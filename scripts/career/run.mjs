// The career agent. Reads public job boards, filters to roles worth reading,
// matches each one's requirements against evidence in the portfolio, and writes
// a private report: what fits, what is missing, and a draft note.
//
// It runs locally and writes to private/, which git ignores. This repository is
// public, so the report does not belong in it and the job is not in CI.
//
// Run: ANTHROPIC_API_KEY=... node scripts/career/run.mjs [--dry] [--limit 8]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { CONFIG, forModel, gapReport, normalizeMatch, parseGreenhouse, parseLever, rank, renderReport } from './lib.mjs';

const root = new URL('../../', import.meta.url);
const key = (process.env.ANTHROPIC_API_KEY || '').trim();
const dry = process.argv.includes('--dry');
const limitArg = process.argv.indexOf('--limit');
const limit = limitArg > 0 ? Number(process.argv[limitArg + 1]) : CONFIG.maxPostingsPerRun;
const sources = JSON.parse(readFileSync(new URL('sources.json', import.meta.url), 'utf8'));

if (!key && !dry) {
  console.error('ANTHROPIC_API_KEY is not set. Use --dry to see which postings would be read.');
  process.exit(1);
}

// ---- the portfolio, as evidence ----

const docs = JSON.parse(execFileSync('python3', ['scripts/ask/export_docs.py'], { cwd: root, maxBuffer: 64 << 20 }));
const pages = docs.map((d) => ({ url: d.url, title: d.title, type: d.type, summary: (d.description || d.summary || '').slice(0, 300), words: (d.body || '').split(/\s+/).length }));
const evidence = docs
  .filter((d) => /work|service|about|resume/.test(d.type) || /\/(work|services|about|resume)\//.test(d.url))
  .map((d) => ({ url: d.url, title: d.title, text: (d.body || '').slice(0, 4000) }));
console.log(`${pages.length} pages in the portfolio, ${evidence.length} of them case studies, services or background.`);

// ---- fetch the boards ----

const failed = [];
async function board(url, parse, company) {
  try {
    const res = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return parse(await res.json(), company);
  } catch (e) {
    failed.push(`${company} (${String(e.message || e).slice(0, 40)})`);
    return [];
  }
}

const batches = await Promise.all([
  ...sources.greenhouse.map((c) => board(`https://boards-api.greenhouse.io/v1/boards/${c}/jobs?content=true`, parseGreenhouse, c)),
  ...sources.lever.map((c) => board(`https://api.lever.co/v0/postings/${c}?mode=json`, parseLever, c)),
]);
const all = batches.flat();
const checked = all.length;
const shortlist = rank(all, sources.filters, limit);
console.log(`${checked} postings read. ${shortlist.length} worth a closer look.`);
if (failed.length) console.log(`Boards that did not respond: ${failed.join(', ')}`);
for (const p of shortlist) console.log(`  ${String(p.score).padStart(2)}  ${p.title} at ${p.company} (${p.location || 'no location'})`);
if (dry || !shortlist.length) {
  console.log(dry ? '\nDry run. No model calls, nothing written.' : '\nNothing matched. Widen the filters in scripts/career/sources.json.');
  process.exit(0);
}

// ---- match each posting against the evidence ----

const SYSTEM = `You match one job posting against one engineer's portfolio, for the engineer's own use. Be accurate rather than encouraging: a report that overstates the fit wastes his week.

Rules:
- Pull the real requirements out of the posting. Skip boilerplate and benefits. At most twelve.
- For each one, decide: strong (the portfolio clearly shows it), partial (adjacent or implied), weak (nothing there).
- Evidence must be URL paths from the portfolio list, and only pages that actually support the claim. No evidence means it is not strong. Never invent a page, a client, a result or a number.
- A requirement with nothing behind it is the most useful line in the report. Say so plainly instead of stretching to fill it.
- worth_applying: true only if the strong matches cover what the role is actually for.
- The draft note is from him, to a hiring manager. Under 180 words. Specific about what he built and what it measured. No flattery, no "I am passionate", no em dashes. It is a starting point he will edit, not something to send as it stands.

Call report once.`;

const TOOL = {
  name: 'report',
  description: 'Record the match.',
  input_schema: {
    type: 'object',
    properties: {
      summary: { type: 'string', description: 'Two sentences: where the fit is real and where it is thin.' },
      worth_applying: { type: 'boolean' },
      requirements: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            requirement: { type: 'string' },
            verdict: { type: 'string', enum: ['strong', 'partial', 'weak'] },
            evidence: { type: 'array', items: { type: 'string', description: 'A URL path from the portfolio list.' } },
            note: { type: 'string', description: 'One short sentence.' },
          },
          required: ['requirement', 'verdict'],
        },
      },
      note: { type: 'string', description: 'The draft note to the hiring manager. Empty if not worth applying.' },
    },
    required: ['summary', 'requirements', 'worth_applying'],
  },
};

let spent = 0;
async function match(posting) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: process.env.CAREER_MODEL || CONFIG.model,
      max_tokens: 4000,
      system: SYSTEM,
      tools: [TOOL],
      tool_choice: { type: 'tool', name: 'report' },
      messages: [{ role: 'user', content: `The posting:\n${JSON.stringify(forModel(posting), null, 1)}\n\nThe portfolio, page by page:\n${JSON.stringify(pages)}\n\nThe case studies and service pages in full:\n${JSON.stringify(evidence)}` }],
    }),
  });
  if (!res.ok) throw new Error(`${posting.company}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  spent += (data.usage.input_tokens * 2 + data.usage.output_tokens * 10) / 1e6; // Sonnet rates
  return normalizeMatch(data.content.find((b) => b.type === 'tool_use')?.input, posting, pages);
}

const matches = [];
let next = 0;
await Promise.all(
  Array.from({ length: CONFIG.concurrency }, async () => {
    while (next < shortlist.length) {
      const p = shortlist[next++];
      try {
        const m = await match(p);
        matches.push(m);
        console.log(`  ${String(m.fit).padStart(3)}%  ${m.title} at ${m.company}${m.worthApplying ? '  <- worth applying' : ''}`);
      } catch (e) {
        console.error(`  failed: ${String(e.message || e).slice(0, 120)}`);
      }
    }
  }),
);

const date = new Date().toISOString().slice(0, 10);
const report = renderReport({ matches, gaps: gapReport(matches), checked, sources: sources.greenhouse.length + sources.lever.length, failed, date });
mkdirSync(new URL('private/', root), { recursive: true });
const out = `private/jobs-${date}.md`;
writeFileSync(new URL(out, root), report);
console.log(`\nWrote ${out}. $${spent.toFixed(3)} spent.`);
const gaps = gapReport(matches, 3);
if (gaps.length) console.log(`Most asked for, with nothing behind it: ${gaps.map((g) => `${g.gap} (${g.count})`).join(', ')}`);
