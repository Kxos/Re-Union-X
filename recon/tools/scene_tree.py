"""Nodi di una scena CocoStudio (SceneEditor, *Scene*.json): nome -> layout dei GUIComponent.

    python -I recon/tools/scene_tree.py <scena.json> [...]
"""
import json
import sys

sys.stdout.reconfigure(encoding='utf-8')


def walk(n, depth):
    files = [c.get('fileData', {}).get('path') for c in n.get('components', []) if c.get('fileData')]
    print('%s%s [%s] x=%s y=%s z=%s %s' % ('  ' * depth, n.get('name'), n.get('classname'), n.get('x'), n.get('y'),
                                         n.get('zorder'), ' '.join(f for f in files if f)))
    for c in n.get('gameobjects', []):
        walk(c, depth + 1)


for f in sys.argv[1:]:
    print('===', f.replace('\\', '/').split('/')[-1])
    walk(json.load(open(f, encoding='utf-8-sig')), 0)
