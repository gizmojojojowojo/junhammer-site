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
