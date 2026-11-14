// POST /api/va-ask: answers questions about VA disability eligibility and the
// claim process, grounded only in the Title 38 passages in src/va/corpus.mjs.
//
// The whole corpus goes with every question, so there is no retrieval step to
// go wrong. Answers are checked before they are streamed: a citation that is
// not in the corpus, or wording that decides a veteran's case, is refused
// rather than shown.
//
// Settings (Cloudflare Pages > Settings > Variables and Secrets):
//   ANTHROPIC_API_KEY  secret. Required.
//   VA_ASK_MODEL       optional. Defaults to DEFAULT_MODEL below.
//   ASK_KV             optional KV binding, shared. Makes the limits site-wide.
//   VA_ASK_HOURLY_LIMIT  per visitor, default 10. VA_ASK_DAILY_LIMIT, site-wide, default 300.
import { LIMITS, SYSTEM, buildMessages, checkAnswer, correction, parseRequest, sourcesFor } from '../../src/va/answer.mjs';
import { sse } from '../../src/ask/answer.mjs';

const DEFAULT_MODEL = 'claude-haiku-5-5';
const API = 'https://api.anthropic.com/v1/messages';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

const memory = new Map();
const memoryKV = {
  get: async (k) => memory.get(k) ?? null,
  put: async (k, v) => {
    if (memory.size > 5000) memory.clear();
    memory.set(k, v);
  },
};

async function overLimit(env, ip) {
  const kv = env.ASK_KV || memoryKV;
  const now = new Date().toISOString();
  const day = `vaask:day:${now.slice(0, 10)}`;
  const hour = `vaask:ip:${ip}:${now.slice(0, 13)}`;
  const [d, h] = await Promise.all([kv.get(day), kv.get(hour)]);
  const dayCount = Number(d) || 0;
  const hourCount = Number(h) || 0;
  if (dayCount >= Number(env.VA_ASK_DAILY_LIMIT || 300) || hourCount >= Number(env.VA_ASK_HOURLY_LIMIT || 10)) return true;
  await Promise.all([kv.put(day, String(dayCount + 1), { expirationTtl: 2 * 86400 }), kv.put(hour, String(hourCount + 1), { expirationTtl: 2 * 3600 })]);
  return false;
}

function apiKey(env) {
  const name = Object.keys(env).find((k) => k.trim().toUpperCase() === 'ANTHROPIC_API_KEY');
  return name && typeof env[name] === 'string' ? env[name].trim() : '';
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const started = Date.now();
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

  const key = apiKey(env);
  if (!key) return json({ error: 'This is not switched on yet.', reason: 'no_key' }, 503);
  if (await overLimit(env, request.headers.get('cf-connecting-ip') || 'unknown')) {
    return json({ error: 'This is at its limit for now. Try again in an hour, or talk to an accredited representative, who is free.', reason: 'limited' }, 429);
  }

  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const emit = (event, data) => writer.write(sse(event, data)).catch(() => {});

  context.waitUntil(
    (async () => {
      try {
        const model = env.VA_ASK_MODEL || DEFAULT_MODEL;
        const messages = buildMessages(parsed.question, parsed.history);
        const generate = async (msgs) => {
          const res = await fetch(API, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
            body: JSON.stringify({ model, max_tokens: LIMITS.maxTokens, system: SYSTEM, messages: msgs }),
            signal: AbortSignal.timeout(30000),
          });
          if (!res.ok) {
            console.error('va-ask: model call failed', res.status, (await res.text()).slice(0, 200));
            throw new Error(`model_${res.status}`);
          }
          const data = await res.json();
          // A reply cut off at the token ceiling can end mid-sentence, which on
          // this subject reads as a half-finished instruction. Refuse it.
          if (data.stop_reason === 'max_tokens') throw new Error('truncated');
          return { data, text: (data.content || []).map((b) => b.text || '').join('').trim() };
        };
        // Checked whole, before anything reaches the page. A first answer that
        // fails gets one chance to be rewritten with the problem named, since
        // refusing a good answer over a fixable slip helps nobody.
        let { data, text } = await generate(messages);
        let check = checkAnswer(text);
        let retried = false;
        if (text && !check.ok) {
          retried = true;
          ({ data, text } = await generate([...messages, { role: 'assistant', content: text }, { role: 'user', content: correction(check) }]));
          check = checkAnswer(text);
        }
        if (!text || !check.ok) {
          console.error('va-ask: answer refused', JSON.stringify({ unknown: check.unknownCitations, decides: check.decidesForTheVeteran }));
          emit('refused', {
            message: 'That answer did not pass its own checks, so it is not being shown. This is the point at which to talk to a VA accredited representative: they are free, they can see your records, and they can act on your behalf.',
            link: 'https://www.va.gov/get-help-from-accredited-representative/',
          });
        } else {
          emit('answer', { text, sources: sourcesFor(text) });
        }
        console.log(JSON.stringify({ vaAsk: 1, ok: check.ok, retried, cited: check.cited.length, in: data.usage?.input_tokens, out: data.usage?.output_tokens, ms: Date.now() - started }));
      } catch (e) {
        console.error('va-ask: failed', String(e?.message || e).slice(0, 60));
        emit('error', { message: 'Something went wrong. Try again in a moment.' });
      } finally {
        await writer.close().catch(() => {});
      }
    })(),
  );
  return new Response(stream.readable, { headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store' } });
}

export const onRequest = () => json({ error: 'Use POST.' }, 405);
