"""Testi di dialogo degli NPC (text/drama/2xxxxxxxx.txt) citati dalle mappe servite e assenti
dalle risorse servite: dal pacchetto globale 2016 (inglese), in mancanza dai dati JP 4.3.1.

    python -I recon/tools/import_npc_talk.py <nomi serviti.tsv> <bundle2016> <jp text/drama> <cartella stage> <uscita> [--report r.json]

Formato (client 4.3.1): i due int a +0x14 e +0x18
del record npc della MAP sono i testi; tipo 3 usa il primo, tipo 1 il primo o il secondo (la
nuvoletta NPCTalkIcon compare per i tipi 1 e 3). Il testo e' (categoria 1 = drama,
id % 200000000 + 200000000) = text/drama/<n>.txt; se manca la finestra non si apre e il tocco
non fa nulla (missione 132, stage 5020: 204050201). Le pagine sono separate da 0x0C.

<bundle2016> = estrazione del pacchetto 2016 (files\ con gli stub risolti e la revisione piu'
recente, files.tsv con lo sha1 di ogni record: si controlla che files\ sia la riga corrente,
dup 0). <jp text/drama> = file con suffisso di revisione <id>.<8 cifre>.txt: vince la piu' alta.
Quelli dal JP sono in giapponese e vanno segnalati. Scrive <uscita>/text/drama/<n>.txt; salta i
testi gia' nelle risorse servite (es. 204010301 del tutorial).
"""
import hashlib
import json
import os
import re
import sys

here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, here)
from mapfile import FormatError, parse_map  # noqa: E402

args = sys.argv[1:]
report = None
if '--report' in args:
    i = args.index('--report')
    report = args[i + 1]
    del args[i:i + 2]
served_tsv, b16, jpdir, stagedir, out = args

served = set()
for line in open(served_tsv, encoding='utf-8', errors='replace'):
    m = re.match(r'(text/drama/\d+\.txt)\t', line)
    if m:
        served.add(m.group(1))

# id -> mappe che lo citano
want = {}
bad = []
for f in sorted(os.listdir(stagedir)):
    if not re.match(r'^mappoi_stg\d+_\d\d\.bin$', f):
        continue
    try:
        m = parse_map(open(os.path.join(stagedir, f), 'rb').read())
    except FormatError as e:
        bad.append('%s: %s' % (f, e))
        continue
    if not m['client_layout']:
        continue
    for npc in m['npcs']:
        if npc['type'] not in (1, 3):
            continue
        for t in (npc['talk'], npc['talk2']):
            if t:
                want.setdefault(t % 200000000 + 200000000, []).append(f)

current = {}
for line in open(os.path.join(b16, 'files.tsv'), encoding='utf-8'):
    c = line.rstrip('\n').split('\t')
    if c[0].startswith('text/drama/') and c[-1] == '0':
        current[c[0]] = c[5]
jp = {}
for f in os.listdir(jpdir):
    m = re.match(r'^(\d+)(?:\.(\d{8}))?\.txt$', f)
    if m:
        n, r = int(m.group(1)), int(m.group(2) or 0)
        if n not in jp or r > jp[n][0]:
            jp[n] = (r, f)

dst = os.path.join(out, 'text', 'drama')
os.makedirs(dst, exist_ok=True)
res = {'maps_bad': bad, 'already_served': [], 'from_2016': [], 'from_jp': [], 'missing': []}
for n in sorted(want):
    name = 'text/drama/%d.txt' % n
    if name in served:
        res['already_served'].append(n)
        continue
    src = os.path.join(b16, 'files', 'text', 'drama', '%d.txt' % n)
    kind = 'from_2016'
    if os.path.isfile(src):
        data = open(src, 'rb').read()
        if name in current and hashlib.sha1(data).hexdigest() != current[name]:
            sys.exit('%s: files\\ non e\' la revisione corrente di files.tsv' % name)
    elif n in jp:
        data = open(os.path.join(jpdir, jp[n][1]), 'rb').read()
        kind = 'from_jp'
    else:
        res['missing'].append({'id': n, 'maps': sorted(set(want[n]))})
        continue
    with open(os.path.join(dst, '%d.txt' % n), 'wb') as fh:
        fh.write(data)
    res[kind].append(n if kind == 'from_2016' else {'id': n, 'file': jp[n][1], 'maps': sorted(set(want[n]))})

print('testi npc: %d citati, %d gia\' serviti, %d dal 2016, %d dal JP (giapponese), %d mancanti, %d mappe illeggibili'
      % (len(want), len(res['already_served']), len(res['from_2016']), len(res['from_jp']), len(res['missing']), len(bad)))
for r in res['from_jp']:
    print('  dal JP: %d (%s)' % (r['id'], ', '.join(r['maps'])))
for r in res['missing']:
    print('  mancante: %d (%s)' % (r['id'], ', '.join(r['maps'])))
if report:
    os.makedirs(os.path.dirname(os.path.abspath(report)), exist_ok=True)
    with open(report, 'w', encoding='utf-8') as fh:
        json.dump(res, fh, indent=1)
