// POST /api/audit: runs the AEO audit agent on a visitor-supplied URL and
// streams its progress, then the report.
//
// The agent loop lives in src/audit/agent.mjs. This file handles the request:
// who may call it, how often, and how the model is reached.
//
// Settings (Cloudflare Pages > Settings > Variables and Secrets):
//   ANTHROPIC_API_KEY   secret. Required.
//   AUDIT_MODEL         optional. Defaults to DEFAULT_MODEL below.
//   ASK_KV              optional KV binding, shared with /api/ask. Makes the limits hold across the whole site.
//   AUDIT_HOURLY_LIMIT  optional, per visitor. Default 3.
//   AUDIT_DAILY_LIMIT   optional, whole site. Default 60.
import { checkUrl } from '../../src/audit/guard.mjs';
import { LIMITS, runAudit } from '../../src/audit/agent.mjs';
import { sse } from '../../src/ask/answer.mjs';

const DEFAULT_MODEL = 'claude-haiku-5-5';
const API = 'https://api.anthropic.com/v1/messages';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

// Without KV the counters live in this isolate only. That is a weaker guard,
// so the spend limit on the API key stays the hard cap.
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
  const day = `audit:day:${now.slice(0, 10)}`;
  const hour = `audit:ip:${ip}:${now.slice(0, 13)}`;
  const [d, h] = await Promise.all([kv.get(day), kv.get(hour)]);
  const dayCount = Number(d) || 0;
  const hourCount = Number(h) || 0;
  if (dayCount >= Number(env.AUDIT_DAILY_LIMIT || 60) || hourCount >= Number(env.AUDIT_HOURLY_LIMIT || 3)) return true;
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
  const checked = checkUrl(body?.url);
  if (checked.error) return json({ error: checked.error }, 400);
  const target = checked.url;

  const key = apiKey(env);
  if (!key) return json({ error: 'The audit is not switched on yet.', reason: 'no_key' }, 503);
  if (await overLimit(env, request.headers.get('cf-connecting-ip') || 'unknown')) {
    return json({ error: 'The audit is at its limit for now. Try again in an hour.', reason: 'limited' }, 429);
  }

  const callModel = async (payload) => {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(LIMITS.modelTimeoutMs),
    });
    if (!res.ok) {
      console.error('audit: model call failed', res.status, (await res.text()).slice(0, 300));
      throw new Error(`model_${res.status}`);
    }
    return res.json();
  };

  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const emit = (event, data) => writer.write(sse(event, data)).catch(() => {});
  context.waitUntil(
    (async () => {
      try {
        emit('start', { url: target.href });
        const { report, usage, steps } = await runAudit({ target, callModel, emit, model: env.AUDIT_MODEL || DEFAULT_MODEL });
        emit('report', report);
        console.log(JSON.stringify({ audit: 1, host: target.hostname, score: report.score, steps, ...usage, ms: Date.now() - started }));
      } catch (e) {
        const reason = String(e?.message || e).slice(0, 40);
        console.error('audit: failed', reason);
        emit('error', { message: 'The audit could not finish. Try again in a moment.', reason: /^model_\d+$|^no_report$/.test(reason) ? reason : 'failed' });
      } finally {
        await writer.close().catch(() => {});
      }
    })(),
  );
  return new Response(stream.readable, { headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store' } });
}

export const onRequest = () => json({ error: 'Use POST.' }, 405);
