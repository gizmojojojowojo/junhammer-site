// Run: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { CORPUS, LINKS, SUGGESTED, SYSTEM, buildMessages, checkAnswer, correction, parseRequest, resolveCite, sourcesFor } from '../src/va/answer.mjs';

test('the corpus is complete and every passage is citable', () => {
  assert.ok(CORPUS.length >= 15);
  for (const c of CORPUS) {
    assert.match(c.cite, /^38 CFR /, `${c.id} has a citation`);
    assert.match(c.url, /^https:\/\/www\.ecfr\.gov\/current\/title-38\//, `${c.id} links to the text`);
    assert.ok(c.text.length > 80 && c.topic, `${c.id} carries real text and a topic`);
  }
  assert.equal(new Set(CORPUS.map((c) => c.id)).size, CORPUS.length, 'ids are unique');
  for (const l of LINKS) assert.match(l.url, /^https:\/\/(www\.va\.gov|www\.archives\.gov)\//, `${l.id} points at an official site`);
});

test('the prompt forbids prediction, strategy and eligibility findings', () => {
  for (const rule of ['Never predict whether a claim will be granted', 'Never give claim strategy', 'Never say "you qualify"', 'Do not answer from general knowledge']) {
    assert.ok(SYSTEM.includes(rule), `the prompt says: ${rule}`);
  }
  assert.ok(SYSTEM.includes('3.303(d)'), 'it names the misconception worth correcting');
});

test('every question carries the whole corpus, so retrieval cannot fail', () => {
  const m = buildMessages('Can I claim something not in my records?');
  assert.equal(m.length, 1);
  for (const c of CORPUS) assert.ok(m[0].content.includes(c.text.slice(0, 60)), `${c.id} is present`);
  assert.ok(m[0].content.includes('<question>\nCan I claim something not in my records?\n</question>'));
  const withHistory = buildMessages('And then?', [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }]);
  assert.equal(withHistory.length, 3);
});

test('requests are validated and history is made well formed', () => {
  assert.match(parseRequest({}).error, /Send a question/);
  assert.match(parseRequest({ question: 'x' }).error, /Send a question/);
  assert.match(parseRequest({ question: 'x'.repeat(500) }).error, /under 400/);
  assert.equal(parseRequest({ question: '  what   is   service   connection ' }).question, 'what is service connection');
  const r = parseRequest({ question: 'ok then', history: [{ role: 'assistant', content: 'dangling' }, { role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }, { role: 'user', content: 'trailing' }] });
  assert.deepEqual(r.history.map((m) => m.role), ['user', 'assistant'], 'starts with a user turn and ends with an assistant turn');
  assert.deepEqual(parseRequest({ question: 'hiya', history: 'nope' }).history, []);
});

test('an answer is checked before it is shown', () => {
  const good = 'A condition can be service connected even when it was first diagnosed after discharge [38 CFR 3.303(d)].';
  assert.deepEqual(checkAnswer(good), { ok: true, cited: ['38 CFR 3.303(d)'], unknownCitations: [], decidesForTheVeteran: false });
  const invented = checkAnswer('The rule is clear [38 CFR 9.999].');
  assert.equal(invented.ok, false);
  assert.deepEqual(invented.unknownCitations, ['38 CFR 9.999']);
  for (const bad of ['You qualify for compensation [38 CFR 3.303(d)].', 'You are eligible for this.', 'You will receive a rating soon.', 'Based on that, your claim will be granted.']) {
    assert.equal(checkAnswer(bad).decidesForTheVeteran, true, bad);
    assert.equal(checkAnswer(bad).ok, false);
  }
  // The check is deliberately blunt. It flags "you are eligible" even in a
  // sentence that attributes the decision to the VA, because a false flag
  // costs a regenerated answer and a missed one costs a veteran.
  assert.equal(checkAnswer('The VA decides whether you are eligible.').decidesForTheVeteran, true);
});

test('sources under an answer are the ones it cited', () => {
  const s = sourcesFor('First [38 CFR 3.303(d)] and also [38 CFR 3.155(b)] and again [38 CFR 3.303(d)].');
  assert.deepEqual(s.map((x) => x.cite), ['38 CFR 3.303(d)', '38 CFR 3.155(b)'], 'listed in the order of the corpus, not of the answer');
  assert.ok(s.every((x) => x.url.startsWith('https://')));
  assert.deepEqual(sourcesFor('No citations here.'), []);
});

test('the suggested questions are the ones people actually ask', () => {
  assert.ok(SUGGESTED.length >= 6);
  assert.ok(SUGGESTED.some((q) => /service medical records|sick call/i.test(q)), 'the records misconception is offered');
  assert.ok(SUGGESTED.some((q) => /steps to file/i.test(q)));
  assert.ok(SUGGESTED.every((q) => q.length < 70));
});

// ---- endpoint ----
const { onRequestPost } = await import('../functions/api/va-ask.js');

function ctx(body, env = {}, headers = {}) {
  const pending = [];
  return {
    request: new Request('https://junhammer.com/api/va-ask', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://junhammer.com', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) }),
    env,
    waitUntil: (p) => pending.push(p),
    pending,
  };
}
const events = async (stream) => (await new Response(stream).text()).split('\n\n').filter(Boolean).map((b) => ({ event: b.match(/^event: (.+)$/m)[1], data: JSON.parse(b.match(/^data: (.+)$/m)[1]) }));

function model(text) {
  const seen = [];
  return {
    seen,
    fetchImpl: async (url, init) => {
      seen.push(JSON.parse(init.body));
      return Response.json({ content: [{ type: 'text', text }], usage: { input_tokens: 100, output_tokens: 20 } });
    },
  };
}

test('endpoint: validates before spending anything', async () => {
  const real = globalThis.fetch;
  globalThis.fetch = async () => assert.fail('no model call should be made');
  try {
    assert.equal((await onRequestPost(ctx({ question: 'hello there' }, { ANTHROPIC_API_KEY: 'k' }, { origin: 'https://evil.test' }))).status, 403);
    assert.equal((await onRequestPost(ctx('not json', { ANTHROPIC_API_KEY: 'k' }))).status, 400);
    assert.equal((await onRequestPost(ctx({ question: 'x' }, { ANTHROPIC_API_KEY: 'k' }))).status, 400);
    assert.equal((await onRequestPost(ctx({ question: 'a real question here' }))).status, 503);
  } finally {
    globalThis.fetch = real;
  }
});

test('endpoint: a good answer streams with the sources it cited', async () => {
  const real = globalThis.fetch;
  const m = model('A condition first diagnosed after you left can still be service connected [38 CFR 3.303(d)].');
  globalThis.fetch = m.fetchImpl;
  try {
    const c = ctx({ question: 'I never went to sick call, can I still claim?' }, { ANTHROPIC_API_KEY: ' secret ' });
    const out = await events((await onRequestPost(c)).body);
    await Promise.all(c.pending);
    assert.deepEqual(out.map((e) => e.event), ['answer']);
    assert.deepEqual(out[0].data.sources.map((s) => s.cite), ['38 CFR 3.303(d)']);
    assert.ok(out[0].data.sources[0].url.includes('ecfr.gov'));
    assert.ok(m.seen[0].system.includes('Never predict'));
    assert.ok(m.seen[0].messages[0].content.includes('3.303'), 'the corpus went with the question');
    assert.ok(!JSON.stringify(out).includes('secret'));
  } finally {
    globalThis.fetch = real;
  }
});

test('endpoint: an answer that decides the case is refused, not shown', async () => {
  const real = globalThis.fetch;
  globalThis.fetch = model('Good news, you qualify for compensation [38 CFR 3.303(d)].').fetchImpl;
  try {
    const c = ctx({ question: 'do I qualify?' }, { ANTHROPIC_API_KEY: 'k' });
    const out = await events((await onRequestPost(c)).body);
    await Promise.all(c.pending);
    assert.deepEqual(out.map((e) => e.event), ['refused']);
    assert.match(out[0].data.message, /accredited representative/);
    assert.ok(!JSON.stringify(out).includes('you qualify'), 'the refused text never reaches the page');
  } finally {
    globalThis.fetch = real;
  }
});

test('endpoint: an invented citation is refused too', async () => {
  const real = globalThis.fetch;
  globalThis.fetch = model('The rule is at [38 CFR 9.999].').fetchImpl;
  try {
    const c = ctx({ question: 'what is the rule?' }, { ANTHROPIC_API_KEY: 'k' });
    const out = await events((await onRequestPost(c)).body);
    await Promise.all(c.pending);
    assert.equal(out[0].event, 'refused');
  } finally {
    globalThis.fetch = real;
  }
});

test('endpoint: the per-visitor limit holds and points somewhere useful', async () => {
  const real = globalThis.fetch;
  globalThis.fetch = model('Fine [38 CFR 3.303(d)].').fetchImpl;
  try {
    const store = new Map();
    const env = { ANTHROPIC_API_KEY: 'k', VA_ASK_HOURLY_LIMIT: '1', ASK_KV: { get: async (k) => store.get(k) ?? null, put: async (k, v) => void store.set(k, v) } };
    assert.equal((await onRequestPost(ctx({ question: 'first question' }, env))).status, 200);
    const second = await onRequestPost(ctx({ question: 'second question' }, env));
    assert.equal(second.status, 429);
    assert.match((await second.json()).error, /accredited representative/);
  } finally {
    globalThis.fetch = real;
  }
});

test('endpoint: a reply cut off at the token ceiling is not shown', async () => {
  const real = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ content: [{ type: 'text', text: 'The steps are to file an intent to file, which sets the date your claim counts fr' }], stop_reason: 'max_tokens', usage: { input_tokens: 10, output_tokens: 1200 } });
  try {
    const c = ctx({ question: 'what are the steps?' }, { ANTHROPIC_API_KEY: 'k' });
    const out = await events((await onRequestPost(c)).body);
    await Promise.all(c.pending);
    assert.equal(out[0].event, 'error', 'half a sentence about a claim is worse than none');
    assert.ok(!JSON.stringify(out).includes('counts fr'));
  } finally {
    globalThis.fetch = real;
  }
});

// ---- presumptive conditions ----
const { PRESUMPTIVE, NOT_COVERED, findCondition } = await import('../src/va/presumptive.mjs');

test('every presumptive group cites its section and carries the rule', () => {
  assert.deepEqual(PRESUMPTIVE.map((p) => p.id), ['particulate', 'chronic', 'herbicide', 'lejeune']);
  for (const p of PRESUMPTIVE) {
    assert.match(p.cite, /^38 CFR 3\.3/);
    assert.match(p.url, /ecfr\.gov/);
    assert.ok(p.service.length > 30 && p.rule.length > 30, `${p.id} states who it covers and what the rule is`);
    assert.ok(CORPUS.some((c) => c.cite === p.cite), `${p.id} is backed by a passage the answer agent can cite`);
  }
  assert.equal(PRESUMPTIVE.find((p) => p.id === 'chronic').groups[0].conditions.length, 41);
  assert.equal(PRESUMPTIVE.find((p) => p.id === 'lejeune').groups[0].conditions.length, 8);
  assert.ok(NOT_COVERED.some((n) => /statute/.test(n)), 'the lookup says statute-added conditions may be missing');
});

test('a condition lookup finds the list and never more than that', () => {
  const asthma = findCondition('asthma');
  assert.equal(asthma.length, 1);
  assert.equal(asthma[0].id, 'particulate');
  assert.match(asthma[0].service, /Afghanistan/);
  // Some conditions sit on more than one list, with different rules.
  assert.deepEqual(findCondition("Parkinson's disease").map((m) => m.id).sort(), ['herbicide', 'lejeune']);
  assert.ok(findCondition('lung carcinoma').length >= 3, 'word order does not matter');
  assert.equal(findCondition('arthritis')[0].id, 'chronic');
  assert.deepEqual(findCondition('knee pain'), []);
  assert.deepEqual(findCondition('as'), [], 'too short to mean anything');
  assert.deepEqual(findCondition(null), []);
});

test('a deeper paragraph or the bare section of a known passage is a real citation', () => {
  assert.equal(resolveCite('38 CFR 3.320(a)(2)').cite, '38 CFR 3.320(a)');
  assert.equal(resolveCite('38 CFR 3.320').cite, '38 CFR 3.320(a)');
  assert.equal(resolveCite('38 CFR 3.303(d)').cite, '38 CFR 3.303(d)');
  assert.equal(resolveCite('38 CFR 9.999'), null);
  assert.equal(resolveCite('38 CFR 3.32'), null, 'a prefix of a section number is not the section');
  const ok = checkAnswer('Sinusitis is on the list [38 CFR 3.320(a)(2)] for qualifying service [38 CFR 3.320(a)(5)].');
  assert.equal(ok.ok, true);
  assert.deepEqual(sourcesFor('See [38 CFR 3.320(a)(2)] and [38 CFR 3.320(a)(5)].').map((x) => x.cite), ['38 CFR 3.320(a)'], 'both resolve to the one passage');
});

test('a failed first answer is rewritten once before anything is refused', async () => {
  const real = globalThis.fetch;
  const seen = [];
  const replies = ['Good news, you qualify under [38 CFR 3.320(a)].', 'The regulation treats sinusitis as service connected for that service [38 CFR 3.320(a)].'];
  globalThis.fetch = async (url, init) => {
    seen.push(JSON.parse(init.body));
    return Response.json({ content: [{ type: 'text', text: replies[seen.length - 1] }], usage: {} });
  };
  try {
    const c = ctx({ question: 'Is my sinusitis presumptive?' }, { ANTHROPIC_API_KEY: 'k' });
    const out = await events((await onRequestPost(c)).body);
    await Promise.all(c.pending);
    assert.equal(out[0].event, 'answer');
    assert.match(out[0].data.text, /regulation treats/);
    assert.equal(seen.length, 2);
    assert.match(seen[1].messages.at(-1).content, /Only the VA decides that/);
    assert.ok(!JSON.stringify(out).includes('you qualify'));
  } finally {
    globalThis.fetch = real;
  }
  assert.match(correction({ unknownCitations: ['38 CFR 9.999'], decidesForTheVeteran: false }), /38 CFR 9\.999/);
});
