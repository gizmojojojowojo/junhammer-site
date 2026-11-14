// Run: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanDomains, cleanQuestions, forSite, hostOf, isSite, mentions, readCitations, readQuestion, scoreRun, verdict } from '../src/visibility/lib.mjs';

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
  assert.match(verdict(scoreRun([{ cited: false, retrieved: false, position: null, mentioned: false, pages: [], others: [] }], 'x.com')), /never surfaced in the searches/);
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

// ---- endpoint ----
const { onRequestGet: visGet, onRequestPost, RUN } = await import('../functions/api/visibility.js');

const HOME = '<!doctype html><html lang="en"><head><title>Acme AEO | Answer engine optimization in Denver</title><meta name="description" content="We get brands cited in AI search."></head><body><main><h1>Answer engine optimization</h1><p>We help Denver businesses get cited by AI search assistants, with measurement rather than guesswork.</p><h2>What we do</h2><p>Audits, content, and tracking.</p></main></body></html>';

function store() {
  const m = new Map();
  return { m, kv: { get: async (k) => m.get(k) ?? null, put: async (k, v) => void m.set(k, v) } };
}
function ctx(body, env = {}, headers = {}) {
  const pending = [];
  return {
    request: new Request('https://junhammer.com/api/visibility', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://junhammer.com', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) }),
    env,
    waitUntil: (p) => pending.push(p),
    pending,
  };
}
const events = async (stream) => (await new Response(stream).text()).split('\n\n').filter(Boolean).map((b) => ({ event: b.match(/^event: (.+)$/m)[1], data: JSON.parse(b.match(/^data: (.+)$/m)[1]) }));

/** A fake world: the site, the question writer, and a search that cites acme on every third question. */
function world({ citeEvery = 3 } = {}) {
  let asked = 0;
  const calls = { questions: 0, answers: 0 };
  return {
    calls,
    fetchImpl: async (url, init) => {
      if (url === 'https://api.anthropic.com/v1/messages') {
        const payload = JSON.parse(init.body);
        if (payload.tools?.[0]?.name === 'set_questions') {
          calls.questions++;
          return Response.json({ content: [{ type: 'tool_use', name: 'set_questions', input: { questions: Array.from({ length: RUN.questions }, (_, i) => `What is the best way to handle problem number ${i}?`) } }], usage: {} });
        }
        calls.answers++;
        const n = asked++;
        const mine = n % citeEvery === 0;
        return Response.json({
          content: [
            { type: 'web_search_tool_result', content: [{ type: 'web_search_result', url: 'https://moz.com/a' }, { type: 'web_search_result', url: 'https://acme.example.org/p' }] },
            { type: 'text', text: 'Some answer.', citations: mine ? [{ type: 'web_search_result_location', url: 'https://acme.example.org/p' }] : [{ type: 'web_search_result_location', url: 'https://moz.com/a' }] },
          ],
          usage: { server_tool_use: { web_search_requests: 2 } },
        });
      }
      return new Response(HOME, { headers: { 'content-type': 'text/html' } });
    },
  };
}

test('endpoint: validates before spending a single search', async () => {
  const real = globalThis.fetch;
  globalThis.fetch = async () => assert.fail('nothing should be called');
  try {
    assert.equal((await onRequestPost(ctx({ url: 'https://acme.example.org' }, { ANTHROPIC_API_KEY: 'k' }, { origin: 'https://evil.test' }))).status, 403);
    assert.equal((await onRequestPost(ctx('nope', { ANTHROPIC_API_KEY: 'k' }))).status, 400);
    assert.equal((await onRequestPost(ctx({ url: 'http://127.0.0.1/' }, { ANTHROPIC_API_KEY: 'k' }))).status, 400);
    assert.equal((await onRequestPost(ctx({ url: 'https://acme.example.org' }))).status, 503);
  } finally {
    globalThis.fetch = real;
  }
});

test('endpoint: a full run scores the brand and caches it', async () => {
  const real = globalThis.fetch;
  const w = world();
  globalThis.fetch = w.fetchImpl;
  try {
    const { kv, m } = store();
    const env = { ANTHROPIC_API_KEY: 'k', ASK_KV: kv };
    const c = ctx({ url: 'acme.example.org' }, env);
    const out = await events((await onRequestPost(c)).body);
    await Promise.all(c.pending);
    const kinds = out.map((e) => e.event);
    assert.deepEqual(kinds.slice(0, 3), ['step', 'step', 'questions']);
    assert.equal(kinds.at(-1), 'report');
    const report = out.at(-1).data;
    assert.equal(report.brand, 'acme.example.org');
    assert.equal(report.brandName, 'Acme AEO');
    assert.equal(report.questions, RUN.questions);
    const cited = Math.ceil(RUN.questions / 3); // the fake world cites us on every third
    assert.equal(report.cited, cited);
    assert.equal(report.retrieved, RUN.questions, 'found every time, cited on some');
    assert.equal(report.retrievedNotCited, RUN.questions - cited);
    assert.deepEqual(report.leaders[0], { domain: 'moz.com', questions: RUN.questions - cited, share: Math.round((100 * (RUN.questions - cited)) / RUN.questions), isBrand: false });
    assert.match(report.verdict, /passed over/);
    assert.equal(w.calls.questions, 1);
    assert.equal(w.calls.answers, RUN.questions);
    assert.ok([...m.keys()].some((k) => k.startsWith('vis:run:')), 'the run is cached');
  } finally {
    globalThis.fetch = real;
  }
});

test('endpoint: a cached domain costs nothing and is free to anyone', async () => {
  const real = globalThis.fetch;
  const w = world();
  globalThis.fetch = w.fetchImpl;
  try {
    const { kv } = store();
    const env = { ANTHROPIC_API_KEY: 'k', ASK_KV: kv };
    const first = ctx({ url: 'acme.example.org' }, env);
    await events((await onRequestPost(first)).body);
    await Promise.all(first.pending);
    const before = w.calls.answers;
    // A different visitor, already at their own limit, still gets the result.
    const res = await onRequestPost(ctx({ url: 'https://www.acme.example.org/some/page' }, env, { 'cf-connecting-ip': '9.9.9.9' }));
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.cached, true);
    assert.equal(data.brand, 'acme.example.org', 'the cache is keyed on the domain, not the path');
    assert.equal(w.calls.answers, before, 'no further searches were bought');
  } finally {
    globalThis.fetch = real;
  }
});

test('endpoint: one new domain per visitor, and a daily ceiling for the site', async () => {
  const real = globalThis.fetch;
  globalThis.fetch = world().fetchImpl;
  try {
    const { kv } = store();
    const env = { ANTHROPIC_API_KEY: 'k', ASK_KV: kv, VIS_DAILY_LIMIT: '2' };
    const first = ctx({ url: 'one-brand.org' }, env);
    await events((await onRequestPost(first)).body);
    await Promise.all(first.pending);
    const second = await onRequestPost(ctx({ url: 'two-brand.org' }, env));
    assert.equal(second.status, 429);
    assert.equal((await second.json()).reason, 'limited', 'same visitor, new domain');
    const other = ctx({ url: 'two-brand.org' }, env, { 'cf-connecting-ip': '2.2.2.2' });
    await events((await onRequestPost(other)).body);
    await Promise.all(other.pending);
    const third = await onRequestPost(ctx({ url: 'three-brand.org' }, env, { 'cf-connecting-ip': '3.3.3.3' }));
    assert.equal((await third.json()).reason, 'closed', 'the site budget is spent');
  } finally {
    globalThis.fetch = real;
  }
});

test('endpoint: an unreadable site fails before any question is bought', async () => {
  const real = globalThis.fetch;
  let answers = 0;
  globalThis.fetch = async (url) => {
    if (url.includes('anthropic')) answers++;
    return new Response('gone', { status: 404, headers: { 'content-type': 'text/plain' } });
  };
  try {
    const { kv } = store();
    const c = ctx({ url: 'nothing-here.org' }, { ANTHROPIC_API_KEY: 'k', ASK_KV: kv });
    const out = await events((await onRequestPost(c)).body);
    await Promise.all(c.pending);
    assert.equal(out.at(-1).event, 'error');
    assert.equal(out.at(-1).data.reason, 'unreachable');
    assert.equal(answers, 0, 'nothing was spent');
  } finally {
    globalThis.fetch = real;
  }
});

test('questions nobody has answered are separated from questions lost', () => {
  const s = scoreRun([
    { question: 'open one', cited: false, retrieved: false, position: null, mentioned: false, pages: [], others: [], citedCount: 0 },
    { question: 'lost one', cited: false, retrieved: true, position: 2, mentioned: false, pages: [], others: ['moz.com'], citedCount: 3 },
    { question: 'won one', cited: true, retrieved: true, position: 1, mentioned: true, pages: ['/a/'], others: [], citedCount: 1 },
  ], 'example.com');
  assert.deepEqual(s.uncontested, ['open one']);
  assert.deepEqual(s.misses.map((m) => [m.question, m.uncontested]), [['open one', true], ['lost one', false]]);
  assert.match(verdict(s), /nobody owns those yet/);
  assert.ok(!/nobody owns/.test(verdict(scoreRun([{ question: 'q', cited: true, retrieved: true, position: 1, mentioned: true, pages: [], others: [], citedCount: 2 }], 'example.com'))));
});

test('named rivals always appear, even on zero', () => {
  const rows = [
    { question: 'a', cited: true, retrieved: true, position: 1, mentioned: true, pages: [], others: ['moz.com'], citedCount: 2 },
    { question: 'b', cited: false, retrieved: true, position: 2, mentioned: false, pages: [], others: ['moz.com', 'ahrefs.com'], citedCount: 2 },
  ];
  const s = scoreRun(rows, 'example.com', ['Ahrefs.com', 'https://www.quiet.com/pricing', 'quiet.com']);
  assert.deepEqual(s.rivals, [{ domain: 'ahrefs.com', questions: 1, share: 50 }, { domain: 'quiet.com', questions: 0, share: 0 }]);
  assert.deepEqual(s.beats, ['quiet.com'], 'cited once, beats the rival on zero');
  assert.deepEqual(s.losesTo, []);
  assert.deepEqual(s.leaders.map((l) => l.domain), ['moz.com'], 'named rivals are not repeated in the discovered list');
  assert.deepEqual(scoreRun(rows, 'example.com').rivals, []);
});

test('typed domains are cleaned before they are used', () => {
  assert.deepEqual(cleanDomains(['https://WWW.Moz.com/beginners-guide', ' ahrefs.com ', 'moz.com', 'not a domain', '', null]), ['moz.com', 'ahrefs.com']);
  assert.equal(cleanDomains(['a.com', 'b.com', 'c.com', 'd.com']).length, 3);
  assert.deepEqual(cleanDomains('nope'), []);
});

test('endpoint: questions are generated first, free, and can be replaced', async () => {
  const real = globalThis.fetch;
  const w = world();
  globalThis.fetch = w.fetchImpl;
  try {
    const { kv } = store();
    const env = { ANTHROPIC_API_KEY: 'k', ASK_KV: kv };
    const res = await onRequestPost(ctx({ url: 'acme.example.org', action: 'questions' }, env));
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.brandName, 'Acme AEO');
    assert.equal(data.questions.length, RUN.questions);
    assert.equal(w.calls.answers, 0, 'no searches were bought to write questions');

    // The visitor's own questions are used instead of the generated ones.
    const mine = ['Who should I hire for AI search work in Denver?', 'Does answer engine optimization actually pay off?', 'What does an AEO audit involve from start to finish?'];
    const c = ctx({ url: 'acme.example.org', questions: mine, competitors: ['moz.com', 'https://www.ahrefs.com/blog'] }, env);
    const out = await events((await onRequestPost(c)).body);
    await Promise.all(c.pending);
    const report = out.at(-1).data;
    assert.equal(report.questions, 3);
    assert.equal(report.askedByVisitor, true);
    assert.deepEqual(out.find((e) => e.event === 'questions').data.questions, mine);
    assert.deepEqual(report.rivals.map((r) => r.domain), ['moz.com', 'ahrefs.com'], 'named rivals appear, ahrefs on zero');
    assert.equal(report.rivals[1].questions, 0);
    assert.ok(!report.leaders.some((l) => l.domain === 'moz.com'), 'a named rival is not repeated as a discovery');
  } finally {
    globalThis.fetch = real;
  }
});

test('endpoint: a cached run is readable by URL, so results are shareable', async () => {
  const real = globalThis.fetch;
  globalThis.fetch = world().fetchImpl;
  try {
    const { kv } = store();
    const env = { ANTHROPIC_API_KEY: 'k', ASK_KV: kv };
    const miss = await visGet({ request: new Request('https://junhammer.com/api/visibility?d=never-checked.org'), env });
    assert.equal(miss.status, 404);
    assert.equal((await miss.json()).reason, 'not_run');
    assert.equal((await visGet({ request: new Request('https://junhammer.com/api/visibility'), env })).status, 400);

    const c = ctx({ url: 'acme.example.org' }, env);
    await events((await onRequestPost(c)).body);
    await Promise.all(c.pending);
    const hit = await visGet({ request: new Request('https://junhammer.com/api/visibility?d=https://WWW.acme.example.org/a'), env });
    const data = await hit.json();
    assert.equal(hit.status, 200);
    assert.equal(data.brand, 'acme.example.org');
    assert.equal(data.cached, true);
    assert.match(hit.headers.get('cache-control'), /max-age/);
  } finally {
    globalThis.fetch = real;
  }
});

test('a run on edited questions is personal: not cached, not shareable', async () => {
  const real = globalThis.fetch;
  const w = world();
  globalThis.fetch = w.fetchImpl;
  try {
    const { kv, m } = store();
    const env = { ANTHROPIC_API_KEY: 'k', ASK_KV: kv };
    const mine = ['Who should I hire for AI search work?', 'Does answer engine optimization pay off?', 'What does an AEO audit cover?'];
    const c = ctx({ url: 'acme.example.org', questions: mine }, env);
    const out = await events((await onRequestPost(c)).body);
    await Promise.all(c.pending);
    assert.equal(out.at(-1).data.shareable, false);
    assert.ok(![...m.keys()].some((k) => k.startsWith('vis:run:')), 'a custom run does not become the domain result');
    assert.equal((await visGet({ request: new Request('https://junhammer.com/api/visibility?d=acme.example.org'), env })).status, 404);

    // The standard run is cached and shareable, and a later custom run does
    // not overwrite it.
    const std = ctx({ url: 'acme.example.org' }, env, { 'cf-connecting-ip': '5.5.5.5' });
    const stdOut = await events((await onRequestPost(std)).body);
    await Promise.all(std.pending);
    assert.equal(stdOut.at(-1).data.shareable, true);
    assert.equal((await visGet({ request: new Request('https://junhammer.com/api/visibility?d=acme.example.org'), env })).status, 200);
    const again = ctx({ url: 'acme.example.org', questions: mine }, env, { 'cf-connecting-ip': '6.6.6.6' });
    await events((await onRequestPost(again)).body);
    await Promise.all(again.pending);
    const still = await (await visGet({ request: new Request('https://junhammer.com/api/visibility?d=acme.example.org'), env })).json();
    assert.equal(still.questions, RUN.questions, 'the shared result is still the standard run');
  } finally {
    globalThis.fetch = real;
  }
});
