// Pure parts of the budget agent: cost accounting, reading a web-search answer
// for citations, the file-write guard and state updates. Tested in tests/agent.test.mjs.
// The runner in scripts/agent/run.mjs adds the model calls and the file system.

export const SITE = 'junhammer.com';

// USD per million tokens, and per web search. Check against
// https://platform.claude.com/docs/en/about-claude/pricing when changing models.
export const PRICES = {
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
};
export const SEARCH_USD = 10 / 1000;

export const CONFIG = {
  measureModel: 'claude-haiku-5-5', // asks the target questions with web search
  decideModel: 'claude-sonnet-5-5', // reads the evidence and chooses the day's action
  searchesPerQuestion: 3,
  turns: 10,
  maxFilesPerDay: 2,
  maxFileBytes: 60_000,
  dailyCapUsd: 1.5, // a run stops before it can spend more than this
};

export function costOf(model, usage = {}) {
  const p = PRICES[model];
  if (!p) throw new Error(`No price for ${model}`);
  const tokensIn = (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0) + (usage.cache_read_input_tokens || 0);
  return (tokensIn * p.input + (usage.output_tokens || 0) * p.output) / 1e6 + (usage.server_tool_use?.web_search_requests || 0) * SEARCH_USD;
}

const hostOf = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};
const isSite = (host, site) => host === site || host.endsWith(`.${site}`);

/**
 * Reads one web-search answer. "retrieved" means the site appeared in the search
 * results the model saw. "cited" means the answer cites it. Position is where
 * the site first appears among the results (1 is first), or null.
 */
export function readAnswer(content, site = SITE) {
  const results = [];
  const cited = [];
  for (const block of content || []) {
    if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) for (const r of block.content) if (r.url) results.push(r.url);
    if (block.type === 'text') for (const c of block.citations || []) if (c.url) cited.push(c.url);
  }
  const resultHosts = results.map(hostOf);
  const citedHosts = [...new Set(cited.map(hostOf).filter(Boolean))];
  const at = resultHosts.findIndex((h) => isSite(h, site));
  const sitePages = [...new Set([...cited, ...results].filter((u) => isSite(hostOf(u), site)).map((u) => new URL(u).pathname))];
  return {
    cited: citedHosts.some((h) => isSite(h, site)),
    retrieved: at >= 0,
    position: at >= 0 ? at + 1 : null,
    results: results.length,
    citedDomains: citedHosts.slice(0, 8),
    sitePages: sitePages.slice(0, 5),
  };
}

/** The agent may only write Markdown content. No code, config, data or workflow files. */
export function allowedPath(path) {
  return typeof path === 'string' && /^src\/content\/(blog|services|work|pages)\/[a-z0-9][a-z0-9-]*\.md$/.test(path);
}

export function checkWrite(path, content, written) {
  if (!allowedPath(path)) return 'Only Markdown files under src/content/blog, services, work or pages can be written.';
  if (typeof content !== 'string' || !content.startsWith('---\n')) return 'The file must start with its front matter block.';
  if (content.length > CONFIG.maxFileBytes) return 'The file is too large.';
  if (/[—]/.test(content)) return 'The site style allows no em dashes. Rewrite those sentences.';
  if (!written.includes(path) && written.length >= CONFIG.maxFilesPerDay) return `Only ${CONFIG.maxFilesPerDay} files can change per day.`;
  return null;
}

export const today = (now = new Date()) => now.toISOString().slice(0, 10);

/** Why today's run should not happen, or null. */
export function stopReason(state, now = new Date()) {
  if (state.spentUsd >= state.budgetUsd) return 'The budget is spent.';
  if (state.day >= state.days) return `Day ${state.days} is done.`;
  if (state.journal.at(-1)?.date === today(now)) return 'Already ran today.';
  return null;
}

export function recordMeasurement(state, results, now = new Date()) {
  state.measurements.push({ date: today(now), day: state.day, results });
  if (state.measurements.length > 40) state.measurements = state.measurements.slice(-40);
}

const text = (v, n) => (typeof v === 'string' ? v.replace(/—/g, ', ').replace(/\s+/g, ' ').trim().slice(0, n) : '');

export function recordEntry(state, entry, { files = [], costUsd = 0, outcome = '' } = {}, now = new Date()) {
  if (!state.startedAt) state.startedAt = today(now);
  state.day += 1;
  state.spentUsd = +(state.spentUsd + costUsd).toFixed(4);
  state.journal.push({
    day: state.day,
    date: today(now),
    title: text(entry?.title, 120) || `Day ${state.day}`,
    observed: text(entry?.observed, 900),
    hypothesis: text(entry?.hypothesis, 600),
    action: text(entry?.action, 900),
    expect: text(entry?.expect, 400),
    files,
    outcome,
    costUsd: +costUsd.toFixed(4),
  });
  return state.journal.at(-1);
}

/** Up to five questions, each with the page meant to answer it. */
export function cleanTargets(input, pages) {
  const known = new Set(pages.map((p) => p.url));
  return (Array.isArray(input) ? input : [])
    .filter((t) => t && typeof t.question === 'string' && known.has(t.page))
    .map((t) => ({ question: text(t.question, 160), page: t.page, why: text(t.why, 300) }))
    .slice(0, 5);
}

/** A compact table of the last few measurements for the decision prompt. */
export function measurementBrief(state, last = 5) {
  return state.measurements.slice(-last).map((m) => ({
    day: m.day,
    date: m.date,
    results: m.results.map((r) => ({ question: r.question, cited: r.cited, retrieved: r.retrieved, position: r.position, sitePages: r.sitePages, others: r.citedDomains.slice(0, 5) })),
  }));
}
