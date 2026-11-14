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
