// POST /api/ask: answers a visitor question from this site's own content.
//
// 1. Retrieve the best-matching passages from the index built at deploy time.
// 2. If nothing matches, say so without calling the model.
// 3. Otherwise stream an answer from Claude that cites those passages.
//
// Settings (Cloudflare Pages > Settings > Variables and Secrets):
//   ANTHROPIC_API_KEY  secret. Without it the endpoint returns search results only.
//   ASK_MODEL          optional. Defaults to DEFAULT_MODEL below.
//   ASK_KV             optional KV binding. Turns on per-visitor and daily limits.
//   ASK_HOURLY_LIMIT   optional, per visitor. Default 20.
//   ASK_DAILY_LIMIT    optional, whole site. Default 400.
//   AI                 optional Workers AI binding. Makes search by meaning available.
//   ASK_RETRIEVAL      optional. "keyword" or "hybrid" (keyword plus meaning). Defaults to DEFAULT_RETRIEVAL below.
import { buildIndex, search } from '../../src/ask/retrieve.mjs';
import { LIMITS, SYSTEM, allowedLinks, answerable, buildMessages, parseRequest, publicSources, relayStream, sse } from '../../src/ask/answer.mjs';

import { EMBED_MODEL, QUERY_PREFIX, buildStore, decodeStore, encodeStore, hybridSearch } from '../../src/ask/semantic.mjs';

const DEFAULT_MODEL = 'claude-haiku-5-5';
const DEFAULT_RETRIEVAL = 'keyword';
const API = 'https://api.anthropic.com/v1/messages';

let cached; // one index per isolate; a new deployment starts new isolates

async function loadIndex(context) {
  if (!cached) {
    const res = await context.env.ASSETS.fetch(new URL('/ask-index.json', context.request.url));
    if (!res.ok) throw new Error(`index ${res.status}`);
    const text = await res.text();
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
    cached = buildIndex(JSON.parse(text).chunks);
    // Passage vectors are stored under this hash, so new content gets new vectors.
    cached.hash = [...digest.slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  return cached;
}

const embed = async (env, texts) => (await env.AI.run(EMBED_MODEL, { text: texts, pooling: 'cls' })).data;

let vectors; // { key, store } for this isolate
let building; // one build at a time

/**
 * Passage vectors for the current index, or null while they are not ready.
 * The first request after a content change starts the build in the background
 * and is served by keyword search; the vectors are then saved to KV for every isolate.
 */
async function loadVectors(context, index) {
  const { env } = context;
  if (!env.AI) return null;
  const key = `ask:vec:1:${index.hash}`;
  if (vectors?.key === key) return vectors.store;
  if (env.ASK_KV) {
    const saved = await env.ASK_KV.get(key);
    const store = saved && decodeStore(saved, index.n);
    if (store) {
      vectors = { key, store };
      return store;
    }
  }
  if (!building) {
    building = (async () => {
      const store = await buildStore(index.chunks, (texts) => embed(env, texts));
      vectors = { key, store };
      if (env.ASK_KV) await env.ASK_KV.put(key, encodeStore(store), { expirationTtl: 60 * 86400 });
    })()
      .catch((e) => console.error('ask: embedding build failed', e))
      .finally(() => {
        building = null;
      });
    context.waitUntil(building);
  }
  return null;
}

/** Hybrid results, or null when meaning search is unavailable, not ready or slow. The caller falls back to keywords. */
async function semantic(context, index, query) {
  try {
    const store = await loadVectors(context, index);
    if (!store) return null;
    const [vector] = await Promise.race([
      embed(context.env, [QUERY_PREFIX + query]),
      new Promise((_, reject) => setTimeout(() => reject(new Error('embedding timeout')), 3000)),
    ]);
    return hybridSearch(index, query, vector, store);
  } catch (e) {
    console.error('ask: semantic search failed', e);
    return null;
  }
}

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

/** Fixed-window counters in KV. Approximate under bursts, which is fine for a cost guard. */
async function overLimit(env, ip) {
  if (!env.ASK_KV) return false;
  const now = new Date();
  const day = `ask:day:${now.toISOString().slice(0, 10)}`;
  const hour = `ask:ip:${ip}:${now.toISOString().slice(0, 13)}`;
  const [d, h] = await Promise.all([env.ASK_KV.get(day), env.ASK_KV.get(hour)]);
  const dayCount = Number(d) || 0;
  const hourCount = Number(h) || 0;
  if (dayCount >= Number(env.ASK_DAILY_LIMIT || 400) || hourCount >= Number(env.ASK_HOURLY_LIMIT || 20)) return true;
  await Promise.all([
    env.ASK_KV.put(day, String(dayCount + 1), { expirationTtl: 2 * 86400 }),
    env.ASK_KV.put(hour, String(hourCount + 1), { expirationTtl: 2 * 3600 }),
  ]);
  return false;
}

/** Reads the key, forgiving stray spaces or lowercase in the dashboard entry. */
function apiKey(env) {
  const name = Object.keys(env).find((k) => k.trim().toUpperCase() === 'ANTHROPIC_API_KEY');
  const value = name && typeof env[name] === 'string' ? env[name].trim() : '';
  return { key: value, state: !name ? 'no_key' : value ? 'ok' : 'empty_key' };
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const started = Date.now();

  // Browsers send Origin on POST. Refuse other sites embedding this endpoint.
  const origin = request.headers.get('origin');
  if (origin && new URL(origin).host !== new URL(request.url).host) return json({ error: 'Not allowed.' }, 403);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Send JSON.' }, 400);
  }
  const parsed = parseRequest(body);
  if (parsed.error) return json({ error: parsed.error }, 400);
  const { question, history } = parsed;

  let index;
  try {
    index = await loadIndex(context);
  } catch (e) {
    console.error('ask: index load failed', e);
    return json({ error: 'Search is not available right now.' }, 503);
  }

  // A follow-up like "how much does that cost?" needs the earlier question to retrieve well.
  const lastAsked = [...history].reverse().find((m) => m.role === 'user')?.content ?? '';
  const query = lastAsked ? `${question} ${lastAsked}` : question;
  // A dry run returns the ranking only and never calls the answer model. The
  // evals use it to compare keyword and hybrid retrieval on the live site.
  const dry = body.dry === true;
  const wanted = dry && (body.retrieval === 'hybrid' || body.retrieval === 'keyword') ? body.retrieval : env.ASK_RETRIEVAL || DEFAULT_RETRIEVAL;
  let found = search(index, query);
  let retrieval = 'keyword';
  if (wanted === 'hybrid') {
    const hybrid = await semantic(context, index, query);
    if (hybrid) {
      found = hybrid;
      retrieval = 'hybrid';
    }
  }
  if (dry) return json({ mode: 'dry', retrieval, answerable: answerable(found), urls: found.results.map((r) => r.url) });
  const sources = publicSources(found.results);
  const log = (extra) =>
    console.log(JSON.stringify({ ask: 1, chars: question.length, top: found.results[0]?.url ?? null, coverage: +found.coverage.toFixed(2), retrieval, ms: Date.now() - started, ...extra }));

  if (!answerable(found)) {
    log({ mode: 'no_match' });
    return json({ mode: 'no_match', sources: [] });
  }
  const { key, state } = apiKey(env);
  if (!key) {
    log({ mode: 'search', reason: state });
    // Variable names only, never values: enough to spot a misnamed entry.
    const similar = Object.keys(env).filter((k) => /anthropic|claude|api.?key/i.test(k));
    return json({ mode: 'search', reason: state, similar, sources });
  }
  if (await overLimit(env, request.headers.get('cf-connecting-ip') || 'unknown')) {
    log({ mode: 'limited' });
    return json({ mode: 'search', reason: 'limited', limited: true, sources });
  }

  const upstream = await fetch(API, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: env.ASK_MODEL || DEFAULT_MODEL,
      max_tokens: LIMITS.maxTokens,
      stream: true,
      system: SYSTEM,
      messages: buildMessages(question, found.results, history),
    }),
  });
  if (!upstream.ok || !upstream.body) {
    console.error('ask: model call failed', upstream.status, (await upstream.text()).slice(0, 300));
    log({ mode: 'model_error', status: upstream.status });
    // The visitor still gets the matching pages. The status code helps diagnose
    // setup problems (401 bad key, 404 unknown model, 429 or 529 busy).
    return json({ mode: 'search', reason: `model_${upstream.status}`, sources });
  }

  const head = new TransformStream();
  const writer = head.writable.getWriter();
  context.waitUntil(
    (async () => {
      await writer.write(sse('sources', { sources, links: allowedLinks(found.results) }));
      writer.releaseLock();
      await upstream.body
        .pipeThrough(relayStream((usage) => log({ mode: 'answer', ...usage })))
        .pipeTo(head.writable);
    })().catch((e) => console.error('ask: stream failed', e)),
  );
  return new Response(head.readable, {
    headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export const onRequest = () => json({ error: 'Use POST.' }, 405);
