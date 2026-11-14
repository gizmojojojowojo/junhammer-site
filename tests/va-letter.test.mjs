// Run: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { extractByPattern, ground, limbOf, redact, suggestBilateral } from '../src/va/letter.mjs';

// A made-up letter in the standard wording of a rating decision.
const LETTER = `DEPARTMENT OF VETERANS AFFAIRS
File Number: 123 45 6789
In reply refer to: C 12345678
Contact: 800-827-1000 or veteran@example.org

DECISION
1. Service connection for tinnitus is granted with an evaluation of 10 percent effective March 3, 2024.
2. Service connection for left knee strain is granted with an evaluation of 20 percent effective March 3, 2024.
3. Evaluation of right knee patellofemoral syndrome, which is currently 10 percent disabling, is increased to 30 percent effective March 3, 2024.
4. Evaluation of migraine headaches, which is currently 30 percent disabling, is continued.
5. Service connection for sleep apnea is denied.
6. Service connection for scar, left forearm is granted with an evaluation of 0 percent effective March 3, 2024.
`;

test('identifiers are replaced before anything else happens', () => {
  const r = redact(LETTER);
  assert.ok(!/123 45 6789/.test(r.text) && !/12345678/.test(r.text), 'file and Social Security numbers are gone');
  assert.ok(!/800-827-1000/.test(r.text) && !/veteran@example\.org/.test(r.text));
  assert.ok(r.redactions >= 4);
  assert.match(r.text, /tinnitus is granted with an evaluation of 10 percent/, 'the ratings themselves survive');
  assert.match(r.text, /March 3, 2024/, 'ordinary dates survive');
  assert.deepEqual(redact(''), { text: '', redactions: 0 });
});

test('the standard sentences are read without a model', () => {
  const { items, denied } = extractByPattern(redact(LETTER).text);
  assert.deepEqual(items.map((i) => [i.condition, i.rating, i.status]), [
    ['tinnitus', 10, 'granted'],
    ['left knee strain', 20, 'granted'],
    ['right knee patellofemoral syndrome', 30, 'increased'],
    ['migraine headaches', 30, 'continued'],
    ['scar, left forearm', 0, 'granted'],
  ]);
  assert.deepEqual(denied, ['sleep apnea'], 'a denial is listed apart and never given a rating');
  assert.deepEqual(extractByPattern('Nothing to see here.'), { items: [], denied: [] });
  assert.equal(extractByPattern('Service connection for x is granted with an evaluation of 15 percent').items.length, 0, '15 is not a rating');
});

test('an increase replaces the rating it supersedes', () => {
  const t = 'Service connection for lumbar strain is granted with an evaluation of 10 percent. Later: Evaluation of lumbar strain, which is currently 10 percent disabling, is increased to 40 percent effective today.';
  assert.deepEqual(extractByPattern(t).items.map((i) => [i.condition, i.rating]), [['lumbar strain', 40]]);
});

test('a ratings table line is read too', () => {
  const t = 'Condition            Rating   Status\nPTSD                 70%      Service Connected\nleft ankle sprain    10%      Service Connected\nhypertension         0%       Not Service Connected';
  assert.deepEqual(extractByPattern(t).items.map((i) => [i.condition, i.rating]), [['PTSD', 70], ['left ankle sprain', 10]]);
});

test('the paired-limb flag is suggested only with a compensable left and right in one pair', () => {
  const { items } = extractByPattern(LETTER);
  const flag = Object.fromEntries(items.map((i) => [i.condition, i.bilateral]));
  assert.equal(flag['left knee strain'], true);
  assert.equal(flag['right knee patellofemoral syndrome'], true);
  assert.equal(flag['tinnitus'], false);
  assert.equal(flag['scar, left forearm'], false, 'a 0 percent arm with no right arm is not a pair');
  assert.deepEqual(limbOf('bilateral pes planus'), { side: 'both', group: 'lower' });
  assert.equal(suggestBilateral([{ condition: 'bilateral pes planus', rating: 30 }])[0].bilateral, true);
  assert.equal(suggestBilateral([{ condition: 'left knee', rating: 10 }, { condition: 'right shoulder', rating: 10 }]).some((i) => i.bilateral), false, 'a leg and an arm are not a pair');
  assert.equal(suggestBilateral([{ condition: 'left knee', rating: 10 }, { condition: 'right knee', rating: 0 }]).some((i) => i.bilateral), false, 'a 0 percent side is not compensable');
});

test('a model reading is kept only where the letter backs it', () => {
  const { items, dropped } = ground(
    [
      { condition: 'tinnitus', rating: 10, status: 'granted' },
      { condition: 'left knee strain', rating: 20 },
      { condition: 'post-traumatic stress disorder', rating: 70 }, // not in the letter
      { condition: 'migraine headaches', rating: 50 }, // the letter says 30
      { condition: 'tinnitus', rating: 10 }, // duplicate
      { condition: 'right knee patellofemoral syndrome', rating: 35 }, // not a rating
      null,
    ],
    LETTER,
  );
  assert.deepEqual(items.map((i) => [i.condition, i.rating]), [['tinnitus', 10], ['left knee strain', 20]]);
  assert.equal(dropped.length, 4, 'invented conditions and wrong numbers are dropped, not shown');
  assert.deepEqual(ground('nope', LETTER), { items: [], dropped: [] });
});

// ---- endpoint ----
const { onRequestPost } = await import('../functions/api/va-letter.js');
const post = (body, env = {}, headers = {}) =>
  onRequestPost({ request: new Request('https://junhammer.com/api/va-letter', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://junhammer.com', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) }), env });

test('letter endpoint: validates before spending anything', async () => {
  const real = globalThis.fetch;
  globalThis.fetch = async () => assert.fail('no model call should be made');
  try {
    assert.equal((await post({ text: LETTER }, { ANTHROPIC_API_KEY: 'k' }, { origin: 'https://evil.example.org' })).status, 403);
    assert.equal((await post('nope', { ANTHROPIC_API_KEY: 'k' })).status, 400);
    assert.equal((await post({ text: 'too short' }, { ANTHROPIC_API_KEY: 'k' })).status, 400);
    assert.equal((await post({ text: 'x'.repeat(13000) }, { ANTHROPIC_API_KEY: 'k' })).status, 400);
    assert.equal((await post({ text: LETTER })).status, 503);
  } finally {
    globalThis.fetch = real;
  }
});

test('letter endpoint: redacts again, and keeps only what the letter backs', async () => {
  const real = globalThis.fetch;
  let sent;
  globalThis.fetch = async (url, init) => {
    sent = JSON.parse(init.body);
    return Response.json({ content: [{ type: 'tool_use', name: 'record_ratings', input: { ratings: [
      { condition: 'tinnitus', rating: 10, status: 'granted' },
      { condition: 'left knee strain', rating: 20, status: 'granted' },
      { condition: 'right knee patellofemoral syndrome', rating: 30, status: 'increased' },
      { condition: 'traumatic brain injury', rating: 70 },
    ] } }] });
  };
  try {
    const res = await post({ text: LETTER }, { ANTHROPIC_API_KEY: ' secret ' });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.deepEqual(data.items.map((i) => [i.condition, i.rating, i.bilateral]), [['tinnitus', 10, false], ['left knee strain', 20, true], ['right knee patellofemoral syndrome', 30, true]]);
    assert.equal(data.droppedCount, 1, 'the invented condition is dropped');
    assert.deepEqual(data.denied, ['sleep apnea']);
    const prompt = sent.messages[0].content;
    assert.ok(!/123 45 6789/.test(prompt) && !/12345678/.test(prompt) && !/veteran@example/.test(prompt), 'identifiers never reach the model');
    assert.ok(!JSON.stringify(data).includes('secret'));
  } finally {
    globalThis.fetch = real;
  }
});

test('letter endpoint: the hourly limit holds', async () => {
  const real = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ content: [{ type: 'tool_use', name: 'record_ratings', input: { ratings: [] } }] });
  try {
    const m = new Map();
    const env = { ANTHROPIC_API_KEY: 'k', VA_LETTER_HOURLY_LIMIT: '1', ASK_KV: { get: async (k) => m.get(k) ?? null, put: async (k, v) => void m.set(k, v) } };
    assert.equal((await post({ text: LETTER }, env)).status, 200);
    assert.equal((await post({ text: LETTER }, env)).status, 429);
  } finally {
    globalThis.fetch = real;
  }
});
