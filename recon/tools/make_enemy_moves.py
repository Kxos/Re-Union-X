"""Animazione `move` per le grafiche dei nemici di Dark Road usate dal master.

    python -I recon/tools/make_enemy_moves.py <enemy.json> <nomi.tsv> <resource_data\\N\\data> <cache> <uscita>

Le serie di Dark Road (lwf/character/enemy/5001+) hanno wait, atk1_o, dead, knockback ma
non `move`, che il campo di KHUX carica per ogni nemico (HANDOFF, prove zoo). Per ogni
displayId >= 5000 del master `enemy` si estrae wait/ (res_bulk.py, nella cache) e lo si
copia in <uscita>/lwf/character/enemy/<id>/move/: stesse texture (i nomi wait_*.png che
il .lwf cita), wait.lwf rinominato move.lwf. Il nemico si sposta senza animarsi.
Chiave dei record: BGAD_KEY, come res_bulk.py.
"""
import json
import os
import shutil
import subprocess
import sys

enemy_json, tsv, datadir, cache, out = sys.argv[1:6]
ids = sorted({e['displayId'] for e in json.load(open(enemy_json, encoding='utf-8')) if e['displayId'] >= 5000})
prefixes = ['lwf/character/enemy/%d/wait/' % d for d in ids]
if prefixes:
    subprocess.run([sys.executable, '-I', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'res_bulk.py'),
                    tsv, datadir, cache] + prefixes, check=True)
made = 0
for d in ids:
    src = os.path.join(cache, 'lwf', 'character', 'enemy', str(d), 'wait')
    if not os.path.isdir(src):
        print('manca wait per', d)
        continue
    dst = os.path.join(out, 'lwf', 'character', 'enemy', str(d), 'move')
    os.makedirs(dst, exist_ok=True)
    for f in os.listdir(src):
        shutil.copyfile(os.path.join(src, f), os.path.join(dst, 'move.lwf' if f == 'wait.lwf' else f))
    made += 1
print('move ricostruita per %d grafiche di Dark Road' % made)
