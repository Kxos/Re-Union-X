"""Pacchetto statico delle stanze recuperate (JP 4.3.1 + 2016) per il client: rooms_gen\\files.

    python recon/tools/make_jp_rooms.py [--out D:\\Progetto_Restauro_KH_UX\\rooms_gen] [--story-only]
        [--rooms R1,R2] [--dry] [--jobs N] (Pillow: senza -I)

Fonti (solo lettura): stanze unite di rooms_merge_v2.py in <ref_work>\\rooms_merged\\<stanza>\\
(i 4 .bin, tessere e immagini intere gia' scelti e ricostruiti) e, per cio' che li' manca, i dati JP
4.3.1 della cartella di riferimento locale (`map/`, `lwf/map/`; nomi con revisione `<nome>.<8 cifre>.<ext>`: vale la
revisione piu' alta, come latest di import_jp_coco.py).

Per ogni stanza di rooms_merged la cui `map/<S>/<S>_info.bin` non e' gia' servita (indice
names_v4.tsv + ipa431\\names_addnl.tsv + pacchetti generati stage_gen\\files, medal_gen\\files) e
per le stanze servite ma incomplete (DB_0018_01_00, ED_0011_01_00) si calcola l'elenco dei file che
il caricatore apre (formato BMI in check_rooms.py):
  * obbligatori (assente = crash): map/<S>/<S>_{info,cls,chp,jmp}.bin; tessere da 256 del livello
    base1 della stanza scritta nel BMI a +0x10 (alias grafico: puo' essere un'altra stanza),
    map/<N>/<N>_base1/<N>_base1_%03d.png da 001 a ceil(W/256)*ceil(H/256); tessere dei livelli
    map/<T>/<T>_<L>/<T>_<L>_%03d.png (T puo' essere un'altra stanza);
  * facoltativi (assenti = tollerati): immagini intere map/<T>/<T>_<L>.png; oggetti
    lwf/map/<O>/<O>.lwf con tutti i png che il lwf cita (lwf con texture assenti: non si copia,
    l'oggetto manca come oggi in DW_0001/DW_0003).
Una stanza entra solo se TUTTI gli obbligatori sono serviti o recuperabili (mai una tessera
assente); i file gia' serviti non si riscrivono mai (vince l'originale). Con --story-only solo le
stanze delle porte di storia (schema_v2\\schema_mondi.json, porte scope 'storia': stanza e
destinazione) piu' le stanze degli stage di storia di stage_exits_v2.json (storia_master, storia_variante,
storia_oltre: le 27 stanze delle missioni 526-979 a una parte o senza porte + SR_0009_01_00, 21-10); senza, tutte le complete (le stanze di storia sono comunque l'insieme da coprire e
il rapporto dice quali mancano e perche').

Texture: PNG veri (estrazione JP, alpha non premoltiplicata) -> BTF tipo 8 con btf.encode
(premoltiplica come le originali); tessere del tutto trasparenti -> il segnaposto BTF tipo 1 da 45
byte delle originali (le tessere vuote servite sono cosi': 588/592 segnaposto = PNG JP trasparente);
BTF gia' tali (file del 2016) copiati. Nomi uguali a quelli che il client cerca.

Uscita: <out>\\files\\map\\..., <out>\\files\\lwf\\map\\... (i file non piu' previsti si tolgono),
<out>\\report.json e <out>\\report.md (per stanza: completa / scartata e perche'). Rilancio
incrementale: un file gia' scritto e piu' nuovo della fonte non si riconverte.
"""
import argparse
import json
import math
import os
import re
import struct
import sys
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
D = r'D:\Progetto_Restauro_KH_UX'
import private_tools  # noqa: E402  (local reference data folders, see private_tools.py)
JP_ROOT = private_tools.local_path('jp_data')
TILE = 256
REV = re.compile(r'^(.*)\.(\d{8})(\.[^.]+)$')
# segnaposto delle tessere vuote originali (map/DB_0000_00_00/..._base1_001.png della 5.0.1)
# 45 byte, come l'originale. Fino al 20-10 qui c'era un 00 in piu' all'offset 16 (46 byte): campi slittati, il
# client leggeva byte di dati da un file di 46 e andava in crash entrando nelle 86 stanze generate con
# tessere trasparenti (quest 13 e 524, banco 20-10); le tessere scritte cosi' si riscrivono (BAD_PLACEHOLDER)
PLACEHOLDER = bytes.fromhex('89425446000001000000000000000000010000000000000100010000000001'
                            '0001000100050000000000000000')
BAD_PLACEHOLDER = bytes.fromhex('8942544600000100000000000000000000010000000000000100010000000001'
                                '0001000100050000000000000000')
assert len(PLACEHOLDER) == 45

ap = argparse.ArgumentParser()
ap.add_argument('--merged', default=private_tools.local_path('ref_work', 'rooms_merged'))
ap.add_argument('--jp', default=JP_ROOT)
ap.add_argument('--index', action='append')
ap.add_argument('--served-files', action='append', help='pacchetti generati gia\' serviti (cartelle files)')
ap.add_argument('--schema', default=os.path.join(D, 'reference', 'world_schema', 'schema_v2', 'schema_mondi.json'))
ap.add_argument('--out', default=os.path.join(D, 'rooms_gen'))
ap.add_argument('--story-only', action='store_true')
ap.add_argument('--rooms', help='solo queste stanze (elenco con virgole), per prove')
ap.add_argument('--dry', action='store_true', help='solo rapporto, nessuna scrittura in files')
ap.add_argument('--jobs', type=int, default=0)
a = ap.parse_args()
a.index = a.index or [os.path.join(D, 'resource_data', 'names_v4.tsv'), os.path.join(D, 'ipa431', 'names_addnl.tsv')]
a.served_files = a.served_files or [p for p in (os.path.join(D, 'stage_gen', 'files'), os.path.join(D, 'medal_gen', 'files'))
                                    if os.path.isdir(p)]
OUT_FILES = os.path.join(a.out, 'files')


def cstr(b):
    return b.split(b'\0')[0].decode('ascii', 'replace')


def parse_info(b):
    """BMI come in check_rooms.py."""
    if b[:3] != b'BMI':
        raise ValueError('non BMI')
    nT, nI, nO = struct.unpack_from('<3H', b, 0x0a)
    W, H = struct.unpack_from('<2I', b, 0x20)
    info = {'name': cstr(b[0x10:0x20]), 'w': W, 'h': H, 'tiled': [], 'images': [], 'objects': []}
    o = 0x28
    for _ in range(nT):
        v = struct.unpack_from('<6I', b, o + 32)
        info['tiled'].append({'room': cstr(b[o:o + 16]), 'layer': cstr(b[o + 16:o + 32]), 'w2': v[4], 'h2': v[5]})
        o += 60
    for _ in range(nI):
        info['images'].append({'room': cstr(b[o:o + 16]), 'layer': cstr(b[o + 16:o + 32])})
        o += 52
    for _ in range(nO):
        info['objects'].append(cstr(b[o:o + 32]))
        o += 52
    info['size_ok'] = o == len(b)
    return info


def tiles(w, h):
    return math.ceil(w / TILE) * math.ceil(h / TILE)


# ------------------------------------------------------------------ cosa e' gia' servito
served = set()
for tsv in a.index:
    with open(tsv, encoding='utf-8') as fh:
        next(fh)
        for line in fh:
            served.add(line.split('\t', 1)[0])
for root in a.served_files:
    for dp, _, fs in os.walk(root):
        for f in fs:
            served.add(os.path.relpath(os.path.join(dp, f), root).replace('\\', '/'))

# ------------------------------------------------------------------ fonti
_jp_dirs = {}


def jp_dir(rel_dir):
    """Revisione corrente dei file di una cartella JP: nome logico -> percorso (pigro, per cartella)."""
    if rel_dir not in _jp_dirs:
        idx = {}
        p = os.path.join(a.jp, *rel_dir.split('/'))
        if os.path.isdir(p):
            for f in os.listdir(p):
                m = REV.match(f)
                base, r = (m.group(1) + m.group(3), int(m.group(2))) if m else (f, -1)
                if base not in idx or idx[base][0] < r:
                    idx[base] = (r, os.path.join(p, f))
        _jp_dirs[rel_dir] = {k: v[1] for k, v in idx.items()}
    return _jp_dirs[rel_dir]


_merged_dirs = {}


def merged_dir(rel_dir):
    if rel_dir not in _merged_dirs:
        p = os.path.join(a.merged, *rel_dir.split('/'))
        _merged_dirs[rel_dir] = {f: os.path.join(p, f) for f in os.listdir(p)} if os.path.isdir(p) else {}
    return _merged_dirs[rel_dir]


# INFO alias (decisione dell'utente 20-10, missioni 526-979): SR_0009_01_00 (Q929, stage 39109 parte 1) ha dai
# dati JP solo _cls/_chp/_jmp (nessuna INFO in nessuna fonte: rooms_merged, JP 4.3.1, 2016, stage_gen). _cls e _chp
# sono identici byte per byte a quelli di SR_0009_00_00 (1.065.496 e 2.382 byte, stessa misura 0x1554 x 0x618);
# il _jmp proprio e' quello JP (16 byte: zero salti, resta cosi'). L'INFO e' il BMI di SR_0009_00_00 senza
# modifiche: il nome a +0x10 e tutti i livelli/immagini/oggetti citano gia' SR_0009_00_00, quindi tessere e lwf
# sono quelli di 00_00 (come le stanze alias del BMI, es. DB_0021_*) e la stanza risulta 'graphics_of'.
INFO_ALIAS = {'SR_0009_01_00': 'SR_0009_00_00'}


def source(name):
    """Percorso della fonte di un nome del client (map/... o lwf/map/...), o None."""
    d, _, f = name.rpartition('/')
    for room, src in INFO_ALIAS.items():
        if name == 'map/%s/%s_info.bin' % (room, room) and not merged_dir(room).get(room + '_info.bin'):
            return merged_dir(src).get(src + '_info.bin')
    if name.startswith('map/'):
        p = merged_dir(d[4:]).get(f)            # rooms_merged\<stanza>\... = map/<stanza>/...
        if p:
            return p
    return jp_dir(d).get(f)


def resolve(names):
    """-> (da scrivere {nome: fonte}, assenti [nomi])."""
    todo, miss = {}, []
    for n in names:
        if n in served:
            continue
        p = source(n)
        if p:
            todo[n] = p
        else:
            miss.append(n)
    return todo, miss


_hex_idx = None
HEXPNG = re.compile(r'^[0-9a-f]+2e706e67\.png$')        # <hex del nome originale>.png, "....png"


def hex_fill(name):
    """Texture di un lwf scartata come stub nell'estrazione JP (file identico altrove): se il nome e'
    <oggetto>_<nome originale in esadecimale>.png e lo stesso nome originale sta in altri oggetti
    lwf/map JP con contenuto identico in tutti, si usa quello (come LWF_FILL di import_jp_coco.py)."""
    global _hex_idx
    if _hex_idx is None:
        import hashlib
        _hex_idx = {}
        base = os.path.join(a.jp, 'lwf', 'map')
        for obj in (os.listdir(base) if os.path.isdir(base) else []):
            for f, p in jp_dir('lwf/map/' + obj).items():
                suf = f[len(obj) + 1:] if f.startswith(obj + '_') else ''
                if HEXPNG.match(suf):
                    _hex_idx.setdefault(suf, []).append(p)
        for k, ps in _hex_idx.items():
            _hex_idx[k] = ps[0] if len({hashlib.sha1(open(p, 'rb').read()).digest() for p in ps}) == 1 else None
    obj = name.split('/')[2]
    suf = name.rsplit('/', 1)[1][len(obj) + 1:]
    return _hex_idx.get(suf) if HEXPNG.match(suf) else None


_lwf_cache = {}
FILLED = []


def lwf_object(obj):
    """Oggetto lwf/map/<O>: (da scrivere, motivo se scartato o None)."""
    if obj in _lwf_cache:
        return _lwf_cache[obj]
    lw = 'lwf/map/%s/%s.lwf' % (obj, obj)
    if lw in served:
        res = ({}, None)
    else:
        p = source(lw)
        if not p:
            res = ({}, 'lwf assente')
        else:
            pngs = sorted({m.decode() for m in re.findall(rb'[\w\-.]+\.png', open(p, 'rb').read())})
            todo, miss = resolve(['lwf/map/%s/%s' % (obj, t) for t in pngs])
            filled = []
            for m in list(miss):
                fp = hex_fill(m)
                if fp:
                    todo[m] = fp
                    miss.remove(m)
                    filled.append((m, fp))
            if miss:
                res = ({}, 'texture del lwf assenti: %d di %d (es. %s)' % (len(miss), len(pngs), miss[0]))
            else:
                FILLED.extend(filled)
                todo[lw] = p
                res = (todo, None)
    _lwf_cache[obj] = res
    return res


def plan_room(room):
    """Elenco dei file per una stanza: dict con stato, file da scrivere, assenze."""
    r = {'room': room}
    info_name = 'map/%s/%s_info.bin' % (room, room)
    bins = ['map/%s/%s_%s.bin' % (room, room, k) for k in ('info', 'cls', 'chp', 'jmp')]
    ip = None if info_name in served else source(info_name)
    if ip is None and info_name not in served:
        todo, miss = resolve(bins)
        r.update(status='scartata', why='senza _info.bin (solo geometria): il client la apre dalla cartella -> crash',
                 missing_fatal=miss)
        return r, {}
    if ip is None:                         # servita: l'INFO si legge dalla cache di check_rooms o da rooms_merged
        cp = os.path.join(D, 'stage_gen', 'rooms_info', 'map', room, room + '_info.bin')
        ip = cp if os.path.exists(cp) else os.path.join(a.merged, room, room + '_info.bin')
        r['served'] = True
    info = parse_info(open(ip, 'rb').read())
    r['bmi'] = {'name': info['name'], 'w': info['w'], 'h': info['h'], 'size_ok': info['size_ok']}
    fatal = list(bins)
    n = info['name']
    fatal += ['map/{0}/{0}_base1/{0}_base1_{1:03d}.png'.format(n, i + 1) for i in range(tiles(info['w'], info['h']))]
    for t in info['tiled']:
        fatal += ['map/{0}/{0}_{1}/{0}_{1}_{2:03d}.png'.format(t['room'], t['layer'], i + 1)
                  for i in range(tiles(t['w2'], t['h2']))]
    todo, miss = resolve(fatal)
    r['required'] = len(fatal)
    if n != room:
        r['graphics_of'] = n
    if miss:
        r.update(status='scartata', why='file obbligatori assenti (tessere o .bin): %d' % len(miss), missing_fatal=miss[:20])
        return r, {}
    warn = []
    for im in info['images']:
        t2, m2 = resolve(['map/{0}/{0}_{1}.png'.format(im['room'], im['layer'])])
        todo.update(t2)
        warn += ['immagine assente ' + x for x in m2]
    for ob in sorted(set(info['objects'])):
        t2, why = lwf_object(ob)
        todo.update(t2)
        if why:
            warn.append('lwf %s: %s' % (ob, why))
    r.update(status='completa', files_new=len(todo), warnings=warn)
    return r, todo


# ------------------------------------------------------------------ conversione
def convert(job):
    name, src, dst = job
    try:
        if os.path.exists(dst) and os.path.getmtime(dst) >= os.path.getmtime(src) and not (
                os.path.getsize(dst) == len(BAD_PLACEHOLDER) and open(dst, 'rb').read() == BAD_PLACEHOLDER):
            return name, 'tenuto', os.path.getsize(dst)
        d = open(src, 'rb').read()
        if name.endswith('.png'):
            if d[:4] == b'\x89BTF':
                out = d
            elif d[:8] == b'\x89PNG\r\n\x1a\n':
                import btf
                from PIL import Image
                im = Image.open(src).convert('RGBA')
                if '/lwf/' not in '/' + name and im.getextrema()[3][1] == 0:
                    out = PLACEHOLDER
                else:
                    out = btf.encode(im)
            else:
                return name, 'formato sconosciuto', 0
        else:
            out = d
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        tmp = dst + '.tmp'
        with open(tmp, 'wb') as fh:
            fh.write(out)
        os.replace(tmp, dst)
        return name, 'scritto', len(out)
    except Exception as e:                  # noqa: BLE001
        return name, 'errore %r' % e, 0


def main():
    story = set()
    sch = json.load(open(a.schema, encoding='utf-8'))
    for dr in sch['doors'].values():
        if dr.get('scope') == 'storia':
            story.update((dr['room'], dr['dest']))
    # anche le stanze delle missioni di storia a una sola parte (nessuna porta: es. Beast's Castle),
    # come le usa import_orig_stages.py (stage_exits_v2.json: stanze di ogni stage)
    ex = private_tools.local_path('ref_work', 'schema_v2_work', 'stage_exits_v2.json')
    if os.path.exists(ex):
        st = json.load(open(ex, encoding='utf-8'))['stages']
        for s in (st.values() if isinstance(st, dict) else st):
            if s.get('stage_type') in ('storia_master', 'storia_variante', 'storia_oltre'):
                story.update(r for r in s.get('rooms', {}).values() if r)
    rooms = sorted(f for f in os.listdir(a.merged) if os.path.isdir(os.path.join(a.merged, f)))
    if a.rooms:
        rooms = [x for x in a.rooms.split(',') if x]
    results, plan = [], {}
    for room in rooms:
        info_served = 'map/%s/%s_info.bin' % (room, room) in served
        r, todo = plan_room(room)
        r['story'] = room in story
        if info_served:
            if r['status'] == 'completa' and not todo:
                r.update(status='servita')           # gia' completa nelle risorse: niente da fare
            elif r['status'] == 'completa':
                r['status'] = 'servita, completata'
        if r['status'] != 'scartata' and a.story_only and not r['story'] and not info_served:
            r.update(status='esclusa', why='--story-only: nessuna porta di storia')
            todo = {}
        if r['status'] != 'scartata':
            plan.update(todo)
        results.append(r)
    missing_story = sorted(story - set(rooms))
    jobs = [(n, p, os.path.join(OUT_FILES, *n.split('/'))) for n, p in sorted(plan.items())]
    stats = {}
    size = 0
    errors = []
    if not a.dry:
        with Pool(a.jobs or None) as pool:
            for k, (n, st, sz) in enumerate(pool.imap_unordered(convert, jobs, chunksize=32)):
                stats[st.split(' ')[0]] = stats.get(st.split(' ')[0], 0) + 1
                size += sz
                if st.startswith(('errore', 'formato')):
                    errors.append((n, st))
                if k % 5000 == 4999:
                    print('  %d/%d' % (k + 1, len(jobs)), flush=True)
        want = {os.path.normcase(j[2]) for j in jobs}
        removed = 0
        for dp, _, fs in os.walk(OUT_FILES):
            for f in fs:
                p = os.path.join(dp, f)
                if os.path.normcase(p) not in want:
                    os.remove(p)
                    removed += 1
        stats['tolti'] = removed
    else:                                   # stima: file gia' scritti da una corsa precedente
        have = [os.path.getsize(j[2]) for j in jobs if os.path.exists(j[2])]
        size = sum(have)
        stats['gia_scritti'] = len(have)
    by = {}
    for r in results:
        by[r['status']] = by.get(r['status'], 0) + 1
    st_rooms = [r for r in results if r['story']]
    rep = {'merged': a.merged, 'out': OUT_FILES, 'story_only': a.story_only, 'rooms': len(results), 'by_status': by,
           'files': len(jobs), 'bytes': size, 'write_stats': stats, 'errors': errors,
           'lwf_textures_filled': [{'name': m, 'from': p} for m, p in FILLED],
           'story_rooms': len(story),'story_not_in_merged': missing_story,
           'story_by_status': {s: sorted(r['room'] for r in st_rooms if r['status'] == s)
                               for s in sorted({r['status'] for r in st_rooms})},
           'results': results}
    os.makedirs(a.out, exist_ok=True)
    json.dump(rep, open(os.path.join(a.out, 'report.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    L = ['# rooms_gen: stanze recuperate per il client', '',
         'Generato da `recon/tools/make_jp_rooms.py`. Stanze: %d; file nel pacchetto: %d (%.1f MB).' % (
             len(results), len(jobs), size / 1e6), '',
         '| stato | stanze | di storia |', '|---|---:|---:|']
    for s, c in sorted(by.items()):
        L.append('| %s | %d | %d |' % (s, c, sum(1 for r in st_rooms if r['status'] == s)))
    lw_ok = sum(1 for t, why in _lwf_cache.values() if t and not why)
    lw_bad = sum(1 for t, why in _lwf_cache.values() if why)
    L += ['', 'Stanze di storia (porte scope storia): %d; non in rooms_merged: %s' % (
        len(story), ', '.join(missing_story) or 'nessuna'), '',
        'Oggetti lwf/map: %d aggiunti, %d gia\' serviti, %d non copiati (lwf o texture assenti); texture dei lwf '
        'riprese da un altro oggetto con lo stesso nome originale e contenuto identico: %d.' % (
            lw_ok, len(_lwf_cache) - lw_ok - lw_bad, lw_bad, len(FILLED)), '', '## Scartate', '']
    rep['lwf_objects'] = {'added': lw_ok, 'skipped': lw_bad, 'served': len(_lwf_cache) - lw_ok - lw_bad}
    json.dump(rep, open(os.path.join(a.out, 'report.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    for r in results:
        if r['status'] in ('scartata', 'esclusa'):
            L.append('- %s%s: %s%s' % (r['room'], ' (storia)' if r['story'] else '', r['why'],
                                       ' (es. %s)' % ', '.join(r.get('missing_fatal', [])[:3]) if r.get('missing_fatal') else ''))
    L += ['', '## Avvisi (file facoltativi assenti: immagini intere, lwf)', '']
    for r in results:
        if r.get('warnings'):
            L.append('- %s: %s' % (r['room'], '; '.join(r['warnings'])))
    open(os.path.join(a.out, 'report.md'), 'w', encoding='utf-8').write('\n'.join(L) + '\n')
    print('stanze', len(results), by, '| file', len(jobs), '| %.1f MB' % (size / 1e6), '|', stats)
    print('storia:', {s: len(v) for s, v in rep['story_by_status'].items()}, '| non in rooms_merged:', missing_story)
    for n, st in errors[:20]:
        print('  ERRORE', n, st)
    return 1 if errors else 0


if __name__ == '__main__':
    sys.exit(main())
