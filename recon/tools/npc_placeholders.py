"""Segnaposto della wait.lwf degli NPC usati dalle mappe (I-197).

    python -I recon/tools/npc_placeholders.py <stage_gen/files> [--served names.tsv ...] [--report out.json]

Il client (animazione d'attesa dell'NPC) formatta
lwf/character/npc/%d/wait/wait.lwf, la carica con (NULL se manca) e fa addChild(NULL):
crash alle stanze con un NPC senza LWF (quest 953-955, NPC 11018). Per ogni id NPC di ogni parte di
ogni stage in <files>/stage senza wait.lwf servita (elenchi --served) o gia' generata, scrive
l'LWF vuoto di empty_lwf.py (nostro) in <files>/lwf/character/npc/<id>/wait/wait.lwf. Gira PRIMA di
import_jp_coco.py, che sostituisce il segnaposto col JP originale dove esistono tutte le texture.
Deterministico, idempotente: non tocca i file gia' presenti.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import empty_lwf  # noqa: E402
import mapfile  # noqa: E402

REL = 'lwf/character/npc/%d/wait/wait.lwf'


def npc_ids(stage_dir):
    """-> (insieme id NPC, {stage: errore}) di tutti gli stage della cartella."""
    files = mapfile.iter_stage_files(stage_dir)
    ids, errs = set(), {}
    for sid in sorted({k[0] for k in files}):
        try:
            if (sid, None) in files:
                _stg, parts = mapfile.load_stage(files, sid)
            else:
                # parti senza STG (es. stage 1040): le MAP si leggono lo stesso
                parts = [mapfile.parse_map(open(f, 'rb').read(), k[1])
                         for k, f in sorted(files.items(), key=lambda kv: kv[0][1] or 0) if k[0] == sid and k[1] is not None]
                if not parts:
                    raise mapfile.FormatError('nessuna parte')
        except (mapfile.FormatError, OSError, ValueError) as e:
            errs[sid] = str(e)
            continue
        for p in parts:
            for n in p['npcs']:
                ids.add(n['id'] if 'id' in n else n['raw'][2])
    return ids, errs


def served_set(tsvs):
    s = set()
    for t in tsvs:
        if os.path.exists(t):
            with open(t, encoding='utf-8') as f:
                s.update(l.split('\t')[0] for l in f)
    return s


def run(files_dir, served=()):
    ids, errs = npc_ids(os.path.join(files_dir, 'stage'))
    empty = empty_lwf.build()
    written, present, served_ids = [], [], []
    for i in sorted(ids):
        rel = REL % i
        if rel in served:
            served_ids.append(i)
        elif os.path.isfile(os.path.join(files_dir, *rel.split('/'))):
            present.append(i)
        else:
            dst = os.path.join(files_dir, *rel.split('/'))
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            with open(dst, 'wb') as f:
                f.write(empty)
            written.append(i)
    return {'npc_ids': len(ids), 'written': written, 'already_generated': present,
            'served': served_ids, 'stage_errors': errs}


if __name__ == '__main__':
    a = sys.argv[1:]
    rep = a[a.index('--report') + 1] if '--report' in a else None
    srv = []
    while '--served' in a:
        k = a.index('--served'); srv.append(a[k + 1]); del a[k:k + 2]
    if rep:
        k = a.index('--report'); del a[k:k + 2]
    r = run(a[0], served_set(srv))
    print('NPC nelle mappe: %d, segnaposto scritti: %d, gia\' presenti: %d, serviti: %d, stage non letti: %d%s'
          % (r['npc_ids'], len(r['written']), len(r['already_generated']), len(r['served']), len(r['stage_errors']),
             (' (' + ' '.join(str(k) for k in r['stage_errors']) + ')') if r['stage_errors'] else ''))
    if rep:
        json.dump(r, open(rep, 'w'), indent=1)
