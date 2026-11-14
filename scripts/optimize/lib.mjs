// Pure parts of the prompt optimizer: the train/holdout split, scoring a
// candidate from its graded answers, selection, and the failure summary that
// feeds the next generation. Tested in tests/optimize.test.mjs.
import { CHECKS } from '../../src/ask/grade.mjs';

export const CONFIG = {
  holdout: 0.35, // share of questions kept back, never used to choose a prompt
  variantsPerGeneration: 4,
  keep: 2, // parents carried into the next generation
  generations: 4,
  concurrency: 4,
  maxPromptChars: 4000,
};

/**
 * Splits the questions into a training set and a holdout set, the same way
 * every run, so the holdout never leaks into prompt selection. The split is by
 * a hash of the question text, not position, so adding a question does not
 * reshuffle the rest.
 */
export function splitQuestions(questions, ratio = CONFIG.holdout) {
  const train = [];
  const holdout = [];
  for (const q of questions) {
    let h = 2166136261;
    for (const ch of q.q) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
    ((h % 1000) / 1000 < ratio ? holdout : train).push(q);
  }
  return { train, holdout };
}

/**
 * One number for a candidate prompt: the share of all rule checks it passed,
 * across every question it answered. Off-topic questions count as one check
 * each: did it decline. A question that never reached the model is not the
 * prompt's fault and is left out.
 */
export function scoreCandidate(graded, declines = []) {
  let passed = 0;
  let total = 0;
  for (const g of graded) {
    if (!g.grade) continue;
    for (const [id] of CHECKS) {
      total++;
      if (g.grade[id]) passed++;
    }
  }
  for (const d of declines) {
    total++;
    if (d.declined) passed++;
  }
  return { score: total ? +(passed / total).toFixed(4) : 0, passed, total, perfect: graded.filter((g) => g.grade && Object.values(g.grade).every(Boolean)).length, answered: graded.filter((g) => g.grade).length };
}

/** Best first. Ties go to the shorter prompt, since a shorter one costs less per answer. */
export function select(population, keep = CONFIG.keep) {
  return [...population].sort((a, b) => b.score - a.score || a.prompt.length - b.prompt.length).slice(0, keep);
}

/** What went wrong, compact enough to put in a prompt. Worst checks first. */
export function summarizeFailures(graded, declines = [], limit = 6) {
  const byCheck = new Map(CHECKS.map(([id, label]) => [id, { label, failed: 0 }]));
  const examples = [];
  for (const g of graded) {
    if (!g.grade) continue;
    const missed = CHECKS.filter(([id]) => !g.grade[id]);
    for (const [id] of missed) byCheck.get(id).failed++;
    if (missed.length) examples.push({ question: g.q, failed: missed.map(([, label]) => label), answer: (g.text || '').slice(0, 400) });
  }
  const refused = declines.filter((d) => !d.declined).map((d) => ({ question: d.q, answer: (d.text || '').slice(0, 300), failed: ['Answered an off-topic question instead of declining'] }));
  return {
    checks: [...byCheck.values()].filter((c) => c.failed).sort((a, b) => b.failed - a.failed),
    examples: [...examples, ...refused].slice(0, limit),
  };
}

/** Did the gain on the training set survive on questions never used to pick the prompt? */
export function verdict(baseline, winner) {
  const trainGain = +(winner.train - baseline.train).toFixed(4);
  const holdoutGain = +(winner.holdout - baseline.holdout).toFixed(4);
  let reads;
  if (holdoutGain > 0.001 && holdoutGain >= trainGain * 0.5) reads = 'The gain held up on questions that were never used to choose the prompt.';
  else if (holdoutGain > 0.001) reads = 'The gain held up, but it was smaller on unseen questions than on the training set. Part of it was fitted to the training questions.';
  else if (Math.abs(holdoutGain) <= 0.001) reads = 'The gain did not transfer. On unseen questions the new prompt matched the old one, so the improvement was fitted to the training set.';
  else reads = 'The new prompt did worse on unseen questions. The search found something that suits the training questions and not the rest.';
  return { trainGain, holdoutGain, transferred: holdoutGain > 0.001, reads };
}
