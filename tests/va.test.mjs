// Run: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { combineAll, combineOne, combinedRating, naiveGap, nextStep, toNearestTen } from '../src/va/rating.mjs';

const TABLE = JSON.parse(readFileSync(new URL('../evals/va/combined-table.json', import.meta.url), 'utf8'));
const rate = (...ratings) => combinedRating(ratings.map((r) => ({ rating: r })));
const bi = (rating) => ({ rating, bilateral: true });

test('every cell of the printed table in 38 CFR 4.25 comes out right', () => {
  let cells = 0;
  for (const [row, values] of Object.entries(TABLE)) {
    values.forEach((expected, i) => {
      cells++;
      assert.equal(combineOne(Number(row), (i + 1) * 10), expected, `${row} combined with ${(i + 1) * 10}`);
    });
  }
  assert.equal(cells, 684, 'the whole table is covered');
});

test('the worked examples in the text of 4.25', () => {
  // "a person having a 60 percent disability ... is thus 72 percent disabled"
  assert.equal(rate(60, 30).combinedValue, 72);
  // "with a 50 percent disability and a 30 percent disability ... 65 ... converted to 70"
  assert.equal(rate(50, 30).combinedValue, 65);
  assert.equal(rate(50, 30).rated, 70);
  // "a disability of 40 percent, and another of 20 percent ... 52 ... which is 50"
  assert.equal(rate(40, 20).combinedValue, 52);
  assert.equal(rate(40, 20).rated, 50);
  // "60, 40 and 20 ... the first two ... is 76 ... combined with 20 ... is 81 ... which is 80"
  assert.equal(rate(60, 40).combinedValue, 76);
  assert.equal(rate(60, 40, 20).combinedValue, 81);
  assert.equal(rate(60, 40, 20).rated, 80);
});

test('4.25(a): each combination feeds the next as a whole number', () => {
  // 30 and 20 is 44 in the table; 44 and 10 is 50. Carrying 49.6 instead
  // would still give 50 here, but the regulation rounds at every step.
  assert.equal(rate(30, 20).combinedValue, 44);
  assert.equal(combineOne(44, 10), 50);
  assert.equal(rate(30, 20, 10).combinedValue, 50);
  assert.equal(combineAll([10, 30, 20]), combineAll([30, 20, 10]), 'severity order is applied for us');
  assert.equal(combineAll([]), 0);
  assert.equal(combineAll([0, 0]), 0, 'zero percent conditions do not move the total');
});

test('4.25(b): the conversion to a multiple of ten happens once, at the end', () => {
  assert.equal(toNearestTen(64), 60);
  assert.equal(toNearestTen(65), 70, 'a value ending in 5 is adjusted upward');
  assert.equal(toNearestTen(45), 50);
  assert.equal(toNearestTen(44.9), 40);
  assert.deepEqual([toNearestTen(0), toNearestTen(97), toNearestTen(100)], [0, 100, 100]);
  // Three 10s: 19, then 27. Converting along the way would give 20 then 30.
  assert.equal(rate(10, 10, 10).combinedValue, 27);
  assert.equal(rate(10, 10, 10).rated, 30);
});

test('4.26: the worked example in the text, including the re-sort', () => {
  // "60 percent, 20 percent, 10 percent and 10 percent (the two 10s bilateral)
  //  ... the order of severity would be 60, 21 and 20. The 60 and 21 combine
  //  to 68 and the 68 and 20 combine to 74, converted to 70."
  const r = combinedRating([{ rating: 60 }, { rating: 20 }, bi(10), bi(10)]);
  assert.equal(r.bilateralValue, 21, 'the two 10s give 19, plus 1.9, rounded to 21');
  assert.equal(r.bilateralFactor, 1.9);
  assert.deepEqual(r.steps.filter((s) => s.kind !== 'bilateral' && s.kind !== 'factor').map((s) => s.after), [60, 68, 74]);
  assert.equal(r.combinedValue, 74);
  assert.equal(r.rated, 70);
  assert.equal(r.bilateralApplied, true);
});

test('4.26: the bilateral group re-enters the order by severity, not at the front', () => {
  // A composite of 21 sorts below a 60 and above a 20.
  const r = combinedRating([{ rating: 60 }, { rating: 20 }, bi(10), bi(10)]);
  const after = r.steps.filter((s) => ['combine', 'composite'].includes(s.kind));
  assert.deepEqual(after.map((s) => s.rating), [60, 21, 20]);
  assert.equal(after[1].kind, 'composite');
});

test('4.26: the factor makes paired limbs worth more than the same ratings on one side', () => {
  assert.equal(combinedRating([bi(10), bi(10)]).combinedValue, 21);
  assert.equal(rate(10, 10).combinedValue, 19);
  assert.equal(combinedRating([bi(40), bi(20)]).combinedValue, 57, '52 plus 5.2 is 57.2, rounded to 57');
});

test('4.26(c): one paired disability on its own gets no factor', () => {
  const alone = combinedRating([{ rating: 30, bilateral: true }, { rating: 20 }]);
  assert.equal(alone.bilateralApplied, false);
  assert.equal(alone.bilateralIgnored, true, 'flagged, because people expect a factor here');
  assert.equal(alone.bilateralFactor, null);
  assert.equal(alone.combinedValue, rate(30, 20).combinedValue);
});

test('4.26(b): four affected extremities combine before the factor is added', () => {
  const r = combinedRating([bi(30), bi(20), bi(20), bi(10)]);
  // 30, 20, 20 and 10 combine to 60, plus 6, is 66.
  assert.deepEqual(r.steps.filter((s) => s.kind === 'bilateral').map((s) => s.after), [30, 44, 55, 60]);
  assert.equal(r.bilateralValue, 66);
  assert.equal(r.rated, 70);
});

test('4.26(d): a paired disability is left out when that pays better', () => {
  // Every arrangement is tried, so the result can never be worse than
  // ignoring the factor entirely.
  const many = [bi(50), bi(40), bi(10), { rating: 30 }];
  const best = combinedRating(many);
  const withoutFactor = combineAll(many.map((d) => d.rating));
  assert.ok(best.combinedValue >= withoutFactor, `${best.combinedValue} is at least ${withoutFactor}`);
  for (const set of [[bi(10), bi(10)], [bi(60), bi(40), bi(20)], [bi(20), bi(20), bi(20), bi(20), { rating: 70 }]]) {
    const r = combinedRating(set);
    assert.ok(r.combinedValue >= combineAll(set.map((d) => d.rating)), 'the favourable arrangement wins');
  }
  assert.equal(combinedRating([bi(10), bi(10)]).bilateralPartial, false);
});

test('the gap between what people expect and what they are paid', () => {
  // 50 and 30 is 65; 65 and 20 is 72; 72 pays as 70. Three ratings that look
  // like 100 on paper pay as 70.
  assert.deepEqual(naiveGap([{ rating: 50 }, { rating: 30 }, { rating: 20 }]), { rated: 70, ifTheyAdded: 100, difference: 30 });
  const many = naiveGap([30, 20, 20, 10, 10].map((rating) => ({ rating })));
  assert.equal(many.ifTheyAdded, 90);
  assert.ok(many.rated < many.ifTheyAdded, 'adding them up always overstates it');
  assert.equal(naiveGap([{ rating: 100 }]).difference, 0);
});

test('input is cleaned and the working is returned in full', () => {
  const r = combinedRating([{ rating: '40', label: 'Right knee' }, { rating: 150 }, { rating: -5 }, { rating: 'nonsense' }, null]);
  assert.equal(r.count, 2);
  assert.equal(r.rated, 100, 'out of range is clamped, not dropped');
  assert.deepEqual([combinedRating().rated, combinedRating('not a list').rated], [0, 0]);
  const labelled = combinedRating([{ rating: 40, label: 'Right knee' }, { rating: 20, label: 'Tinnitus' }]);
  assert.deepEqual(labelled.steps.map((s) => [s.label, s.before, s.after]), [['Right knee', 0, 40], ['Tinnitus', 40, 52]]);
});

test('what it would take to reach the next ten', () => {
  // At 70, another 20 percent still pays as 70. It takes 30 to reach 80.
  assert.equal(combinedRating([{ rating: 50 }, { rating: 30 }, { rating: 20 }]).rated, 70);
  assert.deepEqual(nextStep([{ rating: 50 }, { rating: 30 }]), { addRating: 30, reaches: 80, from: 70 });
  assert.equal(nextStep([{ rating: 100 }]), null);
  assert.ok(nextStep([{ rating: 10 }]).reaches >= 20);
});

// ---- 38 CFR 4.16(a), the unemployability threshold ----
const { tdiuThreshold, groupValues } = await import('../src/va/tdiu.mjs');

test('4.16(a): a single disability needs 60 percent', () => {
  const yes = tdiuThreshold([{ rating: 60 }]);
  assert.equal(yes.meetsSchedularThreshold, true);
  assert.equal(yes.route, 'single-60');
  const no = tdiuThreshold([{ rating: 50 }]);
  assert.equal(no.meetsSchedularThreshold, false);
  assert.match(no.reads, /60 percent or more/);
  assert.equal(no.extraschedularPossible, true, '4.16(b) referral is still open');
});

test('4.16(a): two or more need one at 40 and a combined 70', () => {
  // 40 and 50 combine to 70. One is at least 40, so the threshold is met.
  const met = tdiuThreshold([{ rating: 50 }, { rating: 40 }]);
  assert.equal(met.combined, 70);
  assert.deepEqual([met.meetsSchedularThreshold, met.route], [true, 'combination-40-70']);
  // 30 and 30 and 30 reach 70 combined but nothing is at 40.
  const noAnchor = tdiuThreshold([{ rating: 30 }, { rating: 30 }, { rating: 30 }]);
  assert.equal(noAnchor.combined, 70);
  assert.equal(noAnchor.meetsSchedularThreshold, false);
  assert.match(noAnchor.reads, /40 percent or more/);
  // 40 and 20 is a 40 anchor but only 50 combined.
  const short = tdiuThreshold([{ rating: 40 }, { rating: 20 }]);
  assert.deepEqual([short.combined, short.meetsSchedularThreshold], [50, false]);
  assert.match(short.reads, /combined rating has to reach 70/);
});

test('4.16(a): disabilities counted as one can supply the 40 percent anchor', () => {
  // Three 30s combine to 70, so the combined test passes, but nothing is
  // ratable at 40 on its own and the threshold fails.
  const apart = tdiuThreshold([{ rating: 30 }, { rating: 30 }, { rating: 30 }]);
  assert.equal(apart.combined, 70);
  assert.equal(apart.highestSingle, 30);
  assert.equal(apart.meetsSchedularThreshold, false);

  // Two of them share a body system, so they count as one disability. They
  // combine to 51, which anchors the 40 percent test, and nothing else moves.
  const grouped = tdiuThreshold([
    { rating: 30, group: 'orthopedic' },
    { rating: 30, group: 'orthopedic' },
    { rating: 30 },
  ]);
  assert.equal(grouped.groups[0].value, 51, '30 and 30 combine to 51 as one disability');
  assert.equal(grouped.combined, 70, 'the combined rating is unchanged');
  assert.equal(grouped.meetsSchedularThreshold, true);
  assert.match(grouped.reads, /51 percent/);
});

test('4.16(a)(1): a paired-limb group carries its bilateral factor', () => {
  const g = groupValues([
    { rating: 30, bilateral: true, group: 'legs' },
    { rating: 20, bilateral: true, group: 'legs' },
    { rating: 10 },
  ]);
  // 30 and 20 combine to 44, plus 4.4, is 48.4, rounded to 48.
  assert.equal(g[0].value, 48, 'the factor is included, per 4.16(a)(1)');
  assert.equal(g[0].members.length, 2);
  assert.equal(g[1].value, 10);
  assert.deepEqual(groupValues([]), []);
  assert.equal(groupValues([{ rating: 0 }]).length, 0);
});

test('the threshold is never reported as qualifying for TDIU', () => {
  const r = tdiuThreshold([{ rating: 70 }]);
  const text = JSON.stringify(r).toLowerCase();
  assert.ok(!/eligible|qualif|you will|entitled/.test(text), 'no eligibility language anywhere in the result');
  assert.ok('meetsSchedularThreshold' in r && !('eligible' in r));
});

// ---- what changes at each rating ----
const { THRESHOLDS, thresholdsFor } = await import('../src/va/thresholds.mjs');

test('every threshold cites the section it came from', () => {
  for (const t of THRESHOLDS) {
    assert.match(t.cite.section, /^38 (CFR|U\.S\.C\.)/, `${t.id} cites a regulation`);
    assert.match(t.cite.url, /^https:\/\/www\.ecfr\.gov\//, `${t.id} links to the text`);
    assert.ok(t.cite.note && t.cite.note.length > 30, `${t.id} records what the section says`);
    assert.ok(t.summary && t.who && t.label, `${t.id} is complete`);
  }
  assert.equal(new Set(THRESHOLDS.map((t) => t.id)).size, THRESHOLDS.length, 'ids are unique');
});

test('thresholds sort correctly against a rating', () => {
  const at20 = thresholdsFor({ rated: 20 });
  assert.deepEqual(at20.applies.map((t) => t.id), ['compensation', 'healthcare-3']);
  assert.ok(at20.upcoming.some((t) => t.id === 'dependents' && t.pointsAway === 10));

  const at30 = thresholdsFor({ rated: 30 });
  assert.ok(at30.applies.some((t) => t.id === 'dependents'));
  assert.ok(!at30.applies.some((t) => t.id === 'healthcare-3'), 'priority group 3 is replaced by 2');
  assert.ok(at30.applies.some((t) => t.id === 'healthcare-2'));

  const at50 = thresholdsFor({ rated: 50 });
  assert.ok(at50.applies.some((t) => t.id === 'healthcare-1'));
  assert.ok(!at50.applies.some((t) => t.id === 'healthcare-2'));

  assert.deepEqual(thresholdsFor({ rated: 0 }).applies, []);
  assert.equal(thresholdsFor().rated, 0);
  assert.equal(thresholdsFor({ rated: 999 }).rated, 100);
});

test('unemployability reaches priority group 1 at a lower rating', () => {
  const schedular70 = thresholdsFor({ rated: 70 });
  assert.ok(!schedular70.applies.some((t) => t.id === 'healthcare-1') === false, '70 is already over 50');
  // The rule that matters: unemployability qualifies on its own.
  const low = thresholdsFor({ rated: 40, tdiu: true });
  assert.ok(low.applies.some((t) => t.id === 'healthcare-1'), '38 CFR 17.36(b)(1) names unemployability');
  assert.ok(!thresholdsFor({ rated: 40 }).applies.some((t) => t.id === 'healthcare-1'));
});

test('family benefits turn on permanent and total, not on the number 100', () => {
  const hundred = thresholdsFor({ rated: 100 });
  assert.ok(!hundred.applies.some((t) => t.id === 'champva'), 'a 100 rating does not imply permanent and total');
  assert.equal(hundred.permanentTotalUnknown, true, 'flagged so the page can ask');
  const pt = thresholdsFor({ rated: 100, permanentTotal: true });
  assert.deepEqual(pt.applies.filter((t) => ['champva', 'chapter-35'].includes(t.id)).map((t) => t.id), ['champva', 'chapter-35']);
  assert.equal(pt.permanentTotalUnknown, false);
  // Permanent and total can be held below 100 as well, and the rule follows
  // the finding rather than the rating.
  assert.ok(thresholdsFor({ rated: 70, permanentTotal: true }).applies.some((t) => t.id === 'champva'));
});

test('the list says what it does not cover', () => {
  const c = thresholdsFor({ rated: 50 }).coverage;
  assert.equal(c.sourced, THRESHOLDS.length);
  assert.ok(c.missing.length >= 3);
  assert.ok(c.missing.some((m) => /state/i.test(m)), 'state programs are named as missing');
});
