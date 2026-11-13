// Retrieval evals for /ask/. Run: npm run eval:ask
// Uses dist/ask-index.json when the site has been built; otherwise builds the
// index from source through scripts/ask/export_docs.py.
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { buildChunks, extraDocs } from '../../src/ask/chunk.mjs';
import { buildIndex, search } from '../../src/ask/retrieve.mjs';
import { answerable as gate } from '../../src/ask/answer.mjs';

const root = new URL('../../', import.meta.url);
const read = (p) => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const verbose = process.argv.includes('--verbose');

let chunks;
if (existsSync(new URL('dist/ask-index.json', root)) && !process.argv.includes('--from-source')) {
  chunks = read('dist/ask-index.json').chunks;
  console.log('Index: dist/ask-index.json');
} else {
  const docs = JSON.parse(execFileSync('python3', ['scripts/ask/export_docs.py'], { cwd: root, maxBuffer: 64 << 20 }));
  chunks = buildChunks([...docs, ...extraDocs(read('src/data/site.json'))]);
  console.log('Index: built from source');
}
const index = buildIndex(chunks);
const set = read('evals/ask/questions.json');

let top1 = 0, hit3 = 0, hit6 = 0, mrr = 0, gated = 0;
const misses = [];
for (const { q, expect } of set.answerable) {
  const found = search(index, q);
  const rank = found.results.findIndex((r) => expect.includes(r.url));
  if (rank === 0) top1++;
  if (rank >= 0 && rank < 3) hit3++;
  if (rank >= 0) { hit6++; mrr += 1 / (rank + 1); }
  const ok = gate(found);
  if (!ok) gated++;
  if (rank < 0 || !ok || verbose) misses.push({ q, rank, ok, coverage: found.coverage.toFixed(2), score: found.results[0]?.score.toFixed(1), got: found.results.slice(0, 3).map((r) => r.url) });
}
let leaked = 0;
const leaks = [];
for (const q of set.offTopic) {
  const found = search(index, q);
  if (gate(found)) { leaked++; leaks.push({ q, coverage: found.coverage.toFixed(2), score: found.results[0]?.score.toFixed(1), got: found.results[0]?.url }); }
}

const n = set.answerable.length;
const pct = (x, d) => `${((100 * x) / d).toFixed(1)}%`;
console.log(`Chunks: ${chunks.length}`);
console.log(`Answerable questions: ${n}`);
console.log(`  Right page ranked first:  ${pct(top1, n)}`);
console.log(`  Right page in top 3:      ${pct(hit3, n)}`);
console.log(`  Right page in top 6:      ${pct(hit6, n)}`);
console.log(`  Mean reciprocal rank:     ${(mrr / n).toFixed(3)}`);
console.log(`  Wrongly turned away:      ${gated}`);
console.log(`Off-topic questions: ${set.offTopic.length}`);
console.log(`  Turned away before the model: ${set.offTopic.length - leaked}`);
if (misses.length) console.log('\nDetails:', JSON.stringify(misses, null, 1));
if (leaks.length) console.log('\nOff-topic passed to the model (it is also told to decline these):', JSON.stringify(leaks, null, 1));

// Fail CI when retrieval gets worse than the committed baseline.
const floor = { hit6: 0.9, gated: 2 };
if (hit6 / n < floor.hit6 || gated > floor.gated) { console.error('\nBelow baseline.'); process.exit(1); }
