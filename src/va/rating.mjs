// VA combined disability rating, per 38 CFR 4.25 (combined ratings table) and
// 38 CFR 4.26 (bilateral factor), checked against the text of both sections
// and against all 684 cells of the printed table (evals/va/combined-table.json).
//
// Ratings do not add. Each one applies to the ability left after the ones
// before it, so 50 and 30 make 70 rather than 80. The VA publishes a lookup
// table and no calculator, and the arithmetic has three traps:
//
//   1. Each combination is rounded to a whole number and the next combination
//      uses that rounded figure, "exactly as found in table I" (4.25(a)).
//   2. The conversion to the nearest ten happens once, at the very end
//      (4.25(b)), never along the way.
//   3. Paired limbs are combined with each other, 10 percent is added rather
//      than combined, the result is rounded, and it then re-enters the
//      severity order as a single disability (4.26).
//
// Pure functions, tested in tests/va.test.mjs. Nothing here decides anyone's
// rating. It reproduces arithmetic the VA applies to ratings it has already
// assigned, and only the VA assigns those.

/** Table I is whole numbers, and the printed table is round-half-up. */
const whole = (n) => Math.floor(n + 0.5);

/** One cell of table I: `rating` percent of the efficiency left after `combined`. */
export function combineOne(combined, rating) {
  return whole(combined + (rating * (100 - combined)) / 100);
}

/** 4.25(a): severest first, each result feeding the next. Zeros change nothing. */
export function combineAll(ratings) {
  return [...ratings]
    .filter((r) => Number.isFinite(r) && r > 0)
    .sort((a, b) => b - a)
    .reduce((combined, r) => combineOne(combined, r), 0);
}

/**
 * 4.25(a): converted to the nearest number divisible by ten, with values
 * ending in 5 adjusted upward. This is the figure that sets the payment, so
 * 64 pays as 60 and 65 pays as 70.
 */
export function toNearestTen(value) {
  const tens = Math.floor(value / 10) * 10;
  return Math.min(100, value - tens >= 5 ? tens + 10 : tens);
}

const clean = (d) => ({
  rating: Math.max(0, Math.min(100, Math.round(Number(d?.rating) || 0))),
  bilateral: d?.bilateral === true,
  label: typeof d?.label === 'string' ? d.label.slice(0, 80) : '',
});

/**
 * Combines one arrangement: `inFactor` are the paired disabilities that go
 * through the bilateral factor, everything else combines normally.
 * 4.26 is explicit that the bilateral result "will be treated as one
 * disability for the purpose of arranging in order of severity", so the
 * composite is sorted back in with the rest rather than kept at the front.
 */
function arrange(inFactor, others) {
  const steps = [];
  let composite = null;
  let factor = null;

  if (inFactor.length >= 2) {
    let paired = 0;
    for (const d of [...inFactor].sort((a, b) => b.rating - a.rating)) {
      const before = paired;
      paired = combineOne(paired, d.rating);
      steps.push({ kind: 'bilateral', label: d.label, rating: d.rating, before, after: paired });
    }
    factor = (paired * 10) / 100;
    composite = whole(paired + factor);
    steps.push({ kind: 'factor', rating: 10, before: paired, after: composite, note: '10 percent of the combined bilateral value, added rather than combined, then treated as one disability (38 CFR 4.26)' });
  }

  const queue = [...others.map((d) => ({ rating: d.rating, label: d.label })), ...(composite === null ? [] : [{ rating: composite, label: 'Bilateral group', composite: true }])].sort((a, b) => b.rating - a.rating);
  let combined = 0;
  for (const d of queue) {
    const before = combined;
    combined = combineOne(combined, d.rating);
    steps.push({ kind: d.composite ? 'composite' : 'combine', label: d.label, rating: d.rating, before, after: combined });
  }
  return { combined, steps, factor: factor === null ? null : +factor.toFixed(1), composite };
}

/** Every subset of `items` with at least two members, smallest index order kept. */
function subsets(items) {
  const out = [];
  for (let mask = 0; mask < 1 << items.length; mask++) {
    const picked = items.filter((_, i) => mask & (1 << i));
    if (picked.length >= 2) out.push(picked);
  }
  return out;
}

/**
 * The combined rating. Returns the full working so a page can show every step
 * rather than only an answer.
 *
 * Each disability is { rating, bilateral, label? }. `bilateral: true` marks a
 * disability of a paired extremity: both arms, both legs, or paired skeletal
 * muscles (4.26(a) treats a whole upper or lower extremity as one side, so a
 * right thigh and a left foot are a pair).
 */
export function combinedRating(disabilities = []) {
  const list = (Array.isArray(disabilities) ? disabilities : []).map(clean).filter((d) => d.rating > 0);
  const paired = list.filter((d) => d.bilateral);
  const unpaired = list.filter((d) => !d.bilateral);

  // 4.26(c): the factor needs a compensable disability in each of two paired
  // extremities. One on its own is combined like any other, which is the rule
  // people most often expect to work in their favour and does not.
  // 4.26(d): if leaving a bilateral disability out of the factor produces a
  // better result, it is left out. So every workable arrangement is tried and
  // the most favourable one wins, which is what the regulation requires.
  const options =
    paired.length >= 2 && paired.length <= 6
      ? subsets(paired).map((inFactor) => {
          const excluded = paired.filter((d) => !inFactor.includes(d));
          return { inFactor, others: [...unpaired, ...excluded] };
        })
      : [];
  options.push({ inFactor: [], others: list });

  let best = null;
  for (const option of options) {
    const run = arrange(option.inFactor, option.others);
    if (!best || run.combined > best.run.combined) best = { run, option };
  }

  const { run, option } = best;
  const combinedValue = Math.min(100, run.combined);
  const allPairedUsed = option.inFactor.length === paired.length;
  return {
    rated: toNearestTen(combinedValue),
    combinedValue,
    bilateralFactor: run.factor,
    bilateralValue: run.composite,
    bilateralApplied: option.inFactor.length >= 2,
    // 4.26(c): a lone paired disability gets no factor.
    bilateralIgnored: paired.length === 1,
    // 4.26(d): some paired disabilities did better left out of the factor.
    bilateralPartial: option.inFactor.length >= 2 && !allPairedUsed,
    bilateralExcluded: paired.filter((d) => !option.inFactor.includes(d)).map((d) => d.label || `${d.rating} percent`),
    steps: run.steps,
    sum: list.reduce((n, d) => n + d.rating, 0),
    count: list.length,
  };
}

/** What assuming ratings add would cost. The gap is why this exists. */
export function naiveGap(disabilities) {
  const r = combinedRating(disabilities);
  const ifTheyAdded = Math.min(100, r.sum);
  return { rated: r.rated, ifTheyAdded, difference: ifTheyAdded - r.rated };
}

/** The smallest further rating that reaches the next ten. Null at 100. */
export function nextStep(disabilities) {
  const current = combinedRating(disabilities);
  if (current.rated >= 100) return null;
  const target = current.rated + 10;
  for (let r = 10; r <= 100; r += 10) {
    const next = combinedRating([...disabilities, { rating: r }]);
    if (next.rated >= target) return { addRating: r, reaches: next.rated, from: current.rated };
  }
  return null;
}
