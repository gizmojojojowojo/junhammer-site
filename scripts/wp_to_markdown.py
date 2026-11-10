"""One-time migration: WordPress export + url_inventory.csv -> Markdown content files.

Usage: python3 scripts/wp_to_markdown.py <wordpress-export.xml> <url_inventory.csv>
Only rows marked KEEP / REFRESH / REPUBLISH / DECIDE are written.
"""
import csv, html, json, re, sys, xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import urlparse
from bs4 import BeautifulSoup, NavigableString, Comment

ROOT = Path(__file__).resolve().parent.parent
NS = {'wp': 'http://wordpress.org/export/1.2/', 'content': 'http://purl.org/rss/1.0/modules/content/',
      'excerpt': 'http://wordpress.org/export/1.2/excerpt/'}
xml_path, inv_path = sys.argv[1], sys.argv[2]

def norm(u):
    p = urlparse(u).path or '/'
    p = re.sub(r'/+', '/', p)
    return p if p.endswith('/') else p + '/'

inv = {r['old_url']: r for r in csv.DictReader(open(inv_path))}
# where every old URL ends up (for rewriting internal links)
dest = {}
for p, r in inv.items():
    a = r['action']
    if a in ('KEEP', 'REFRESH', 'DECIDE', 'REPUBLISH'):
        dest[p] = r['target_url'] or p
    elif a in ('MERGE', 'REDIRECT'):
        dest[p] = r['target_url']
    else:
        dest[p] = None  # pruned
# resolve chains
for p in list(dest):
    seen = 0
    while dest.get(p) in dest and dest[dest[p]] not in (dest[p], None) and seen < 5:
        dest[p] = dest[dest[p]]; seen += 1

ch = ET.parse(xml_path).getroot().find('channel')
items = list(ch.findall('item'))
attach = {it.findtext('wp:post_id', namespaces=NS): it.findtext('wp:attachment_url', namespaces=NS)
          for it in items if it.findtext('wp:post_type', namespaces=NS) == 'attachment'}
images = set()

def inline(node):
    out = []
    for c in node.children:
        if isinstance(c, Comment):
            continue
        if isinstance(c, NavigableString):
            out.append(re.sub(r'\s+', ' ', str(c)))
            continue
        n = c.name
        if n in ('strong', 'b'):
            t = inline(c).strip(); out.append(f'**{t}**' if t else '')
        elif n in ('em', 'i'):
            t = inline(c).strip(); out.append(f'*{t}*' if t else '')
        elif n == 'code':
            out.append(f'`{c.get_text()}`')
        elif n == 'br':
            out.append('  \n')
        elif n == 'a':
            t = inline(c).strip(); href = link(c.get('href', ''))
            out.append(f'[{t}]({href})' if href and t else t)
        elif n == 'img':
            out.append(img(c))
        else:
            out.append(inline(c))
    return ''.join(out)

def link(href):
    if not href:
        return ''
    u = urlparse(href)
    if u.netloc in ('junhammer.com', 'www.junhammer.com') or (not u.netloc and href.startswith('/')):
        if '/wp-content/' in u.path:
            images.add(href); return href
        p = norm(href)
        if p in dest:
            if dest[p] is None:
                return ''
            p = dest[p]
        return p + (('#' + u.fragment) if u.fragment else '')
    return href

def img(c):
    src = c.get('src', '')
    if not src:
        return ''
    src = re.sub(r'-\d+x\d+(\.\w+)$', r'\1', src)  # full-size original
    images.add(src)
    alt = (c.get('alt') or '').replace(']', '')
    return f'![{alt}]({src})'

def block(node, depth=0):
    out = []
    for c in node.children:
        if isinstance(c, Comment):
            continue
        if isinstance(c, NavigableString):
            t = re.sub(r'\s+', ' ', str(c)).strip()
            if t:
                out.append(t)
            continue
        n = c.name
        if n in ('script', 'style', 'noscript', 'iframe', 'form', 'button'):
            continue
        if re.fullmatch(r'h[1-6]', n):
            lvl = max(2, int(n[1]))  # page title is the only h1
            t = inline(c).strip().strip('*')
            if t:
                out.append('#' * lvl + ' ' + t)
        elif n == 'p':
            t = inline(c).strip()
            if t and t != '&nbsp;':
                out.append(t)
        elif n in ('ul', 'ol'):
            lines = []
            for i, li in enumerate(c.find_all('li', recursive=False), 1):
                sub = [x for x in li.children if getattr(x, 'name', None) in ('ul', 'ol')]
                for s in sub:
                    s.extract()
                mark = f'{i}.' if n == 'ol' else '-'
                lines.append('  ' * depth + f'{mark} ' + inline(li).strip())
                for s in sub:
                    lines.append(block(BeautifulSoup(str(s), 'html.parser'), depth + 1))
            out.append('\n'.join(lines))
        elif n == 'blockquote':
            t = block(c)
            out.append('\n'.join('> ' + l if l else '>' for l in t.split('\n')))
        elif n == 'pre':
            out.append('```\n' + c.get_text().strip('\n') + '\n```')
        elif n == 'img':
            out.append(img(c))
        elif n == 'figure':
            im = c.find('img'); cap = c.find('figcaption')
            if im:
                out.append(img(im) + (f'\n*{inline(cap).strip()}*' if cap else ''))
            elif c.find('table'):
                out.append(block(c, depth))
        elif n == 'table':
            rows = [[inline(td).strip().replace('|', '\\|') for td in tr.find_all(['td', 'th'])] for tr in c.find_all('tr')]
            rows = [r for r in rows if any(r)]
            if rows:
                w = max(len(r) for r in rows); rows = [r + [''] * (w - len(r)) for r in rows]
                md = ['| ' + ' | '.join(rows[0]) + ' |', '|' + '---|' * w] + ['| ' + ' | '.join(r) + ' |' for r in rows[1:]]
                out.append('\n'.join(md))
        elif n == 'hr':
            out.append('---')
        else:
            t = block(c, depth)
            if t:
                out.append(t)
    return '\n\n'.join(x for x in out if x.strip())

def to_md(content):
    content = re.sub(r'<!--.*?-->', '', content, flags=re.S)
    content = re.sub(r'\[/?[a-z_]+[^\]]*\]', '', content)  # shortcodes
    if '<p' not in content and '<h' not in content:
        content = ''.join(f'<p>{p}</p>' for p in re.split(r'\n\s*\n', content))
    md = block(BeautifulSoup(content, 'html.parser'))
    md = re.sub(r'\*\*\s*\*\*', '', md)
    md = re.sub(r'\n{3,}', '\n\n', md).strip()
    return md + '\n'

def first_text(md, n=155):
    for para in md.split('\n\n'):
        if para[:1].isalpha():
            t = re.sub(r'[*_`]|\[([^\]]*)\]\([^)]*\)', r'\1', para)
            return clip(t, n)
    return ''

def clip(t, n=155):
    t = html.unescape(re.sub(r'\s+', ' ', t)).strip()
    if len(t) <= n:
        return t
    return t[:n].rsplit(' ', 1)[0].rstrip(',;:—-') + '…'

def yq(s):
    return json.dumps(s, ensure_ascii=False)

TOPIC = {'Pillar': None, 'AEO': 'AEO', 'SEO': 'SEO', 'AI': 'AI', 'Healthcare AEO': 'Healthcare AEO', '': None}
PILLAR_TOPIC = {'user-intent': 'SEO', 'what-is-semantic-search': 'SEO', 'what-is-seo': 'SEO',
                'answer-engine-optimization-tools': 'AEO', 'definitive-guide-to-answer-engine': 'AEO'}
written = []
for it in items:
    pt = it.findtext('wp:post_type', namespaces=NS); st = it.findtext('wp:status', namespaces=NS)
    if pt not in ('post', 'page'):
        continue
    path = norm(it.findtext('link'))
    slug = it.findtext('wp:post_name', namespaces=NS)
    if st != 'publish':
        path = f'/blog/{slug}/'
    r = inv.get(path)
    if not r or r['action'] not in ('KEEP', 'REFRESH', 'REPUBLISH', 'DECIDE'):
        continue
    meta = {m.findtext('wp:meta_key', namespaces=NS): m.findtext('wp:meta_value', namespaces=NS) or ''
            for m in it.findall('wp:postmeta', namespaces=NS)}
    title = html.unescape(it.findtext('title') or '').strip()
    body = to_md(it.findtext('content:encoded', namespaces=NS) or '')
    seo_title = meta.get('rank_math_title') or meta.get('_yoast_wpseo_title') or ''
    seo_title = '' if '%' in seo_title else html.unescape(seo_title).strip()
    desc = meta.get('rank_math_description') or meta.get('_yoast_wpseo_metadesc') or html.unescape(it.findtext('excerpt:encoded', namespaces=NS) or '')
    desc = clip(html.unescape(desc), 160) if desc.strip() and '%' not in desc else first_text(body)
    date = (it.findtext('wp:post_date', namespaces=NS) or '')[:10]
    mod = (it.findtext('wp:post_modified', namespaces=NS) or '')[:10]
    thumb = attach.get(meta.get('_thumbnail_id', ''), '')
    if thumb:
        images.add(thumb)
    target = r['target_url'] or path
    fm = {'title': title}
    if seo_title and seo_title != title:
        fm['seoTitle'] = seo_title
    fm['description'] = desc
    if pt == 'post' or target.startswith('/blog/'):
        out_slug = target.strip('/').split('/')[-1]
        topic = TOPIC.get(r['section'])
        if not topic:
            topic = next((v for k, v in PILLAR_TOPIC.items() if k in out_slug), 'SEO')
        fm.update(slug=out_slug, date=date, updated=mod if mod > date else None, topic=topic,
                  pillar=r['section'] == 'Pillar', draft=out_slug == 'ai-agents-in-digital-marketing')
        if thumb:
            fm['image'] = thumb
        dirn = ROOT / 'src/content/blog'
    elif target.startswith('/work/'):
        continue  # case studies handled with hand-written frontmatter below
    else:
        out_slug = target.strip('/').split('/')[-1] or 'home'
        if out_slug in ('home', 'blog', 'about', 'contact', 'seo-services'):
            # rewritten by hand for the new positioning; keep the old copy for reference
            (ROOT / 'scripts/legacy').mkdir(parents=True, exist_ok=True)
            (ROOT / f'scripts/legacy/{out_slug}.md').write_text(f'# {title}\n\n{body}')
            continue
        fm['slug'] = out_slug
        dirn = ROOT / 'src/content/pages'
    dirn.mkdir(parents=True, exist_ok=True)
    lines = ['---'] + [f'{k}: {yq(v) if isinstance(v, str) else str(v).lower()}' for k, v in fm.items() if v is not None] + ['---', '']
    (dirn / f'{out_slug}.md').write_text('\n'.join(lines) + body)
    written.append((dirn.name, out_slug, len(body.split())))

# case studies: dump bodies for hand-editing
for it in items:
    path = norm(it.findtext('link') or '')
    r = inv.get(path)
    if r and r['target_url'].startswith('/work/'):
        (ROOT / 'scripts/legacy').mkdir(parents=True, exist_ok=True)
        slug = r['target_url'].strip('/').split('/')[-1]
        (ROOT / f'scripts/legacy/work-{slug}.md').write_text(to_md(it.findtext('content:encoded', namespaces=NS) or ''))

json.dump(sorted(images), open(ROOT / 'scripts/wp_images.json', 'w'), indent=1)
for w in written:
    print(*w)
print(len(written), 'files;', len(images), 'images referenced')
