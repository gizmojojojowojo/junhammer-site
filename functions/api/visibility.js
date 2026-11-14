// POST /api/visibility: measures whether AI answers cite a domain.
//
// Each question costs a real web search, so this is the most expensive thing
// on the site per run. Three things keep that in hand: a small fixed question
// count, a hard cap per visitor and per day, and a seven day cache keyed on
// the domain, so the second person to check a domain pays nothing.
//
// Settings (Cloudflare Pages > Settings > Variables and Secrets):
//   ANTHROPIC_API_KEY   secret. Required.
//   ASK_KV              KV binding, shared. Holds the cache and the counters.
//   VIS_MODEL           optional. Defaults to DEFAULT_MODEL below.
//   VIS_DAILY_LIMIT     new runs per day, whole site. Default 8.
//   VIS_CACHE_DAYS      how long a run is reused. Default 7.
import { checkUrl, safeFetch } from '../../src/audit/guard.mjs';
import { parsePage } from '../../src/audit/page.mjs';
import { cleanDomains, cleanQuestions, readQuestion, scoreRun, verdict } from '../../src/visibility/lib.mjs';
import { sse } from '../../src/ask/answer.mjs';

const DEFAULT_MODEL = 'claude-haiku-5-5';
const API = 'https://api.anthropic.com/v1/messages';
// Six questions at one search each keeps a free run near six cents. The free
// run is a sample: enough to tell a business whether it is in the game at all,
// not enough to track a trend. Ten binary trials cannot measure a small
// improvement, and pretending otherwise would be the dishonest part.
export const RUN = { questions: 6, maxQuestions: 10, concurrency: 3, searchesPerQuestion: 1, answerTokens: 600, timeoutMs: 40000 };

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

const memory = new Map();
const memoryKV = {
  get: async (k) => memory.get(k) ?? null,
  put: async (k, v) => {
    if (memory.size > 2000) memory.clear();
    memory.set(k, v);
  },
};

function apiKey(env) {
  const name = Object.keys(env).find((k) => k.trim().toUpperCase() === 'ANTHROPIC_API_KEY');
  return name && typeof env[name] === 'string' ? env[name].trim() : '';
}

const call = async (key, payload) => {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(RUN.timeoutMs),
  });
  if (!res.ok) {
    console.error('visibility: model call failed', res.status, (await res.text()).slice(0, 200));
    throw new Error(`model_${res.status}`);
  }
  return res.json();
};

const QUESTION_SYSTEM = `You write the questions a potential customer would type into an AI assistant when they are looking for what this business offers, before they know the business exists.

Rules:
- Write questions about the problem, the category and the place, never the brand name. "Who is Acme" measures nothing: of course the company's own site is cited. The point is to find out whether they show up when somebody does not already know them.
- Mix the obvious category questions with the specific ones a buyer asks late, such as how to choose, what it costs to get wrong, and comparisons.
- Where the business serves a place, put the place in two or three of them.
- Each one must read like something a person types, not a keyword phrase.
- Return exactly the number asked for.`;

async function writeQuestions(key, model, page, count) {
  const data = await call(key, {
    model,
    max_tokens: 900,
    system: QUESTION_SYSTEM,
    tools: [{ name: 'set_questions', description: 'Record the questions.', input_schema: { type: 'object', properties: { questions: { type: 'array', items: { type: 'string' } } }, required: ['questions'] } }],
    tool_choice: { type: 'tool', name: 'set_questions' },
    messages: [{ role: 'user', content: `Write ${count} questions for this business.\n\nSite: ${page.url}\nTitle: ${page.title}\nDescription: ${page.metaDescription}\nHeadings: ${page.headings.slice(0, 14).map((h) => h.text).join(' | ')}\n\nFrom the page:\n${page.text.slice(0, 2500)}` }],
  });
  return cleanQuestions(data.content.find((b) => b.type === 'tool_use')?.input?.questions, count);
}

/** One question, put to the model with live web search, then read for the brand. */
async function askOne(key, model, question, brand, brandName) {
  const data = await call(key, {
    model,
    max_tokens: RUN.answerTokens,
    system: 'Answer the question the way a helpful search assistant would, for someone who does not already know which companies exist in this area. Search the web first. Name and cite specific sources.',
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: RUN.searchesPerQuestion }],
    messages: [{ role: 'user', content: question }],
  });
  return { row: readQuestion({ question, content: data.content, brand, brandName }), searches: data.usage?.server_tool_use?.web_search_requests || 0 };
}

async function pool(items, size, fn) {
  let next = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i], i);
    }
  }));
}

/** GET /api/visibility?d=domain returns a cached run, so results are shareable. */
export async function onRequestGet({ request, env }) {
  const d = cleanDomains([new URL(request.url).searchParams.get('d') || ''], 1)[0];
  if (!d) return json({ error: 'Pass ?d=domain.' }, 400);
  const cached = await (env.ASK_KV || memoryKV).get(`vis:run:3:${d}`);
  if (!cached) return json({ error: 'No run for that domain yet.', reason: 'not_run' }, 404);
  return new Response(JSON.stringify({ ...JSON.parse(cached), cached: true }), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=600' } });
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
  const brand = checked.url.hostname.replace(/^www\./, '');

  const key = apiKey(env);
  if (!key) return json({ error: 'This is not switched on yet.', reason: 'no_key' }, 503);
  const kv = env.ASK_KV || memoryKV;
  const model = env.VIS_MODEL || DEFAULT_MODEL;

  // Step one is cheap: one model call, no searches. The visitor edits the
  // questions before anything is spent on them, so a bad guess costs nothing.
  if (body.action === 'questions') {
    try {
      const fetched = await safeFetch(checked.url);
      if (!fetched.ok || fetched.status >= 400) return json({ error: 'That site could not be read. Check the address.' }, 400);
      const page = parsePage(fetched.text, fetched.finalUrl);
      const brandName = (page.title.split(/[|—\-–:]/)[0] || brand).trim().slice(0, 60);
      const questions = await writeQuestions(key, model, page, RUN.questions);
      if (questions.length < 3) return json({ error: 'Not enough could be read from that page to write questions. Add your own below.' }, 422);
      return json({ brand, brandName, url: fetched.finalUrl, questions });
    } catch (e) {
      console.error('visibility: questions failed', String(e?.message || e).slice(0, 60));
      return json({ error: 'That did not work. Try again in a moment.' }, 502);
    }
  }

  // A cached run is free and is served to anyone who asks for the same domain.
  const cacheKey = `vis:run:3:${brand}`;
  const cached = await kv.get(cacheKey);
  if (cached && !body.fresh) {
    const run = JSON.parse(cached);
    return json({ ...run, cached: true });
  }

  const day = new Date().toISOString().slice(0, 10);
  const dayKey = `vis:day:${day}`;
  const ipKey = `vis:ip:${request.headers.get('cf-connecting-ip') || 'unknown'}:${day}`;
  const [d, i] = await Promise.all([kv.get(dayKey), kv.get(ipKey)]);
  if ((Number(d) || 0) >= Number(env.VIS_DAILY_LIMIT || 40)) return json({ error: 'The checker has done its runs for today. Each one costs a real search budget. A domain someone has already checked is still free to view, or come back tomorrow.', reason: 'closed' }, 429);
  if ((Number(i) || 0) >= 1) return json({ error: 'One new domain per visitor per day. Domains that have already been checked are still free to view.', reason: 'limited' }, 429);
  await Promise.all([kv.put(dayKey, String((Number(d) || 0) + 1), { expirationTtl: 2 * 86400 }), kv.put(ipKey, '1', { expirationTtl: 2 * 86400 })]);

  const rivals = cleanDomains(body.competitors, 3);
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const emit = (event, data) => writer.write(sse(event, data)).catch(() => {});

  context.waitUntil(
    (async () => {
      let searches = 0;
      try {
        emit('step', { label: `Reading ${brand}` });
        const fetched = await safeFetch(checked.url);
        if (!fetched.ok || fetched.status >= 400) throw new Error('unreachable');
        const page = parsePage(fetched.text, fetched.finalUrl);
        const brandName = (page.title.split(/[|—\-–:]/)[0] || brand).trim().slice(0, 60);

        // Questions the visitor approved win over anything generated here.
        let questions = cleanQuestions(body.questions, RUN.maxQuestions);
        if (!questions.length) {
          emit('step', { label: 'Writing the questions a buyer would ask' });
          questions = await writeQuestions(key, model, page, RUN.questions);
        }
        if (questions.length < 3) throw new Error('no_questions');
        emit('questions', { questions, brandName });

        const rows = new Array(questions.length);
        let done = 0;
        await pool(questions, RUN.concurrency, async (q, idx) => {
          try {
            const out = await askOne(key, model, q, brand, brandName);
            rows[idx] = out.row;
            searches += out.searches;
          } catch {
            rows[idx] = null;
          }
          emit('progress', { done: ++done, total: questions.length });
        });

        const usable = rows.filter(Boolean);
        if (!usable.length) throw new Error('no_answers');
        const score = scoreRun(usable, brand, rivals);
        const run = {
          brand,
          brandName,
          url: fetched.finalUrl,
          ranAt: new Date().toISOString(),
          model,
          failedQuestions: rows.length - usable.length,
          ...score,
          askedByVisitor: cleanQuestions(body.questions, RUN.maxQuestions).length > 0,
          verdict: verdict(score),
        };
        await kv.put(cacheKey, JSON.stringify(run), { expirationTtl: Number(env.VIS_CACHE_DAYS || 7) * 86400 });
        emit('report', run);
        console.log(JSON.stringify({ visibility: 1, brand, citedRate: score.citedRate, searches, ms: Date.now() - started }));
      } catch (e) {
        const reason = String(e?.message || e).slice(0, 40);
        console.error('visibility: failed', reason);
        emit('error', { message: reason === 'unreachable' ? 'That site could not be read. Check the address.' : 'The run could not finish. Try again in a moment.', reason });
      } finally {
        await writer.close().catch(() => {});
      }
    })(),
  );
  return new Response(stream.readable, { headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store' } });
}

export const onRequest = () => json({ error: 'Use POST.' }, 405);
