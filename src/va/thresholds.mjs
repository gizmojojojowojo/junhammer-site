// What changes at each VA disability rating.
//
// The VA documents each of these on its own page, so the question people
// actually have, "what does my rating get me", has no single answer anywhere.
// This is that list, with the regulation behind each line.
//
// RULES FOR THIS FILE. Every entry cites the section it comes from, and the
// summary says what that section says and nothing more. No entry is written
// from memory or from a secondary source. The list is deliberately partial:
// a short sourced list is worth more than a long one that is half guesswork,
// and `COVERAGE` below says what is missing so nobody mistakes it for
// complete. Anything about an individual's own claim belongs with an
// accredited representative, not here.

const eCFR = (title, part, section) => `https://www.ecfr.gov/current/title-${title}/part-${part}/section-${section}`;

/**
 * Each threshold has a `test` over the facts a veteran can read off a
 * decision letter: the combined rating, whether unemployability is in payment,
 * and whether the disability is held permanent and total.
 */
export const THRESHOLDS = [
  {
    id: 'compensation',
    at: 10,
    label: 'The rating is compensable',
    who: 'The veteran',
    summary: 'A rating of 10 percent or more is compensable. Below that the schedule assigns a zero percent evaluation, which records the disability without a compensable one.',
    test: ({ rated }) => rated >= 10,
    cite: { section: '38 CFR 4.31', url: eCFR(38, 4, '4.31'), note: 'In every instance where the schedule does not provide a zero percent evaluation for a diagnostic code, a zero percent evaluation shall be assigned when the requirements for a compensable evaluation are not met.' },
  },
  {
    id: 'healthcare-3',
    at: 10,
    label: 'VA health care priority group 3',
    who: 'The veteran',
    summary: 'A combined rating of 10 or 20 percent places a veteran in priority group 3 for enrollment, alongside former prisoners of war and Purple Heart recipients.',
    test: ({ rated }) => rated >= 10 && rated < 30,
    cite: { section: '38 CFR 17.36(b)(3)', url: eCFR(38, 17, '17.36'), note: 'Lists veterans with a singular or combined rating of 10 percent or 20 percent in the third priority category.' },
  },
  {
    id: 'dependents',
    at: 30,
    label: 'Dependents can be added to compensation',
    who: 'Spouse, children, dependent parents',
    summary: 'At 30 percent or more, an additional amount of compensation may be payable for a spouse, a child, or a dependent parent. Below 30 percent the payment does not change with family size.',
    test: ({ rated }) => rated >= 30,
    cite: { section: '38 CFR 3.4(b)(2)', url: eCFR(38, 3, '3.4'), authority: '38 U.S.C. 1115', note: 'An additional amount of compensation may be payable for a spouse, child, and/or dependent parent where a veteran is entitled to compensation based on disability evaluated as 30 per centum or more disabling.' },
  },
  {
    id: 'healthcare-2',
    at: 30,
    label: 'VA health care priority group 2',
    who: 'The veteran',
    summary: 'A combined rating of 30 or 40 percent places a veteran in priority group 2 for enrollment.',
    test: ({ rated }) => rated >= 30 && rated < 50,
    cite: { section: '38 CFR 17.36(b)(2)', url: eCFR(38, 17, '17.36'), note: 'Lists veterans with a singular or combined rating of 30 percent or 40 percent in the second priority category.' },
  },
  {
    id: 'healthcare-1',
    at: 50,
    label: 'VA health care priority group 1',
    who: 'The veteran',
    summary: 'A combined rating of 50 percent or more puts a veteran in the highest enrollment priority group. Unemployability does the same at a lower schedular rating, and so does the Medal of Honor.',
    test: ({ rated, tdiu }) => rated >= 50 || tdiu === true,
    cite: { section: '38 CFR 17.36(b)(1)', url: eCFR(38, 17, '17.36'), note: 'Veterans with a singular or combined rating of 50 percent or greater based on one or more service-connected disabilities or unemployability; and veterans awarded the Medal of Honor.' },
  },
  {
    id: 'tdiu',
    at: 70,
    label: 'Unemployability can pay at the 100 percent rate',
    who: 'The veteran',
    summary: 'A veteran whose service-connected disabilities prevent substantially gainful employment may be paid at the 100 percent rate while rated lower. The percentage threshold is one disability at 60 percent or more, or one at 40 percent or more with a combined rating of 70 percent or more.',
    test: ({ tdiuThresholdMet }) => tdiuThresholdMet === true,
    cite: { section: '38 CFR 4.16(a)', url: eCFR(38, 4, '4.16'), note: 'Sets the percentage threshold. Whether the disabilities prevent substantially gainful employment is a separate finding the rating agency makes, and 4.16(b) allows a grant below the threshold.' },
  },
  {
    id: 'champva',
    at: 100,
    label: 'CHAMPVA health cover for the family',
    who: 'Spouse and children',
    summary: 'The spouse or child of a veteran the VA has adjudicated permanently and totally disabled from a service-connected condition may be eligible for CHAMPVA, provided they are not eligible for TRICARE or Medicare Part A.',
    test: ({ permanentTotal }) => permanentTotal === true,
    cite: { section: '38 CFR 17.271(a)(1)', url: eCFR(38, 17, '17.271'), note: 'The spouse or child of a veteran who has been adjudicated by VA as having a permanent and total service-connected disability.' },
  },
  {
    id: 'chapter-35',
    at: 100,
    label: 'Chapter 35 education benefits for the family',
    who: 'Spouse and children',
    summary: 'A child or spouse of a veteran with a total disability permanent in nature from a service-connected disability is an eligible person for survivors and dependents educational assistance.',
    test: ({ permanentTotal }) => permanentTotal === true,
    cite: { section: '38 CFR 21.3021(a)', url: eCFR(38, 21, '21.3021'), note: 'Defines an eligible person to include the child and the spouse of a veteran who has a total disability permanent in nature resulting from a service-connected disability.' },
  },
];

/** What this list does not yet cover, so nobody reads it as complete. */
export const COVERAGE = {
  sourced: THRESHOLDS.length,
  missing: [
    'Special monthly compensation, which pays above the 100 percent rate for specific losses (38 CFR 3.350)',
    'State programs, which vary by state and are not in the Code of Federal Regulations',
    'Vocational rehabilitation, housing grants, and the automobile allowance',
    'Dependency and indemnity compensation for survivors',
  ],
};

const near = (threshold, rated) => threshold.at > rated && threshold.at - rated <= 20;

/**
 * Sorts the thresholds against one veteran's figures.
 *
 * `facts` is { rated, tdiuThresholdMet, tdiu, permanentTotal }. Everything is
 * read off a decision letter. Nothing here infers a fact that was not given:
 * `permanentTotal` is a finding the VA makes and states, not something a
 * rating of 100 implies on its own.
 */
export function thresholdsFor(facts = {}) {
  const rated = Math.max(0, Math.min(100, Math.round(Number(facts.rated) || 0)));
  const state = { ...facts, rated };
  const applies = [];
  const upcoming = [];
  for (const t of THRESHOLDS) {
    const { test, ...rest } = t;
    if (test(state)) applies.push(rest);
    else if (near(t, rated)) upcoming.push({ ...rest, pointsAway: t.at - rated });
  }
  return {
    rated,
    applies,
    upcoming: upcoming.sort((a, b) => a.pointsAway - b.pointsAway),
    // A rating of 100 does not by itself mean permanent and total, and the two
    // family benefits above turn on that finding rather than on the number.
    permanentTotalUnknown: rated >= 100 && facts.permanentTotal === undefined,
    coverage: COVERAGE,
  };
}
