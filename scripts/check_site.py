"""Pre-publish checks for content. Run: python3 scripts/check_site.py

Checks frontmatter against the site's rules, flags long titles/descriptions,
and verifies every internal link points at a real page or a redirect.
Needs PyYAML (pip3 install pyyaml).
"""
import json, re, sys
from datetime import date
from pathlib import Path
import yaml

ROOT = Path(__file__).resolve().parent.parent
C = ROOT / 'src/content'
TOPICS = {'AI', 'AEO', 'SEO', 'Healthcare AEO'}
errors, warns = [], []

def load(p):
    t = p.read_text()
    m = re.match(r'^---\n(.*?)\n---\n?(.*)$', t, re.S)
    if not m:
        errors.append(f'{p}: missing frontmatter'); return {}, t
    try:
        return yaml.safe_load(m.group(1)) or {}, m.group(2)
    except yaml.YAMLError as e:
        errors.append(f'{p}: bad YAML: {e}'); return {}, ''

routes = {'/', '/blog/', '/services/', '/work/', '/contact/', '/ask/', '/ask/evals/', '/audit/', '/arcade/', '/tools/', '/agent/', '/ask/prompt-evolution/', '/rss.xml', '/llms.txt'}
routes |= {f'/blog/topic/{t}/' for t in ('ai', 'aeo', 'seo', 'healthcare')}
docs = []
for coll in ('blog', 'services', 'work', 'pages'):
    for p in sorted((C / coll).glob('*.md')):
        fm, body = load(p)
        slug = fm.get('slug') or p.stem
        if coll == 'blog' and slug != p.stem:
            warns.append(f'{p.name}: slug "{slug}" differs from filename')
        if not fm.get('title'):
            errors.append(f'{coll}/{p.name}: missing title')
        d = fm.get('description') or ''
        if d and len(d) > 200:
            errors.append(f'{coll}/{p.name}: description over 200 chars (build will fail)')
        elif not d:
            warns.append(f'{coll}/{p.name}: no meta description')
        elif len(d) > 160:
            warns.append(f'{coll}/{p.name}: description {len(d)} chars (aim for 160 or fewer)')
        shown = fm.get('seoTitle') or fm.get('title') or ''
        if len(shown) > 65:
            warns.append(f'{coll}/{p.name}: SEO title {len(shown)} chars; add a shorter seoTitle')
        if coll == 'blog':
            if fm.get('topic') not in TOPICS:
                errors.append(f'blog/{p.name}: topic must be one of {sorted(TOPICS)}')
            if not fm.get('date'):
                errors.append(f'blog/{p.name}: missing date')
        if coll == 'services':
            for k in ('navLabel', 'summary'):
                if not fm.get(k): errors.append(f'services/{p.name}: missing {k}')
        if coll == 'work':
            for k in ('client', 'summary'):
                if not fm.get(k): errors.append(f'work/{p.name}: missing {k}')
        draft = fm.get('draft') is True
        prefix = {'blog': '/blog/', 'services': '/services/', 'work': '/work/', 'pages': '/'}[coll]
        if not draft:
            routes.add(f'{prefix}{slug}/')
        docs.append((coll, p, fm, body, draft))

redirects = set()
rp = ROOT / 'public/_redirects'
if rp.exists():
    for line in rp.read_text().splitlines():
        if line and not line.startswith('#'):
            redirects.add(line.split()[0])
gone = set(json.loads((ROOT / 'functions/gone.json').read_text())) if (ROOT / 'functions/gone.json').exists() else set()

def check_link(src, href):
    if not href.startswith('/') or href.startswith('//'):
        return
    path = href.split('#')[0].split('?')[0]
    if not path or path.startswith('/images/') or re.search(r'\.\w{2,12}$', path):
        return
    if path in routes:
        return
    if path in redirects:
        warns.append(f'{src}: links to {path}, which redirects; link the destination instead')
    elif path in gone:
        errors.append(f'{src}: links to retired page {path}')
    else:
        errors.append(f'{src}: broken internal link {path}')

link_re = re.compile(r'\]\((/[^)\s]*)\)')
for coll, p, fm, body, draft in docs:
    if draft:
        continue
    for href in link_re.findall(body):
        check_link(f'{coll}/{p.name}', href)
for f in [*(ROOT / 'src').rglob('*.astro'), ROOT / 'src/data/navigation.json']:
    for href in re.findall(r'href=[{"`]?["`]?(/[^"`{}\s>]*)', f.read_text()):
        if '$' not in href:
            check_link(f.relative_to(ROOT), href)

for e in errors: print('ERROR', e)
for w in warns: print('warn ', w)
print(f'\n{len(routes)} pages, {len(errors)} errors, {len(warns)} warnings')
sys.exit(1 if errors else 0)
