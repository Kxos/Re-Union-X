"""Controllo delle mappe di missione (STG + parti MAP) in una cartella stage/.

    python -I validate_maps.py <cartella_stage> <cls_dir> [stageId ...] [--json report.json] [--jmp]

--jmp: le componenti collegate dai salti interni della stanza (_jmp.bin accanto alla CLS) contano come
raggiunte (gradini fra due livelli; usato per i tour v2 di gen_tours_v2.py). Senza: come prima.

cls_dir: cartella con map/<stanza>/<stanza>_cls.bin (es. maps_x). Formato: stage_gen/exits/NOTE.md.
Errori (E) per stage:
- STG: magia, numero di parti [2] basso = file _NN presenti (contigui da 00), parte di partenza
  [2] alto < parti, partenza [3],[4] percorribile nella parte di partenza;
- parte: magia MAP, +0x20 = 0, X (+0x24) = 4 + 36 n uscite, offset A/B/C coerenti con le sezioni;
- uscite: parte di destinazione esistente e diversa, punto d'uscita percorribile nella propria
  stanza, arrivo percorribile nella stanza di destinazione e a piu' di 96 da ogni uscita della
  destinazione (altrimenti si riparte subito), nessun nemico entro 96 dall'uscita;
- tutte le parti raggiungibili dalla parte di partenza seguendo le uscite;
- aree: [0]+[1] dentro l'elenco nemici della parte;
- uid unici fra le parti (aree, nemici, forzieri) - riportati a parte gli uid area duplicati;
- STG [8] aree, [9] nemici, [14] forzieri, [15] oggetti = somme sulle parti; esattamente un'area
  bersaglio ([4] & 1) e il suo primo nemico = STG [6].
Avvisi (W): nemici entro 200 da un'uscita, STG [12] diverso dalla parte del bersaglio.

Raggiungibilita' dentro la stanza (errori "irraggiungibile", opzioni --radius R, --tol T):
la bitmap CLS ha 1 bit per unita' di mappa (W x H = dimensioni della stanza in unita'), quindi la
griglia e' quella dei pixel. Si etichettano le componenti 4-connesse dei pixel liberi con almeno R
unita' di spazio libero intorno (distanza euclidea dal muro > R, default 16: gli originali passano fino a R = 20). Per ogni
parte le sorgenti sono la partenza (parte di partenza) e i punti d'arrivo delle uscite delle altre
parti che puntano qui, ma solo di uscite a loro volta raggiungibili (punto fisso a partire dalla
partenza). Ogni sorgente/punto viene agganciato al pixel della griglia piu' vicino entro T unita'
(default 48). Errore se un nemico, un forziere, un punto d'uscita o il bersaglio (primo nemico
dell'area con [4]&1 e il suo poligono) non cade in una componente raggiunta.
Avviso (W) "giro lungo": il percorso minimo (celle da 8, 8-connesso, Dijkstra) dall'ingresso
principale della parte (partenza o primo arrivo) al bersaglio o a un'uscita e' > 1.5 volte la
linea d'aria (e > 800): raggiungibile, ma camminando dritti verso la freccia si resta contro il muro.
"""
import collections
import json
import os
import re
import struct
import sys

import numpy as np
from scipy import ndimage

args = [a for a in sys.argv[1:]]
jout = None
RADIUS, TOL = 16.0, 48


def _opt(name, conv):
    if name in args:
        i = args.index(name)
        v = conv(args[i + 1])
        del args[i:i + 2]
        return v
    return None


JMP = '--jmp' in args
if JMP:
    args.remove('--jmp')
jout = _opt('--json', str)
RADIUS = _opt('--radius', float) or RADIUS
TOL = _opt('--tol', int) or TOL
DET_RATIO = _opt('--detour', float) or 1.5
d, cls_dir = args[0], args[1]
only = {int(x) for x in args[2:]}
TRIG = 96
_cls = {}
_lab = {}


def labels(folder):
    """Componenti 4-connesse dei pixel liberi (con spazio libero > RADIUS) della stanza."""
    if folder not in _lab:
        while len(_lab) >= 12:                    # cache piccola: le etichette sono W*H int32
            del _lab[next(iter(_lab))]
        walkable(folder, 0, 0)
        c = _cls[folder]
        if c is None:
            _lab[folder] = None
        else:
            W, H, stride = struct.unpack_from('<3i', c, 4)
            bits = np.unpackbits(np.frombuffer(c, np.uint8, stride * H, 16).reshape(H, stride), axis=1)[:, :W]
            free = bits == 0
            if RADIUS > 0:
                free = ndimage.distance_transform_edt(free) > RADIUS
            _lab[folder] = ndimage.label(free)[0]
    return _lab[folder]


def comp_at(folder, x, y):
    """Componente del pixel percorribile piu' vicino a (x, y) entro TOL; 0 = nessuno; None = niente CLS."""
    lab = labels(folder)
    if lab is None:
        return None
    H, W = lab.shape
    x0, x1, y0, y1 = max(0, x - TOL), min(W, x + TOL + 1), max(0, y - TOL), min(H, y + TOL + 1)
    if x0 >= x1 or y0 >= y1:
        return 0
    win = lab[y0:y1, x0:x1]
    ys, xs = np.nonzero(win)
    if not len(xs):
        return 0
    d2 = (xs + x0 - x) ** 2 + (ys + y0 - y) ** 2
    k = int(np.argmin(d2))
    return int(win[ys[k], xs[k]]) if d2[k] <= TOL * TOL else 0


_jmp = {}


def jump_close(folder, comps):
    """Con --jmp: componenti raggiunte + quelle collegate dai salti interni della stanza (map/<stanza>/
    <stanza>_jmp.bin: JMP, n, 0, 0, n record {cella CHP, k, k x (x1, y1, x2, y2, h)} di interi; gradini fra
    due livelli, nei due versi). Senza --jmp: invariato."""
    comps = set(comps)
    if not JMP:
        return comps
    if folder not in _jmp:
        pairs = []
        p = os.path.join(cls_dir, 'map', folder, folder + '_jmp.bin')
        if os.path.exists(p) and labels(folder) is not None:
            b = open(p, 'rb').read()
            o = 16
            for _ in range(i32(b, 4)):
                k = i32(b, o + 4)
                o += 8
                for _ in range(k):
                    x1, y1, x2, y2 = struct.unpack_from('<4i', b, o)
                    o += 20
                    a, c = comp_at(folder, x1, y1), comp_at(folder, x2, y2)
                    if a and c and a != c:
                        pairs.append((a, c))
        _jmp[folder] = pairs
    changed = True
    while changed:
        changed = False
        for a, c in _jmp[folder]:
            if (a in comps) != (c in comps):
                comps |= {a, c}
                changed = True
    return comps


def walkable(folder, x, y):
    if folder not in _cls:
        p = os.path.join(cls_dir, 'map', folder, folder + '_cls.bin')
        _cls[folder] = open(p, 'rb').read() if os.path.exists(p) else None
    c = _cls[folder]
    if c is None:
        return None
    W, H, stride = struct.unpack_from('<3i', c, 4)
    return 0 <= x < W and 0 <= y < H and not (c[16 + y * stride + x // 8] >> (7 - x % 8)) & 1


def i32(b, o):
    return struct.unpack_from('<i', b, o)[0]


def parse_part(b):
    p = {'err': []}
    if b[:4] != b'MAP\0':
        p['err'].append('magia MAP assente')
        return p
    p['room'] = b[0x0c:0x1c].split(b'\0')[0].decode('ascii', 'replace')
    e0, X, A, B, C = struct.unpack_from('<5i', b, 0x20)
    if e0 != 0:
        p['err'].append('+0x20 = %d (atteso 0)' % e0)
    n = i32(b, 0x34)
    if X != 4 + 36 * n:
        p['err'].append('X = %d ma uscite = %d (atteso %d)' % (X, n, 4 + 36 * n))
    p['exits'] = [struct.unpack_from('<9i', b, 0x38 + 36 * k) for k in range(n)]
    o = 0x34 + X
    na, ne = struct.unpack_from('<2i', b, o)
    o += 8
    p['areas'] = [struct.unpack_from('<17i', b, o + 0x44 * k) for k in range(na)]
    o += 0x44 * na
    p['enemies'] = [struct.unpack_from('<8i', b, o + 0x20 * k) for k in range(ne)]
    o += 0x20 * ne
    if o != 0x34 + A:
        p['err'].append('fine nemici 0x%x != A 0x%x' % (o, 0x34 + A))
    o = 0x34 + A
    nc = i32(b, o)
    p['chests'] = [struct.unpack_from('<5i', b, o + 4 + 20 * k) for k in range(nc)]
    if o + 4 + 20 * nc != 0x34 + B:
        p['err'].append('fine forzieri != B')
    o = 0x34 + B
    p['nobj'] = i32(b, o)
    if o + 4 + 16 * p['nobj'] != 0x34 + C:
        p['err'].append('fine oggetti != C')
    if 0x34 + C > len(b):
        p['err'].append('C oltre la fine del file')
    for k, a in enumerate(p['areas']):
        if a[0] < 0 or a[1] < 1 or a[0] + a[1] > ne:
            p['err'].append('area %d: nemici %d..%d fuori da %d' % (k, a[0], a[0] + a[1], ne))
    return p


DET_CELL = 8
_det = {}


def detour(folder, src, dst):
    """(linea d'aria, percorso) da src a dst sulla griglia percorribile ridotta a celle DET_CELL,
    8-connessa, passi 1 e radice di 2 (Dijkstra). None se non collegati."""
    from scipy.sparse import coo_matrix
    from scipy.sparse.csgraph import dijkstra
    if folder not in _det:
        while len(_det) >= 12:
            del _det[next(iter(_det))]
        m = labels(folder)[::DET_CELL, ::DET_CELL] > 0
        h_, w_ = m.shape
        idx = -np.ones(m.shape, np.int64)
        idx[m] = np.arange(int(m.sum()))
        rows, cols, wts = [], [], []
        for dy, dx, wt in ((0, 1, 1.0), (1, 0, 1.0), (1, 1, 2 ** 0.5), (1, -1, 2 ** 0.5)):
            A = idx[0:h_ - dy, max(0, -dx):w_ - max(0, dx)]
            B = idx[dy:h_, max(0, dx):w_ + min(0, dx)]
            ok = (A >= 0) & (B >= 0)
            rows.append(A[ok])
            cols.append(B[ok])
            wts.append(np.full(int(ok.sum()), wt))
        n = int(m.sum())
        g = coo_matrix((np.concatenate(wts), (np.concatenate(rows), np.concatenate(cols))), shape=(n, n)).tocsr()
        _det[folder] = (m, idx, g, {})
    m, idx, g, dcache = _det[folder]
    h_, w_ = m.shape

    def cell(p):
        x, y = min(w_ - 1, max(0, p[0] // DET_CELL)), min(h_ - 1, max(0, p[1] // DET_CELL))
        r = TOL // DET_CELL
        ys, xs = np.nonzero(m[max(0, y - r):y + r + 1, max(0, x - r):x + r + 1])
        if not len(xs):
            return None
        k = int(np.argmin((xs + max(0, x - r) - x) ** 2 + (ys + max(0, y - r) - y) ** 2))
        return ys[k] + max(0, y - r), xs[k] + max(0, x - r)
    a, b = cell(src), cell(dst)
    if a is None or b is None:
        return None
    ia = int(idx[a])
    if ia not in dcache:
        dcache[ia] = dijkstra(g, directed=False, indices=ia)
    dist = dcache[ia][idx[b]]
    if not np.isfinite(dist):
        return None
    return ((src[0] - dst[0]) ** 2 + (src[1] - dst[1]) ** 2) ** 0.5, int(dist * DET_CELL)


def reach_check(h, parts, spart, W=None):
    """Errori di raggiungibilita' dentro le stanze (vedi docstring). In W (avvisi) il giro lungo
    verso il bersaglio: percorso > DET_RATIO volte la linea d'aria dalla sorgente piu' vicina."""
    E = []
    if labels(parts[spart]['room']) is None:
        return E
    reached = [set() for _ in parts]              # componenti raggiunte per parte
    src = [[] for _ in parts]
    c = comp_at(parts[spart]['room'], h[3], h[4])
    if c:
        reached[spart] = jump_close(parts[spart]['room'], {c})
    else:
        E.append('parte %d: partenza (%d,%d) senza pixel percorribile entro %d' % (spart, h[3], h[4], TOL))
    src[spart].append(('partenza', h[3], h[4]))
    changed = True
    while changed:                                # punto fisso: uscite raggiunte -> arrivi
        changed = False
        for k, p in enumerate(parts):
            for ex in p['exits']:
                dst = ex[7]
                if not 0 <= dst < len(parts) or dst == k:
                    continue
                if comp_at(p['room'], ex[0], ex[1]) not in reached[k]:
                    continue
                c = comp_at(parts[dst]['room'], ex[5], ex[6])
                if c and c not in reached[dst]:
                    reached[dst] = jump_close(parts[dst]['room'], reached[dst] | {c})
                    changed = True
                tag = ('arrivo da parte %d' % k, ex[5], ex[6])
                if tag not in src[dst]:
                    src[dst].append(tag)
    for k, p in enumerate(parts):
        room, R = p['room'], reached[k]
        if not R:
            if k != spart:
                E.append('parte %d: irraggiungibile (nessun arrivo da un\'uscita raggiunta)' % k)
            continue

        def bad(x, y):
            return comp_at(room, x, y) not in R
        for nm, x, y in src[k]:
            if not comp_at(room, x, y):
                E.append('parte %d: %s (%d,%d) senza pixel percorribile entro %d' % (k, nm, x, y, TOL))
        goals = []
        for ex in p['exits']:
            if bad(ex[0], ex[1]):
                E.append('parte %d: uscita (%d,%d) irraggiungibile' % (k, ex[0], ex[1]))
            else:
                goals.append(('l\'uscita verso la parte %d' % ex[7], ex[0], ex[1]))
        for e in p['enemies']:
            if bad(e[0], e[1]):
                E.append('parte %d: nemico uid %d (%d,%d) irraggiungibile' % (k, e[7], e[0], e[1]))
        for ch in p['chests']:
            if bad(ch[0], ch[1]):
                E.append('parte %d: forziere uid %d (%d,%d) irraggiungibile' % (k, ch[4], ch[0], ch[1]))
        for a in p['areas']:
            if not a[4] & 1:
                continue
            e = p['enemies'][a[0]] if 0 <= a[0] < len(p['enemies']) else None
            if e and bad(e[0], e[1]):
                E.append('parte %d: bersaglio uid %d (%d,%d) irraggiungibile' % (k, e[7], e[0], e[1]))
            elif e and W is not None and src[k]:
                goals.append(('il bersaglio uid %d' % e[7], e[0], e[1]))
            poly = a[9:17]
            if any(poly):
                xs, ys = poly[0::2], poly[1::2]
                lab = labels(room)
                Hh, Ww = lab.shape
                x0, x1 = max(0, min(xs) - TOL), min(Ww, max(xs) + TOL + 1)
                y0, y1 = max(0, min(ys) - TOL), min(Hh, max(ys) + TOL + 1)
                win = lab[y0:y1, x0:x1] if x0 < x1 and y0 < y1 else np.zeros(0, int)
                if not any(int(v) in R for v in np.unique(win)):
                    E.append('parte %d: area bersaglio uid %d (poligono %s) irraggiungibile' % (k, a[5], poly))
        if W is not None and src[k]:
            nm, sx, sy = src[k][0]                # ingresso principale della parte
            for g, gx, gy in goals:
                r = detour(room, (sx, sy), (gx, gy))
                if r and r[1] > DET_RATIO * r[0] and r[1] > 800:
                    W.append('parte %d: giro lungo da %s (%d,%d) verso %s (%d,%d): linea d\'aria %.0f, percorso %d'
                             % (k, nm, sx, sy, g, gx, gy, r[0], r[1]))
    return E


def check(sid):
    E, W = [], []
    stg = open(os.path.join(d, 'mappoi_stg%05d.bin' % sid), 'rb').read()
    h = struct.unpack_from('<16i', stg)
    if stg[:4] != b'STG\0':
        E.append('magia STG assente')
    nparts, spart = h[2] & 0xffff, h[2] >> 16
    files = sorted(int(m.group(1)) for f in os.listdir(d)
                   for m in [re.fullmatch(r'mappoi_stg%05d_(\d+)\.bin' % sid, f)] if m)
    if files != list(range(nparts)):
        E.append('parti nell\'STG = %d, file = %s' % (nparts, files))
    parts = []
    for k in range(len(files)):
        p = parse_part(open(os.path.join(d, 'mappoi_stg%05d_%02d.bin' % (sid, k)), 'rb').read())
        E += ['parte %d: %s' % (k, e) for e in p['err']]
        parts.append(p)
    if any('room' not in p for p in parts) or not parts:
        return E, W, h, parts
    if spart >= len(parts):
        E.append('parte di partenza %d >= %d' % (spart, len(parts)))
    elif walkable(parts[spart]['room'], h[3], h[4]) is False:
        E.append('partenza (%d,%d) non percorribile in %s' % (h[3], h[4], parts[spart]['room']))
    # uscite
    for k, p in enumerate(parts):
        for ex in p['exits']:
            x, y, ang, rest, fb, ax, ay, dst, face = ex
            if walkable(p['room'], x, y) is False:
                E.append('parte %d: uscita (%d,%d) non percorribile' % (k, x, y))
            if not 0 <= dst < len(parts) or dst == k:
                E.append('parte %d: uscita verso parte %d inesistente' % (k, dst))
                continue
            q = parts[dst]
            if walkable(q['room'], ax, ay) is False:
                E.append('parte %d: arrivo (%d,%d) non percorribile in %s' % (k, ax, ay, q['room']))
            for bx in q['exits']:
                dd = ((bx[0] - ax) ** 2 + (bx[1] - ay) ** 2) ** 0.5
                if dd <= TRIG:
                    E.append('parte %d: arrivo a %.0f da un\'uscita della parte %d' % (k, dd, dst))
            if face not in (1, 2):
                W.append('parte %d: verso d\'arrivo %d' % (k, face))
            for e in p['enemies']:
                dd = ((e[0] - x) ** 2 + (e[1] - y) ** 2) ** 0.5
                if dd <= TRIG:
                    E.append('parte %d: nemico uid %d a %.0f dall\'uscita' % (k, e[7], dd))
                elif dd < 200:
                    W.append('parte %d: nemico uid %d a %.0f dall\'uscita' % (k, e[7], dd))
    # raggiungibilita'
    if 0 <= spart < len(parts):
        seen, todo = {spart}, [spart]
        while todo:
            c = todo.pop()
            for ex in parts[c]['exits']:
                if 0 <= ex[7] < len(parts) and ex[7] not in seen:
                    seen.add(ex[7])
                    todo.append(ex[7])
        if len(seen) != len(parts):
            E.append('parti non raggiungibili: %s' % sorted(set(range(len(parts))) - seen))
        E += reach_check(h, parts, spart, W)
    # uid
    ent_uids = collections.Counter()
    area_uids = collections.Counter()
    for p in parts:
        for a in p['areas']:
            area_uids[a[5]] += 1
        for e in p['enemies']:
            ent_uids[e[7]] += 1
        for c in p['chests']:
            ent_uids[c[4]] += 1
    dup = sorted(u for u, n in ent_uids.items() if n > 1)
    if dup:
        E.append('uid nemici/forzieri duplicati: %s' % dup[:8])
    adup = sorted(u for u, n in area_uids.items() if n > 1 or u in ent_uids)
    if adup:
        E.append('uid area duplicati o uguali a nemici/forzieri: %s' % adup[:8])
    # totali
    tot = (sum(len(p['areas']) for p in parts), sum(len(p['enemies']) for p in parts),
           sum(len(p['chests']) for p in parts), sum(p['nobj'] for p in parts))
    if (h[8], h[9], h[14], h[15]) != tot:
        E.append('totali STG (aree,nemici,forzieri,oggetti) %s != parti %s' % ((h[8], h[9], h[14], h[15]), tot))
    tg = [(k, a) for k, p in enumerate(parts) for a in p['areas'] if a[4] & 1]
    if len(tg) != 1:
        E.append('aree bersaglio: %d (attesa 1)' % len(tg))
    else:
        k, a = tg[0]
        if parts[k]['enemies'][a[0]][2] != h[6]:
            E.append('bersaglio STG %d != primo nemico dell\'area bersaglio %d' % (h[6], parts[k]['enemies'][a[0]][2]))
        if h[12] != k:
            W.append('STG [12] = %d, bersaglio nella parte %d' % (h[12], k))
    return E, W, h, parts


sids = sorted({int(m.group(1)) for f in os.listdir(d) for m in [re.fullmatch(r'mappoi_stg(\d+)\.bin', f)] if m})
if only:
    sids = [s for s in sids if s in only]
res = {}
cat = collections.Counter()
nparts = collections.Counter()
for sid in sids:
    E, W, h, parts = check(sid)
    nparts[len(parts)] += 1
    res[sid] = {'parts': len(parts), 'errors': E, 'warnings': W}
    for e in E:
        cat[re.sub(r'[-\d]+', '#', e.split(': ', 1)[-1] if e.startswith('parte') else e)[:60]] += 1
bad = [s for s in sids if res[s]['errors']]
print('stage: %d | parti: %s | con errori: %d | con avvisi: %d' % (
    len(sids), dict(sorted(nparts.items())), len(bad), sum(1 for s in sids if res[s]['warnings'])))
multi_bad = [s for s in bad if res[s]['parts'] > 1]
print('  a piu\' parti con errori: %d / %d' % (len(multi_bad), sum(1 for s in sids if res[s]['parts'] > 1)))
reach_bad = [s for s in sids if any('irraggiungibil' in e or 'senza pixel percorribile' in e
                                    for e in res[s]['errors'])]
print('  con errori di raggiungibilita\' (radius %g, tol %d): %d %s' % (RADIUS, TOL, len(reach_bad), reach_bad[:20]))
det = [s for s in sids if any('giro lungo' in w for w in res[s]['warnings'])]
print('  avvisi "giro lungo" (> %.1fx la linea d\'aria): %d %s' % (DET_RATIO, len(det), det[:20]))
for k, v in cat.most_common(12):
    print('  E x%d  %s' % (v, k))
for s in (multi_bad or bad)[:8]:
    print('  %d: %s' % (s, res[s]['errors'][:3]))
if jout:
    json.dump(res, open(jout, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
