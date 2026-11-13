// Rule-based grading for /ask/ answers. No model judges another model here:
// every check is something a script can verify. Tested in tests/ask.test.mjs.
import { allowedLinks } from './answer.mjs';

export const CHECKS = [
  ['cites', 'Cites a source'],
  ['citesInRange', 'Every citation number is real'],
  ['citesExpected', 'Cites a page that holds the answer'],
  ['linksAllowed', 'Uses only links found in the sources'],
  ['short', 'Stays under 220 words'],
];

export function grade(text, results, expect) {
  const cited = [...new Set([...text.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])))];
  const links = [...text.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]);
  const allowed = new Set(allowedLinks(results));
  return {
    cites: cited.length > 0,
    citesInRange: cited.every((n) => n >= 1 && n <= results.length),
    citesExpected: cited.some((n) => expect.includes(results[n - 1]?.url)),
    linksAllowed: links.every((l) => allowed.has(l)),
    short: text.split(/\s+/).length <= 220,
  };
}

/** An off-topic question passes when the answer says the site does not cover it and cites nothing. */
export function declined(text) {
  return /does not cover|doesn't cover|not covered|cannot help|can't help/i.test(text) && !/\[\d+\]/.test(text);
}

/** Where the first expected page landed in the results (0-based), or -1. */
export const rankOf = (results, expect) => results.findIndex((r) => expect.includes(r.url));
