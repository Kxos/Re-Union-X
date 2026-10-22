"""Forzieri e nemici di ogni stage, dalle mappe stage/mappoi_stg<id>_NN.bin.

    python -I recon/tools/stage_poi.py recon/tools <names_addnl.tsv> <addnl.mp4> <out.json>
    python -I recon/tools/stage_poi.py --dir <cartella con mappoi_stg*.bin> [...] <out.json>

Prima forma: le parti dell'addnl (chiave dei record in BGAD_KEY, esadecimale, la chiave 5.0.1 come per
bgad_extract.py). Seconda forma: file sciolti (es. stage_gen\\orig_stages\\stage; con piu' cartelle
vince l'ultima per lo stesso file), letti con l'STG: si scartano gli stage incoerenti.
Lettura con il parser esatto recon/tools/mapfile.py (formato del client):
nemici = record da 8 interi (x, y, enemyId, f3, f4, livello, reward, uid), forzieri = record da 5
(x, y, reward, tipo, uid). uid e' l'id univoco che il client cerca in userTreasures /
userEnemyDropItems di /stage/start e che riporta in /stage/clear (getTreasures, getEnemyDropItems);
reward e' la riga della tabella reward (per i nemici di solito 1, per alcuni una sua, es. 80002:
letta, se manca il client va in crash dopo /stage/start; make-game-tables.js crea
una riga per ogni reward di questo file). Si riportano tutti i nemici, anche quelli delle squadre
con il bit 0x20 (non contate nei totali dell'STG). Alcuni uid di nemici non compaiono come record
(es. 1 nel Prologue: sono gli uid delle squadre): il server usa tutti gli uid fino al massimo.
Uscita: {"<stageId>": {"chests": [{uid, reward, kind, map}], "enemies": [{uid, enemyId, reward, map}]}}.
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mapfile  # noqa: E402


def poi(part_bytes, part):
    p = mapfile.parse_map(part_bytes, part)
    if not p['client_layout']:
        raise mapfile.FormatError('formato vecchio (versione %d)' % p['version'])
    enemies = [{'uid': e['uid'], 'enemyId': e['enemyId'], 'reward': e['reward'], 'map': part} for e in p['enemies']]
    chests = [{'uid': c['uid'], 'reward': c['reward'], 'kind': c['kind'], 'map': part} for c in p['chests']]
    return enemies, chests


stages, errors = {}, []


def add(sid, enemies, chests):
    s = stages.setdefault(str(sid), {'chests': [], 'enemies': []})
    s['chests'] += chests
    s['enemies'] += enemies


if len(sys.argv) >= 3 and sys.argv[1] == '--dir':
    *dirs, out = sys.argv[2:]
    files = {}
    for d in dirs:
        files.update(mapfile.iter_stage_files(d))
    for sid in sorted({k[0] for k in files}):
        try:
            stg, parts = mapfile.load_stage(files, sid)
            bad, _ = mapfile.check_stage(stg, parts)
            if bad:
                raise mapfile.FormatError('; '.join(bad))
            for k in range(len(parts)):
                add(sid, *poi(open(files[(sid, k)], 'rb').read(), k))
        except (mapfile.FormatError, OSError) as e:
            errors.append('%d: %s' % (sid, e))
else:
    sys.path.insert(0, sys.argv[1])
    import bgad
    key = bytes.fromhex(os.environ['BGAD_KEY'])
    names, data, out = sys.argv[2], sys.argv[3], sys.argv[4]

    def read_record(fh, off):
        fh.seek(off)
        h = bgad.parse(fh.read(bgad.HDR.size))
        fh.seek(off)
        buf = fh.read(h['hsize'] + h['nlen'] + h['size'])
        return bgad.decode(buf, bgad.parse(buf), key)

    with open(names, encoding='utf-8') as fn, open(data, 'rb') as fh:
        for line in fn:
            name, off = line.rstrip('\n').split('\t')
            m = re.fullmatch(r'stage/mappoi_stg(\d+)_(\d+)\.bin', name)
            if not m:
                continue
            try:
                add(int(m.group(1)), *poi(read_record(fh, int(off)), int(m.group(2))))
            except Exception as e:  # noqa: BLE001 - si riportano e si prosegue
                errors.append('%s: %s' % (name, e))

for s in stages.values():
    s['enemies'].sort(key=lambda e: e['uid'])
os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
with open(out, 'w', encoding='utf-8') as fo:
    json.dump(dict(sorted(stages.items(), key=lambda kv: int(kv[0]))), fo, separators=(',', ':'))
print('%d stage, %d forzieri, %d nemici -> %s' % (
    len(stages), sum(len(s['chests']) for s in stages.values()),
    sum(len(s['enemies']) for s in stages.values()), out))
for e in errors[:20]:
    print('  !', e)
if len(errors) > 20:
    print('  ... altri %d' % (len(errors) - 20))
