// Measuring whether AI answers cite a brand.
//
// The method is the only honest thing about a tool like this, so it is written
// down rather than implied. A question is put to a model with live web search.
// The model searches, reads, and answers with citations. Two different things
// are then counted, and they are not the same thing:
//
//   RETRIEVED  the domain appeared in the search results the model saw.
//   CITED      the answer actually cited it. This is the one that matters,
//              because a reader only ever sees what was cited.
//
// A brand can be retrieved on every question and cited on none. That gap is
// usually the most useful thing in a report, so it is reported rather than
// averaged away.
//
// What this cannot do: it is one model with one search tool, not ChatGPT, not
// Google AI Overviews, not Perplexity. Those are different retrieval stacks
// and will not agree with this, or with each other, or with themselves next
// week. It measures a direction, and it measures it the same way every time,
// which is what makes two runs comparable. Anything claiming to be "your
// ranking in AI" is selling something.

export const hostOf = (url) => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
};

/** Same registered site, including subdomains. */
export const isSite = (host, site) => {
  const a = String(host || '').toLowerCase().replace(/^www\./, '');
  const b = String(site || '').toLowerCase().replace(/^www\./, '');
  return Boolean(a && b) && (a === b || a.endsWith(`.${b}`));
};

/**
 * Pulls the search results and the citations out of one Messages API response.
 * Citations are what the answer actually leaned on; results are everything the
 * model was shown.
 */
export function readCitations(content) {
  const results = [];
  const cited = [];
  for (const block of content || []) {
    if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
      for (const r of block.content) if (r?.url) results.push(r.url);
    }
    if (block.type === 'text') {
      for (const c of block.citations || []) if (c?.url) cited.push(c.url);
    }
  }
  const text = (content || []).filter((b) => b.type === 'text').map((b) => b.text || '').join(' ');
  return { results, cited, resultHosts: results.map(hostOf), citedHosts: cited.map(hostOf).filter(Boolean), text };
}

/** The narrow view for one domain: the shape the budget agent already uses. */
export function forSite(reading, site) {
  const at = reading.resultHosts.findIndex((h) => isSite(h, site));
  const pages = [...new Set([...reading.cited, ...reading.results].filter((u) => isSite(hostOf(u), site)).map((u) => new URL(u).pathname))];
  return {
    cited: reading.citedHosts.some((h) => isSite(h, site)),
    retrieved: at >= 0,
    position: at >= 0 ? at + 1 : null,
    results: reading.results.length,
    citedDomains: [...new Set(reading.citedHosts)].slice(0, 8),
    sitePages: pages.slice(0, 5),
  };
}

/** Is the brand named in the prose, even where nothing was cited to it? */
export function mentions(text, brandName) {
  const name = String(brandName || '').trim();
  if (name.length < 2) return false;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}([^\\p{L}\\p{N}]|$)`, 'iu').test(text || '');
}

/** One question, read for one brand. */
export function readQuestion({ question, content, brand, brandName }) {
  const reading = readCitations(content);
  const site = forSite(reading, brand);
  return {
    question,
    cited: site.cited,
    retrieved: site.retrieved,
    position: site.position,
    mentioned: mentions(reading.text, brandName) || site.cited,
    pages: site.sitePages,
    // Who was cited instead, deduplicated, brand removed.
    others: [...new Set(reading.citedHosts)].filter((h) => !isSite(h, brand)),
    citedCount: reading.cited.length,
    resultCount: reading.results.length,
  };
}

const pct = (n, d) => (d ? Math.round((100 * n) / d) : 0);

/**
 * Aggregates a run. `rows` are readQuestion results.
 *
 * Share of voice counts cited domains across every question, so a domain cited
 * on eight of ten questions outranks one cited once. It counts each domain
 * once per question, because an answer citing the same site three times is one
 * endorsement, not three.
 */
export function scoreRun(rows = [], brand = '') {
  const n = rows.length;
  const citedRows = rows.filter((r) => r.cited);
  const voice = new Map();
  for (const row of rows) {
    const domains = new Set(row.others);
    if (row.cited) domains.add(String(brand).toLowerCase().replace(/^www\./, ''));
    for (const d of domains) voice.set(d, (voice.get(d) || 0) + 1);
  }
  const ranking = [...voice.entries()]
    .map(([domain, questions]) => ({ domain, questions, share: pct(questions, n), isBrand: isSite(domain, brand) }))
    .sort((a, b) => b.questions - a.questions || a.domain.localeCompare(b.domain));
  const brandRank = ranking.findIndex((r) => r.isBrand);
  const positions = rows.map((r) => r.position).filter((p) => p !== null);
  const pages = new Map();
  for (const row of rows) for (const p of row.pages) pages.set(p, (pages.get(p) || 0) + 1);

  return {
    questions: n,
    cited: citedRows.length,
    citedRate: pct(citedRows.length, n),
    retrieved: rows.filter((r) => r.retrieved).length,
    retrievedRate: pct(rows.filter((r) => r.retrieved).length, n),
    mentioned: rows.filter((r) => r.mentioned).length,
    // Found by the search but left out of the answer. Usually the real story.
    retrievedNotCited: rows.filter((r) => r.retrieved && !r.cited).length,
    averagePosition: positions.length ? +(positions.reduce((a, b) => a + b, 0) / positions.length).toFixed(1) : null,
    shareOfVoice: ranking.find((r) => r.isBrand)?.share ?? 0,
    rankAmongDomains: brandRank >= 0 ? brandRank + 1 : null,
    leaders: ranking.filter((r) => !r.isBrand).slice(0, 8),
    yourPages: [...pages.entries()].sort((a, b) => b[1] - a[1]).map(([path, questions]) => ({ path, questions })).slice(0, 8),
    misses: rows.filter((r) => !r.cited).map((r) => ({ question: r.question, retrieved: r.retrieved, wonBy: r.others.slice(0, 3) })),
  };
}

/** A short, plain reading of the result. No score inflation. */
export function verdict(score) {
  const { citedRate, retrievedNotCited, questions, shareOfVoice } = score;
  if (!questions) return 'Nothing was measured.';
  if (citedRate === 0 && score.retrieved === 0) return 'Not cited on any question, and never even surfaced in the searches behind the answers. The gap here is being findable at all, not being chosen.';
  if (citedRate === 0) return `Not cited on any question, but found by the search on ${score.retrieved} of ${questions}. The pages are reachable and are being passed over, which is a content problem rather than a crawling one.`;
  if (retrievedNotCited > score.cited) return `Cited on ${score.cited} of ${questions}, and found but passed over on ${retrievedNotCited} more. Being retrieved is not the constraint. Being the clearest answer on the page is.`;
  if (citedRate >= 60) return `Cited on ${score.cited} of ${questions}, with ${shareOfVoice} percent share of voice. Strong, and worth watching rather than fixing.`;
  return `Cited on ${score.cited} of ${questions}, ${shareOfVoice} percent share of voice.`;
}

export function cleanQuestions(input, max = 10) {
  return (Array.isArray(input) ? input : [])
    .map((q) => (typeof q === 'string' ? q : q?.question))
    .filter((q) => typeof q === 'string')
    .map((q) => q.replace(/\s+/g, ' ').trim())
    .filter((q) => q.length >= 8 && q.length <= 160)
    .filter((q, i, all) => all.indexOf(q) === i)
    .slice(0, max);
}
