"""Copertura degli asset: percorsi citati dal binario contro i nomi di un indice.

Cerca nel binario le stringhe di percorso (cocostudio/, lwf/, img/, ...) e le
confronta con l'elenco nome<TAB>offset scritto da bgi_check.py (IDX_DUMP).
Stampa, per cartella, quanti percorsi ci sono e quali mancano.

    python -I recon/tools/asset_coverage.py <libcocos2dcpp.so> <nomi.tsv> [cartella ...]
"""
import collections
import re
import sys

data = open(sys.argv[1], 'rb').read()
names = set()
with open(sys.argv[2], encoding='utf-8') as fh:
    for line in fh:
        names.add(line.split('\t', 1)[0])
dirs = sys.argv[3:] or ['cocostudio', 'lwf', 'img', 'map', 'text', 'audio', 'mixture', 'json']
pat = re.compile(rb'(?:%s)/[A-Za-z0-9_./%%-]+\.[A-Za-z0-9]+' % b'|'.join(d.encode() for d in dirs))
found = sorted(set(m.decode() for m in pat.findall(data)))
by_dir = collections.defaultdict(lambda: [0, []])
for p in found:
    d = by_dir[p.split('/', 1)[0]]
    if '%' in p:
        continue                                    # percorso con formato: non verificabile
    d[0] += 1
    if p not in names:
        d[1].append(p)
for d, (n, miss) in sorted(by_dir.items()):
    print('%-12s citati %4d  mancanti %4d' % (d, n, len(miss)))
    for p in miss:
        print('    ' + p)
