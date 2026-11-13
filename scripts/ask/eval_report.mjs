// Runs the whole /ask/ test set and writes the results that /ask/evals/ shows.
// Retrieval is always measured. Answers are graded when ANTHROPIC_API_KEY is set
// (a few cents per run); without it the previous answer results are kept.
// Run: node scripts/ask/eval_report.mjs            (writes src/data/ask-evals.json)
// CI:  .github/workflows/ask-evals.yml runs this on every push to main.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { buildChunks, extraDocs } from '../../src/ask/chunk.mjs';
import { buildIndex, search } from '../../src/ask/retrieve.mjs';
import { LIMITS, SYSTEM, answerable, buildMessages } from '../../src/ask/answer.mjs';
import { CHECKS, declined, grade, rankOf } from '../../src/ask/grade.mjs';

const root = new URL('../../', import.meta.url);
const read = (p) => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const OUT = 'src/data/ask-evals.json';
const key = (process.env.ANTHROPIC_API_KEY || '').trim();
const model = process.env.ASK_MODEL || 'claude-haiku-5-5';

const docs = JSON.parse(execFileSync('python3', ['scripts/ask/export_docs.py'], { cwd: root, maxBuffer: 64 << 20 }));
const chunks = buildChunks([...docs, ...extraDocs(read('src/data/site.json'))]);
const index = buildIndex(chunks);
const set = read('evals/ask/questions.json');
const previous = existsSync(new URL(OUT, root)) ? read(OUT) : {};

// ---- retrieval ----
const rows = set.answerable.map(({ q, expect }) => {
  const found = search(index, q);
  return { q, expect, found, rank: rankOf(found.results, expect), gated: !answerable(found) };
});
const n = rows.length;
const offTopic = set.offTopic.map((q) => ({ q, found: search(index, q) })).map((r) => ({ ...r, stopped: !answerable(r.found) }));
const retrieval = {
  questions: n,
  passages: chunks.length,
  first: rows.filter((r) => r.rank === 0).length,
  top3: rows.filter((r) => r.rank >= 0 && r.rank < 3).length,
  reachedModel: rows.filter((r) => r.rank >= 0).length,
  mrr: +(rows.reduce((s, r) => s + (r.rank >= 0 ? 1 / (r.rank + 1) : 0), 0) / n).toFixed(3),
  wronglyTurnedAway: rows.filter((r) => r.gated).length,
  offTopic: offTopic.length,
  offTopicStopped: offTopic.filter((r) => r.stopped).length,
};

// ---- answers ----
async function ask(question, results, attempt = 0) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model, max_tokens: LIMITS.maxTokens, system: SYSTEM, messages: buildMessages(question, results) }),
  });
  if ((res.status === 429 || res.status >= 500) && attempt < 4) {
    await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
    return ask(question, results, attempt + 1);
  }
  if (!res.ok) throw new Error(`model ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return { text: data.content.map((b) => b.text || '').join(''), usage: data.usage };
}

async function pool(items, size, fn) {
  let next = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (next < items.length) await fn(items[next++]);
  }));
}

let answers = previous.answers ?? null;
let questions = rows.map((r) => ({ q: r.q, rank: r.rank }));
if (key) {
  let tokensIn = 0;
  let tokensOut = 0;
  const live = rows.filter((r) => !r.gated);
  await pool(live, 4, async (r) => {
    const { text, usage } = await ask(r.q, r.found.results);
    r.grade = grade(text, r.found.results, r.expect);
    r.text = text;
    tokensIn += usage.input_tokens;
    tokensOut += usage.output_tokens;
  });
  const reached = offTopic.filter((r) => !r.stopped);
  await pool(reached, 4, async (r) => {
    r.declined = declined((await ask(r.q, r.found.results)).text);
  });
  const passed = (r) => r.grade && Object.values(r.grade).every(Boolean);
  answers = {
    model,
    answered: live.length,
    passedAll: live.filter(passed).length,
    checks: CHECKS.map(([id, label]) => ({ id, label, passed: live.filter((r) => r.grade[id]).length })),
    offTopicReachedModel: reached.length,
    offTopicDeclined: reached.filter((r) => r.declined).length,
    avgTokensIn: Math.round(tokensIn / live.length),
    avgTokensOut: Math.round(tokensOut / live.length),
    ranAt: new Date().toISOString(),
    commit: (process.env.GITHUB_SHA || '').slice(0, 7),
  };
  questions = rows.map((r) => {
    const failed = r.grade ? CHECKS.filter(([id]) => !r.grade[id]).map(([, label]) => label) : ['Turned away before the model'];
    return { q: r.q, rank: r.rank, pass: failed.length === 0, failed, ...(failed.length && r.text ? { answer: r.text.slice(0, 700) } : {}) };
  });
} else if (previous.questions?.some((x) => 'pass' in x)) {
  // Keep the last graded answers next to fresh retrieval ranks.
  const old = new Map(previous.questions.map((x) => [x.q, x]));
  questions = rows.map((r) => ({ ...(old.get(r.q) || {}), q: r.q, rank: r.rank }));
}

const report = { ranAt: new Date().toISOString(), commit: (process.env.GITHUB_SHA || previous.commit || '').slice(0, 7), retrieval, answers, questions };
writeFileSync(new URL(OUT, root), JSON.stringify(report, null, 2) + '\n');

console.log(`Retrieval: right page first ${retrieval.first}/${n}, in top 3 ${retrieval.top3}/${n}, sent to model ${retrieval.reachedModel}/${n}`);
if (key) console.log(`Answers (${model}): ${answers.passedAll}/${answers.answered} pass every check`);
else console.log('Answers: skipped (no ANTHROPIC_API_KEY)');
// Fail the run when retrieval drops below the committed floor, after writing the report.
if (retrieval.reachedModel / n < 0.9 || retrieval.wronglyTurnedAway > 2) {
  console.error('Retrieval is below baseline.');
  process.exit(1);
}
