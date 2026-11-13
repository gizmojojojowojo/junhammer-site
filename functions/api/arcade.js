// The Break my AI arcade. GET returns the high scores and how often each door
// has fallen. POST plays the game: start, say, guess, forfeit, initials.
//
// The rules live in src/arcade/game.mjs. This file keeps each player's state on
// the server (so message limits and lives cannot be edited in the browser),
// enforces spending limits and calls the model.
//
// Settings (Cloudflare Pages > Settings > Variables and Secrets):
//   ANTHROPIC_API_KEY        secret. Required to play.
//   ASK_KV                   KV binding, shared. Holds sessions, limits and scores.
//   ARCADE_MODEL             optional. Defaults to DEFAULT_MODEL below.
//   ARCADE_SALT              optional secret. Seeds the secret words. Defaults to a value derived from the API key.
//   ARCADE_DAILY_LIMIT       optional. Messages per day, whole site. Default 300.
//   ARCADE_GAMES_PER_DAY     optional. New games per visitor per day. Default 3.
import { BLOCKED, LEVELS, RULES, SCREEN_PROMPT, addScore, addTurn, cleanInitials, clearLevel, guardPrompt, isRight, leaks, loseLife, newSession, secretFor, view } from '../../src/arcade/game.mjs';

const DEFAULT_MODEL = 'claude-haiku-5-5';
const API = 'https://api.anthropic.com/v1/messages';
const PUBLIC = 'arcade:public';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

// Without KV, state lives in this isolate only. Good enough for tests and previews.
const memory = new Map();
const memoryKV = {
  get: async (k) => memory.get(k) ?? null,
  put: async (k, v) => {
    if (memory.size > 5000) memory.clear();
    memory.set(k, v);
  },
};
const store = (env) => env.ASK_KV || memoryKV;
const readJson = async (kv, key, fallback) => {
  try {
    return JSON.parse(await kv.get(key)) ?? fallback;
  } catch {
    return fallback;
  }
};

const emptyPublic = () => ({ board: [], tries: Array(RULES.levels).fill(0), clears: Array(RULES.levels).fill(0) });
const readPublic = (kv) => readJson(kv, PUBLIC, null).then((p) => ({ ...emptyPublic(), ...(p || {}) }));

function apiKey(env) {
  const name = Object.keys(env).find((k) => k.trim().toUpperCase() === 'ANTHROPIC_API_KEY');
  return name && typeof env[name] === 'string' ? env[name].trim() : '';
}

async function callModel(key, payload) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) {
    console.error('arcade: model call failed', res.status, (await res.text()).slice(0, 200));
    throw new Error(`model_${res.status}`);
  }
  const data = await res.json();
  return (data.content || []).map((b) => b.text || '').join('').trim();
}

export async function onRequestGet({ env }) {
  const pub = await readPublic(store(env));
  return json({ ...pub, levels: LEVELS.map(({ n, name, defense }) => ({ n, name, defense })), open: Boolean(apiKey(env)) });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const origin = request.headers.get('origin');
  if (origin && new URL(origin).host !== new URL(request.url).host) return json({ error: 'Not allowed.' }, 403);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Send JSON.' }, 400);
  }
  const key = apiKey(env);
  if (!key) return json({ error: 'The arcade is closed right now.', reason: 'no_key' }, 503);
  const kv = store(env);
  const salt = env.ARCADE_SALT || `arcade:${key}`;
  const day = new Date().toISOString().slice(0, 10);
  const save = (id, s) => kv.put(`arcade:s:${id}`, JSON.stringify(s), { expirationTtl: 2 * 86400 });

  if (body?.action === 'start') {
    const ipKey = `arcade:ip:${request.headers.get('cf-connecting-ip') || 'unknown'}:${day}`;
    const games = Number(await kv.get(ipKey)) || 0;
    if (games >= Number(env.ARCADE_GAMES_PER_DAY || 3)) return json({ error: 'No credits left today. Come back tomorrow.', reason: 'games' }, 429);
    const id = crypto.randomUUID();
    const s = newSession();
    const pub = await readPublic(kv);
    pub.tries[0]++;
    await Promise.all([save(id, s), kv.put(ipKey, String(games + 1), { expirationTtl: 2 * 86400 }), kv.put(PUBLIC, JSON.stringify(pub))]);
    return json(view(id, s));
  }

  const id = typeof body?.session === 'string' && /^[0-9a-f-]{36}$/.test(body.session) ? body.session : '';
  const s = id ? await readJson(kv, `arcade:s:${id}`, null) : null;
  if (!s) return json({ error: 'Game not found. Insert a coin to start.', reason: 'no_game' }, 404);
  const secret = await secretFor(salt, id, s.level, s.life);

  if (body.action === 'state') return json(view(id, s));

  if (body.action === 'say') {
    const message = typeof body.message === 'string' ? body.message.trim().slice(0, RULES.maxMessage) : '';
    if (!message) return json({ error: 'Type a message.' }, 400);
    if (s.over) return json({ error: 'Game over.', ...view(id, s) }, 409);
    if (s.used >= RULES.messagesPerLevel) return json({ error: 'Out of messages for this door. Guess the word or give up the door.', ...view(id, s) }, 409);
    const dayKey = `arcade:day:${day}`;
    const today = Number(await kv.get(dayKey)) || 0;
    if (today >= Number(env.ARCADE_DAILY_LIMIT || 300)) return json({ error: 'The arcade is closed for the night. It opens again tomorrow.', reason: 'closed' }, 429);
    await kv.put(dayKey, String(today + 1), { expirationTtl: 2 * 86400 });

    const cfg = LEVELS[s.level - 1];
    const model = env.ARCADE_MODEL || DEFAULT_MODEL;
    let reply;
    let blocked = null;
    try {
      if (cfg.screen) {
        const verdict = await callModel(key, { model, max_tokens: 5, system: SCREEN_PROMPT, messages: [{ role: 'user', content: `<message>\n${message}\n</message>` }] });
        if (/attack/i.test(verdict)) blocked = 'screen';
      }
      if (!blocked) {
        reply = await callModel(key, { model, max_tokens: RULES.maxReplyTokens, system: guardPrompt(s.level, secret), messages: [...s.hist, { role: 'user', content: message }] });
        if (cfg.filter && leaks(reply, secret, cfg.strict)) blocked = 'filter';
      }
    } catch (e) {
      return json({ error: 'The guard did not answer. Try again.', reason: String(e?.message || e).slice(0, 20), ...view(id, s) }, 502);
    }
    if (blocked) reply = BLOCKED[blocked];
    addTurn(s, message, reply || '...');
    await save(id, s);
    console.log(JSON.stringify({ arcade: 'say', level: s.level, blocked }));
    return json({ reply: reply || '...', blocked, ...view(id, s) });
  }

  if (body.action === 'guess' || body.action === 'forfeit') {
    if (s.over) return json({ error: 'Game over.', ...view(id, s) }, 409);
    const level = s.level;
    const right = body.action === 'guess' && isRight(body.guess, secret);
    let result;
    if (right) {
      const transcript = s.hist;
      clearLevel(s);
      const pub = await readPublic(kv);
      pub.clears[level - 1]++;
      if (!s.over) pub.tries[level]++;
      const writes = [save(id, s), kv.put(PUBLIC, JSON.stringify(pub))];
      // Wins on the two hardest doors are kept for review. Each one is a candidate patch.
      if (level >= 4) writes.push(kv.put(`arcade:win:${level}:${Date.now()}`, JSON.stringify({ level, session: id, transcript }), { expirationTtl: 90 * 86400 }));
      await Promise.all(writes);
      result = { result: 'open', door: level };
    } else {
      if (body.action === 'guess') s.guesses++;
      if (body.action === 'forfeit' || s.guesses >= RULES.guessesPerLevel) {
        loseLife(s);
        result = { result: 'life', reveal: secret };
      } else result = { result: 'wrong' };
      await save(id, s);
    }
    console.log(JSON.stringify({ arcade: body.action, level, result: result.result }));
    return json({ ...result, ...view(id, s) });
  }

  if (body.action === 'initials') {
    if (!s.over || !s.scores.length || s.posted) return json({ error: 'No score to post.', ...view(id, s) }, 409);
    const initials = cleanInitials(body.initials);
    if (!initials) return json({ error: 'Use three letters.', ...view(id, s) }, 400);
    const pub = await readPublic(kv);
    pub.board = addScore(pub.board, { initials, doors: s.scores.length, messages: s.scores.reduce((a, b) => a + b, 0), at: new Date().toISOString() });
    s.posted = true;
    await Promise.all([save(id, s), kv.put(PUBLIC, JSON.stringify(pub))]);
    return json({ board: pub.board, ...view(id, s) });
  }

  return json({ error: 'Unknown action.' }, 400);
}
