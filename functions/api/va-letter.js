// POST /api/va-letter: the optional model reading of a VA decision letter.
//
// The page reads a letter in the browser first and only calls this when the
// veteran asks. The text arrives already redacted and is redacted again here.
// Nothing about the letter is logged: only counts. Whatever the model returns
// is kept only where the letter itself backs it (see ground()).
//
// Settings: ANTHROPIC_API_KEY (required), VA_LETTER_MODEL (optional), ASK_KV
// (optional, shared), VA_LETTER_HOURLY_LIMIT (default 5 per visitor),
// VA_LETTER_DAILY_LIMIT (default 100, whole site).
import { LETTER_LIMIT, LETTER_SYSTEM, LETTER_TOOL, extractByPattern, ground, redact } from '../../src/va/letter.mjs';

const DEFAULT_MODEL = 'claude-haiku-5-5';
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

const memory = new Map();
const memoryKV = { get: async (k) => memory.get(k) ?? null, put: async (k, v) => void memory.set(k, v) };

function apiKey(env) {
  const name = Object.keys(env).find((k) => k.trim().toUpperCase() === 'ANTHROPIC_API_KEY');
  return name && typeof env[name] === 'string' ? env[name].trim() : '';
}

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get('origin');
  if (origin && new URL(origin).host !== new URL(request.url).host) return json({ error: 'Not allowed.' }, 403);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Send JSON.' }, 400);
  }
  if (typeof body?.text !== 'string' || body.text.trim().length < 40) return json({ error: 'Paste the decision section of the letter.' }, 400);
  if (body.text.length > LETTER_LIMIT) return json({ error: `Keep it under ${LETTER_LIMIT.toLocaleString('en-US')} characters. The decision section is enough.` }, 400);

  const key = apiKey(env);
  if (!key) return json({ error: 'This is not switched on yet.', reason: 'no_key' }, 503);

  const kv = env.ASK_KV || memoryKV;
  const now = new Date().toISOString();
  const dayKey = `valetter:day:${now.slice(0, 10)}`;
  const ipKey = `valetter:ip:${request.headers.get('cf-connecting-ip') || 'unknown'}:${now.slice(0, 13)}`;
  const [d, h] = await Promise.all([kv.get(dayKey), kv.get(ipKey)]);
  if ((Number(d) || 0) >= Number(env.VA_LETTER_DAILY_LIMIT || 100) || (Number(h) || 0) >= Number(env.VA_LETTER_HOURLY_LIMIT || 5)) {
    return json({ error: 'This is at its limit for now. Enter the ratings by hand, or try again in an hour.', reason: 'limited' }, 429);
  }
  await Promise.all([kv.put(dayKey, String((Number(d) || 0) + 1), { expirationTtl: 2 * 86400 }), kv.put(ipKey, String((Number(h) || 0) + 1), { expirationTtl: 2 * 3600 })]);

  // Redacted again on the server, in case the page's step was skipped.
  const { text } = redact(body.text);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: env.VA_LETTER_MODEL || DEFAULT_MODEL,
        max_tokens: 1500,
        system: LETTER_SYSTEM,
        tools: [LETTER_TOOL],
        tool_choice: { type: 'tool', name: 'record_ratings' },
        messages: [{ role: 'user', content: `<letter>\n${text}\n</letter>` }],
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      console.error('va-letter: model call failed', res.status);
      return json({ error: 'That did not work. Enter the ratings by hand, or try again in a moment.' }, 502);
    }
    const data = await res.json();
    const read = data.content?.find((b) => b.type === 'tool_use')?.input?.ratings;
    const { items, dropped } = ground(read, text);
    // Counts only. The letter and what was read from it are never logged.
    console.log(JSON.stringify({ vaLetter: 1, kept: items.length, dropped: dropped.length }));
    return json({ items, droppedCount: dropped.length, denied: extractByPattern(text).denied });
  } catch {
    return json({ error: 'That did not work. Enter the ratings by hand, or try again in a moment.' }, 502);
  }
}

export const onRequest = () => json({ error: 'Use POST.' }, 405);
