"""Controlla che le stanze (map/<stanza>/) usate dalle mappe abbiano tutti i file che il client carica.

    python -I recon/tools/check_rooms.py [--out rooms_check.json] [--cache <cartella>]
        [--index names.tsv ...] [--files <cartella pacchetto generato> ...]
        [--data resource_data\\7\\data] [--stages <cartella stage> ...]

Default: indice names_v4.tsv (dati resource_data\\7\\data) + ipa431\\names_addnl.tsv, pacchetti
generati medal_gen\\files, rooms_gen\\files (stanze recuperate, make_jp_rooms.py: solo se l'ultima
versione di resource_data lo contiene, packs.txt, o con --rooms-gen) e stage_gen\\files, stage di stage_gen\\story e stage_gen\\files\\stage
(+ gli stage originali dell'indice), uscita stage_gen\\rooms_check.json.

Formato di map/<S>/<S>_info.bin («BMI»), letto dal caricatore della mappa (stringhe del binario
4.3.1 «map/%s/%s_base1/%s_base1_%%03d.png», «map/%s/%s_%s/%s_%s_%%03d.png», «map/%s/%s_%s.png»,
«lwf/map/%s/%s.lwf», «map/%s/%s_{cls,chp,jmp,info}.bin»):
  0x00 'BMI\\0', 0x0a u16 nT livelli a tessere, 0x0c u16 nI immagini intere, 0x0e u16 nO oggetti,
  0x10 nome[16] della stanza di cui si usa base1 (alias grafico se diversa dalla cartella),
  0x20 u32 W, H del livello base1 -> map/<nome>/<nome>_base1/<nome>_base1_NNN.png;
  poi nT record da 60 byte: stanza[16] livello[16] W H x y W2 H2 flag
      -> map/<stanza>/<stanza>_<livello>/<stanza>_<livello>_NNN.png
  poi nI record da 52 byte: stanza[16] livello[16] w h x y flag
      -> map/<stanza>/<stanza>_<livello>.png
  poi nO record da 52 byte: nome[16] 0[16] x y 0 flag 0 -> lwf/map/<nome>/<nome>.lwf (+ png citati)
Tessere da 256x256, numerate da 001 in righe: ceil(W/256) * ceil(H/256) (indice =
colonna + colonne * riga + 1, nome con sprintf; texture assente -> sprite nullo -> crash).
Il nome «stanza» dei record puo' essere un'altra stanza (DB_0018_01_00 usa i livelli di DB_0018_00_00).
"""
import argparse
import json
import math
import os
import re
import struct
import sys

here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, here)
import bgad  # noqa: E402

D = r'D:\Progetto_Restauro_KH_UX'
ap = argparse.ArgumentParser()
ap.add_argument('--index', action='append')
ap.add_argument('--data', default=os.path.join(D, 'resource_data', '7', 'data'))
ap.add_argument('--files', action='append')
ap.add_argument('--stages', action='append')
ap.add_argument('--cache', default=os.path.join(D, 'stage_gen', 'rooms_info'))
ap.add_argument('--out', default=os.path.join(D, 'stage_gen', 'rooms_check.json'))
ap.add_argument('--rooms-gen', action='store_true',
                help='conta rooms_gen\\files anche se la versione installata non lo contiene (prova della 35)')
ap.add_argument('--lib',default=os.path.join(here, '..', 'ext', 'ww431', 'libcocos2dcpp.so'))
a = ap.parse_args()
a.index = a.index or [os.path.join(D, 'resource_data', 'names_v4.tsv'), os.path.join(D, 'ipa431', 'names_addnl.tsv')]


def rooms_installed():
    """rooms_gen conta solo se l'ultima versione in resource_data lo contiene (packs.txt di
    build-resources.ps1) o con --rooms-gen: prima della 35 le stanze non sono nel client."""
    if a.rooms_gen:
        return True
    rd = os.path.join(D, 'resource_data')
    vs = sorted((int(v) for v in os.listdir(rd) if v.isdigit()), reverse=True)
    pt = os.path.join(rd, str(vs[0]), 'packs.txt') if vs else ''
    return bool(pt) and os.path.exists(pt) and 'rooms_gen' in open(pt).read().split()


# pacchetti nell'ordine di build-resources.ps1 (a nome ripetuto vince l'ultimo): medaglie, stanze
# recuperate (make_jp_rooms.py, se installate), generato
a.files = a.files or [p for p in (os.path.join(D, 'medal_gen', 'files'),
                                  os.path.join(D, 'rooms_gen', 'files') if rooms_installed() else '',
                                  os.path.join(D, 'stage_gen', 'files')) if p and os.path.isdir(p)]
a.stages = a.stages or [os.path.join(D, 'stage_gen', 'story'), os.path.join(D, 'stage_gen', 'files', 'stage')]
TILE = 256

# ------------------------------------------------------------------ indice delle risorse installate
names = set()
offs = {}                      # offset del primo indice (quello dei dati --data)
for i, tsv in enumerate(a.index):
    with open(tsv, encoding='utf-8') as fh:
        next(fh)
        for line in fh:
            n, _, o = line.rstrip('\n').partition('\t')
            names.add(n)
            if i == 0:
                offs[n] = int(o)
gen = {}                       # nome -> file su disco dei pacchetti generati (vincono, --last-wins)
for root in a.files:
    for dp, _, fs in os.walk(root):
        for f in fs:
            p = os.path.join(dp, f)
            gen[os.path.relpath(p, root).replace('\\', '/')] = p
names |= set(gen)
data = [os.path.join(a.data, f) for f in sorted(os.listdir(a.data))]
_key = None


def read_res(n):
    """Contenuto di un file installato (pacchetto generato o dati originali), con cache su disco."""
    global _key
    if n in gen:
        return open(gen[n], 'rb').read()
    c = os.path.join(a.cache, *n.split('/'))
    if os.path.exists(c):
        return open(c, 'rb').read()
    if n not in offs:
        return None
    if _key is None:
        _key = bytes.fromhex(os.environ['BGAD_KEY']) if os.environ.get('BGAD_KEY') else bgad.lib_key(a.lib)
    off = offs[n]
    for path in data:
        size = os.path.getsize(path)
        if off < size:
            break
        off -= size
    with open(path, 'rb') as fh:
        fh.seek(off)
        h = bgad.parse(fh.read(bgad.HDR.size))
        fh.seek(off)
        buf = fh.read(h['hsize'] + h['nlen'] + h['size'])
    out = bgad.decode(buf, bgad.parse(buf), _key)
    os.makedirs(os.path.dirname(c), exist_ok=True)
    open(c, 'wb').write(out)
    return out


def cstr(b):
    return b.split(b'\0')[0].decode('ascii', 'replace')


def parse_info(b):
    if b[:3] != b'BMI':
        raise ValueError('non BMI')
    nT, nI, nO = struct.unpack_from('<3H', b, 0x0a)
    W, H = struct.unpack_from('<2I', b, 0x20)
    info = {'name': cstr(b[0x10:0x20]), 'w': W, 'h': H, 'tiled': [], 'images': [], 'objects': []}
    o = 0x28
    for _ in range(nT):
        v = struct.unpack_from('<6I', b, o + 32)
        info['tiled'].append({'room': cstr(b[o:o + 16]), 'layer': cstr(b[o + 16:o + 32]), 'w': v[0], 'h': v[1],
                              'x': v[2], 'y': v[3], 'w2': v[4], 'h2': v[5]})
        o += 60
    for _ in range(nI):
        v = struct.unpack_from('<4I', b, o + 32)
        info['images'].append({'room': cstr(b[o:o + 16]), 'layer': cstr(b[o + 16:o + 32]), 'w': v[0], 'h': v[1],
                               'x': v[2], 'y': v[3]})
        o += 52
    for _ in range(nO):
        x, y = struct.unpack_from('<2I', b, o + 32)
        info['objects'].append({'name': cstr(b[o:o + 32]), 'x': x, 'y': y})
        o += 52
    info['size_ok'] = o == len(b)
    return info


def tiles(w, h):
    return math.ceil(w / TILE) * math.ceil(h / TILE)


def lwf_pngs(name):
    b = read_res('lwf/map/%s/%s.lwf' % (name, name))
    if b is None:
        return None
    return sorted({m.decode() for m in re.findall(rb'[\w\-.]+\.png', b)})


def check_room(room):
    """Gruppi che mandano in crash (base1, livelli a tessere, .bin): crea lo sprite della
    tessera senza controllare la texture. Avvisi (immagini intere, oggetti lwf e loro png): controlla il nodo nullo e l'oggetto resta vuoto (DW_0001/DW_0003, con lwf assenti,
    giocate sul banco)."""
    req = ['map/%s/%s_%s.bin' % (room, room, k) for k in ('info', 'cls', 'chp', 'jmp')]
    r = {'room': room}
    b = read_res(req[0])
    if b is None:
        miss = [n for n in req if n not in names]
        r.update(missing=len(miss), missing_groups={'bin': {'missing': len(miss), 'of': 4, 'first': miss}}, warnings={})
        return r
    info = parse_info(b)
    r['info'] = {k: info[k] for k in ('name', 'w', 'h', 'size_ok')}
    # base1 della stanza scritta nel BMI a +0x10 (alias grafico: il client carica le tessere di quella stanza);
    # nelle nostre 86 nome = cartella, fra le recuperate di rooms_gen ci sono alias (DB_0020_00_01 -> DB_0020_00_00)
    bn = info['name'] or room
    fatal = {'base1 (%s, %dx%d)' % (bn, info['w'], info['h']): [
        'map/{0}/{0}_base1/{0}_base1_{1:03d}.png'.format(bn, i + 1) for i in range(tiles(info['w'], info['h']))]}
    for t in info['tiled']:
        fatal['%s_%s (tessere, %dx%d)' % (t['room'], t['layer'], t['w2'], t['h2'])] = [
            'map/{0}/{0}_{1}/{0}_{1}_{2:03d}.png'.format(t['room'], t['layer'], i + 1) for i in range(tiles(t['w2'], t['h2']))]
    fatal['bin'] = req
    warn = {}
    for im in info['images']:
        warn['%s_%s (immagine)' % (im['room'], im['layer'])] = ['map/{0}/{0}_{1}.png'.format(im['room'], im['layer'])]
    for ob in sorted({o['name'] for o in info['objects']}):
        lw = 'lwf/map/%s/%s.lwf' % (ob, ob)
        pngs = lwf_pngs(ob) if lw in names else []
        warn['lwf %s' % ob] = [lw] + ['lwf/map/%s/%s' % (ob, p) for p in pngs or []]
    r['layers'] = {'tiled': ['%s_%s' % (t['room'], t['layer']) for t in info['tiled']],
                   'images': ['%s_%s' % (t['room'], t['layer']) for t in info['images']],
                   'objects': sorted({o['name'] for o in info['objects']})}
    r['other_rooms'] = sorted({t['room'] for t in info['tiled'] + info['images']} - {room})
    r['required'] = sum(len(v) for v in fatal.values())

    def miss_of(groups):
        mg = {}
        for g, lst in groups.items():
            miss = [n for n in lst if n not in names]
            if miss:
                mg[g] = {'missing': len(miss), 'of': len(lst), 'first': miss[:3]}
        return mg
    r['missing_groups'] = miss_of(fatal)
    r['missing'] = sum(v['missing'] for v in r['missing_groups'].values())
    r['warnings'] = miss_of(warn)
    return r


# ------------------------------------------------------------------ stanze usate dalle mappe
use = {}                       # stanza -> {stageId: sorgente}


def add_part(b, sid, src):
    if b[:3] != b'MAP':
        return
    room = cstr(b[0x0c:0x1c])
    use.setdefault(room, {}).setdefault(sid, src)


pat = re.compile(r'mappoi_stg(\d+)_(\d+)\.bin$')
for d in a.stages:
    for f in sorted(os.listdir(d)):
        m = pat.match(f)
        if m:
            add_part(open(os.path.join(d, f), 'rb').read(), int(m.group(1)), os.path.basename(d.rstrip('\\/')))
orig = sorted(n for n in offs if pat.search(n) and n.startswith('stage/'))
for n in orig:
    m = pat.search(n)
    sid = int(m.group(1))
    # la parte originale dell'indice (se il pacchetto generato la sostituisce, conta anche quella sopra)
    g = gen.pop(n, None)
    b = read_res(n)
    if g:
        gen[n] = g
    if b is not None and b[:3] == b'MAP':
        use.setdefault(cstr(b[0x0c:0x1c]), {}).setdefault(sid, 'originale' + (' (sostituita da files)' if g else ''))

all_rooms = sorted({n.split('/')[1] for n in names if n.startswith('map/') and n.endswith('_info.bin')} | set(use))
res = []
for room in all_rooms:
    r = check_room(room)
    r['used_by'] = {str(k): v for k, v in sorted(use.get(room, {}).items())}
    res.append(r)
bad = [r for r in res if r['missing']]
rep = {'tile': TILE, 'index': a.index, 'files': a.files, 'stages': a.stages, 'rooms': len(res),
       'incomplete': [r['room'] for r in bad],
       'incomplete_used': {r['room']: r['used_by'] for r in bad if r['used_by']},
       'with_warnings': [r['room'] for r in res if r['warnings']],
       'results': res}
os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
json.dump(rep, open(a.out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('stanze:', len(res), '| incomplete (crash):', len(bad), '| con avvisi (immagini/lwf assenti):',
      len(rep['with_warnings']), '| usate dalle mappe:', len(use))
for r in bad:
    print(' ', r['room'], 'mancano', r['missing'], 'file:', '; '.join(
        '%s %d/%d' % (g, v['missing'], v['of']) for g, v in r['missing_groups'].items()),
        '| usata da', len(r['used_by']), 'stage' + (': ' + ', '.join(r['used_by']) if r['used_by'] else ''))
