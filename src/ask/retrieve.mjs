// Lexical retrieval (BM25 with field weights and bigrams) over the chunk index.
// No dependencies and no network calls, so it runs the same in a Cloudflare
// Pages Function, in Node tests and in the evals.
import { plain } from './chunk.mjs';

const STOP = new Set(
  `a an and are as at be been but by can could do does did for from had has have he her his how i if in into is it its me my of on or our she should so than that the their them then there these they this to was we were what when where which who whom why will with would you your about am any some just also not no yes please tell give show whats s`.split(' '),
);

// Domain shorthand. Each side is added to the query when the other appears.
const SYNONYMS = [
  ['aeo', 'answer engine optimization'],
  ['geo', 'generative engine optimization'],
  ['seo', 'search engine optimization'],
  ['llm', 'large language model'],
  ['mcp', 'model context protocol'],
  ['cost', 'price pricing budget'],
  ['charge', 'cost price pricing budget rate'],
  ['much', 'cost price pricing'],
  ['hire', 'contact project'],
  ['email', 'contact'],
  ['touch', 'contact'],
  ['reach', 'contact'],
  ['background', 'about experience'],
  ['built', 'build work'],
  ['pharma', 'pharmaceutical'],
  ['chatbot', 'chat'],
  ['military', 'army veteran'],
];

const stem = (t) => {
  if (t.length > 4 && t.endsWith('ies')) return t.slice(0, -3) + 'y';
  if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss') && !t.endsWith('us') && !t.endsWith('is')) return t.slice(0, -1);
  return t;
};

export function tokenize(text) {
  const uni = (text.toLowerCase().replace(/\be-commerce\b/g, 'ecommerce').match(/[\p{L}\p{N}]+/gu) || []).filter((t) => !STOP.has(t)).map(stem);
  const out = [...uni];
  for (let i = 0; i < uni.length - 1; i++) out.push(`${uni[i]}_${uni[i + 1]}`);
  return out;
}

function expand(query) {
  const q = ` ${query.toLowerCase()} `;
  let extra = '';
  for (const [a, b] of SYNONYMS) {
    if (new RegExp(`\\b${a}\\b`).test(q)) extra += ` ${b}`;
    else if (b.split(' ').length > 2 && q.includes(b)) extra += ` ${a}`;
  }
  return extra;
}

// Field weights were swept on evals/ask/questions.json; results were flat across the range, so these stay moderate.
const K1 = 1.4;
const B = 0.6;
const W_HEADING = 2.5;
const W_TITLE = 3;
const W_EXPANSION = 0.3;
const W_PAGE = 1;

export function buildIndex(chunks) {
  const df = new Map();
  let total = 0;
  const docs = chunks.map((c) => {
    const tf = new Map();
    const add = (text, w) => {
      for (const t of tokenize(text)) tf.set(t, (tf.get(t) || 0) + w);
    };
    const body = tokenize(plain(c.text));
    for (const t of body) tf.set(t, (tf.get(t) || 0) + 1);
    add(c.heading || '', W_HEADING);
    add(c.title || '', W_TITLE);
    for (const t of tf.keys()) df.set(t, (df.get(t) || 0) + 1);
    total += body.length;
    return { tf, len: body.length };
  });
  // Page-level view: title, description and URL words. A question that matches
  // a page's title lifts every passage on that page.
  const pages = new Map();
  for (const c of chunks) {
    if (!pages.has(c.url)) pages.set(c.url, { tf: new Map(), text: `${c.title} ${c.url.replace(/[/-]/g, ' ')}` });
    if (!c.heading && !c.anchor) pages.get(c.url).text += ` ${plain(c.text).slice(0, 300)}`;
  }
  const pageDf = new Map();
  for (const p of pages.values()) {
    for (const t of tokenize(p.text)) p.tf.set(t, (p.tf.get(t) || 0) + 1);
    for (const t of p.tf.keys()) pageDf.set(t, (pageDf.get(t) || 0) + 1);
  }
  return { chunks, docs, df, avg: total / Math.max(1, chunks.length), n: chunks.length, pages, pageDf };
}

/**
 * @returns {{results: Array<object>, coverage: number}} coverage is the share of
 * the question's own terms found in the best chunk; the caller uses it to
 * decide whether the site can answer at all.
 */
export function search(index, query, { k = 8, perUrl = 2 } = {}) {
  let own = [...new Set(tokenize(query))];
  // "What do you do?" is all stopwords. Treat a multi-word question with no
  // content terms as a question about Joe and his services.
  const general = own.length === 0 && query.trim().split(/\s+/).length >= 3;
  if (general) {
    query = 'Joe Unhammer services AI engineering AEO SEO';
    own = [...new Set(tokenize(query))];
  }
  // Expansion terms count for less than the visitor's own words.
  const terms = new Map(tokenize(expand(query)).map((t) => [t, W_EXPANSION]));
  for (const t of own) terms.set(t, 1);
  const scored = [];
  for (let i = 0; i < index.n; i++) {
    const d = index.docs[i];
    let score = 0;
    for (const [t, w] of terms) {
      const tf = d.tf.get(t);
      if (!tf) continue;
      const df = index.df.get(t);
      const idf = Math.log(1 + (index.n - df + 0.5) / (df + 0.5));
      score += w * idf * ((tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * d.len) / index.avg)));
    }
    if (score > 0) scored.push({ i, score });
  }
  const pageScore = new Map();
  for (const [url, p] of index.pages) {
    let ps = 0;
    for (const [t, w] of terms) {
      if (!p.tf.has(t)) continue;
      const df = index.pageDf.get(t);
      ps += w * Math.log(1 + (index.pages.size - df + 0.5) / (df + 0.5));
    }
    pageScore.set(url, ps);
  }
  for (const s of scored) s.score += W_PAGE * (pageScore.get(index.chunks[s.i].url) || 0);
  scored.sort((a, b) => b.score - a.score);

  const results = [];
  const seen = new Map();
  for (const s of scored) {
    const c = index.chunks[s.i];
    const n = seen.get(c.url) || 0;
    if (n >= perUrl) continue;
    seen.set(c.url, n + 1);
    results.push({ ...c, score: s.score });
    if (results.length >= k) break;
  }

  let coverage = 0;
  const ownUni = own.filter((t) => !t.includes('_'));
  if (results.length && ownUni.length) {
    // Rare terms count for more, so "weather" missing matters more than "joe" matching.
    const weight = (t) => {
      const df = index.df.get(t) || 0;
      return Math.log(1 + (index.n - df + 0.5) / (df + 0.5));
    };
    const top = results.map((r) => index.docs[r.id].tf);
    let hit = 0;
    let all = 0;
    for (const t of ownUni) {
      const w = weight(t);
      all += w;
      if (top.some((tf) => tf.has(t))) hit += w;
    }
    coverage = all ? hit / all : 0;
  }
  return { results, coverage: general ? 1 : coverage };
}
