// Answer evals for /ask/: calls the model for every test question and checks the
// answers with rules, not opinions. Costs a few cents per run.
// Run: ANTHROPIC_API_KEY=... npm run eval:answers   (add ASK_MODEL=... to compare models)
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { buildChunks, extraDocs } from '../../src/ask/chunk.mjs';
import { buildIndex, search } from '../../src/ask/retrieve.mjs';
import { LIMITS, SYSTEM, answerable, buildMessages } from '../../src/ask/answer.mjs';
import { declined as isDeclined, grade } from '../../src/ask/grade.mjs';

const key = process.env.ANTHROPIC_API_KEY;
if (!key) { console.error('Set ANTHROPIC_API_KEY.'); process.exit(2); }
const model = process.env.ASK_MODEL || 'claude-haiku-5-5';
const root = new URL('../../', import.meta.url);
const read = (p) => JSON.parse(readFileSync(new URL(p, root), 'utf8'));

const chunks = existsSync(new URL('dist/ask-index.json', root))
  ? read('dist/ask-index.json').chunks
  : buildChunks([...JSON.parse(execFileSync('python3', ['scripts/ask/export_docs.py'], { cwd: root, maxBuffer: 64 << 20 })), ...extraDocs(read('src/data/site.json'))]);
const index = buildIndex(chunks);
const set = read('evals/ask/questions.json');

async function answer(question, results) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model, max_tokens: LIMITS.maxTokens, system: SYSTEM, messages: buildMessages(question, results) }),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return { text: data.content.map((b) => b.text || '').join(''), usage: data.usage };
}

const totals = { cites: 0, citesInRange: 0, citesExpected: 0, linksAllowed: 0, short: 0 };
const failures = [];
let tokensIn = 0, tokensOut = 0, n = 0;
for (const { q, expect } of set.answerable) {
  const found = search(index, q);
  if (!answerable(found)) continue;
  const { text, usage } = await answer(q, found.results);
  const g = grade(text, found.results, expect);
  n++;
  tokensIn += usage.input_tokens; tokensOut += usage.output_tokens;
  for (const k of Object.keys(totals)) if (g[k]) totals[k]++;
  if (Object.values(g).includes(false)) failures.push({ q, ...g, text });
}
let declined = 0, reached = 0;
for (const q of set.offTopic) {
  const found = search(index, q);
  if (!answerable(found)) continue; // already turned away without the model
  reached++;
  const { text } = await answer(q, found.results);
  if (isDeclined(text)) declined++;
  else failures.push({ q, offTopic: true, text });
}

const pct = (x) => `${((100 * x) / n).toFixed(1)}%`;
console.log(`Model: ${model}`);
console.log(`Answered: ${n}`);
console.log(`  Cites a source:                 ${pct(totals.cites)}`);
console.log(`  Every citation number is real:  ${pct(totals.citesInRange)}`);
console.log(`  Cites an expected page:         ${pct(totals.citesExpected)}`);
console.log(`  Uses only links from sources:   ${pct(totals.linksAllowed)}`);
console.log(`  Stays under 220 words:          ${pct(totals.short)}`);
console.log(`Off-topic that reached the model: ${reached}, declined: ${declined}`);
console.log(`Tokens: ${tokensIn} in, ${tokensOut} out (average ${Math.round(tokensIn / n)} in, ${Math.round(tokensOut / n)} out per answer)`);
if (failures.length) console.log('\nFailures:', JSON.stringify(failures, null, 1));
