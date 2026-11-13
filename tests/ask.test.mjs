// Run: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChunks, slugify } from '../src/ask/chunk.mjs';
import { buildIndex, search, tokenize } from '../src/ask/retrieve.mjs';
import { LIMITS, allowedLinks, answerable, buildMessages, parseRequest, publicSources, relayStream } from '../src/ask/answer.mjs';
import { onRequestPost } from '../functions/api/ask.js';
import { declined, grade, rankOf } from '../src/ask/grade.mjs';

const docs = [
  {
    type: 'article', url: '/blog/geo/', title: 'Generative Engine Optimization', description: 'How to get cited in AI answers.',
    body: 'Intro paragraph about getting cited by assistants such as ChatGPT and Perplexity in their generated answers every day.\n\n## What is GEO?\n\nGenerative engine optimization improves how often AI systems cite your content. See the [original paper](https://arxiv.org/abs/2311.09735) and [services](/services/aeo/).\n\n### Who coined it?\n\nResearchers at Princeton and IIT Delhi coined the term in 2023 and published the study at the KDD conference the following year in Barcelona.\n\n```\n## not a heading\n```',
    faqs: [{ q: 'What is GEO?', a: 'Duplicate of the body section.' }, { q: 'Is GEO new?', a: 'The term dates to 2023.' }],
  },
  { type: 'service', url: '/services/seo/', title: 'SEO', summary: 'Technical SEO and content strategy for rankings.', body: '', lists: { 'What you get': ['Site audit', 'Keyword plan'] } },
];
const chunks = buildChunks(docs);
const index = buildIndex(chunks);

test('chunks follow headings, keep anchors and skip duplicate FAQ entries', () => {
  const geo = chunks.filter((c) => c.url === '/blog/geo/');
  assert.deepEqual(geo.map((c) => c.heading), ['', '', 'What is GEO?', 'What is GEO?: Who coined it?', 'Is GEO new?']);
  assert.equal(geo[2].anchor, 'what-is-geo');
  assert.ok(geo[3].text.includes('## not a heading'), 'headings inside code fences stay in the text');
  assert.ok(chunks.find((c) => c.url === '/services/seo/').text.includes('- Site audit'));
  chunks.forEach((c, i) => assert.equal(c.id, i));
});

test('slugify matches Astro heading ids', () => {
  assert.equal(slugify('What is **AEO** & GEO?'), 'what-is-aeo--geo');
});

test('tokenize drops stopwords, stems plurals and adds bigrams', () => {
  assert.deepEqual(tokenize('What are the AI agents?'), ['ai', 'agent', 'ai_agent']);
});

test('search ranks the right page', () => {
  assert.equal(search(index, 'who coined the term').results[0].heading, 'What is GEO?: Who coined it?');
  assert.equal(search(index, 'SEO site audits').results[0].url, '/services/seo/');
});

test('off-topic and empty questions are not answerable', () => {
  assert.equal(answerable(search(index, 'pizza recipe')), false);
  assert.equal(answerable(search(index, 'hi')), false);
  assert.equal(answerable(search(index, 'who coined the term GEO')), true);
});

test('allowed links come only from retrieved text', () => {
  const links = allowedLinks(search(index, 'what is GEO').results);
  assert.ok(links.includes('https://arxiv.org/abs/2311.09735'));
  assert.ok(links.includes('/services/aeo/'));
  assert.ok(!links.some((l) => l.includes('evil')));
});

test('parseRequest validates and trims', () => {
  assert.ok(parseRequest({}).error);
  assert.ok(parseRequest({ question: 'x'.repeat(LIMITS.question + 1) }).error);
  const ok = parseRequest({ question: '  what   is geo ', history: [{ role: 'assistant', content: 'stray' }, { role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }, { role: 'system', content: 'no' }, { role: 'user', content: 'dangling' }] });
  assert.equal(ok.question, 'what is geo');
  assert.deepEqual(ok.history.map((m) => m.role), ['user', 'assistant']);
});

test('prompt wraps sources and question as data', () => {
  const [msg] = buildMessages('what is geo', search(index, 'what is geo').results);
  assert.match(msg.content, /^<sources>\n\[1\] /);
  assert.match(msg.content, /<question>\nwhat is geo\n<\/question>$/);
  assert.equal(publicSources(search(index, 'what is geo').results)[0].n, 1);
});

const upstreamEvents = [
  { type: 'message_start', message: { usage: { input_tokens: 900 } } },
  { type: 'content_block_delta', delta: { type: 'text_delta', text: 'GEO is ' } },
  { type: 'content_block_delta', delta: { type: 'text_delta', text: 'citation work [1].' } },
  { type: 'message_delta', usage: { output_tokens: 12 } },
  { type: 'message_stop' },
];
const upstreamBody = (events, split = 37) => {
  const bytes = new TextEncoder().encode(events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(''));
  return new ReadableStream({
    start(c) {
      for (let i = 0; i < bytes.length; i += split) c.enqueue(bytes.slice(i, i + split));
      c.close();
    },
  });
};
const readEvents = async (stream) =>
  (await new Response(stream).text()).trim().split('\n\n').map((b) => ({ event: b.match(/^event: (.+)$/m)[1], data: JSON.parse(b.match(/^data: (.+)$/m)[1]) }));

test('relayStream handles events split across network chunks', async () => {
  let usage;
  const out = await readEvents(upstreamBody(upstreamEvents, 7).pipeThrough(relayStream((u) => (usage = u))));
  assert.deepEqual(out.map((e) => e.event), ['delta', 'delta', 'done']);
  assert.equal(out.filter((e) => e.event === 'delta').map((e) => e.data.text).join(''), 'GEO is citation work [1].');
  assert.deepEqual(usage, { input: 900, output: 12 });
});

test('relayStream reports a cut-off answer', async () => {
  const out = await readEvents(upstreamBody(upstreamEvents.slice(0, 2)).pipeThrough(relayStream()));
  assert.equal(out.at(-1).event, 'error');
});

// The Pages Function, with the asset store, the model API and waitUntil stubbed.
const ctx = (body, env = {}, headers = {}) => {
  const pending = [];
  return {
    request: new Request('https://junhammer.com/api/ask', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://junhammer.com', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) }),
    env: { ASSETS: { fetch: async () => new Response(JSON.stringify({ chunks })) }, ...env },
    waitUntil: (p) => pending.push(p),
    pending,
  };
};

test('endpoint: rejects other origins and bad input', async () => {
  assert.equal((await onRequestPost(ctx({ question: 'what is geo' }, {}, { origin: 'https://evil.example' }))).status, 403);
  assert.equal((await onRequestPost(ctx('not json'))).status, 400);
  assert.equal((await onRequestPost(ctx({ question: '' }))).status, 400);
});

test('endpoint: off-topic never reaches the model', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => assert.fail('model was called');
  try {
    const res = await onRequestPost(ctx({ question: 'pizza recipe' }, { ANTHROPIC_API_KEY: 'k' }));
    assert.equal((await res.json()).mode, 'no_match');
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('endpoint: without a key it returns search results', async () => {
  const data = await (await onRequestPost(ctx({ question: 'who coined the term GEO' }))).json();
  assert.equal(data.mode, 'search');
  assert.equal(data.reason, 'no_key');
  assert.equal(data.sources[0].url, '/blog/geo/#who-coined-it');
  const empty = await (await onRequestPost(ctx({ question: 'who coined the term GEO' }, { ANTHROPIC_API_KEY: '  ' }))).json();
  assert.equal(empty.reason, 'empty_key');
  assert.deepEqual(empty.similar, ['ANTHROPIC_API_KEY']);
});

test('endpoint: streams sources, then the answer, and sends the key only to the API', async () => {
  const realFetch = globalThis.fetch;
  let sent;
  globalThis.fetch = async (url, init) => {
    sent = { url, init, body: JSON.parse(init.body) };
    return new Response(upstreamBody(upstreamEvents));
  };
  try {
    const c = ctx({ question: 'who coined the term GEO' }, { 'ANTHROPIC_API_KEY ': ' secret-key\n', ASK_MODEL: 'test-model' });
    const res = await onRequestPost(c);
    const out = await readEvents(res.body);
    await Promise.all(c.pending);
    assert.deepEqual(out.map((e) => e.event), ['sources', 'delta', 'delta', 'done']);
    assert.ok(out[0].data.sources.length && out[0].data.links.includes('/blog/geo/'));
    assert.equal(sent.url, 'https://api.anthropic.com/v1/messages');
    assert.equal(sent.init.headers['x-api-key'], 'secret-key');
    assert.equal(sent.body.model, 'test-model');
    assert.equal(sent.body.stream, true);
    assert.ok(!JSON.stringify(out).includes('secret-key'));
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('endpoint: a model failure falls back to search results', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('{"type":"error"}', { status: 529 });
  try {
    const data = await (await onRequestPost(ctx({ question: 'who coined the term GEO' }, { ANTHROPIC_API_KEY: 'k' }))).json();
    assert.equal(data.mode, 'search');
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('endpoint: the hourly limit falls back to search results', async () => {
  const store = new Map();
  const ASK_KV = { get: async (k) => store.get(k) ?? null, put: async (k, v) => void store.set(k, v) };
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => (calls++, new Response(upstreamBody(upstreamEvents)));
  try {
    const env = { ANTHROPIC_API_KEY: 'k', ASK_KV, ASK_HOURLY_LIMIT: '1' };
    const first = ctx({ question: 'who coined the term GEO' }, env);
    await (await onRequestPost(first)).text();
    await Promise.all(first.pending);
    const second = await (await onRequestPost(ctx({ question: 'who coined the term GEO' }, env))).json();
    assert.equal(second.limited, true);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('grading: citations, links and length are checked by rule', () => {
  const results = search(index, 'what is GEO').results;
  const expect = ['/blog/geo/'];
  const good = grade('GEO improves how often AI cites you [1]. See the [paper](https://arxiv.org/abs/2311.09735).', results, expect);
  assert.deepEqual(Object.values(good), [true, true, true, true, true]);
  const bad = grade(`Trust me [99]. See [this](https://evil.example/). ${'word '.repeat(230)}`, results, expect);
  assert.deepEqual(bad, { cites: true, citesInRange: false, citesExpected: false, linksAllowed: false, short: false });
  assert.equal(grade('No citation at all.', results, expect).cites, false);
  assert.equal(rankOf(results, expect), 0);
  assert.equal(rankOf(results, ['/nope/']), -1);
  assert.equal(declined('This site does not cover that.'), true);
  assert.equal(declined('This site does not cover that, but [1] says so.'), false);
});
