// Turns fetched HTML into the facts the audit tools report. Regex-based on
// purpose: it runs in a Cloudflare Function with no dependencies, and it only
// has to describe a page, never render one. Pure functions, tested in tests/audit.test.mjs.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '-', ndash: '-', rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', hellip: '...' };

export function decode(text) {
  return text
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n) || 32))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16) || 32))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

const strip = (html) => decode(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const words = (text) => (text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;

function attrs(tag) {
  const out = {};
  for (const m of tag.matchAll(/([a-zA-Z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
    out[m[1].toLowerCase()] = decode(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return out;
}

const tags = (html, name) => [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'gi'))].map((m) => attrs(m[0]));

function jsonLd(html) {
  const blocks = [];
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      blocks.push({ data: JSON.parse(m[1].trim()) });
    } catch {
      blocks.push({ error: 'This block is not valid JSON.' });
    }
  }
  return blocks;
}

/** Flattens @graph and nested arrays into a list of top-level schema nodes. */
export function schemaNodes(blocks) {
  const nodes = [];
  const visit = (v) => {
    if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === 'object') {
      if (Array.isArray(v['@graph'])) v['@graph'].forEach(visit);
      else nodes.push(v);
    }
  };
  for (const b of blocks) if (b.data) visit(b.data);
  return nodes;
}

const typesOf = (node) => [].concat(node['@type'] || []).map(String);
const nameOf = (v) => (typeof v === 'string' ? v : Array.isArray(v) ? v.map(nameOf).filter(Boolean).join(', ') : v?.name ? String(v.name) : '');

/** Splits the main content into sections by heading. The first section is the text before any heading. */
function sections(content) {
  const marked = content
    .replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_, level, inner) => `\n\u0001${level}\u0002${strip(inner)}\u0003\n`)
    .replace(/<\/(p|div|li|tr|section|article|blockquote|ul|ol|table|dd|dt|figcaption)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  const out = [{ level: 0, heading: '', lines: [] }];
  for (const raw of decode(marked).split('\n')) {
    const h = raw.match(/\u0001(\d)\u0002(.*)\u0003/);
    if (h) out.push({ level: Number(h[1]), heading: h[2], lines: [] });
    else {
      const line = raw.replace(/\s+/g, ' ').trim();
      if (line) out[out.length - 1].lines.push(line);
    }
  }
  return out.map((s) => {
    const text = s.lines.join('\n');
    // The first line with real sentence length is the "answer" a reader or model sees first.
    const first = s.lines.find((l) => words(l) >= 6) || '';
    return { level: s.level, heading: s.heading, text, words: words(text), firstParagraphWords: words(first) };
  });
}

export function parsePage(html, pageUrl) {
  const url = new URL(pageUrl);
  const head = (html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i) || [, html.slice(0, 60000)])[1];
  const metas = tags(head, 'meta');
  const meta = (key) => metas.find((m) => (m.name || m.property || '').toLowerCase() === key)?.content?.trim() || '';
  const links = tags(head, 'link');
  const htmlTag = attrs((html.match(/<html\b[^>]*>/i) || [''])[0]);

  const blocks = jsonLd(html);
  const nodes = schemaNodes(blocks);

  const body = html
    .replace(/<head\b[\s\S]*?<\/head>/i, ' ')
    .replace(/<(script|style|noscript|svg|template|iframe)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  const main = body.match(/<main\b[^>]*>([\s\S]*)<\/main>/i)?.[1] || body.match(/<article\b[^>]*>([\s\S]*)<\/article>/i)?.[1];
  const content = (main || body).replace(/<(nav|footer|aside|form)\b[\s\S]*?<\/\1>/gi, ' ');
  const secs = sections(content);
  const text = secs.map((s) => s.text).join('\n');

  // Internal links count across the whole page (about and contact usually sit in
  // the menu or footer). Outside sources count only when cited in the content.
  const internal = new Set();
  const externalHosts = new Set();
  const collect = (html, wantInternal) => {
    for (const { href } of tags(html, 'a')) {
      if (!href || /^(mailto:|tel:|javascript:|#)/i.test(href)) continue;
      try {
        const u = new URL(href, url);
        if (!/^https?:$/.test(u.protocol)) continue;
        const same = u.hostname.replace(/^www\./, '') === url.hostname.replace(/^www\./, '');
        if (same && wantInternal) internal.add(u.pathname);
        else if (!same && !wantInternal) externalHosts.add(u.hostname.replace(/^www\./, ''));
      } catch {
        /* skip malformed links */
      }
    }
  };
  collect(body, true);
  collect(content, false);
  const images = tags(content, 'img');
  const article = nodes.find((n) => typesOf(n).some((t) => /Article|BlogPosting|NewsArticle|WebPage|Product|HowTo|Recipe/.test(t))) || {};
  const times = tags(body, 'time').map((t) => t.datetime).filter(Boolean);

  return {
    url: url.href,
    title: strip((head.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i) || [, ''])[1]),
    metaDescription: meta('description'),
    canonical: links.find((l) => (l.rel || '').toLowerCase().split(/\s+/).includes('canonical'))?.href || '',
    metaRobots: meta('robots'),
    lang: htmlTag.lang || '',
    viewport: Boolean(meta('viewport')),
    openGraph: Boolean(meta('og:title')),
    htmlBytes: html.length,
    scriptCount: (html.match(/<script\b/gi) || []).length,
    usedMain: Boolean(main),
    headings: secs.filter((s) => s.level).map((s) => ({ level: s.level, text: s.heading })),
    sections: secs,
    text,
    words: words(text),
    lists: (content.match(/<(ul|ol)\b/gi) || []).length,
    tables: (content.match(/<table\b/gi) || []).length,
    images: images.length,
    imagesMissingAlt: images.filter((i) => !('alt' in i)).length,
    internalLinks: [...internal],
    externalHosts: [...externalHosts],
    jsonLd: blocks,
    schema: nodes,
    microdata: /\bitemscope\b/i.test(body),
    author: meta('author') || nameOf(article.author) || strip((body.match(/<[^>]+rel\s*=\s*["']?author["']?[^>]*>([\s\S]*?)<\//i) || [, ''])[1]),
    published: meta('article:published_time') || String(article.datePublished || '') || times[0] || '',
    modified: meta('article:modified_time') || String(article.dateModified || ''),
    statistics: (text.match(/\b\d[\d,]*(?:\.\d+)?[ ]?(?:%|percent\b|million\b|billion\b)|\b\d+(?:\.\d+)?x\b/gi) || []).length,
  };
}

export const QUESTION = /\?\s*$|^(what|why|how|when|where|who|which|can|does|do|is|are|should|will)\b/i;

// ---- robots.txt ----

export const AI_CRAWLERS = [
  ['GPTBot', 'OpenAI model training'],
  ['OAI-SearchBot', 'ChatGPT search'],
  ['ChatGPT-User', 'ChatGPT browsing for a user'],
  ['ClaudeBot', 'Anthropic model training'],
  ['Claude-SearchBot', 'Claude search'],
  ['Claude-User', 'Claude browsing for a user'],
  ['PerplexityBot', 'Perplexity search'],
  ['Perplexity-User', 'Perplexity browsing for a user'],
  ['Google-Extended', 'Gemini training and grounding'],
  ['Googlebot', 'Google Search and AI Overviews'],
  ['Bingbot', 'Bing and Copilot'],
  ['Applebot-Extended', 'Apple Intelligence training'],
  ['CCBot', 'Common Crawl'],
];

export function parseRobots(text) {
  const groups = [];
  const sitemaps = [];
  let group = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === 'user-agent') {
      if (!lastWasAgent) {
        group = { agents: [], rules: [] };
        groups.push(group);
      }
      group.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (key === 'sitemap') sitemaps.push(value);
      else if ((key === 'allow' || key === 'disallow') && group) group.rules.push({ allow: key === 'allow', path: value });
    }
  }
  return { groups, sitemaps };
}

function ruleMatches(pattern, path) {
  if (!pattern) return false;
  const anchored = pattern.endsWith('$');
  const source = (anchored ? pattern.slice(0, -1) : pattern).split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*');
  return new RegExp(`^${source}${anchored ? '$' : ''}`).test(path);
}

/** Longest matching rule wins; allow wins a tie. An empty Disallow allows everything. */
export function robotsAllows(robots, agent, path) {
  const name = agent.toLowerCase();
  const own = robots.groups.filter((g) => g.agents.includes(name));
  const groups = own.length ? own : robots.groups.filter((g) => g.agents.includes('*'));
  let best = null;
  for (const g of groups) {
    for (const r of g.rules) {
      if (!ruleMatches(r.path, path)) continue;
      if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow)) best = r;
    }
  }
  return { allowed: best ? best.allow : true, rule: own.length ? 'named' : groups.length ? 'wildcard' : 'none' };
}
