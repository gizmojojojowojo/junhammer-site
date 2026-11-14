// Run: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, scoreCandidate, select, splitQuestions, summarizeFailures, verdict } from '../scripts/optimize/lib.mjs';

const qs = Array.from({ length: 60 }, (_, i) => ({ q: `question number ${i}`, expect: ['/a/'] }));

test('the split is stable, proportionate and does not reshuffle when questions are added', () => {
  const a = splitQuestions(qs);
  const b = splitQuestions(qs);
  assert.deepEqual(a.holdout, b.holdout, 'same split every run');
  assert.equal(a.train.length + a.holdout.length, 60);
  assert.ok(a.holdout.length >= 12 && a.holdout.length <= 30, `holdout was ${a.holdout.length}`);
  const grown = splitQuestions([...qs, { q: 'a brand new question', expect: [] }]);
  assert.deepEqual(grown.holdout.filter((x) => x.q !== 'a brand new question').map((x) => x.q), a.holdout.map((x) => x.q));
  assert.equal(splitQuestions(qs, 0).holdout.length, 0);
});

const pass = { cites: true, citesInRange: true, citesExpected: true, linksAllowed: true, short: true };
const fail = { ...pass, citesExpected: false, short: false };

test('scoring counts every check, plus off-topic declines', () => {
  const s = scoreCandidate([{ q: 'a', grade: pass }, { q: 'b', grade: fail }], [{ q: 'off', declined: true }, { q: 'off2', declined: false }]);
  assert.deepEqual([s.passed, s.total, s.perfect, s.answered], [9, 12, 1, 2]);
  assert.equal(s.score, 0.75);
  assert.equal(scoreCandidate([{ q: 'a' }]).score, 0, 'questions that never reached the model do not count');
  assert.equal(scoreCandidate([]).total, 0);
});

test('selection prefers the higher score, then the shorter prompt', () => {
  const top = select([{ score: 0.8, prompt: 'long prompt here' }, { score: 0.9, prompt: 'xxxx' }, { score: 0.9, prompt: 'xx' }, { score: 0.1, prompt: 'z' }], 2);
  assert.deepEqual(top.map((p) => p.prompt), ['xx', 'xxxx']);
  assert.equal(select([{ score: 1, prompt: 'a' }]).length, 1);
});

test('the failure summary ranks the worst checks and keeps examples', () => {
  const s = summarizeFailures([{ q: 'a', grade: fail, text: 'bad answer' }, { q: 'b', grade: { ...pass, short: false }, text: 'long' }, { q: 'c', grade: pass }], [{ q: 'off', declined: false, text: 'I answered anyway' }]);
  assert.deepEqual(s.checks.map((c) => [c.label, c.failed]), [['Stays under 220 words', 2], ['Cites a page that holds the answer', 1]]);
  assert.equal(s.examples.length, 3);
  assert.match(s.examples.at(-1).failed[0], /off-topic/);
  assert.deepEqual(summarizeFailures([{ q: 'c', grade: pass }]), { checks: [], examples: [] });
});

test('the verdict is honest about gains that do not transfer', () => {
  assert.ok(verdict({ train: 0.8, holdout: 0.8 }, { train: 0.9, holdout: 0.88 }).transferred);
  assert.match(verdict({ train: 0.8, holdout: 0.8 }, { train: 0.9, holdout: 0.82 }).reads, /smaller on unseen/);
  assert.match(verdict({ train: 0.8, holdout: 0.8 }, { train: 0.9, holdout: 0.8 }).reads, /did not transfer/);
  assert.match(verdict({ train: 0.8, holdout: 0.8 }, { train: 0.9, holdout: 0.7 }).reads, /did worse/);
  assert.equal(verdict({ train: 0.8, holdout: 0.8 }, { train: 0.9, holdout: 0.7 }).holdoutGain, -0.1);
});

test('config keeps the holdout meaningful', () => {
  assert.ok(CONFIG.holdout >= 0.2 && CONFIG.holdout <= 0.5);
  assert.ok(CONFIG.keep < CONFIG.variantsPerGeneration);
});
