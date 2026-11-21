// Run: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, allowedPath, checkWrite, cleanTargets, costOf, measurementBrief, readAnswer, recordEntry, recordMeasurement, stopReason } from '../scripts/agent/lib.mjs';

const fresh = () => ({ budgetUsd: 20, days: 30, startedAt: null, day: 0, spentUsd: 0, targets: [], measurements: [], journal: [] });

test('cost: tokens plus searches', () => {
  const usage = { input_tokens: 1_000_000, output_tokens: 100_000, server_tool_use: { web_search_requests: 3 } };
  assert.equal(+costOf('claude-haiku-5-5', usage).toFixed(4), 0.18);
  assert.equal(+costOf('claude-sonnet-5-5', { input_tokens: 10_000, output_tokens: 1_000 }).toFixed(4), 0.03);
  assert.throws(() => costOf('unknown-model', {}), /No price/);
});

test('reading an answer: retrieved, cited and position', () => {
  const content = [
    { type: 'server_tool_use', name: 'web_search', input: { query: 'x' } },
    { type: 'web_search_tool_result', content: [{ type: 'web_search_result', url: 'https://moz.com/a' }, { type: 'web_search_result', url: 'https://www.junhammer.com/blog/geo/' }, { type: 'web_search_result', url: 'https://notjunhammer.com/x' }] },
    { type: 'text', text: 'GEO is...', citations: [{ type: 'web_search_result_location', url: 'https://moz.com/a' }] },
    { type: 'text', text: 'More.', citations: [{ type: 'web_search_result_location', url: 'https://junhammer.com/blog/geo/' }, { url: 'https://moz.com/b' }] },
  ];
  assert.deepEqual(readAnswer(content), { cited: true, retrieved: true, position: 2, results: 3, citedDomains: ['moz.com', 'junhammer.com'], sitePages: ['/blog/geo/'] });
  const missed = readAnswer([{ type: 'web_search_tool_result', content: { type: 'web_search_tool_result_error', error_code: 'unavailable' } }, { type: 'text', text: 'No idea.' }]);
  assert.deepEqual([missed.cited, missed.retrieved, missed.position, missed.results], [false, false, null, 0]);
  assert.equal(readAnswer([{ type: 'text', text: 'x', citations: [{ url: 'https://notjunhammer.com/' }] }]).cited, false);
});

test('the agent can only write content files, within limits', () => {
  for (const ok of ['src/content/blog/new-post.md', 'src/content/services/seo.md']) assert.ok(allowedPath(ok));
  for (const bad of ['src/content/blog/../../../.github/workflows/x.md', '.github/workflows/agent.yml', 'functions/api/ask.js', 'src/data/agent.json', 'src/content/blog/Post.md', 'src/content/blog/a.mdx', '/etc/passwd', null]) assert.ok(!allowedPath(bad), String(bad));
  const body = '---\ntitle: x\n---\nText.';
  assert.equal(checkWrite('src/content/blog/a.md', body, []), null);
  assert.match(checkWrite('package.json', body, []), /Only Markdown/);
  assert.match(checkWrite('src/content/blog/a.md', 'No front matter', []), /front matter/);
  assert.match(checkWrite('src/content/blog/a.md', body + ' One — two.', []), /em dashes/);
  assert.match(checkWrite('src/content/blog/a.md', body + 'x'.repeat(CONFIG.maxFileBytes), []), /too large/);
  assert.match(checkWrite('src/content/blog/c.md', body, ['src/content/blog/a.md', 'src/content/blog/b.md']), /files can change/);
  assert.equal(checkWrite('src/content/blog/a.md', body, ['src/content/blog/a.md', 'src/content/blog/b.md']), null, 'rewriting the same file is fine');
});

test('state: entries, spend, measurements and stop rules', () => {
  const s = fresh();
  const now = new Date('2026-11-14T14:00:00Z');
  assert.equal(stopReason(s, now), null);
  recordMeasurement(s, [{ question: 'q', cited: false, retrieved: true, position: 4, sitePages: ['/a/'], citedDomains: ['moz.com'] }], now);
  const e = recordEntry(s, { title: 'Chose targets', observed: 'An em dash — here', action: 'a' }, { files: ['src/content/blog/a.md'], costUsd: 0.1234567 }, now);
  assert.deepEqual([s.day, s.startedAt, s.spentUsd, e.day, e.costUsd], [1, '2026-11-14', 0.1235, 1, 0.1235]);
  assert.ok(!e.observed.includes('—'));
  assert.equal(stopReason(s, now), 'Already ran today.');
  assert.equal(stopReason(s, new Date('2026-11-15T14:00:00Z')), null);
  assert.match(stopReason({ ...s, spentUsd: 20 }, new Date('2026-11-15T14:00:00Z')), /budget/);
  assert.match(stopReason({ ...s, day: 30 }, new Date('2026-11-15T14:00:00Z')), /Day 30/);
  assert.equal(measurementBrief(s)[0].results[0].position, 4);
});

test('targets must point at real pages', () => {
  const pages = [{ url: '/blog/geo/' }, { url: '/services/seo/' }];
  const t = cleanTargets([{ question: 'What is GEO?', page: '/blog/geo/', why: 'w' }, { question: 'x', page: '/made-up/' }, 'junk', ...Array(9).fill({ question: 'q', page: '/services/seo/' })], pages);
  assert.equal(t.length, 5);
  assert.deepEqual(t[0], { question: 'What is GEO?', page: '/blog/geo/', why: 'w' });
  assert.ok(t.every((x) => x.page !== '/made-up/'));
});

// ---- asking for a structured answer without forcing a tool choice ----
const { callForTool } = await import('../scripts/lib/tool-call.mjs');

test('a tool answer is requested without a forced tool choice, and prose gets one retry', async () => {
  const seen = [];
  const replies = [
    { content: [{ type: 'text', text: 'Here are my thoughts in prose.' }], usage: { input_tokens: 10, output_tokens: 5 } },
    { content: [{ type: 'tool_use', id: 't1', name: 'report', input: { ok: true } }], usage: { input_tokens: 12, output_tokens: 6 } },
  ];
  const fetchImpl = async (url, init) => {
    seen.push(JSON.parse(init.body));
    return Response.json(replies[seen.length - 1]);
  };
  const out = await callForTool({ key: 'k', toolName: 'report', fetchImpl, payload: { model: 'm', max_tokens: 100, system: 'Be exact.', tools: [{ name: 'report', input_schema: { type: 'object' } }], messages: [{ role: 'user', content: 'go' }] } });
  assert.deepEqual(out.input, { ok: true });
  assert.deepEqual(out.usage, { input_tokens: 22, output_tokens: 11 });
  assert.ok(seen.every((b) => b.tool_choice.type === 'auto'), 'some models reject a forced tool choice');
  assert.match(seen[0].system, /Answer by calling the report tool/);
  assert.equal(seen[1].messages.length, 3, 'the retry carries the prose reply and a nudge');
  assert.match(seen[1].messages.at(-1).content, /Call the report tool now/);
});

test('a model that never calls the tool, or an API error, fails loudly', async () => {
  const prose = async () => Response.json({ content: [{ type: 'text', text: 'no' }], usage: {} });
  await assert.rejects(callForTool({ key: 'k', toolName: 'report', fetchImpl: prose, payload: { model: 'm', messages: [{ role: 'user', content: 'go' }] } }), /did not call the tool/);
  const bad = async () => new Response('{"type":"error"}', { status: 400 });
  await assert.rejects(callForTool({ key: 'k', toolName: 'report', fetchImpl: bad, payload: { model: 'm', messages: [] } }), /report: 400/);
});

test('edits keep the file front matter; new files need required fields', async () => {
  const { keepFrontMatter, missingFields } = await import('../scripts/agent/lib.mjs');
  const existing = '---\ntitle: "Old"\ndescription: "old"\ndate: "2026-03-24"\ntopic: "AEO"\nimage: "/a.webp"\n---\nOld body\n';
  const proposed = '---\ntitle: "Guess"\ndescription: "New summary"\ndate: 2026-11-22\nauthor: "x"\n---\nNew body\n';
  const out = keepFrontMatter(existing, proposed, '2026-11-21');
  assert.match(out, /title: "Old"/);
  assert.match(out, /description: "New summary"/);
  assert.match(out, /date: "2026-03-24"/);
  assert.match(out, /topic: "AEO"/);
  assert.match(out, /updated: "2026-11-21"/);
  assert.doesNotMatch(out, /author:/);
  assert.match(out, /\nNew body\n$/);
  assert.deepEqual(missingFields('src/content/blog/new.md', '---\ntitle: "x"\ndate: 2026-01-01\n---\nbody'), ['topic']);
  assert.deepEqual(missingFields('src/content/blog/new.md', '---\ntitle: "x"\ndate: 2026-01-01\ntopic: AEO\n---\nbody'), []);
});
