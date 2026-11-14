// The budget agent. One run is one day: measure, decide, act, write a journal
// entry. It has a dollar budget it tracks itself, and it stops when the budget
// or the day count runs out.
//
// The loop lives here. The rules and the arithmetic are in lib.mjs, tested
// separately. Every file the agent writes goes into a pull request for review:
// nothing it produces reaches the live site without a human merging it.
//
// Run: ANTHROPIC_API_KEY=... node scripts/agent/run.mjs [--dry]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { CONFIG, SITE, checkWrite, cleanTargets, costOf, measurementBrief, readAnswer, recordEntry, recordMeasurement, stopReason } from './lib.mjs';

const root = new URL('../../', import.meta.url);
const STATE = new URL('src/data/agent.json', root);
const key = (process.env.ANTHROPIC_API_KEY || '').trim();
const dry = process.argv.includes('--dry');
const state = JSON.parse(readFileSync(STATE, 'utf8'));
let spent = 0;

const say = (...a) => console.log(...a);
const pages = JSON.parse(execFileSync('python3', ['scripts/ask/export_docs.py'], { cwd: root, maxBuffer: 64 << 20 }));
const pageList = pages.map((p) => ({ url: p.url, title: p.title, words: (p.body || '').split(/\s+/).length }));

async function model(payload, label) {
  if (spent + 0.2 > CONFIG.dailyCapUsd) throw new Error(`daily cap reached before ${label}`);
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`${label}: ${res.status} ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const cost = costOf(payload.model, data.usage);
  spent += cost;
  say(`  ${label}: $${cost.toFixed(4)} (running $${spent.toFixed(4)})`);
  return data;
}

// ---- phase 1: targets, chosen once ----

const TARGET_SYSTEM = `You are an answer engine optimization agent working on ${SITE}. Pick exactly five questions to be your targets for a 30 day campaign.

A good target question:
- is one a real person would type into ChatGPT or Perplexity, not a keyword phrase
- has a page on this site that genuinely answers it today
- is specific enough that this site could plausibly be cited, not "what is SEO"
- is different from the other four, in topic and in the page behind it

You will be measured on whether AI search cites this site when these questions are asked. Choose questions you can actually win. Call set_targets once.`;

async function chooseTargets() {
  const data = await model(
    {
      model: CONFIG.decideModel,
      max_tokens: 2000,
      system: TARGET_SYSTEM,
      tools: [
        {
          name: 'set_targets',
          description: 'Record the five target questions.',
          input_schema: {
            type: 'object',
            properties: {
              targets: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: { question: { type: 'string' }, page: { type: 'string', description: 'The URL path on this site that answers it.' }, why: { type: 'string', description: 'One sentence on why this one is winnable.' } },
                  required: ['question', 'page', 'why'],
                },
              },
            },
            required: ['targets'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'set_targets' },
      messages: [{ role: 'user', content: `Here are the pages on ${SITE}:\n\n${JSON.stringify(pageList)}\n\nPick the five target questions.` }],
    },
    'choose targets',
  );
  const call = data.content.find((b) => b.type === 'tool_use');
  return cleanTargets(call?.input?.targets, pageList);
}

// ---- phase 2: measure ----

/** Asks one target question with web search and reads whether the site was cited. */
async function measure(target) {
  const data = await model(
    {
      model: CONFIG.measureModel,
      max_tokens: 1200,
      system: 'Answer the question using web search, the way a search assistant would. Search before answering. Cite your sources.',
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: CONFIG.searchesPerQuestion }],
      messages: [{ role: 'user', content: target.question }],
    },
    `measure "${target.question.slice(0, 40)}"`,
  );
  return { question: target.question, page: target.page, ...readAnswer(data.content, SITE) };
}

// ---- phase 3: decide and act ----

const DECIDE_SYSTEM = `You are an autonomous agent with one goal: ${state.goal}

You run once a day for ${state.days} days with a total budget of $${state.budgetUsd}. Each day you take ONE action, then write a public journal entry about it. People read that journal, including people deciding whether to hire the engineer who built you.

Today's evidence is the measurement above: for each target question, whether an AI search assistant cited ${SITE}, whether the site even appeared in the search results, and which other domains were cited instead.

What you can do:
- read_page: read any page on the site before changing it. Read before you write.
- write_file: write or rewrite one Markdown content file. At most ${CONFIG.maxFilesPerDay} per day. Everything you write goes to a pull request a human reviews. Nothing you write goes live by itself.
- finish_day: end the day with your journal entry. Always finish with this, even on a day you change nothing.

How to work:
- Do ONE thing today. A single well-aimed change beats three vague ones.
- Base it on the evidence. If a competitor is cited for a question and this site is not, read their angle out of the result list and name what is missing here.
- Days where you change nothing and explain why are legitimate, if the evidence does not support a change.
- You cannot change code, templates, settings or the measurement. Only content.

Writing for this site:
- Plain language, active voice, short sentences, no em dashes, no hype, no filler.
- Lead with the answer. Question-style headings. A direct 40 to 60 word answer under each one.
- Never invent credentials, client names, results or statistics. If you need a fact you do not have, say so in the journal instead of making it up.
- Match the front matter of the file you are editing. If you create a file, copy the front matter shape of a sibling exactly.

The journal entry is honest lab notes, not marketing. If something failed, say it failed. If you are unsure, say that.`;

const DECIDE_TOOLS = [
  { name: 'read_page', description: 'Read the full Markdown of one page of the site.', input_schema: { type: 'object', properties: { url: { type: 'string', description: 'A URL path from the page list.' } }, required: ['url'] } },
  { name: 'write_file', description: 'Write a Markdown content file. The whole file, including front matter.', input_schema: { type: 'object', properties: { path: { type: 'string', description: 'For example src/content/blog/my-post.md' }, content: { type: 'string' }, note: { type: 'string', description: 'One line on what changed and why.' } }, required: ['path', 'content'] } },
  {
    name: 'finish_day',
    description: 'End the day with the journal entry. Call exactly once, last.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'A short headline for the day.' },
        observed: { type: 'string', description: 'What the measurement showed, with numbers.' },
        hypothesis: { type: 'string', description: 'What you think explains it.' },
        action: { type: 'string', description: 'What you did today, or why you did nothing.' },
        expect: { type: 'string', description: 'What you expect to see in the measurement if you are right.' },
      },
      required: ['title', 'observed', 'action'],
    },
  },
];

const pathOf = (url) => `src/content/${url.replace(/^\/|\/$/g, '').replace(/^blog\//, 'blog/')}.md`;

async function decide(results) {
  const written = [];
  const messages = [
    {
      role: 'user',
      content: [
        `Day ${state.day + 1} of ${state.days}. Budget: $${(state.budgetUsd - state.spentUsd).toFixed(2)} of $${state.budgetUsd} left.`,
        '',
        `Today's measurement:`,
        JSON.stringify(results.map((r) => ({ question: r.question, yourPage: r.page, cited: r.cited, retrievedInResults: r.retrieved, position: r.position, sitePagesSeen: r.sitePages, citedInstead: r.citedDomains })), null, 1),
        '',
        state.measurements.length > 1 ? `Earlier measurements:\n${JSON.stringify(measurementBrief(state, 4), null, 1)}` : 'This is the first measurement.',
        '',
        state.journal.length ? `Your last journal entries:\n${JSON.stringify(state.journal.slice(-4).map(({ day, title, action, expect }) => ({ day, title, action, expect })), null, 1)}` : 'No journal yet. This is day one.',
        '',
        `Pages on the site:\n${JSON.stringify(pageList)}`,
        '',
        'Decide the one thing to do today, do it, then finish_day.',
      ].join('\n'),
    },
  ];

  for (let turn = 0; turn < CONFIG.turns; turn++) {
    const last = turn === CONFIG.turns - 1;
    const data = await model({ model: CONFIG.decideModel, max_tokens: 8000, system: DECIDE_SYSTEM, tools: DECIDE_TOOLS, tool_choice: last ? { type: 'tool', name: 'finish_day' } : { type: 'auto' }, messages }, `decide turn ${turn + 1}`);
    const calls = data.content.filter((b) => b.type === 'tool_use');
    const done = calls.find((c) => c.name === 'finish_day');
    if (done) return { entry: done.input, written };
    if (!calls.length) {
      messages.push({ role: 'assistant', content: data.content.length ? data.content : [{ type: 'text', text: '...' }] }, { role: 'user', content: 'Take an action or call finish_day.' });
      continue;
    }
    messages.push({ role: 'assistant', content: data.content });
    const out = [];
    for (const call of calls) {
      let result;
      if (call.name === 'read_page') {
        const page = pages.find((p) => p.url === call.input?.url);
        result = page ? { url: page.url, title: page.title, path: pathOf(page.url), markdown: (page.body || '').slice(0, 30000) } : { error: 'No such page.' };
        say(`  read ${call.input?.url}`);
      } else if (call.name === 'write_file') {
        const { path, content } = call.input || {};
        const problem = checkWrite(path, content, written);
        if (problem) result = { error: problem };
        else {
          if (!dry) {
            mkdirSync(new URL(path.split('/').slice(0, -1).join('/') + '/', root), { recursive: true });
            writeFileSync(new URL(path, root), content);
          }
          if (!written.includes(path)) written.push(path);
          result = { written: path, bytes: content.length };
          say(`  wrote ${path} (${content.length} bytes)${dry ? ' [dry run, not saved]' : ''}`);
        }
      } else result = { error: 'Unknown tool.' };
      out.push({ type: 'tool_result', tool_use_id: call.id, content: JSON.stringify(result), ...(result.error ? { is_error: true } : {}) });
    }
    if (turn === CONFIG.turns - 2) out.push({ type: 'text', text: 'This is your last action. Call finish_day next.' });
    messages.push({ role: 'user', content: out });
  }
  throw new Error('no journal entry');
}

// ---- run ----

const stop = stopReason(state);
if (stop) {
  say(`Nothing to do: ${stop}`);
  process.exit(0);
}
if (!key) {
  console.error('ANTHROPIC_API_KEY is not set.');
  process.exit(1);
}

say(`Day ${state.day + 1} of ${state.days}. Spent so far: $${state.spentUsd.toFixed(2)} of $${state.budgetUsd}.`);
if (!state.targets.length) {
  state.targets = await chooseTargets();
  say(`Targets chosen:\n${state.targets.map((t) => `  - ${t.question}  ->  ${t.page}`).join('\n')}`);
  if (!state.targets.length) throw new Error('no targets chosen');
}

const results = [];
for (const t of state.targets) results.push(await measure(t));
recordMeasurement(state, results);
say(`Cited on ${results.filter((r) => r.cited).length} of ${results.length}, in the results for ${results.filter((r) => r.retrieved).length}.`);

const { entry, written } = await decide(results);
recordEntry(state, entry, { files: written, costUsd: spent, outcome: written.length ? 'pull request opened' : 'no change' });
if (!dry) writeFileSync(STATE, JSON.stringify(state, null, 2) + '\n');

say(`\nDay ${state.day}: ${state.journal.at(-1).title}`);
say(`Files: ${written.length ? written.join(', ') : 'none'}`);
say(`Cost: $${spent.toFixed(4)}. Total: $${state.spentUsd.toFixed(2)} of $${state.budgetUsd}.`);
if (process.env.GITHUB_OUTPUT) {
  const fs = await import('node:fs');
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `day=${state.day}\nfiles=${written.length}\ntitle=${state.journal.at(-1).title.replace(/\n/g, ' ')}\n`);
}
