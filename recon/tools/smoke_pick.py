"""Missioni da provare sul banco: il minimo insieme che copre tutte le stanze e tutti i
nemici (enemyId e displayId) delle mappe generate da gen_story_maps.py, scelto in modo
goloso. Stampa gli stageId separati da virgola.

    python -I recon/tools/smoke_pick.py <report.json> <cartella stage> <enemy.json>
"""
import json
import os
import struct
import sys

report = json.load(open(sys.argv[1], encoding='utf-8'))
enemies = {e['enemyId']: e for e in json.load(open(sys.argv[3], encoding='utf-8'))}
feats = {}
for r in report:
    d = open(os.path.join(sys.argv[2], 'mappoi_stg%05d_00.bin' % r['stageId']), 'rb').read()
    X = struct.unpack_from('<i', d, 0x24)[0]
    na, ne = struct.unpack_from('<2i', d, X + 0x34)
    e0 = X + 0x3c + na * 0x44
    ids = {struct.unpack_from('<8i', d, e0 + k * 0x20)[2] for k in range(ne)}
    f = {('room', r['folder'])} | {('enemy', i) for i in ids}
    f |= {('display', enemies[i]['displayId']) for i in ids if i in enemies}
    feats[r['stageId']] = f
todo = set().union(*feats.values())
pick = []
while todo:
    best = max(feats, key=lambda s: (len(feats[s] & todo), -s))
    if not feats[best] & todo:
        break
    pick.append(best)
    todo -= feats[best]
print(','.join(map(str, sorted(pick))))
print('missioni da provare: %d su %d' % (len(pick), len(report)), file=sys.stderr)
