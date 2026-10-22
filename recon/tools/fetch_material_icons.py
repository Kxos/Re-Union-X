"""Scarica dalla khuxwiki le icone dei materiali che mancano nelle risorse servite
(img/material/material_<id>.png: ce ne sono solo 9) in <cartella>/material_<id>.png;
make_textures.py le converte in BTF. Nome del file sulla wiki: <Nome>_KHX.png.

    python -I recon/tools/fetch_material_icons.py <material.json> <catalogo textures.tsv> <cartella>
"""
import json
import os
import sys
import urllib.parse
import urllib.request

mat_json, tsv, out = sys.argv[1:4]
os.makedirs(out, exist_ok=True)
have = {line.split('\t')[0] for line in open(tsv, encoding='utf-8')}
API = 'https://www.khuxwiki.com/w/api.php?action=query&format=json&list=allimages&ailimit=5&aiprefix='
for m in json.load(open(mat_json, encoding='utf-8')):
    mid, name = m['materialId'], m['name']
    if 'img/material/material_%d.png' % mid in have:
        continue
    dest = os.path.join(out, 'material_%d.png' % mid)
    if os.path.exists(dest):
        continue
    key = name.replace(' ', '_') + '_KHX'
    req = urllib.request.Request(API + urllib.parse.quote(key), headers={'User-Agent': 'khux-restore'})
    imgs = json.load(urllib.request.urlopen(req, timeout=30))['query']['allimages']
    hit = [i for i in imgs if i['name'] == key + '.png']
    if not hit:
        print('%3d %-22s non trovata' % (mid, name))
        continue
    req = urllib.request.Request(hit[0]['url'], headers={'User-Agent': 'khux-restore'})
    open(dest, 'wb').write(urllib.request.urlopen(req, timeout=60).read())
    print('%3d %-22s %s' % (mid, name, hit[0]['url']))
