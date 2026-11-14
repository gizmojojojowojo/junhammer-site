// Grades the audit agent against pages with planted defects.
//
// The fixtures are served from memory, so this needs no network and no live
// site: the agent fetches them through an injected fetch. Only the model calls
// are real, which is the point. A page that tries to instruct the auditor is
// in the set, so prompt injection is measured every run.
//
// Run: ANTHROPIC_API_KEY=... node scripts/audit/eval.mjs [--write]
import { writeFileSync } from 'node:fs';
import { runAudit } from '../../src/audit/agent.mjs';
import { FIXTURES, fixtureFetch } from '../../evals/audit/fixtures.mjs';
import { gradeAudit, summarize } from './grade.mjs';

const key = (process.env.ANTHROPIC_API_KEY || '').trim();
const model = process.env.AUDIT_MODEL || 'claude-haiku-5-5';
const write = process.argv.includes('--write');
if (!key) {
  console.error('ANTHROPIC_API_KEY is not set.');
  process.exit(1);
}

const callModel = async (payload) => {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
};

const grades = [];
for (const fixture of FIXTURES) {
  process.stdout.write(`${fixture.id.padEnd(20)}`);
  try {
    const { report, usage, steps } = await runAudit({ target: new URL(fixture.url), callModel, fetchImpl: fixtureFetch(fixture), model });
    const g = gradeAudit(report, fixture);
    grades.push({ ...g, steps: steps.length, turns: usage.turns });
    const miss = g.missed.length ? `  MISSED: ${g.missed.join('; ')}` : '';
    const inj = g.resistedInjection === false ? '  TOOK THE PAGE AT ITS WORD' : '';
    console.log(`score ${String(g.score).padStart(3)}  found ${g.found}/${g.planted}  ${g.steps} checks${miss}${inj}`);
  } catch (e) {
    console.log(`failed: ${String(e.message || e).slice(0, 100)}`);
    grades.push({ id: fixture.id, error: true, found: 0, planted: (fixture.expect || []).length, missed: (fixture.expect || []).map((x) => x.defect), invented: 0, scoredAllCategories: false, resistedInjection: null });
  }
}

const summary = summarize(grades);
const report = { ranAt: new Date().toISOString(), model, ...summary, pagesGraded: grades.map(({ id, score, found, planted, missed, invented, resistedInjection }) => ({ id, score, found, planted, missed, invented, resistedInjection })) };
console.log(`\n${summary.found} of ${summary.planted} planted problems found (${Math.round((summary.rate || 0) * 100)}%).`);
console.log(`Findings with no evidence behind them: ${summary.invented}.`);
console.log(`Prompt injection: ${summary.injectionResisted === null ? 'not tested' : summary.injectionResisted ? 'resisted' : 'NOT RESISTED'}.`);
if (write) {
  writeFileSync(new URL('../../src/data/audit-evals.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  console.log('Wrote src/data/audit-evals.json.');
}
