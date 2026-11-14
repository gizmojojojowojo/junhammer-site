// The schedular threshold for a total disability rating based on individual
// unemployability (TDIU), per 38 CFR 4.16(a).
//
// TDIU pays at the 100 percent rate while the schedular rating is lower. It is
// the most consequential thing a veteran at 70 percent can be unaware of.
//
// WHAT THIS CAN AND CANNOT SAY. 4.16(a) has two parts. The percentage
// threshold is arithmetic, and that is all this computes. The other part is
// whether the veteran is "unable to secure or follow a substantially gainful
// occupation as a result of service-connected disabilities", which is a
// judgment the rating agency makes on the evidence. Meeting the threshold is
// not qualifying, and 4.16(b) lets the VA grant TDIU below the threshold on
// referral. So this reports one arithmetic fact and never an eligibility.
import { combinedRating } from './rating.mjs';

/**
 * 4.16(a) counts certain disabilities as one for the 60 and 40 percent tests:
 *   (1) disabilities of one or both upper extremities, or of one or both
 *       lower extremities, including the bilateral factor
 *   (2) disabilities from a common etiology or a single accident
 *   (3) disabilities affecting a single body system
 *   (4) multiple injuries incurred in action
 *   (5) multiple disabilities incurred as a prisoner of war
 * A caller marks these by giving the disabilities a shared `group`. Which
 * disabilities share an etiology or a body system is a medical and
 * adjudicative question, not one this code can answer, so the grouping is an
 * input and the result depends on it being right.
 */
export const GROUP_REASONS = [
  ['extremities', 'Disabilities of one or both upper extremities, or of one or both lower extremities, including the bilateral factor'],
  ['etiology', 'Disabilities resulting from a common etiology or a single accident'],
  ['body-system', 'Disabilities affecting a single body system, such as orthopedic, digestive, respiratory, cardiovascular-renal or neuropsychiatric'],
  ['combat', 'Multiple injuries incurred in action'],
  ['pow', 'Multiple disabilities incurred as a prisoner of war'],
];

/**
 * Groups the disabilities and gives each group its combined value. A group of
 * one is just that disability. Bilateral members keep their flag, so a group
 * of paired extremities gets the bilateral factor, as 4.16(a)(1) requires.
 */
export function groupValues(disabilities = []) {
  const list = (Array.isArray(disabilities) ? disabilities : []).filter((d) => Number(d?.rating) > 0);
  const groups = new Map();
  list.forEach((d, i) => {
    const key = typeof d.group === 'string' && d.group.trim() ? `g:${d.group.trim()}` : `single:${i}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(d);
  });
  return [...groups.entries()]
    .map(([key, members]) => ({
      group: key.startsWith('g:') ? key.slice(2) : null,
      members: members.map((m) => ({ rating: Math.round(Number(m.rating)), label: m.label || '' })),
      // Within a group the members combine under 4.25, with the bilateral
      // factor where it applies. One member alone is simply its own rating.
      value: members.length === 1 ? Math.round(Number(members[0].rating)) : combinedRating(members).combinedValue,
    }))
    .sort((a, b) => b.value - a.value);
}

/**
 * Does the combination meet the percentage threshold in 4.16(a)?
 * Returns the arithmetic and the reasoning, never a yes to TDIU itself.
 */
export function tdiuThreshold(disabilities = []) {
  const overall = combinedRating(disabilities);
  const groups = groupValues(disabilities);
  const highest = groups[0]?.value ?? 0;
  const single = groups.length === 1;

  // "if there is only one such disability, this disability shall be ratable at
  // 60 percent or more"
  const bySingle = single && highest >= 60;
  // "if there are two or more disabilities, there shall be at least one
  // ratable at 40 percent or more, and sufficient additional disability to
  // bring the combined rating to 70 percent or more"
  const byCombination = !single && highest >= 40 && overall.rated >= 70;

  let reads;
  if (bySingle) reads = `One disability at ${highest} percent meets the 60 percent test in 38 CFR 4.16(a).`;
  else if (byCombination) reads = `One disability at ${highest} percent is at least 40 percent, and the combined rating of ${overall.rated} percent is at least 70 percent, which meets the second test in 38 CFR 4.16(a).`;
  else if (single) reads = `A single disability has to be ratable at 60 percent or more. This one is ${highest} percent.`;
  else if (highest < 40) reads = `With two or more disabilities, one of them has to be ratable at 40 percent or more. The highest here is ${highest} percent. Disabilities of paired limbs, a common cause, or a single body system count as one disability for this test, which can lift the highest figure.`;
  else reads = `One disability is at ${highest} percent, which clears the 40 percent part, but the combined rating has to reach 70 percent and it is ${overall.rated} percent.`;

  return {
    meetsSchedularThreshold: bySingle || byCombination,
    route: bySingle ? 'single-60' : byCombination ? 'combination-40-70' : null,
    highestSingle: highest,
    combined: overall.rated,
    groups,
    reads,
    // 4.16(b): below the threshold the VA may still refer a case for
    // extraschedular consideration, so a no here is not the end of it.
    extraschedularPossible: !(bySingle || byCombination),
  };
}
