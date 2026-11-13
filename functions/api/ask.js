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
import { buildIndex, search } from '../../src/ask/retrieve.mjs';
import { LIMITS, SYSTEM, allowedLinks, answerable, buildMessages, parseRequest, publicSources, relayStream, sse } from '../../src/ask/answer.mjs';

const DEFAULT_MODEL = 'claude-haiku-5-5';
const API = 'https://api.anthropic.com/v1/messages';

let cached; // one index per isolate; a new deployment starts new isolates

async function loadIndex(context) {
  if (!cached) {
    const res = await context.env.ASSETS.fetch(new URL('/ask-index.json', context.request.url));
    if (!res.ok) throw new Error(`index ${res.status}`);
    cached = buildIndex((await res.json()).chunks);
  }
  return cached;
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
  const found = search(index, lastAsked ? `${question} ${lastAsked}` : question);
  const sources = publicSources(found.results);
  const log = (extra) =>
    console.log(JSON.stringify({ ask: 1, chars: question.length, top: found.results[0]?.url ?? null, coverage: +found.coverage.toFixed(2), ms: Date.now() - started, ...extra }));

  if (!answerable(found)) {
    log({ mode: 'no_match' });
    return json({ mode: 'no_match', sources: [] });
  }
  if (!env.ANTHROPIC_API_KEY) {
    log({ mode: 'search' });
    return json({ mode: 'search', reason: 'no_key', sources });
  }
  if (await overLimit(env, request.headers.get('cf-connecting-ip') || 'unknown')) {
    log({ mode: 'limited' });
    return json({ mode: 'search', reason: 'limited', limited: true, sources });
  }

  const upstream = await fetch(API, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
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
