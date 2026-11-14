// Run: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, forModel, gapReport, normalizeMatch, parseGreenhouse, parseLever, plain, rank, relevance, renderReport } from '../scripts/career/lib.mjs';

test('board payloads become the same shape', () => {
  const g = parseGreenhouse({ jobs: [{ id: 7, title: 'AI Engineer', location: { name: 'Remote' }, absolute_url: 'https://x.test/7', updated_at: '2026-11-10T00:00:00Z', content: '&lt;p&gt;Build &amp;amp; ship.&lt;/p&gt;' }] }, 'acme');
  assert.deepEqual(g[0], { source: 'greenhouse', company: 'acme', id: 'greenhouse:acme:7', title: 'AI Engineer', location: 'Remote', url: 'https://x.test/7', posted: '2026-11-10', body: '<p>Build &amp; ship.</p>' });
  const l = parseLever([{ id: 'ab', text: 'ML Engineer', categories: { location: 'Denver' }, hostedUrl: 'https://y.test/ab', createdAt: 1763000000000, description: '<ul><li>RAG</li><li>Evals</li></ul>', lists: [{ text: 'You have', content: '<li>Python</li>' }] }], 'beta');
  assert.equal(l[0].id, 'lever:beta:ab');
  assert.match(l[0].body, /- RAG - Evals You have - Python/);
  assert.deepEqual(parseGreenhouse(null, 'x'), []);
  assert.deepEqual(parseLever(undefined, 'x'), []);
});

test('plain text strips markup and scripts', () => {
  assert.equal(plain('<p>Hi</p><script>bad()</script><p>There</p>'), 'Hi There');
  assert.equal(plain(null), '');
});

const filters = { include: ['AI', 'agent', 'RAG', 'evals'], exclude: ['intern', 'sales'], titleMust: ['engineer', 'ai'] };
const post = (title, body = '') => ({ title, body, posted: '2026-11-10', company: 'c', id: title });

test('filtering happens before any model call', () => {
  const r = relevance(post('AI Engineer', 'You will build agent systems with RAG and evals.'), filters);
  assert.equal(r.score, 5, 'title hit counts double, three body hits count one each');
  assert.ok(r.reasons[0].includes('in the title'));
  assert.equal(relevance(post('Sales Engineer', 'AI agent RAG evals'), filters).score, 0);
  assert.equal(relevance(post('Product Manager', 'AI agent RAG evals'), filters).score, 0, 'title must match');
  assert.equal(relevance(post('AI Engineer', 'no matches here'), filters).score, 2);
  const top = rank([post('AI Engineer', 'agent RAG evals'), post('Backend Engineer', 'some AI'), post('AI Engineer Intern', 'agent RAG evals')], filters);
  assert.deepEqual(top.map((p) => p.title), ['AI Engineer']);
  assert.ok(rank(Array.from({ length: 40 }, () => post('AI Engineer', 'agent RAG evals')), filters).length <= CONFIG.maxPostingsPerRun);
  assert.equal(forModel({ ...post('AI Engineer', 'x'.repeat(20000)), location: 'Remote' }).description.length, CONFIG.maxPostingChars);
});

const pages = [{ url: '/work/landmain/', title: 'LandmAIn' }, { url: '/work/site-ai-search/', title: 'Site AI search' }];
const posting = { id: 'p1', company: 'Acme', title: 'AI Engineer', location: 'Remote', url: 'https://x.test/1', posted: '2026-11-10' };

test('a match is only as strong as the evidence behind it', () => {
  const m = normalizeMatch(
    {
      summary: 'Good fit for the retrieval work.',
      worth_applying: true,
      requirements: [
        { requirement: 'Production RAG', verdict: 'strong', evidence: ['/work/site-ai-search/', '/made-up/'], note: 'Built and measured.' },
        { requirement: 'Kubernetes', verdict: 'strong', evidence: [], note: 'Claimed with nothing behind it.' },
        { requirement: 'Evals', verdict: 'partial', evidence: ['/work/site-ai-search/'] },
        { requirement: 'Go', verdict: 'nonsense' },
        { requirement: '' },
      ],
      note: 'Hello there.',
    },
    posting,
    pages,
  );
  assert.equal(m.requirements.length, 4);
  assert.deepEqual(m.requirements[0].evidence, ['/work/site-ai-search/'], 'pages that do not exist are dropped');
  assert.equal(m.requirements[1].verdict, 'partial', 'strong with no evidence is downgraded');
  assert.equal(m.requirements[3].verdict, 'weak', 'an unknown verdict is weak');
  assert.deepEqual(m.gaps, ['Go']);
  assert.equal(m.fit, Math.round((100 * (1 + 0.5 * 2)) / 4));
  assert.equal(normalizeMatch({}, posting, pages).fit, 0);
  assert.equal(normalizeMatch({ worth_applying: 'yes' }, posting, pages).worthApplying, false);
});

test('the gap report ranks what employers keep asking for', () => {
  const mk = (company, gaps) => ({ company, gaps, fit: 50, worthApplying: false, title: 't', requirements: [], summary: '' });
  const gaps = gapReport([mk('Acme', ['Kubernetes', 'kubernetes!', 'Go']), mk('Beta', ['Kubernetes', 'Rust']), mk('Acme', ['Kubernetes'])]);
  assert.deepEqual(gaps[0], { gap: 'kubernetes', count: 3, companies: ['Acme', 'Beta'] });
  assert.equal(gaps.length, 3, 'duplicates inside one posting count once');
  assert.deepEqual(gapReport([]), []);
});

test('the report reads as notes, with gaps first', () => {
  const m = normalizeMatch({ summary: 'Strong overlap.', worth_applying: true, requirements: [{ requirement: 'RAG', verdict: 'strong', evidence: ['/work/landmain/'], note: 'Shipped.' }, { requirement: 'Rust', verdict: 'weak' }], note: 'Hi there.' }, posting, pages);
  const weak = { ...normalizeMatch({ summary: 'Thin.', requirements: [{ requirement: 'Rust', verdict: 'weak' }] }, { ...posting, id: 'p2', title: 'ML Engineer' }, pages) };
  const out = renderReport({ matches: [m, weak], gaps: gapReport([m, weak]), checked: 120, sources: 6, failed: ['badslug'], date: '2026-11-14' });
  assert.match(out, /# Job scan, 2026-11-14/);
  assert.match(out, /120 postings read from 6 boards/);
  assert.match(out, /did not respond: badslug/);
  assert.ok(out.indexOf('## What to build next') < out.indexOf('## Worth applying to'), 'gaps come first');
  assert.match(out, /- \*\*rust\*\* \(2 postings: Acme\)/);
  assert.match(out, /\[x\] \*\*RAG\*\* Shipped\. \(\/work\/landmain\/\)/);
  assert.match(out, /\[ \] \*\*Rust\*\*/);
  assert.match(out, /## Weaker matches[\s\S]*ML Engineer/);
  assert.match(out, /not something to send as it stands/);
  assert.ok(!out.includes('\n\n\n'));
});
