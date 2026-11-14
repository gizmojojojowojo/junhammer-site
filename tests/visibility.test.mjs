// Run: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanQuestions, forSite, hostOf, isSite, mentions, readCitations, readQuestion, scoreRun, verdict } from '../src/visibility/lib.mjs';

/** Builds a Messages API response the way the web search tool returns one. */
const answer = ({ results = [], cites = [], text = 'Here is the answer.' }) => [
  { type: 'server_tool_use', name: 'web_search', input: { query: 'x' } },
  { type: 'web_search_tool_result', content: results.map((url) => ({ type: 'web_search_result', url })) },
  { type: 'text', text, citations: cites.map((url) => ({ type: 'web_search_result_location', url, title: 't' })) },
];

test('hosts are normalised and subdomains count as the same site', () => {
  assert.equal(hostOf('https://WWW.Example.com/a?b=1'), 'example.com');
  assert.equal(hostOf('not a url'), '');
  assert.ok(isSite('blog.example.com', 'example.com'));
  assert.ok(isSite('www.example.com', 'example.com'));
  assert.ok(!isSite('example.com.evil.net', 'example.com'));
  assert.ok(!isSite('notexample.com', 'example.com'));
  assert.ok(!isSite('', 'example.com'));
});

test('results and citations are read apart from each other', () => {
  const r = readCitations(answer({ results: ['https://a.test/1', 'https://b.test/2'], cites: ['https://b.test/2'], text: 'B says so.' }));
  assert.deepEqual(r.resultHosts, ['a.test', 'b.test']);
  assert.deepEqual(r.citedHosts, ['b.test']);
  assert.equal(r.text, 'B says so.');
  assert.deepEqual(readCitations([]).results, []);
  assert.deepEqual(readCitations(null).citedHosts, []);
  // A failed search returns an object rather than a list, and must not throw.
  assert.deepEqual(readCitations([{ type: 'web_search_tool_result', content: { type: 'web_search_tool_result_error', error_code: 'unavailable' } }]).results, []);
});

test('retrieved and cited are counted separately, because they differ', () => {
  const found = forSite(readCitations(answer({ results: ['https://moz.com/a', 'https://example.com/p'], cites: ['https://moz.com/a'] })), 'example.com');
  assert.deepEqual([found.retrieved, found.cited, found.position], [true, false, 2], 'in the results, left out of the answer');
  const used = forSite(readCitations(answer({ results: ['https://example.com/p'], cites: ['https://example.com/p'] })), 'example.com');
  assert.deepEqual([used.retrieved, used.cited, used.sitePages], [true, true, ['/p']]);
});

test('a brand named in the prose counts as mentioned even with no citation', () => {
  assert.ok(mentions('We recommend Acme Tools for this.', 'Acme Tools'));
  assert.ok(mentions('acme tools, among others', 'Acme Tools'));
  assert.ok(!mentions('Acmetools Industries', 'Acme'), 'not a substring match');
  assert.ok(!mentions('nothing relevant', 'Acme'));
  assert.ok(!mentions('text', ''), 'an empty brand never matches');
  assert.ok(mentions('Use C++ for that.', 'C++'), 'punctuation in a name does not break the pattern');
});

test('one question is read into the facts a report needs', () => {
  const row = readQuestion({
    question: 'best AEO consultant',
    brand: 'example.com',
    brandName: 'Example',
    content: answer({ results: ['https://moz.com/a', 'https://example.com/p', 'https://ahrefs.com/b'], cites: ['https://moz.com/a', 'https://ahrefs.com/b'], text: 'Moz and Ahrefs cover this.' }),
  });
  assert.deepEqual([row.cited, row.retrieved, row.position, row.mentioned], [false, true, 2, false]);
  assert.deepEqual(row.others, ['moz.com', 'ahrefs.com']);
  assert.deepEqual(row.pages, ['/p']);
});

const rows = [
  { question: 'q1', cited: true, retrieved: true, position: 1, mentioned: true, pages: ['/a/'], others: ['moz.com'] },
  { question: 'q2', cited: false, retrieved: true, position: 3, mentioned: false, pages: ['/a/'], others: ['moz.com', 'ahrefs.com'] },
  { question: 'q3', cited: false, retrieved: false, position: null, mentioned: false, pages: [], others: ['moz.com', 'semrush.com'] },
  { question: 'q4', cited: true, retrieved: true, position: 2, mentioned: true, pages: ['/b/'], others: ['ahrefs.com'] },
];

test('a run is scored on citations, not on being found', () => {
  const s = scoreRun(rows, 'example.com');
  assert.deepEqual([s.questions, s.cited, s.citedRate], [4, 2, 50]);
  assert.deepEqual([s.retrieved, s.retrievedRate], [3, 75]);
  assert.equal(s.retrievedNotCited, 1, 'found and passed over is reported on its own');
  assert.equal(s.averagePosition, 2);
  assert.deepEqual(s.yourPages, [{ path: '/a/', questions: 2 }, { path: '/b/', questions: 1 }]);
  assert.deepEqual(s.misses.map((m) => m.question), ['q2', 'q3']);
  assert.equal(s.misses[1].retrieved, false);
});

test('share of voice counts one endorsement per question, per domain', () => {
  const s = scoreRun(rows, 'example.com');
  // moz on 3 questions, ahrefs on 2, example and semrush on 1 each.
  assert.deepEqual(s.leaders.map((l) => [l.domain, l.questions]), [['moz.com', 3], ['ahrefs.com', 2], ['semrush.com', 1]]);
  assert.equal(s.shareOfVoice, 50, 'cited on 2 of 4');
  // moz 3, then ahrefs and example tie on 2 and sort alphabetically, so third.
  assert.equal(s.rankAmongDomains, 3);
  // Citing the same domain three times in one answer is still one endorsement.
  const repeated = scoreRun([{ question: 'q', cited: false, retrieved: false, position: null, mentioned: false, pages: [], others: ['moz.com', 'moz.com', 'moz.com'] }], 'example.com');
  assert.equal(repeated.leaders[0].questions, 1);
  assert.equal(scoreRun([], 'example.com').questions, 0);
  assert.equal(scoreRun([], 'example.com').shareOfVoice, 0);
});

test('the verdict names the actual problem rather than a grade', () => {
  assert.match(verdict(scoreRun([{ cited: false, retrieved: false, position: null, mentioned: false, pages: [], others: [] }], 'x.com')), /never even surfaced/);
  const passedOver = scoreRun([
    { question: 'a', cited: false, retrieved: true, position: 2, mentioned: false, pages: [], others: [] },
    { question: 'b', cited: false, retrieved: true, position: 3, mentioned: false, pages: [], others: [] },
  ], 'x.com');
  assert.match(verdict(passedOver), /reachable and are being passed over/);
  // "Passed over" leads only when the misses outnumber the hits. Here they do not.
  assert.match(verdict(scoreRun(rows, 'example.com')), /^Cited on 2 of 4, 50 percent share of voice\.$/);
  const mostlyPassedOver = scoreRun([
    { question: 'a', cited: true, retrieved: true, position: 1, mentioned: true, pages: [], others: [] },
    { question: 'b', cited: false, retrieved: true, position: 2, mentioned: false, pages: [], others: [] },
    { question: 'c', cited: false, retrieved: true, position: 4, mentioned: false, pages: [], others: [] },
  ], 'x.com');
  assert.match(verdict(mostlyPassedOver), /passed over on 2 more/);
  assert.match(verdict(scoreRun([{ cited: true, retrieved: true, position: 1, mentioned: true, pages: [], others: [] }], 'x.com')), /Strong/);
  assert.equal(verdict(scoreRun([], 'x.com')), 'Nothing was measured.');
});

test('generated questions are cleaned before anything is spent on them', () => {
  const q = cleanQuestions([
    'What is answer engine optimization?',
    '  What is answer engine optimization?  ',
    'short',
    'x'.repeat(200),
    { question: 'Who are the best AEO consultants in Denver?' },
    null,
    42,
  ]);
  assert.deepEqual(q, ['What is answer engine optimization?', 'Who are the best AEO consultants in Denver?']);
  assert.equal(cleanQuestions(Array.from({ length: 50 }, (_, i) => `A long enough question number ${i}?`)).length, 10);
  assert.deepEqual(cleanQuestions('not a list'), []);
});
