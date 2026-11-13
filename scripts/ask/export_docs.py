"""Exports site content as JSON for the Ask evals. Run: python3 scripts/ask/export_docs.py

Mirrors src/pages/ask-index.json.ts so evals can run without building the site.
Needs PyYAML (pip3 install pyyaml).
"""
import json, re, sys
from pathlib import Path
import yaml

ROOT = Path(__file__).resolve().parents[2]
C = ROOT / 'src/content'
URL = {'blog': '/blog/{}/', 'services': '/services/{}/', 'work': '/work/{}/', 'pages': '/{}/'}
TYPE = {'blog': 'article', 'services': 'service', 'work': 'case study', 'pages': 'page'}

docs = []
for coll in URL:
    for p in sorted((C / coll).glob('*.md')):
        m = re.match(r'^---\n(.*?)\n---\n?(.*)$', p.read_text(), re.S)
        fm, body = yaml.safe_load(m.group(1)) or {}, m.group(2)
        if fm.get('draft'):
            continue
        lists = {}
        if coll == 'services':
            lists = {'What you get': fm.get('offers') or [], 'Proof': fm.get('proof') or []}
        if coll == 'work':
            lists = {'Results': [f"{r['value']} {r['label']}" for r in fm.get('results') or []]}
        docs.append({
            'type': TYPE[coll],
            'url': URL[coll].format(p.stem),
            'title': fm.get('title', ''),
            'description': fm.get('description') or '',
            'summary': fm.get('summary') or '',
            'body': body,
            'faqs': fm.get('faqs') or [],
            'lists': lists,
        })
json.dump(docs, sys.stdout)
