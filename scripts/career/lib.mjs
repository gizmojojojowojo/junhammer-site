// Pure parts of the career agent: reading public job boards, filtering before
// any model call, turning a match into a report row, finding the requirement
// that keeps appearing without evidence, and rendering the report.
// Tested in tests/career.test.mjs.

export const CONFIG = {
  minRelevance: 3, // below this a posting is not worth a model call
  maxPostingsPerRun: 12,
  maxPostingChars: 9000,
  model: 'claude-sonnet-5-5',
  concurrency: 3,
};

const text = (v, n) => (typeof v === 'string' ? v.replace(/—/g, ', ').replace(/\s+/g, ' ').trim().slice(0, n) : '');

/** Strips HTML and decodes the few entities job boards actually emit. */
export function plain(html) {
  return text(
    String(html || '')
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<li\b[^>]*>/gi, '\n- ')
      .replace(/<\/(p|div|li|h\d|ul|ol|br)>|<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n) || 32))
      .replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/g, (m, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" })[e] || m),
    40000,
  );
}

// Field names follow each board's published API. They have not been checked
// against a live response from this machine, which cannot reach those hosts.
// run.mjs reports any board that fails, so a wrong slug or a changed shape
// shows up on the first real run rather than silently returning nothing.
export function parseGreenhouse(data, company) {
  return (data?.jobs || []).map((j) => ({
    source: 'greenhouse',
    company,
    id: `greenhouse:${company}:${j.id}`,
    title: text(j.title, 160),
    location: text(j.location?.name, 120),
    url: j.absolute_url || '',
    posted: (j.updated_at || j.first_published || '').slice(0, 10),
    body: plain(j.content),
  }));
}

export function parseLever(data, company) {
  return (Array.isArray(data) ? data : []).map((j) => ({
    source: 'lever',
    company,
    id: `lever:${company}:${j.id}`,
    title: text(j.text, 160),
    location: text(j.categories?.location, 120),
    url: j.hostedUrl || '',
    posted: j.createdAt ? new Date(j.createdAt).toISOString().slice(0, 10) : '',
    body: plain([j.descriptionPlain || j.description, ...(j.lists || []).map((l) => `${l.text}\n${l.content}`)].join('\n')),
  }));
}

/**
 * A cheap score so the model only sees postings worth reading. Title matches
 * count double, since a title is a much stronger signal than one mention in a
 * long description. Postings that match an exclude term are dropped outright.
 */
export function relevance(posting, { include = [], exclude = [], titleMust = [] } = {}) {
  const title = posting.title.toLowerCase();
  const body = `${title} ${posting.body}`.toLowerCase();
  const hit = (term) => body.includes(term.toLowerCase());
  if (exclude.some((t) => title.includes(t.toLowerCase()))) return { score: 0, reasons: ['excluded by title'] };
  if (titleMust.length && !titleMust.some((t) => title.includes(t.toLowerCase()))) return { score: 0, reasons: ['title does not match'] };
  const reasons = [];
  let score = 0;
  for (const term of include) {
    if (title.includes(term.toLowerCase())) {
      score += 2;
      reasons.push(`"${term}" in the title`);
    } else if (hit(term)) {
      score += 1;
      reasons.push(`"${term}"`);
    }
  }
  return { score, reasons: reasons.slice(0, 6) };
}

export function rank(postings, filters, limit = CONFIG.maxPostingsPerRun) {
  return postings
    .map((p) => ({ ...p, ...relevance(p, filters) }))
    .filter((p) => p.score >= CONFIG.minRelevance)
    .sort((a, b) => b.score - a.score || (b.posted || '').localeCompare(a.posted || ''))
    .slice(0, limit);
}

/** Only the parts of a posting the model needs, trimmed to keep the call small. */
export function forModel(posting) {
  return { company: posting.company, title: posting.title, location: posting.location, posted: posting.posted, description: posting.body.slice(0, CONFIG.maxPostingChars) };
}

const VERDICTS = ['strong', 'partial', 'weak'];

/** Cleans one model match into a report row. Evidence must point at a real page. */
export function normalizeMatch(input, posting, pages) {
  const known = new Map(pages.map((p) => [p.url, p.title]));
  const requirements = (Array.isArray(input?.requirements) ? input.requirements : [])
    .map((r) => ({
      requirement: text(r?.requirement, 200),
      verdict: VERDICTS.includes(r?.verdict) ? r.verdict : 'weak',
      evidence: (Array.isArray(r?.evidence) ? r.evidence : []).filter((u) => known.has(u)).slice(0, 3),
      note: text(r?.note, 300),
    }))
    .filter((r) => r.requirement)
    .slice(0, 12);
  // A claim of evidence with no page behind it is not evidence.
  for (const r of requirements) if (!r.evidence.length && r.verdict === 'strong') r.verdict = 'partial';
  const strong = requirements.filter((r) => r.verdict === 'strong').length;
  return {
    id: posting.id,
    company: posting.company,
    title: posting.title,
    location: posting.location,
    url: posting.url,
    posted: posting.posted,
    fit: requirements.length ? Math.round((100 * (strong + 0.5 * requirements.filter((r) => r.verdict === 'partial').length)) / requirements.length) : 0,
    summary: text(input?.summary, 600),
    requirements,
    gaps: requirements.filter((r) => r.verdict === 'weak').map((r) => r.requirement),
    note: text(input?.note, 2000),
    worthApplying: input?.worth_applying === true,
  };
}

/**
 * The requirements that keep coming up with no evidence behind them. This is
 * the useful output: the thing to build next, ranked by how often employers
 * ask for it.
 */
export function gapReport(matches, limit = 8) {
  const counts = new Map();
  for (const m of matches) {
    for (const gap of new Set(m.gaps.map((g) => g.toLowerCase().replace(/[^a-z0-9 +#.]/g, '').replace(/\s+/g, ' ').trim()))) {
      if (!gap) continue;
      const entry = counts.get(gap) || { gap, count: 0, companies: [] };
      entry.count++;
      if (!entry.companies.includes(m.company)) entry.companies.push(m.company);
      counts.set(gap, entry);
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.gap.localeCompare(b.gap)).slice(0, limit);
}

const bar = (fit) => '#'.repeat(Math.round(fit / 10)).padEnd(10, '.');

export function renderReport({ matches, gaps, checked, sources, failed = [], date }) {
  const worth = matches.filter((m) => m.worthApplying).sort((a, b) => b.fit - a.fit);
  const rest = matches.filter((m) => !m.worthApplying).sort((a, b) => b.fit - a.fit);
  const lines = [
    `# Job scan, ${date}`,
    '',
    `${checked} postings read from ${sources} boards. ${matches.length} matched closely enough to analyze. ${worth.length} look worth applying to.`,
    failed.length ? `\nBoards that did not respond: ${failed.join(', ')}.` : '',
    '',
    '## What to build next',
    '',
    gaps.length ? 'Requirements that came up with nothing in the portfolio behind them, most frequent first.' : 'No repeated gaps in this batch.',
    '',
    ...gaps.map((g) => `- **${g.gap}** (${g.count} ${g.count === 1 ? 'posting' : 'postings'}: ${g.companies.join(', ')})`),
    '',
    '## Worth applying to',
    '',
  ];
  const block = (m) => [
    `### ${m.title}, ${m.company}`,
    `${bar(m.fit)} ${m.fit}% fit · ${m.location || 'location not given'}${m.posted ? ` · posted ${m.posted}` : ''}`,
    m.url ? `<${m.url}>` : '',
    '',
    m.summary,
    '',
    ...m.requirements.map((r) => `- ${{ strong: '[x]', partial: '[~]', weak: '[ ]' }[r.verdict]} **${r.requirement}** ${r.note}${r.evidence.length ? ` (${r.evidence.join(', ')})` : ''}`),
    '',
    m.note ? `**Draft note**\n\n${m.note}\n` : '',
  ];
  for (const m of worth) lines.push(...block(m));
  if (rest.length) {
    lines.push('## Weaker matches', '');
    for (const m of rest) lines.push(`- **${m.title}**, ${m.company} (${m.fit}% fit). ${m.gaps.length ? `Missing: ${m.gaps.slice(0, 3).join('; ')}.` : m.summary}`);
    lines.push('');
  }
  lines.push('---', '', 'Written by scripts/career/run.mjs. Every draft note is a starting point, not something to send as it stands. Check each claim against the page it cites before using it.');
  return lines.filter((l) => l !== '').join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
}
