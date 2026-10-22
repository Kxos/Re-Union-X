"""Mappe di tutte le missioni di storia (stage/mappoi_stg<stageId>.bin + _00.bin), in automatico.

    python -I recon/tools/gen_story_maps.py <config.json>

config: {"stages": stage_dec.json di thethiny, "quests": wiki\\quests.json,
         "enemies": server\\master_data\\enemy.json, "cls_dir": cartella con map/<stanza>/<stanza>_cls.bin,
         "template": una parte MAP vera (es. mappoi_stg01040_00.bin), "rooms": story_rooms.json,
         "out": cartella di uscita (stage/), "skip": [stageId...], "report": report.json,
         "world_links": recon/tools/world_links.json (facoltativo: uscite sulle porte vere),
         "worldtour": true (facoltativo: missioni «Tour» 991000 + worldId, "worldtour_report"),
         "rooms_check": rooms_check.json di check_rooms.py / "exclude_rooms": [...] (stanze incomplete,
         trattate come assenti)}

Per ogni missione (stageBinId 1..N di thethiny = numero della missione):
- stanza: rooms[nome] se noto, altrimenti una stanza dello stesso mondo (prefisso del
  mondo, preferendo le _00_00) scelta in modo stabile dal nome: le stanze vere della
  storia arrivavano dal CDN, nelle risorse ce ne sono 86;
- nemici e tesori dalla wiki (quests.json: «enemies», «treasures», «target»), nomi ->
  enemyId della tabella enemy (bersaglio: famiglia 1xxxx come nelle mappe vere, altri
  8xxxx);
- posizioni: punti percorribili della bitmap delle collisioni (CLS: 1 bit per pixel, 0 =
  libero) collegati alla partenza (visita sulla griglia di 40 px); partenza = punto libero
  piu' a sinistra, aree distribuite lungo la distanza dalla partenza, l'arena del
  bersaglio (area 0 della parte modello, con il poligono) nel punto piu' lontano;
- intestazione STG (formato delle 1010-1040 vere): [1] 16, [2] parti, [3,4] partenza,
  [5] 2, [6] bersaglio, [7] 1, [8] aree, [9] nemici, [11] 1, [14] forzieri, [15] oggetti.
Una sola parte per missione, salvo "multiroom": true nella config: allora le missioni con
piu' stanze nella wiki (quests.json «rooms») hanno una parte MAP per stanza (_00, _01, ...),
collegate da uscite (blocco a 0x34 di ogni parte, vedi stage_gen/exits/NOTE.md):
- stanza k: uscita «avanti» nel punto piu' lontano dalla partenza -> arrivo nella stanza k+1
  ~240 unita' dentro dalla sua uscita «indietro» (messa nel punto di partenza della stanza);
- gruppi di nemici nella stanza indicata dalla wiki, bersaglio sempre nell'ultima stanza;
  niente nemici/forzieri entro 240 unita' da un'uscita;
- uid globali in ordine di file (area u, nemici u+1..u+n, poi i forzieri della parte);
- STG [2] = parti (partenza parte 0), [12] = parte del bersaglio, totali sommati.
Le missioni a una stanza escono identiche byte per byte alla versione senza multiroom.
Raggiungibilita': i punti della griglia sono collegati solo se stanno nella stessa componente di
pixel percorribili (spazio libero > "reach_radius", default 16; aggancio entro "reach_tol", default
48), cosi' tutto cio' che si piazza e' raggiungibile dalla partenza / dagli arrivi; controllo con
stage_gen/reach/validate_maps.py. Richiede numpy e scipy.
Sacca d'ingresso: se il pezzo di griglia piu' grande arriva a piedi a meno di "pocket_ratio" (default
0.4) della portata della componente di pixel piu' grande (corridoi larghi 33-80 unita' spezzano la
griglia), si usano tutti i punti della componente con distanze geodetiche (vedi walk_grid).
"""
import collections
import hashlib
import json
import os
import re
import struct
import sys

cfg = json.load(open(sys.argv[1], encoding='utf-8-sig'))
stages = json.load(open(cfg['stages'], encoding='utf-8'))
quests = json.load(open(cfg['quests'], encoding='utf-8'))
quests = quests if isinstance(quests, list) else list(quests.values())
enemies = json.load(open(cfg['enemies'], encoding='utf-8'))
rooms = json.load(open(cfg['rooms'], encoding='utf-8-sig'))
tmpl = open(cfg['template'], 'rb').read()
out = cfg['out']
skip = set(cfg.get('skip', []))
os.makedirs(out, exist_ok=True)

WORLD = {1: 'DB', 2: 'DW', 3: 'WL', 4: 'AG', 5: 'OC', 6: 'BC', 7: 'CD', 8: 'ED'}
folders = sorted(d for d in os.listdir(os.path.join(cfg['cls_dir'], 'map')))
# Stanze incomplete (check_rooms.py: tessere di un livello assenti dalle risorse -> crash del client
# entrando nella stanza): trattate come assenti (I-036), cioe' sostituite da una stanza dello stesso
# mondo. Restano in `folders` per non cambiare la scelta stabile delle altre missioni: si salta
# solo la stanza esclusa (candidata successiva).
EXCL = set(cfg.get('exclude_rooms', []))
if cfg.get('rooms_check'):
    EXCL |= set(json.load(open(cfg['rooms_check'], encoding='utf-8'))['incomplete'])
rooms = {k: v for k, v in rooms.items() if v not in EXCL}
quest_by_num = {}
for q in quests:
    if q.get('number') and str(q['number']).isdigit():
        quest_by_num.setdefault(int(q['number']), q)

# nomi dei nemici -> id (bersaglio 1xxxx, gli altri 8xxxx, altrimenti il primo)
by_name = collections.defaultdict(list)
for e in enemies:
    by_name[e['name'].lower()].append(e['enemyId'])


def enemy_id(name, target=False):
    ids = by_name.get(name.lower().strip())
    if not ids:
        # boss senza riga nella tabella enemy: un nemico grande al suo posto (Armored Knight)
        return (10017 if target else 80017) if cfg.get('substitute_unknown', True) else None
    pref = [i for i in ids if (10000 <= i < 20000 if target else 80000 <= i < 90000)]
    return (pref or sorted(ids))[0]


def parse_enemies(q):
    """quests.json: {"room": primo nome, "note": "N}} {{e|Nome|n}} ...|Stanza|note"}."""
    groups = []
    for ent in q.get('enemies', []):
        parts = ent.get('note', '').split('|')
        first = re.match(r'\s*(\d+)', parts[0] or '1')
        members = [(ent['room'], int(first.group(1)) if first else 1)]
        for m in re.finditer(r'\{\{e\|([^|}]+)\|(\d+)', ent.get('note', '')):
            members.append((m.group(1), int(m.group(2))))
        is_target = any('target' in p.lower() for p in parts[1:])
        room = ''
        for p in parts:
            if p and not p.strip().endswith('}}') and not re.match(r'^\s*\d', p) and '{{' not in p:
                room = p.strip()
                break
        groups.append({'members': members, 'target': is_target, 'room': room})
    return groups


def room_folder(name, world):
    if name in rooms:
        return rooms[name]
    pre = WORLD.get(world, 'DB')
    cand = [f for f in folders if f.startswith(pre + '_')] or [f for f in folders if f.startswith('DB_')]
    base = [f for f in cand if f.endswith('_00_00')] or cand
    h = int(hashlib.md5(name.encode()).hexdigest(), 16)
    return next((base[(h + i) % len(base)] for i in range(len(base)) if base[(h + i) % len(base)] not in EXCL),
                base[h % len(base)])


GRID, MARGIN = 40, 40
# Raggiungibilita' a livello di pixel (come validate_maps.py di stage_gen/reach): la bitmap CLS ha
# 1 bit per unita'; componenti 4-connesse dei pixel con spazio libero > REACH_R (gli originali
# 1010-1040 passano fino a 20), ogni punto della griglia agganciato al pixel piu' vicino entro
# REACH_TOL. Due punti della griglia sono vicini solo se stanno nella stessa componente: la visita
# sulla griglia di 40 px non puo' piu' «saltare» un muro sottile (tronco, staccionata) fra due
# campioni, e tutto quello che si piazza (partenza, uscite, arrivi, nemici, forzieri, bersaglio)
# sta nella componente della partenza. Dove la griglia non scavalcava muri il risultato e' identico.
REACH_R = float(cfg.get('reach_radius', 16))
REACH_TOL = int(cfg.get('reach_tol', 48))
_cls_cache = {}


def pixel_comp(cls, W, H, stride):
    """Funzione (x, y) -> etichetta della componente percorribile piu' vicina entro REACH_TOL (0 = nessuna)."""
    import numpy as np
    from scipy import ndimage
    bits = np.unpackbits(np.frombuffer(cls, np.uint8, stride * H, 16).reshape(H, stride), axis=1)[:, :W]
    free = bits == 0
    if REACH_R > 0:
        free = ndimage.distance_transform_edt(free) > REACH_R
    lab = ndimage.label(free)[0]
    T = REACH_TOL

    def comp(x, y):
        x0, x1, y0, y1 = max(0, x - T), min(W, x + T + 1), max(0, y - T), min(H, y + T + 1)
        if x0 >= x1 or y0 >= y1:
            return 0
        win = lab[y0:y1, x0:x1]
        ys, xs = np.nonzero(win)
        if not len(xs):
            return 0
        d2 = (xs + x0 - x) ** 2 + (ys + y0 - y) ** 2
        k = int(np.argmin(d2))
        return int(win[ys[k], xs[k]]) if d2[k] <= T * T else 0

    def snap(x, y):
        """(y, x) del pixel con componente piu' vicino entro REACH_TOL (come comp)."""
        x0, y0 = max(0, x - T), max(0, y - T)
        win = lab[y0:min(H, y + T + 1), x0:min(W, x + T + 1)]
        ys, xs = np.nonzero(win)
        k = int(np.argmin((xs + x0 - x) ** 2 + (ys + y0 - y) ** 2))
        return int(ys[k] + y0), int(xs[k] + x0)
    comp.lab, comp.snap = lab, snap
    return comp


def walk_grid(folder):
    if folder in _cls_cache:
        return _cls_cache[folder]
    cls = open(os.path.join(cfg['cls_dir'], 'map', folder, folder + '_cls.bin'), 'rb').read()
    W, H, stride = struct.unpack_from('<3i', cls, 4)

    def free(x, y):
        return 0 <= x < W and 0 <= y < H and not (cls[16 + y * stride + x // 8] >> (7 - x % 8)) & 1

    ok = set()
    for y in range(MARGIN, H - MARGIN, GRID):
        for x in range(MARGIN, W - MARGIN, GRID):
            if all(free(x + dx, y + dy) for dx in (-MARGIN, 0, MARGIN) for dy in (-MARGIN, 0, MARGIN)):
                ok.add((x, y))
    # componente dei pixel di ogni punto; senza componente (troppo stretto) il punto si scarta
    pc = pixel_comp(cls, W, H, stride)
    _pc_all[folder] = pc
    lab = {p: pc(*p) for p in ok}
    ok = {p for p in ok if lab[p]}
    # componente piu' grande, distanze dalla partenza (punto libero piu' a sinistra)
    seen, comps = set(), []
    for p in sorted(ok):
        if p in seen:
            continue
        comp, q = [], collections.deque([p])
        seen.add(p)
        while q:
            c = q.popleft()
            comp.append(c)
            for d in ((GRID, 0), (-GRID, 0), (0, GRID), (0, -GRID)):
                n = (c[0] + d[0], c[1] + d[1])
                if n in ok and n not in seen and lab[n] == lab[c]:
                    seen.add(n)
                    q.append(n)
        comps.append(comp)
    comp = set(max(comps, key=len))
    start = min(comp, key=lambda p: (p[0], p[1]))
    dist, q = {start: 0}, collections.deque([start])
    while q:
        c = q.popleft()
        for d in ((GRID, 0), (-GRID, 0), (0, GRID), (0, -GRID)):
            n = (c[0] + d[0], c[1] + d[1])
            if n in comp and n not in dist:
                dist[n] = dist[c] + 1
                q.append(n)
    _old_size[folder] = (len(dist), max(dist.values()))
    # Sacca d'ingresso (11 ottobre 2026): la griglia vuole 80x80 liberi intorno a ogni punto, quindi
    # un corridoio largo 33-80 unita' (percorribile per la componente di pixel, e per validate_maps)
    # la spezza in pezzi staccati, e il pezzo piu' grande puo' essere una sacca vicino all'ingresso
    # (AG_0002_00_00: 35 punti su 78 della stessa area, bersaglio a 179 unita' dall'arrivo). Se la
    # componente di pixel con piu' punti della griglia arriva a piedi molto piu' lontano del pezzo
    # scelto (portata geodetica del pezzo < POCKET volte quella della componente), si usano tutti i
    # punti della componente con le distanze geodetiche sui pixel (in passi di griglia, decimali).
    # Altrimenti tutto resta come prima, byte per byte.
    by_lab = collections.Counter(lab[p] for p in ok)
    big = max(sorted(by_lab), key=by_lab.get)
    info = {'old': len(comp), 'label': by_lab[big]}
    if by_lab[big] > len(comp):
        allp = {p for p in ok if lab[p] == big}
        nstart = min(allp, key=lambda p: (p[0], p[1]))
        ndist = geodesic(pc, allp, nstart)
        same = {p for p in ok if lab[p] == lab[start]}
        reach_old = max(v for p, v in geodesic(pc, same, start).items() if p in comp)
        info.update(reach_old=reach_old, reach_new=max(ndist.values()))
        if reach_old < POCKET * info['reach_new']:
            start, dist = nstart, ndist
            info['fixed'] = True
            _geo_pc[folder] = pc
    _walk_info[folder] = info
    _cls_cache[folder] = (start, dist)
    return start, dist


_old_size, _walk_info, _geo_pc, _pc_all = {}, {}, {}, {}
POCKET = float(cfg.get('pocket_ratio', 0.4))


GEO_F = 4    # lato in unita' delle celle per le distanze geodetiche


def geodesic(pc, pts, src):
    """Distanza a piedi (in passi di griglia, decimali) da src a ogni punto di pts, dentro la componente
    di pixel di src (celle di GEO_F unita', 8-connesse)."""
    import numpy as np
    from scipy import sparse
    from scipy.sparse import csgraph
    lab, L = pc.lab, pc(*src)
    H, W = lab.shape
    F = GEO_F
    Hc, Wc = -(-H // F), -(-W // F)
    m = np.zeros((Hc * F, Wc * F), bool)
    m[:H, :W] = lab == L
    cell = m.reshape(Hc, F, Wc, F).any(axis=(1, 3))
    idx = -np.ones(cell.shape, np.int64)
    idx[cell] = np.arange(int(cell.sum()))
    rows, cols, ws = [], [], []
    for dy, dx, w in ((0, 1, 1.0), (1, 0, 1.0), (1, 1, 2 ** 0.5), (1, -1, 2 ** 0.5)):
        a = idx[max(0, -dy):Hc - max(0, dy), max(0, -dx):Wc - max(0, dx)]
        b = idx[dy:dy + a.shape[0], max(0, dx):max(0, dx) + a.shape[1]]
        k = (a >= 0) & (b >= 0)
        rows.append(a[k])
        cols.append(b[k])
        ws.append(np.full(int(k.sum()), w))
    n = int(cell.sum())
    g = sparse.coo_matrix((np.concatenate(ws), (np.concatenate(rows), np.concatenate(cols))), shape=(n, n)).tocsr()
    sy, sx = pc.snap(*src)
    d = csgraph.dijkstra(g, directed=False, indices=int(idx[sy // F, sx // F]))
    out = {}
    for p in pts:
        y, x = pc.snap(*p)
        v = d[idx[y // F, x // F]]
        if np.isfinite(v):
            out[p] = round(float(v) * F / GRID, 3)
    out[src] = 0
    return out


u32 = lambda b, o: struct.unpack_from('<i', b, o)[0]  # noqa: E731
TX = u32(tmpl, 0x24)
TA, TB, TC = (u32(tmpl, 0x28 + 4 * i) + 0x34 for i in range(3))
tna = u32(tmpl, TX + 0x34)
ta0 = TX + 0x3c
T_AREAS = [bytes(tmpl[ta0 + k * 0x44:ta0 + (k + 1) * 0x44]) for k in range(tna)]
ARENA, NORMAL = T_AREAS[0], T_AREAS[1]


def build_part(folder, start, dist, groups, nchests):
    far = max(dist, key=lambda p: (dist[p], -p[1]))
    maxd = dist[far] or 1
    by_d = sorted(dist, key=lambda p: dist[p])
    areas, ens, uid = [], [], 2
    normal = [g for g in groups if not g['target']]
    target = [g for g in groups if g['target']] or [None]
    order = [(g, False) for g in normal] + [(target[0], True)]
    for i, (g, is_t) in enumerate(order):
        if is_t:
            cx, cy = far
        else:
            want = maxd * (i + 1) / (len(order) + 0.5)
            cx, cy = min(by_d, key=lambda p: abs(dist[p] - want))
        near = sorted(dist, key=lambda p: (p[0] - cx) ** 2 + (p[1] - cy) ** 2)
        members = []
        for name, n in (g['members'] if g else []):
            eid = enemy_id(name, is_t and not members)
            if eid:
                members += [eid] * n
        if not members:
            continue
        rec = bytearray(ARENA if is_t else NORMAL)
        struct.pack_into('<2i', rec, 0, len(ens), len(members))
        # uid dell'area, unico come nelle mappe vere (il modello aveva 7 per tutte, uguale a un nemico)
        struct.pack_into('<i', rec, 0x14, uid)
        uid += 1
        if is_t:
            box = [p for p in near[:40] if abs(p[1] - cy) <= 60 and abs(p[0] - cx) <= 300]
            xs = [p[0] for p in box] or [cx]
            ys = [p[1] for p in box] or [cy]
            x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
            if x1 - x0 < 80:
                x0, x1 = cx - 40, cx + 40
            if y1 - y0 < 40:
                y0, y1 = cy - 20, cy + 20
            struct.pack_into('<8i', rec, 0x24, x1, y0, x1, y1, x0, y1, x0, y0)
        for k, eid in enumerate(members):
            x, y = near[min(k * 3, len(near) - 1)]
            ens.append((x, y, eid, 1, 1, 1, 1, uid))
            uid += 1
        areas.append(bytes(rec))
    used = {(e[0], e[1]) for e in ens}
    spots = [p for p in by_d[len(by_d) // 4:] if p not in used and p != start]
    chests = []
    for k in range(nchests):
        if not spots:
            break
        x, y = spots[(k * 7919) % len(spots)]
        chests.append((x, y, 81, 15, uid))
        uid += 1
    body = bytearray(tmpl[:ta0])
    nm = folder.encode()
    body[0x0c:0x0c + 16] = nm + b'\0' * (16 - len(nm))
    struct.pack_into('<2i', body, TX + 0x34, len(areas), len(ens))
    for a in areas:
        body += a
    for e in ens:
        body += struct.pack('<8i', *e)
    A = len(body)
    body += struct.pack('<i', len(chests))
    for c in chests:
        body += struct.pack('<5i', *c)
    B = len(body)
    body += struct.pack('<i', 0)                 # nessun oggetto
    C = len(body)
    body += b'\0' * 64
    struct.pack_into('<3i', body, 0x28, A - 0x34, B - 0x34, C - 0x34)
    return bytes(body), areas, ens, chests


# ---------------------------------------------------------------- piu' stanze
STEP_IN = 6          # arrivo: ~6 passi di griglia (240 unita') dentro dall'uscita
KEEP_OUT = (240, 160, 110)   # raggio libero da nemici/forzieri intorno alle uscite (a scalare)
dd = lambda a, b: ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2) ** 0.5  # noqa: E731


def bfs(src, pts):
    dist, q = {src: 0}, collections.deque([src])
    while q:
        c = q.popleft()
        for d in ((GRID, 0), (-GRID, 0), (0, GRID), (0, -GRID)):
            n = (c[0] + d[0], c[1] + d[1])
            if n in pts and n not in dist:
                dist[n] = dist[c] + 1
                q.append(n)
    return dist


def arrival_near(exit_pt, pts, folder=None, avoid=()):
    """Punto percorribile ~STEP_IN passi dentro dall'uscita e a piu' di 96 (meglio 200) da essa.
    Nelle stanze corrette per la sacca d'ingresso (_geo_pc) il pezzo di griglia dell'uscita puo' essere
    tutto entro 120 unita': allora si misura a piedi su tutta la componente di pixel. avoid: le altre
    uscite della stanza, da cui l'arrivo deve stare a piu' di 160 (altrimenti si riparte subito)."""
    d = bfs(exit_pt, pts)
    if folder in _geo_pc and not any(dd(p, exit_pt) > 120 for p in d):
        d = geodesic(_geo_pc[folder], pts, exit_pt)
    if avoid:
        d = {p: v for p, v in d.items() if all(dd(p, e) > 160 for e in avoid)} or d
    cand = [p for p in d if dd(p, exit_pt) >= 200] or [p for p in d if dd(p, exit_pt) > 120] or list(d)
    return min(cand, key=lambda p: (abs(d[p] - STEP_IN), -dd(p, exit_pt), p))


def centroid(pts):
    return sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)


def build_part_mr(folder, dist, groups, nchests, exits, uid, has_target):
    """Come build_part, ma: posizioni lontane dalle uscite, uid globali da `uid`, blocco uscite.
    exits: [(x, y, angolo, resto, verso1/2, ax, ay, parte, facing)]. Ritorna anche il nuovo uid."""
    ex_pts = [(e[0], e[1]) for e in exits]
    pool = dict(dist)
    for r in KEEP_OUT:
        pool = {p: v for p, v in dist.items() if all(dd(p, e) >= r for e in ex_pts)}
        if len(pool) >= 12:
            break
    if not pool:
        pool = dict(dist)
    far = max(pool, key=lambda p: (pool[p], -p[1]))
    maxd = pool[far] or 1
    mind = min(pool.values())
    by_d = sorted(pool, key=lambda p: pool[p])
    areas, ens = [], []
    normal = [g for g in groups if not g['target']]
    target = [g for g in groups if g['target']]
    order = [(g, False) for g in normal] + ([(target[0], True)] if has_target and target else [])
    for i, (g, is_t) in enumerate(order):
        if is_t:
            cx, cy = far
        else:
            want = mind + (maxd - mind) * (i + 1) / (len(order) + 0.5)
            cx, cy = min(by_d, key=lambda p: abs(pool[p] - want))
        near = sorted(pool, key=lambda p: (p[0] - cx) ** 2 + (p[1] - cy) ** 2)
        members = []
        for name, n in g['members']:
            eid = enemy_id(name, is_t and not members)
            if eid:
                members += [eid] * n
        if not members:
            continue
        rec = bytearray(ARENA if is_t else NORMAL)
        struct.pack_into('<2i', rec, 0, len(ens), len(members))
        struct.pack_into('<i', rec, 0x14, uid)                      # uid area, globale
        uid += 1
        if is_t:
            box = [p for p in near[:40] if abs(p[1] - cy) <= 60 and abs(p[0] - cx) <= 300]
            xs = [p[0] for p in box] or [cx]
            ys = [p[1] for p in box] or [cy]
            x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
            if x1 - x0 < 80:
                x0, x1 = cx - 40, cx + 40
            if y1 - y0 < 40:
                y0, y1 = cy - 20, cy + 20
            struct.pack_into('<8i', rec, 0x24, x1, y0, x1, y1, x0, y1, x0, y0)
        for k, eid in enumerate(members):
            x, y = near[min(k * 3, len(near) - 1)]
            ens.append((x, y, eid, 1, 1, 1, 1, uid))
            uid += 1
        areas.append(bytes(rec))
    used = {(e[0], e[1]) for e in ens}
    spots = [p for p in by_d[len(by_d) // 4:] if p not in used]
    chests = []
    for k in range(nchests):
        if not spots:
            break
        x, y = spots[(k * 7919) % len(spots)]
        chests.append((x, y, 81, 15, uid))
        uid += 1
    body = bytearray(tmpl[:0x34])
    nm = folder.encode()
    body[0x0c:0x0c + 16] = nm + b'\0' * (16 - len(nm))
    body += struct.pack('<i', len(exits))
    for e in exits:
        body += struct.pack('<9i', *e)
    X = len(body) - 0x34                                            # = 4 + 36 n
    body += struct.pack('<2i', len(areas), len(ens))
    struct.pack_into('<2i', body, 0x20, 0, X)
    for a in areas:
        body += a
    for e in ens:
        body += struct.pack('<8i', *e)
    A = len(body)
    body += struct.pack('<i', len(chests))
    for c in chests:
        body += struct.pack('<5i', *c)
    B = len(body)
    body += struct.pack('<i', 0)
    C = len(body)
    body += b'\0' * 64
    struct.pack_into('<3i', body, 0x28, A - 0x34, B - 0x34, C - 0x34)
    return bytes(body), areas, ens, chests, uid


def norm(s):
    # la wiki lascia a volte un «|» finale (es. «Bazaar|» nei forzieri)
    return re.sub(r'\s+', ' ', (s or '').split('|')[0].strip().lower())


# ---------------------------------------------------------------- collegamenti fra le aree
# recon/tools/world_links.json (cfg['world_links']): aree di ogni mondo, porte delle stanze nelle
# risorse ({area vicina: [x, y]} sulla bitmap CLS) e collegamenti dalla wiki/dati originali
# (docs/notes/mappe_storia.md#collegamenti). Con il grafo le uscite delle missioni a piu' stanze
# stanno sulle porte vere (verso la stanza dopo / quella prima) invece che nel punto piu' lontano
# e in quello piu' a sinistra, e si generano le missioni «giro del mondo» (cfg['worldtour']).
WLINKS = json.load(open(cfg['world_links'], encoding='utf-8-sig')) if cfg.get('world_links') else None
AREA, ADJ, BY_CODE = {}, collections.defaultdict(set), {}
if WLINKS:
    for _w, _wd in WLINKS['worlds'].items():
        for _a in _wd['areas']:
            if _a.get('code') in EXCL:
                _a['res'] = False           # stanza incompleta: come un'area assente dalle risorse
            for _nm in [_a['name']] + _a.get('alias', []):
                AREA[(int(_w), norm(_nm))] = _a
            if _a.get('code') and _a.get('res') and not _a.get('variant_of'):
                BY_CODE.setdefault(_a['code'], (int(_w), _a))
        for _l in _wd['links']:
            ADJ[(int(_w), _l['from'])].add(_l['to'])
            ADJ[(int(_w), _l['to'])].add(_l['from'])


def wl_area(world, name):
    return AREA.get((world, norm(name)))


def wl_path(world, a, b):
    """Percorso piu' breve (nomi delle aree) da a a b nel grafo, None se scollegati."""
    prev, q = {a: None}, collections.deque([a])
    while q:
        c = q.popleft()
        if c == b:
            break
        for n in sorted(ADJ[(world, c)]):
            if n not in prev:
                prev[n] = c
                q.append(n)
    if b not in prev:
        return None
    p = [b]
    while prev[p[-1]] is not None:
        p.append(prev[p[-1]])
    return p[::-1]


_room_pc, _arr_geo = {}, {}


def room_comp(folder, pts):
    """(pc, etichetta, xs, ys) della componente di pixel percorribili che contiene i punti della griglia."""
    import numpy as np
    if folder not in _room_pc:
        walk_grid(folder)
        pc = _pc_all[folder]
        L = collections.Counter(pc(*p) for p in sorted(pts)).most_common(1)[0][0]
        ys, xs = np.nonzero(pc.lab == L)
        _room_pc[folder] = (pc, L, xs, ys)
    return _room_pc[folder]


_raw = {}
ISLAND_KEEP = 240     # distanza minima di un'uscita da zone libere staccate (cima della fontana...)


def room_raw(folder, pts):
    """(libero grezzo, distanza dalle «isole»): pixel liberi della CLS non collegati alla zona della
    stanza (es. la cima della fontana della Fountain Square, DB_0000: ellisse libera dentro il buco).
    Il client ci salta sopra (salti `_jmp`) se la freccia dell'uscita ci cade vicino: il giocatore resta
    sull'isola, fuori dal raggio di 96 dell'uscita, e il cambio di stanza non scatta (banco 991001)."""
    import numpy as np
    from scipy import ndimage
    if folder not in _raw:
        pc, L, xs, ys = room_comp(folder, pts)
        cls = open(os.path.join(cfg['cls_dir'], 'map', folder, folder + '_cls.bin'), 'rb').read()
        W, H, stride = struct.unpack_from('<3i', cls, 4)
        free = np.unpackbits(np.frombuffer(cls, np.uint8, stride * H, 16).reshape(H, stride), axis=1)[:, :W] == 0
        lab = ndimage.label(free)[0]
        main = int(lab[ys[0], xs[0]])
        # solo isole dove si puo' stare (>= 1000 pixel): i quadratini da 15x15 sparsi nelle CLS no
        sizes = np.bincount(lab.ravel())
        big = np.nonzero(sizes >= 1000)[0]
        F = 4
        Hc, Wc = -(-H // F), -(-W // F)
        m = np.zeros((Hc * F, Wc * F), bool)
        m[:H, :W] = free & (lab != main) & np.isin(lab, big[big != 0])
        isl = m.reshape(Hc, F, Wc, F).any(axis=(1, 3))
        dist = ndimage.distance_transform_edt(~isl) * F if isl.any() else np.full((Hc, Wc), 1e9)
        _raw[folder] = (free, dist, F)
    return _raw[folder]


def door_px(folder, xy, pts):
    """Porta agganciata al pixel percorribile piu' vicino della componente della stanza (non alla griglia
    di 40: i corridoi stretti in fondo ai quali stanno le porte non hanno punti della griglia), lontano
    almeno ISLAND_KEEP dalle isole libere staccate (vedi room_raw)."""
    import numpy as np
    pc, L, xs, ys = room_comp(folder, pts)
    free, dist, F = room_raw(folder, pts)
    d2 = (xs - xy[0]) ** 2 + (ys - xy[1]) ** 2
    ok = dist[ys // F, xs // F] > ISLAND_KEEP
    if ok.any():
        d2 = np.where(ok, d2, d2.max() + 1)
    k = int(np.argmin(d2))
    return int(xs[k]), int(ys[k])


def exit_angle(folder, pts, p, cent):
    """Angolo della freccia verso l'esterno della zona percorribile nel punto dell'uscita (media dei
    pixel bloccati entro 160). Il client (reference/world_schema/
    freccia_uscita.md) disegna la freccia 40-80 unita' PRIMA dell'uscita, verso l'interno, con la punta
    verso l'esterno: (x - d sin a, y + d cos a), d in [40, 80]. Senza pixel bloccati vicini: dal centro."""
    import math
    import numpy as np
    free, dist, F = room_raw(folder, pts)
    H, W = free.shape
    r = 160
    x0, x1, y0, y1 = max(0, p[0] - r), min(W, p[0] + r + 1), max(0, p[1] - r), min(H, p[1] + r + 1)
    yy, xx = np.nonzero(~free[y0:y1, x0:x1])
    xx, yy = xx + x0 - p[0], yy + y0 - p[1]
    k = xx ** 2 + yy ** 2 <= r * r
    if not k.any():
        return door_angle(cent, p)
    vx, vy = float(xx[k].mean()), float(yy[k].mean())
    a0 = int(round(math.degrees(math.atan2(vx, -vy)))) % 360
    # freccia (40-80 prima dell'uscita, verso l'interno) lontana dalle isole: toccandola il giocatore non
    # deve saltare su un'isola libera fuori dal raggio di 96; altrimenti si ruota fino a 90 gradi.
    # (Prima si controllava un punto 100 unita' OLTRE l'uscita: lato sbagliato, freccia_uscita.md.)
    Hc, Wc = dist.shape
    for da in (0, 15, -15, 30, -30, 45, -45, 60, -60, 75, -75, 90, -90):
        a = (a0 + da) % 360
        pts_ = [(int(p[0] - d * math.sin(math.radians(a))), int(p[1] + d * math.cos(math.radians(a))))
                for d in (40, 60, 80)]
        if all(not (0 <= ty // F < Hc and 0 <= tx // F < Wc) or dist[ty // F, tx // F] > 200 for tx, ty in pts_):
            return a
    return a0


def arrival_px(folder, door, pts, avoid=()):
    """Arrivo accanto a una porta: punto della componente a ~STEP_IN passi a piedi dalla porta, a piu'
    di 200 in linea d'aria da essa (meglio) e a piu' di 160 dalle altre uscite."""
    pc, L, xs, ys = room_comp(folder, pts)
    if (folder, door) not in _arr_geo:
        lab = pc.lab
        H, W = lab.shape
        cand = [(x, y) for y in range(20, H, GRID) for x in range(20, W, GRID) if lab[y, x] == L]
        _arr_geo[(folder, door)] = geodesic(pc, cand, door)
    d = dict(_arr_geo[(folder, door)])
    d.pop(door, None)
    ok = [p for p in d if all(dd(p, e) > 160 for e in avoid)] or list(d)
    best = [p for p in ok if dd(p, door) >= 200] or [p for p in ok if dd(p, door) > 120] or ok
    return min(best, key=lambda p: (abs(d[p] - STEP_IN), -dd(p, door), p))


# Giro lungo (I-072, banco 991001 parte 2): l'uscita sulla porta puo' essere raggiungibile solo con un
# giro enorme (2nd District: «Underground Waterway Entrance» sul camminamento basso fra i canali, 4500
# unita' a piedi contro 1200 in linea d'aria, passando dietro un edificio). Stessa misura del giro lungo
# di validate_maps.detour (pixel con spazio libero > REACH_R campionati ogni DET_CELL, 8-connessi,
# Dijkstra, aggancio entro REACH_TOL): se dall'ingresso principale della parte (partenza o primo arrivo)
# il percorso e' > DET_RATIO volte la linea d'aria e > DET_MIN, l'uscita va sul punto della componente
# della stanza con percorso <= DET_RATIO volte la linea d'aria piu' vicino alla porta.
DET_CELL, DET_RATIO, DET_MIN = 8, 1.5, 800
_det = {}


def det_graph(folder):
    import numpy as np
    from scipy import sparse
    if folder not in _det:
        walk_grid(folder)
        labc = _pc_all[folder].lab[::DET_CELL, ::DET_CELL]
        m = labc > 0
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
        g = sparse.coo_matrix((np.concatenate(wts), (np.concatenate(rows), np.concatenate(cols))),
                              shape=(n, n)).tocsr()
        _det[folder] = (m, idx, g, labc, {})
    return _det[folder]


def det_from(folder, src):
    """(distanze Dijkstra in celle da src, cella di src) come validate_maps.detour; None se src non aggancia."""
    import numpy as np
    from scipy.sparse.csgraph import dijkstra
    m, idx, g, labc, dc = det_graph(folder)
    h_, w_ = m.shape
    x, y = min(w_ - 1, max(0, src[0] // DET_CELL)), min(h_ - 1, max(0, src[1] // DET_CELL))
    r = REACH_TOL // DET_CELL
    ys, xs = np.nonzero(m[max(0, y - r):y + r + 1, max(0, x - r):x + r + 1])
    if not len(xs):
        return None
    k = int(np.argmin((xs + max(0, x - r) - x) ** 2 + (ys + max(0, y - r) - y) ** 2))
    ia = int(idx[ys[k] + max(0, y - r), xs[k] + max(0, x - r)])
    if ia not in dc:
        dc[ia] = dijkstra(g, directed=False, indices=ia)
    return dc[ia]


def det_path(folder, src, dst):
    """(linea d'aria, percorso) come validate_maps.detour, None se non collegati."""
    import numpy as np
    d = det_from(folder, src)
    if d is None:
        return None
    m, idx = det_graph(folder)[:2]
    h_, w_ = m.shape
    x, y = min(w_ - 1, max(0, dst[0] // DET_CELL)), min(h_ - 1, max(0, dst[1] // DET_CELL))
    r = REACH_TOL // DET_CELL
    ys, xs = np.nonzero(m[max(0, y - r):y + r + 1, max(0, x - r):x + r + 1])
    if not len(xs):
        return None
    k = int(np.argmin((xs + max(0, x - r) - x) ** 2 + (ys + max(0, y - r) - y) ** 2))
    v = d[idx[ys[k] + max(0, y - r), xs[k] + max(0, x - r)]]
    if not np.isfinite(v):
        return None
    return dd(src, dst), int(v * DET_CELL)


def short_exit(folder, pts, entry, door, avoid_exits=(), avoid_arr=()):
    """Uscita `door` della stanza vista dall'ingresso `entry`: (punto, nota). Se il percorso a piedi e' un
    giro lungo (> DET_RATIO volte la linea d'aria e > DET_MIN) si sceglie il punto della componente della
    stanza piu' vicino alla porta con percorso <= DET_RATIO volte la linea d'aria, a >= 300 dall'ingresso e
    dalle altre uscite, a >= 240 dagli arrivi nella stanza e a > ISLAND_KEEP dalle isole libere; se non
    ce n'e', la porta resta e la nota lo dice. Senza giro lungo: (door, None)."""
    import numpy as np
    r = det_path(folder, entry, door)
    if not r or not (r[1] > DET_RATIO * r[0] and r[1] > DET_MIN):
        return door, None
    m, idx, g, labc, _ = det_graph(folder)
    d = det_from(folder, entry)
    pc, L, xs, ys = room_comp(folder, pts)
    free, idist, F = room_raw(folder, pts)
    cy, cx = np.nonzero(labc == L)
    px, py = cx * DET_CELL, cy * DET_CELL
    path = np.floor(d[idx[cy, cx]] * DET_CELL)
    air = np.hypot(px - entry[0], py - entry[1])
    ok = np.isfinite(path) & (path <= DET_RATIO * air) & (air >= 300) & (idist[py // F, px // F] > ISLAND_KEEP)
    for e in avoid_exits:
        ok &= np.hypot(px - e[0], py - e[1]) >= 300
    for a in avoid_arr:
        ok &= np.hypot(px - a[0], py - a[1]) >= 240
    old = 'giro lungo da %s verso l\'uscita %s: linea d\'aria %.0f, percorso %d' % (tuple(entry), tuple(door), r[0], r[1])
    if not ok.any():
        return door, old + ': nessun punto con percorso breve, uscita lasciata sulla porta'
    k = int(np.argmin(np.where(ok, (px - door[0]) ** 2 + (py - door[1]) ** 2, np.inf)))
    p = (int(px[k]), int(py[k]))
    r2 = det_path(folder, entry, p)
    return p, old + ' -> uscita spostata in %s (%.0f dalla porta): linea d\'aria %.0f, percorso %d' % (
        p, dd(p, door), r2[0], r2[1])


def door_angle(cent, p):
    """Angolo della freccia (gradi, 0 = su, in senso orario: 35 in alto a destra, 220 in basso a
    sinistra come nelle 1010-1016) dal centro della zona percorribile verso la porta."""
    import math
    return int(round(math.degrees(math.atan2(p[0] - cent[0], -(p[1] - cent[1]))))) % 360


def safe_start(pts, avoid, far=300):
    """Punto piu' vicino al centro della zona percorribile a piu' di `far` da tutte le uscite."""
    c = centroid(pts)
    cand = sorted(pts, key=lambda p: (dd(p, c), p))
    for r in (far, 200, 130):
        for p in cand:
            if all(dd(p, e) >= r for e in avoid):
                return p
    return cand[0]


def wl_doors(world, names, folders_, pts, starts, fars):
    """Uscite delle missioni a piu' stanze sulle porte di world_links.json. Per la stanza k: uscita
    avanti sulla porta verso names[k+1] (o verso il primo passo del percorso nel grafo, se le stanze
    non sono vicine), indietro sulla porta verso names[k-1]; se la stanza e' una sostituta (I-036) o
    la porta manca, una porta qualsiasi della stanza (la piu' lontana dall'altra uscita); senza
    porte resta il punto di prima. Ritorna (fars, starts, note)."""
    R = len(names)
    fars, starts, notes = list(fars), list(starts), []
    for k in range(R):
        if folders_[k] not in BY_CODE:
            continue
        wa = BY_CODE[folders_[k]][1]
        doors = sorted(wa.get('doors', {}).items())
        if not doors:
            continue
        exact = wl_area(world, names[k]) is wa

        def toward(other):
            oa = wl_area(world, other) if exact else None
            if not oa:
                return None
            p = wl_path(world, wa['name'], oa['name'])
            return next((d for d in doors if p and len(p) > 1 and d[0] == p[1]), None)
        want_f = toward(names[k + 1]) if k < R - 1 else None
        want_b = toward(names[k - 1]) if k > 0 else None
        if want_f and want_b and want_f[0] == want_b[0]:
            want_b = None                   # stessa porta: indietro su un'altra
        f = b = None
        if k < R - 1:
            ref = want_b[1] if want_b else starts[k]
            f = want_f or max(doors, key=lambda d: (dd(d[1], ref), d[0]))
        if k > 0:
            rest = [d for d in doors if not f or d[0] != f[0]]
            b = want_b or (max(rest, key=lambda d: (dd(d[1], f[1] if f else fars[k]), d[0])) if rest else None)
        if f:
            fp = door_px(folders_[k], f[1], pts[k])
            if not (k > 0 and not b and dd(fp, starts[k]) < 300):
                notes.append('stanza %d: uscita avanti sulla porta «%s»%s (era %s, ora %s)' % (
                    k, f[0], '' if f is want_f else ' (porta qualsiasi)', fars[k], fp))
                fars[k] = fp
        if b:
            bp = door_px(folders_[k], b[1], pts[k])
            if k == R - 1 or dd(bp, fars[k]) >= 300 or not f:
                notes.append('stanza %d: uscita indietro sulla porta «%s»%s (era %s, ora %s)' % (
                    k, b[0], '' if b is want_b else ' (porta qualsiasi)', starts[k], bp))
                starts[k] = bp
    if dd(starts[0], fars[0]) < 300 and R > 1:
        starts[0] = safe_start(pts[0], [fars[0]])
    return fars, starts, notes


def wl_relation(world, a, b):
    """Come sono collegate due aree nel grafo: 'vicine', 'via X, Y', 'scollegate', 'ignote'."""
    aa, ab = wl_area(world, a), wl_area(world, b)
    if not aa or not ab:
        return 'ignote'
    p = wl_path(world, aa['name'], ab['name'])
    if p is None:
        return 'scollegate'
    return 'vicine' if len(p) <= 2 else 'via ' + ', '.join(p[1:-1])


MIN_PTS, MIN_STEPS = 40, 15   # stanza abbastanza grande per due uscite lontane e i nemici in mezzo


def room_folder_mr(name, world, avoid=None):
    """Come room_folder; per le stanze non note salta quelle troppo piccole (es. DB_0027_00_00 ha
    solo 2 punti percorribili sulla griglia) e, se possibile, la stessa cartella della stanza prima."""
    if name in rooms:
        return rooms[name]
    pre = WORLD.get(world, 'DB')
    cand = [f for f in folders if f.startswith(pre + '_')] or [f for f in folders if f.startswith('DB_')]
    base = [f for f in cand if f.endswith('_00_00')] or cand
    h = int(hashlib.md5(name.encode()).hexdigest(), 16)
    first = None
    for i in range(len(base)):
        f = base[(h + i) % len(base)]
        if f in EXCL:
            continue
        walk_grid(f)
        n_old, steps_old = _old_size[f]     # misura di prima: stesse stanze scelte
        if n_old >= MIN_PTS and steps_old >= MIN_STEPS:
            if f != avoid:
                return f
            first = first or f
    return first or base[h % len(base)]


def build_multi(s, q, room_names, groups):
    """Parti per ogni stanza; ritorna (hdr, [parti], info)."""
    R = len(room_names)
    idx = {}
    for k, r in enumerate(room_names):
        idx.setdefault(norm(r), k)
    doubts = []
    # gruppi -> stanza (wiki); il bersaglio nell'ultima; senza stanza riconosciuta: stanza del gruppo prima
    per_room = [[] for _ in range(R)]
    last_k = 0
    # stanza del gruppo: il primo pezzo della nota (separato da «|») che e' una stanza della
    # missione (parse_enemies prende il primo pezzo non numerico, che nei gruppi misti e' il
    # secondo nemico: va bene per il report, non per scegliere la stanza)
    notes = [ent.get('note', '') for ent in q.get('enemies', [])]
    for gi, g in enumerate(groups):
        hits = [idx[norm(p)] for p in notes[gi].split('|') if norm(p) in idx] if gi < len(notes) else []
        k = hits[0] if hits else idx.get(norm(g['room']))
        if g['target']:
            if k is not None and k != R - 1:
                doubts.append('bersaglio in «%s» (stanza %d) spostato nell\'ultima' % (room_names[k], k))
            k = R - 1
        elif k is None:
            doubts.append('gruppo senza stanza nota («%s») -> stanza %d' % (g['room'], last_k))
            k = last_k
        per_room[k].append(g)
        last_k = k
    if not any(g['target'] for g in per_room[R - 1]):
        per_room[R - 1].append({'members': [('Shadow', 1)], 'target': True, 'room': room_names[-1]})
    chests_per = [0] * R
    for t in q.get('treasures', []):
        k = idx.get(norm(t.get('room')))
        if k is None:
            doubts.append('forziere senza stanza nota («%s») -> stanza 0' % t.get('room'))
            k = 0
        chests_per[k] += 1
    folders_ = []
    for r in room_names:
        folders_.append(room_folder_mr(r, s['worldId'], folders_[-1] if folders_ else None))
        if folders_[-1] != room_folder(r, s['worldId']):
            doubts.append('stanza «%s»: %s troppo piccola o uguale alla precedente -> %s' % (
                r, room_folder(r, s['worldId']), folders_[-1]))
    grids = [walk_grid(f) for f in folders_]
    pts = [set(d) for _, d in grids]
    starts = [st for st, _ in grids]
    fars = [max(d, key=lambda p: (d[p], -p[1])) for _, d in grids]
    cents = [centroid(p) for p in pts]
    links = []
    if WLINKS:
        # uscite sulle porte vere (world_links.json); relazione nel grafo di ogni coppia di stanze
        fars, starts, notes = wl_doors(s['worldId'], room_names, folders_, pts, starts, fars)
        doubts += notes
        links = [{'from': a, 'to': b, 'graph': wl_relation(s['worldId'], a, b),
                  'exact': [a in rooms, b in rooms]} for a, b in zip(room_names, room_names[1:])]
    # punti: uscita avanti fwd[k] (k < R-1) = fars[k]; uscita indietro back[k] (k > 0) = starts[k]
    if WLINKS:
        # porte agganciate ai pixel: arrivi misurati a piedi sulla componente di pixel
        arr_in = [None] + [arrival_px(folders_[k], starts[k], pts[k], [fars[k]] if k < R - 1 else ())
                           for k in range(1, R)]
        arr_back = [arrival_px(folders_[k], fars[k], pts[k], [starts[k]] if k > 0 else ())
                    for k in range(R - 1)] + [None]
        # giro lungo (short_exit): ingresso principale della parte k = partenza (k = 0) o arrivo dalla
        # parte k-1 (accanto all'uscita indietro, che quindi non fa mai un giro lungo); si controlla
        # l'uscita avanti e, se si sposta, si ricalcola solo l'arrivo di ritorno accanto a lei
        for k in range(R - 1):
            entry = starts[0] if k == 0 else arr_in[k]
            p, note = short_exit(folders_[k], pts[k], entry, fars[k], [starts[k]] if k > 0 else (),
                                 [arr_in[k]] if k > 0 else ())
            if note:
                doubts.append('stanza %d: %s' % (k, note))
            if p != fars[k]:
                fars[k] = p
                arr_back[k] = arrival_px(folders_[k], p, pts[k], [starts[k]] if k > 0 else ())
    else:
        arr_in = [None] + [arrival_near(starts[k], pts[k], folders_[k]) for k in range(1, R)]   # entrando da avanti
        arr_back = [arrival_near(fars[k], pts[k], folders_[k]) for k in range(R - 1)] + [None]  # tornando indietro
    face = lambda k, p: 1 if cents[k][0] < p[0] else 2                              # noqa: E731
    if WLINKS:
        angle = lambda k, p: exit_angle(folders_[k], pts[k], p, cents[k])            # noqa: E731
    else:
        angle = lambda k, p: 35 if p[0] >= cents[k][0] else 220                     # noqa: E731
    # le posizioni dei nemici dipendono solo dai punti delle uscite, non dai loro campi: una prima
    # costruzione dell'ultima stanza dice dov'e' il bersaglio, poi si calcolano le distanze residue.
    def exits_of(k, rem):
        ex = []
        if k < R - 1:
            a = arr_in[k + 1]
            ex.append((fars[k][0], fars[k][1], angle(k, fars[k]), rem['fwd'][k], 1, a[0], a[1], k + 1,
                       face(k + 1, a)))
        if k > 0:
            a = arr_back[k - 1]
            ex.append((starts[k][0], starts[k][1], angle(k, starts[k]), rem['back'][k], 2, a[0], a[1], k - 1,
                       face(k - 1, a)))
        return ex
    zero = {'fwd': [0] * R, 'back': [0] * R}
    probe = build_part_mr(folders_[R - 1], grids[R - 1][1], per_room[R - 1], chests_per[R - 1],
                          exits_of(R - 1, zero), 1, True)
    tens = [e for e in probe[2]]
    tpos = None
    if probe[1]:
        # area del bersaglio = ultima area (con [4] = 1); primo nemico
        ta = probe[1][-1]
        first = struct.unpack_from('<i', ta, 0)[0]
        tpos = tens[first][:2] if struct.unpack_from('<i', ta, 0x10)[0] & 1 else None
    tpos = tpos or fars[R - 1]
    fwd, back = [0] * R, [0] * R
    # resto da arrivo in stanza j: j ultima -> fino al bersaglio; altrimenti fino a fwd[j] + fwd[j]
    for k in range(R - 2, -1, -1):
        j = k + 1
        a = arr_in[j]
        fwd[k] = int(round(dd(a, tpos))) if j == R - 1 else int(round(dd(a, fars[j]))) + fwd[j]
    for k in range(1, R):
        a = arr_back[k - 1]
        back[k] = int(round(dd(a, fars[k - 1]))) + fwd[k - 1]
    rem = {'fwd': fwd, 'back': back}
    parts, uid, tot_a, tot_e, tot_c, target_id, tpart = [], 1, 0, 0, 0, None, R - 1
    for k in range(R):
        part, areas, ens, chests, uid = build_part_mr(folders_[k], grids[k][1], per_room[k], chests_per[k],
                                                      exits_of(k, rem), uid, k == R - 1)
        for a in areas:
            if struct.unpack_from('<i', a, 0x10)[0] & 1 and target_id is None:
                target_id = ens[struct.unpack_from('<i', a, 0)[0]][2]
        poi_add(s['stageId'], k, ens, chests)
        parts.append(part)
        tot_a += len(areas)
        tot_e += len(ens)
        tot_c += len(chests)
    target_id = target_id or 80001
    hdr = struct.pack('<16i', 4674643, 16, R, starts[0][0], starts[0][1], 2, target_id, 1, tot_a, tot_e,
                      0, 1, tpart, 0, tot_c, 0)
    info = {'parts': R, 'folders': folders_, 'groups_per_room': [len(g) for g in per_room],
            'chests_per_room': chests_per, 'doubts': doubts}
    if links:
        info['links'] = links
    return hdr, parts, info, tot_e, tot_c


# Forzieri e nemici di ogni missione generata per il server (server/game_data/stage_poi.json,
# stesso formato di stage_poi.py: uid, enemyId/reward, kind, parte), in cfg['poi']
POI = {}


def poi_add(sid, part, ens, chests):
    d = POI.setdefault(str(sid), {'chests': [], 'enemies': []})
    d['enemies'] += [{'uid': e[7], 'enemyId': e[2], 'reward': e[6], 'map': part} for e in ens]
    d['chests'] += [{'uid': c[4], 'reward': c[2], 'kind': c[3], 'map': part} for c in chests]


report = []
for s in sorted(stages, key=lambda r: r['stageBinId']):
    num = s['stageBinId']
    if not (1 <= num <= cfg.get('max_mission', 10 ** 6)) or s['stageId'] >= 100000 or s['stageId'] in skip:
        continue
    q = quest_by_num.get(num, {})
    room_names = q.get('rooms') or [s['mapName']]
    if cfg.get('multiroom') and len(room_names) > 1:
        groups = parse_enemies(q)
        tname = (q.get('target') or '').strip()
        if tname and not any(g['target'] for g in groups):
            groups.append({'members': [(tname, 1)], 'target': True, 'room': room_names[-1]})
        hdr, parts, info, ne, nc = build_multi(s, q, room_names, groups)
        sid = s['stageId']
        open(os.path.join(out, 'mappoi_stg%05d.bin' % sid), 'wb').write(hdr)
        for k, p in enumerate(parts):
            open(os.path.join(out, 'mappoi_stg%05d_%02d.bin' % (sid, k)), 'wb').write(p)
        missing = [n for g in groups for n, _ in g['members'] if n.lower().strip() not in by_name]
        report.append(dict({'mission': num, 'stageId': sid, 'name': s['name'], 'room': room_names[0],
                            'folder': info['folders'][0], 'exact_room': room_names[0] in rooms,
                            'enemies': ne, 'chests': nc, 'unknown_enemies': sorted(set(missing)),
                            'rooms': room_names}, **info))
        continue
    first_room = room_names[0]
    folder = room_folder(first_room, s['worldId'])
    groups = parse_enemies(q)
    tname = (q.get('target') or '').strip()
    if tname and not any(g['target'] for g in groups):
        groups.append({'members': [(tname, 1)], 'target': True, 'room': first_room})
    if not groups:
        groups = [{'members': [('Shadow', 1)], 'target': True, 'room': first_room}]
    start, dist = walk_grid(folder)
    part, areas, ens, chests = build_part(folder, start, dist, groups, len(q.get('treasures', [])))
    target_id = next((e[2] for e in ens if 10000 <= e[2] < 20000), ens[-1][2] if ens else 80001)
    hdr = struct.pack('<16i', 4674643, 16, 1, start[0], start[1], 2, target_id, 1, len(areas), len(ens),
                      0, 1, 0, 0, len(chests), 0)
    sid = s['stageId']
    open(os.path.join(out, 'mappoi_stg%05d.bin' % sid), 'wb').write(hdr)
    open(os.path.join(out, 'mappoi_stg%05d_00.bin' % sid), 'wb').write(part)
    poi_add(sid, 0, ens, chests)
    missing = [n for g in groups for n, _ in g['members'] if n.lower().strip() not in by_name]
    report.append({'mission': num, 'stageId': sid, 'name': s['name'], 'room': first_room, 'folder': folder,
                   'exact_room': first_room in rooms, 'enemies': len(ens), 'chests': len(chests),
                   'unknown_enemies': sorted(set(missing))})
# Missioni «zoo» per provare i nemici: tutti gli enemyId di zoo_enemies, zoo_per_stage per
# missione, in aree da 5 nella stanza zoo_room; stageId 990001.. (righe nel master con
# KHUX_ZOO=1 in make-game-tables.js). All'avvio il campo carica la grafica di tutti.
if cfg.get('zoo_enemies'):
    zoo = json.load(open(cfg['zoo_enemies'], encoding='utf-8'))
    per = cfg.get('zoo_per_stage', 35)
    room = cfg.get('zoo_room', 'DB_0000_00_00')
    start, dist = walk_grid(room)
    for n in range(0, len(zoo), per):
        chunk = zoo[n:n + per]
        groups = [{'members': [], 'target': False, 'room': ''}]
        ids = {}
        for eid in chunk:
            nm = '#%d' % eid
            ids[nm.lower()] = [eid]
        by_name.update(ids)
        for k in range(0, len(chunk), 5):
            groups.append({'members': [('#%d' % e, 1) for e in chunk[k:k + 5]], 'target': k == 0, 'room': ''})
        groups = [g for g in groups if g['members']]
        part, areas, ens, chests = build_part(room, start, dist, groups, 0)
        sid = 990001 + n // per
        hdr = struct.pack('<16i', 4674643, 16, 1, start[0], start[1], 2, ens[0][2], 1, len(areas), len(ens),
                          0, 1, 0, 0, 0, 0)
        open(os.path.join(out, 'mappoi_stg%05d.bin' % sid), 'wb').write(hdr)
        open(os.path.join(out, 'mappoi_stg%05d_00.bin' % sid), 'wb').write(part)
        poi_add(sid, 0, ens, chests)
        print('zoo', sid, len(ens), 'nemici')


# Missioni «giro del mondo» (cfg['worldtour'] = true o lista di worldId, serve cfg['world_links']):
# una missione per mondo con tutte le stanze del mondo che stanno nelle risorse (varianti giorno/notte
# escluse), una parte per stanza, collegate come nel grafo di world_links.json: ogni porta della
# stanza porta alla stanza piu' vicina nel grafo (attraversando le aree assenti dalle risorse) e si
# arriva accanto alla porta di ritorno. Un solo Shadow (bersaglio) nella stanza piu' lontana dalla
# partenza. stageId cfg['worldtour_base'] (991000) + worldId; righe nel master con KHUX_WORLDTOUR=1
# in make-game-tables.js. Rapporto in cfg['worldtour_report'].
def tour_edges(world, wd):
    res = {a['name']: a for a in wd['areas'] if a.get('res') and a.get('code') and not a.get('variant_of')}
    edges, notes = [], []
    for name in sorted(res):
        for nb, xy in sorted(res[name].get('doors', {}).items()):
            if nb in res:
                hit = (nb, [])
            else:
                hit, seen, front = None, {name, nb}, [(nb, [nb])]
                while front and not hit:
                    nxt = []
                    for c, via in front:
                        for n in sorted(ADJ[(world, c)]):
                            if n in seen:
                                continue
                            seen.add(n)
                            if n in res:
                                hit = hit or (n, via)
                            else:
                                nxt.append((n, via + [n]))
                    front = nxt
            if not hit:
                notes.append('%s: porta «%s» senza stanza delle risorse dietro (vicolo cieco)' % (name, nb))
                continue
            dst, via = hit
            back = via[-1] if via else name
            dxy = res[dst].get('doors', {}).get(back)
            if not dxy:
                notes.append('%s -> %s: %s non ha la porta verso «%s»' % (name, dst, dst, back))
            edges.append({'from': name, 'door': nb, 'xy': xy, 'to': dst, 'via': via, 'back': back, 'to_xy': dxy})
    return res, edges, notes


def build_tour(world, wd, sid):
    res, edges, notes = tour_edges(world, wd)
    start = wd['start']
    order, q = [start], collections.deque([start])
    while q:
        c = q.popleft()
        for e in edges:
            if e['from'] == c and e['to'] not in order:
                order.append(e['to'])
                q.append(e['to'])
    for n in sorted(res):
        if n not in order:
            notes.append('%s: non raggiungibile dalla partenza, esclusa' % n)
    idx = {n: k for k, n in enumerate(order)}
    R = len(order)
    folders_ = [res[n]['code'] for n in order]
    grids = [walk_grid(f) for f in folders_]
    pts = [set(d) for _, d in grids]
    cents = [centroid(p) for p in pts]
    ex = [[] for _ in range(R)]                     # per parte: (punto, edge)
    for e in edges:
        if e['from'] in idx and e['to'] in idx:
            k = idx[e['from']]
            ex[k].append((door_px(folders_[k], e['xy'], pts[k]), e))
    # partenza e arrivi lontani dalle uscite della stanza
    st0 = safe_start(pts[0], [p for p, _ in ex[0]])
    arr = {}
    for k in range(R):
        for p, e in ex[k]:
            j = idx[e['to']]
            others = [q for q, _ in ex[j]]
            if e['to_xy']:
                door_j = door_px(folders_[j], e['to_xy'], pts[j])
                arr[id(e)] = arrival_px(folders_[j], door_j, pts[j], [q for q in others if q != door_j])
            else:
                arr[id(e)] = safe_start(pts[j], others)
    # giro lungo (short_exit): ingresso principale di ogni parte come in validate_maps (partenza, poi il
    # primo arrivo seguendo le uscite in ordine di parte); l'uscita spostata si porta dietro solo gli arrivi
    # di ritorno accanto alla sua porta, gli altri arrivi restano (l'uscita nuova sta a >= 240 da loro)
    entry, changed = {0: st0}, True
    while changed:
        changed = False
        for k in range(R):
            if k not in entry:
                continue
            for p, e in ex[k]:
                j = idx[e['to']]
                if j != k and j not in entry:
                    entry[j] = arr[id(e)]
                    changed = True
    moved = []
    for k in range(R):
        if k not in entry:
            continue
        for i, (p, e) in enumerate(ex[k]):
            rev = [e2 for kk in range(R) for _, e2 in ex[kk] if idx[e2['to']] == k and e2['to_xy']
                   and door_px(folders_[k], e2['to_xy'], pts[k]) == p]
            rid = {id(e2) for e2 in rev}
            arr_k = [arr[id(e2)] for kk in range(R) for _, e2 in ex[kk] if idx[e2['to']] == k and id(e2) not in rid]
            np_, note = short_exit(folders_[k], pts[k], entry[k], p, [q for q, _ in ex[k] if q != p], arr_k)
            if note:
                notes.append('parte %d (%s), porta «%s»: %s' % (k, order[k], e['door'], note))
            if np_ != p:
                ex[k][i] = (np_, e)
                for e2 in rev:
                    arr[id(e2)] = arrival_px(folders_[k], np_, pts[k], [q for q, _ in ex[k] if q != np_])
                moved.append({'part': k, 'door': e['door'], 'from': list(p), 'to': list(np_),
                              'arrivals_back': [list(arr[id(e2)]) for e2 in rev]})
    # bersaglio: la stanza piu' lontana (passi nel grafo) dalla partenza
    hops = {0: 0}
    q = collections.deque([0])
    while q:
        c = q.popleft()
        for _, e in ex[c]:
            j = idx[e['to']]
            if j not in hops:
                hops[j] = hops[c] + 1
                q.append(j)
    tpart = max(range(R), key=lambda k: (hops.get(k, -1), k))
    tgroup = [{'members': [('Shadow', 1)], 'target': True, 'room': ''}]

    def exits_of(k, rem):
        out_ = []
        for p, e in ex[k]:
            j, a = idx[e['to']], arr[id(e)]
            out_.append((p[0], p[1], exit_angle(folders_[k], pts[k], p, cents[k]), rem.get(id(e), 0), 1 if hops.get(j, 0) > hops.get(k, 0)
                         else 2, a[0], a[1], j, 1 if cents[j][0] < a[0] else 2))
        return out_
    probe = build_part_mr(folders_[tpart], grids[tpart][1], tgroup, 0, exits_of(tpart, {}), 1, True)
    tpos = (probe[2][0][0], probe[2][0][1]) if probe[2] else cents[tpart]
    # distanza residua al bersaglio ([3]): dall'arrivo nella stanza j, a piedi in linea d'aria fino
    # al bersaglio passando per le uscite verso la stanza del bersaglio (passi nel grafo verso tpart)
    back_hops = {tpart: 0}
    q = collections.deque([tpart])
    while q:
        c = q.popleft()
        for k in range(R):
            if k not in back_hops and any(idx[e['to']] == c for _, e in ex[k]):
                back_hops[k] = back_hops[c] + 1
                q.append(k)
    rem, memo = {}, {}

    def cost(j, pt):
        if j == tpart:
            return dd(pt, tpos)
        best = [(p, e) for p, e in ex[j] if back_hops.get(idx[e['to']], 99) < back_hops.get(j, 99)]
        if not best:
            return 99999
        p, e = min(best, key=lambda pe: dd(pt, pe[0]))
        if id(e) not in memo:
            memo[id(e)] = cost(idx[e['to']], arr[id(e)])
        return dd(pt, p) + memo[id(e)]
    for k in range(R):
        for p, e in ex[k]:
            rem[id(e)] = int(round(cost(idx[e['to']], arr[id(e)])))
    parts, uid, tot_a, tot_e, target_id = [], 1, 0, 0, None
    for k in range(R):
        part, areas, ens, chests, uid = build_part_mr(folders_[k], grids[k][1], tgroup if k == tpart else [], 0,
                                                      exits_of(k, rem), uid, k == tpart)
        if k == tpart and ens:
            target_id = ens[0][2]
        poi_add(sid, k, ens, chests)
        parts.append(part)
        tot_a += len(areas)
        tot_e += len(ens)
    hdr = struct.pack('<16i', 4674643, 16, R, st0[0], st0[1], 2, target_id or 80001, 1, tot_a, tot_e,
                      0, 1, tpart, 0, 0, 0)
    open(os.path.join(out, 'mappoi_stg%05d.bin' % sid), 'wb').write(hdr)
    for k, p in enumerate(parts):
        open(os.path.join(out, 'mappoi_stg%05d_%02d.bin' % (sid, k)), 'wb').write(p)
    return {'world': world, 'name': wd['name'], 'stageId': sid, 'parts': R, 'target_part': tpart,
            'target': order[tpart], 'start': list(st0),
            'rooms': [{'part': k, 'area': n, 'folder': folders_[k], 'hops': hops.get(k),
                       'exits': [{'door': e['door'], 'at': list(p), 'to_part': idx[e['to']], 'to': e['to'],
                                  'via': e['via'], 'arrive': list(arr[id(e)]), 'rem': rem[id(e)]}
                                 for p, e in ex[k]]} for k, n in enumerate(order)],
            'moved_exits': moved, 'notes': notes}


if cfg.get('worldtour') and WLINKS:
    tours = []
    want = cfg['worldtour'] if isinstance(cfg['worldtour'], list) else None
    for w, wd in sorted(WLINKS['worlds'].items(), key=lambda kv: int(kv[0])):
        if want and int(w) not in want:
            continue
        t = build_tour(int(w), wd, cfg.get('worldtour_base', 991000) + int(w))
        tours.append(t)
        print('giro', t['stageId'], t['name'], t['parts'], 'parti, bersaglio in', t['target'])
    json.dump(tours, open(cfg.get('worldtour_report', os.path.join(os.path.dirname(cfg['report']), 'worldtour_report.json')),
                          'w', encoding='utf-8'), ensure_ascii=False, indent=1)
if cfg.get('poi'):
    # si aggiungono a quelli delle mappe vere (stage_poi.py), che restano
    old = json.load(open(cfg['poi'], encoding='utf-8')) if os.path.exists(cfg['poi']) else {}
    old = {k: v for k, v in old.items() if k not in POI}
    json.dump(dict(sorted(dict(old, **POI).items(), key=lambda kv: int(kv[0]))), open(cfg['poi'], 'w', encoding='utf-8'),
              separators=(',', ':'))
json.dump(report, open(cfg['report'], 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('missioni generate:', len(report), '| stanza esatta:', sum(r['exact_room'] for r in report),
      '| nemici sconosciuti:', len({n for r in report for n in r['unknown_enemies']}))
