"""Albero dei widget di un layout cocostudio (JSON 1.x): nome, classe, posizione, dimensione, immagini.

    python -I recon/tools/layout_tree.py <layout.json> [--brief]
"""
import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

d = json.load(open(sys.argv[1], encoding='utf-8-sig'))
brief = '--brief' in sys.argv
print('version', d.get('version'), 'design', d.get('designWidth'), d.get('designHeight'),
      'textures', d.get('textures'))


def files(o):
    out = []
    for k, v in o.items():
        if isinstance(v, dict) and v.get('path'):
            out.append('%s=%s' % (k, v['path']))
    return out


def walk(w, depth):
    o = w.get('options', {})
    line = '%s%s [%s] pos=(%s,%s) size=(%s,%s)' % ('  ' * depth, o.get('name'), w.get('classname'),
                                                   o.get('x'), o.get('y'), o.get('width'), o.get('height'))
    if not brief:
        f = files(o)
        if f:
            line += ' ' + ' '.join(f)
        if o.get('text'):
            line += ' text=%r' % o['text'][:30]
    print(line)
    for c in w.get('children', []):
        walk(c, depth + 1)


walk(d['widgetTree'], 0)
