"""Missioni Â«TourÂ» v2: un giro per ZONA di ogni mondo sulle porte originali dello schema dei mondi v2.

    python -I recon/tools/gen_tours_v2.py [config.json] [--available rooms.json] [--worlds DB,AG] [--out DIR]

ISSUES I-116, docs/notes/mappe_storia.md#tour-v2. Sostituisce i tour 991001-991008 (gen_story_maps.py
`worldtour`, uscite indovinate su world_links.json) con giri costruiti SOLO dalle uscite originali:
reference/world_schema/schema_v2/schema_mondi.json (porte con scope 'storia', approvato dall'utente 13-10).

Regole (decisioni dell'utente 13-10):
- un tour per zona: sottografi `zone_storia` di _graphs.json (DB, AG); per i mondi senza zone, le componenti
  connesse del grafo delle porte di storia del mondo. Una zona spezzata dalle stanze non disponibili da' un
  tour per pezzo (>= 2 stanze);
- solo porte 'storia' fra stanze dello stesso mondo e della zona; mai porte inventate. Una porta verso una
  stanza fuori zona / non disponibile / 'evento' / fra mondi e' omessa (rapporto);
- uscita = mediana delle uscite delle sole missioni di storia (story_median), angolo = il piu' frequente fra
  le missioni di storia (a parita': quello della missione piu' vicina alla mediana); arrivo = mediana del
  gruppo di arrivi piu' numeroso delle missioni di storia, verso = il piu' frequente nel gruppo;
- porte della stessa stanza a <= 96 l'una dall'altra verso stanze diverse (varianti della stessa
  destinazione, es. DB_0010_01_00/_01/_02): una sola, quella con piu' missioni di storia (le altre omesse);
- una parte per stanza in ordine BFS dalla stanza di partenza (fra le stanze che raggiungono almeno 3/4
  delle stanze del pezzo, quella da cui partono piu' missioni di storia; partenza = medoide delle partenze
  originali degli STG JP in quella stanza); le stanze non raggiunte fanno un altro tour (zona «z1.2»...);
- un solo Shadow (bersaglio) nella stanza piu' lontana (passi), nel punto piu' lontano a piedi dall'ingresso
  e a >= 240 dalle uscite; niente forzieri.
Aggancio (coerente con il client, raggio di scatto 96, e con validate_maps.py, spazio libero 16 / aggancio 48):
le uscite originali stanno spesso sul bordo (pixel bloccato, libero entro ~45): si tiene il punto originale
se e' percorribile e aggancia una componente raggiunta entro 48, altrimenti si sposta sul pixel percorribile
piu' vicino (spazio libero > 16) di una componente raggiunta, al massimo 96 (oltre: porta irraggiungibile,
omessa). Le componenti raggiunte si calcolano a punto fisso dalla partenza seguendo le uscite attive e i salti
interni della stanza (_jmp.bin), come `validate_maps.py --jmp`. Arrivi a <= 120 da un'uscita della parte di destinazione: spostati nella stessa componente sul
punto piu' vicino a >= 140 da tutte le uscite. Freccia: solo controllo (40-80 prima dell'uscita, verso
l'interno, freccia_uscita.md), l'angolo originale non si cambia.

Uscite (fuori dal repo, non in stage_gen/files): <out>/mappoi_stg<id>.bin + _NN.bin, <out>/reports/<id>.json/.md,
<out>/tours.json (indice + righe per il master: make-game-tables.js KHUX_TOURS_V2), <out>/stage_poi_tours_v2.json
(nemici per server/game_data/stage_poi.json, da unire a mano), <out>/available_rooms.json (stanze usate come
disponibili: rilanciare con --available <lista finale di rooms_gen>).
stageId = base (992000) + indice del mondo * 100 + numero della zona (DB 1 ... ED 8, DG 9, CS 11, HD 12, NL 13,
SR 14, KG 15, SA 16): 992101.. ; id del master = stageId - 900000.
"""
import collections
import glob
import json
import math
import os
import re
import struct
import sys

import numpy as np
from scipy import ndimage, sparse
from scipy.sparse import csgraph

D = r'D:\Progetto_Restauro_KH_UX'
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # with python -I the script folder is not on sys.path
import private_tools  # noqa: E402  (local reference data folders, see private_tools.py)
CFG = {
    'schema': D + r'\reference\world_schema\schema_v2\schema_mondi.json',
    'graphs': D + r'\reference\world_schema\schema_v2\_graphs.json',
    'stages': private_tools.local_path('ref_work', 'schema_v2_work', 'stage_exits_v2.json'),
    'stg_dir': private_tools.local_path('jp_data', 'stage'),
    'rooms_dir': private_tools.local_path('ref_work', 'rooms_merged'),
    'template': D + r'\stage_gen\files\stage\mappoi_stg01040_00.bin',
    'enemies': os.path.join(REPO, 'server', 'master_data', 'enemy.json'),
    'out': D + r'\stage_gen\tours_v2',
    'available': None,
    'served_index': [D + r'\resource_data\names_v4.tsv', D + r'\ipa431\names_addnl.tsv'],
    'served_files': [D + r'\stage_gen\files'],
    'rooms_check': D + r'\stage_gen\rooms_check.json',
    'base': 992000,
    'worlds': None,
    'jumps': True,       # salti interni (_jmp.bin) fra componenti, come validate_maps.py --jmp
}
WIDX = {'DB': 1, 'DW': 2, 'WL': 3, 'AG': 4, 'OC': 5, 'BC': 6, 'CD': 7, 'ED': 8, 'DG': 9,
        'CS': 11, 'HD': 12, 'NL': 13, 'SR': 14, 'KG': 15, 'SA': 16}
STORY = {'storia_master', 'storia_oltre', 'storia_variante'}
TRIG = 96            # raggio di scatto dell'uscita nel client (createMapTransferInfo)
REACH_R, TOL = 16.0, 48      # come validate_maps.py
SNAP_MAX = 96        # spostamento massimo di un'uscita/arrivo per agganciarla alla zona percorribile
ARR_CLEAR = 120      # arrivo troppo vicino a un'uscita della parte di destinazione (validatore: 96)
ARR_MOVE = 140       # distanza minima dalle uscite dell'arrivo spostato
MIN_COMP = 1000      # componenti percorribili piu' piccole: ignorate per agganciare arrivi/partenza
KEEP_OUT = (240, 200, 160, 110)
CELL = 8

args = sys.argv[1:]


def _opt(name):
    if name in args:
        i = args.index(name)
        v = args[i + 1]
        del args[i:i + 2]
        return v
    return None


for k, v in (('available', _opt('--available')), ('worlds', _opt('--worlds')), ('out', _opt('--out'))):
    if v:
        CFG[k] = v.split(',') if k == 'worlds' else v
if args:
    CFG.update(json.load(open(args[0], encoding='utf-8-sig')))
OUT = CFG['out']
os.makedirs(os.path.join(OUT, 'reports'), exist_ok=True)
dd = lambda a, b: math.hypot(a[0] - b[0], a[1] - b[1])  # noqa: E731

schema = json.load(open(CFG['schema'], encoding='utf-8'))
graphs = json.load(open(CFG['graphs'], encoding='utf-8'))
DOORS, ROOMS = schema['doors'], schema['rooms']


# ---------------------------------------------------------------- stanze disponibili
def cls_path(room):
    for p in (os.path.join(CFG['rooms_dir'], room, room + '_cls.bin'),
              os.path.join(CFG['rooms_dir'], 'map', room, room + '_cls.bin')):
        if os.path.exists(p):
            return p
    return None


def default_available():
    served = set()
    for tsv in CFG['served_index']:
        if os.path.exists(tsv):
            for line in open(tsv, encoding='utf-8'):
                m = re.match(r'map/([A-Z]{2}_\d{4}_\d{2}_\d{2})/', line)
                if m:
                    served.add(m.group(1))
    for root in CFG['served_files']:
        mp = os.path.join(root, 'map')
        if os.path.isdir(mp):
            served |= {d for d in os.listdir(mp) if re.fullmatch(r'[A-Z]{2}_\d{4}_\d{2}_\d{2}', d)}
    incomplete = set()
    if CFG.get('rooms_check') and os.path.exists(CFG['rooms_check']):
        incomplete = set(json.load(open(CFG['rooms_check'], encoding='utf-8')).get('incomplete', []))
    man = json.load(open(os.path.join(CFG['rooms_dir'], '_manifest.json'), encoding='utf-8'))['rooms']
    merged = {r for r, v in man.items() if v.get('status') == 'completa'}
    avail = (served - incomplete) | merged
    return {'_doc': 'Stanze trattate come disponibili da gen_tours_v2.py: servite oggi (indici + stage_gen/files, '
                    'meno le incomplete di rooms_check.json) o complete in rooms_merged (_manifest.json status '
                    '"completa"). Rilanciare con --available <file> con la lista finale di rooms_gen.',
            'served': sorted(served - incomplete), 'served_incomplete': sorted(served & incomplete),
            'merged_complete': sorted(merged), 'available': sorted(avail)}


if CFG['available']:
    _a = json.load(open(CFG['available'], encoding='utf-8-sig'))
    AVAIL = set(_a['available'] if isinstance(_a, dict) else _a)
else:
    _a = default_available()
    json.dump(_a, open(os.path.join(OUT, 'available_rooms.json'), 'w', encoding='utf-8'), indent=1)
    AVAIL = set(_a['available'])
AVAIL = {r for r in AVAIL if cls_path(r)}


# ---------------------------------------------------------------- geometria della stanza
class Room:
    _cache = {}

    @classmethod
    def get(cls, code):
        if code not in cls._cache:
            if len(cls._cache) >= 30:
                del cls._cache[next(iter(cls._cache))]
            cls._cache[code] = Room(code)
        return cls._cache[code]

    def __init__(self, code):
        self.code = code
        c = open(cls_path(code), 'rb').read()
        W, H, stride = struct.unpack_from('<3i', c, 4)
        self.W, self.H = W, H
        bits = np.unpackbits(np.frombuffer(c, np.uint8, stride * H, 16).reshape(H, stride), axis=1)[:, :W]
        self.free = bits == 0
        self.lab = ndimage.label(ndimage.distance_transform_edt(self.free) > REACH_R)[0]
        self.size = np.bincount(self.lab.ravel())
        self._g = None
        self._jumps = None

    def jumps(self):
        """Coppie di componenti collegate dai salti interni (_jmp.bin: JMP, n, 0, 0, poi n record
        {cella CHP, k, k x (x1, y1, x2, y2, h)} di interi; gradini fra due livelli): si salta nei due versi."""
        if self._jumps is None:
            self._jumps = []
            p = cls_path(self.code).replace('_cls.bin', '_jmp.bin')
            if CFG.get('jumps') and os.path.exists(p):
                b = open(p, 'rb').read()
                o = 16
                for _ in range(struct.unpack_from('<i', b, 4)[0]):
                    k = struct.unpack_from('<i', b, o + 4)[0]
                    o += 8
                    for _ in range(k):
                        x1, y1, x2, y2 = struct.unpack_from('<4i', b, o)
                        o += 20
                        a, c = self.comp_at(x1, y1), self.comp_at(x2, y2)
                        if a and c and a != c:
                            self._jumps.append((a, c))
        return self._jumps

    def close(self, comps):
        """Componenti raggiunte + quelle raggiungibili con i salti."""
        comps = set(comps)
        changed = True
        while changed:
            changed = False
            for a, c in self.jumps():
                if (a in comps) != (c in comps):
                    comps |= {a, c}
                    changed = True
        return comps

    def walkable(self, x, y):
        return 0 <= x < self.W and 0 <= y < self.H and bool(self.free[y, x])

    def comp_at(self, x, y):
        """Come validate_maps.comp_at: componente del pixel etichettato piu' vicino entro TOL (0 = nessuna)."""
        x0, x1, y0, y1 = max(0, x - TOL), min(self.W, x + TOL + 1), max(0, y - TOL), min(self.H, y + TOL + 1)
        if x0 >= x1 or y0 >= y1:
            return 0
        win = self.lab[y0:y1, x0:x1]
        ys, xs = np.nonzero(win)
        if not len(xs):
            return 0
        d2 = (xs + x0 - x) ** 2 + (ys + y0 - y) ** 2
        k = int(np.argmin(d2))
        return int(win[ys[k], xs[k]]) if d2[k] <= TOL * TOL else 0

    def nearest(self, x, y, comps=None, rmax=SNAP_MAX, min_size=0):
        """(x, y, distanza, componente) del pixel etichettato piu' vicino entro rmax, nelle componenti
        `comps` (o in quelle con almeno min_size pixel); None se non c'e'."""
        x0, x1, y0, y1 = max(0, x - rmax), min(self.W, x + rmax + 1), max(0, y - rmax), min(self.H, y + rmax + 1)
        if x0 >= x1 or y0 >= y1:
            return None
        win = self.lab[y0:y1, x0:x1]
        if comps is not None:
            m = np.isin(win, list(comps))
        else:
            m = (win > 0) & (self.size[win] >= min_size)
        ys, xs = np.nonzero(m)
        if not len(xs):
            return None
        d2 = (xs + x0 - x) ** 2 + (ys + y0 - y) ** 2
        k = int(np.argmin(d2))
        if d2[k] > rmax * rmax:
            return None
        px, py = int(xs[k] + x0), int(ys[k] + y0)
        return px, py, math.sqrt(d2[k]), int(self.lab[py, px])

    def graph(self):
        """Celle da CELL della zona etichettata, 8-connesse (come validate_maps.detour)."""
        if self._g is None:
            m = self.lab[::CELL, ::CELL] > 0
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
            self._g = (m, idx, g)
        return self._g

    def walk_from(self, src):
        """Distanze a piedi (unita') da src su tutte le celle: (array h x w, inf = non raggiungibile)."""
        m, idx, g = self.graph()
        h_, w_ = m.shape
        x, y = min(w_ - 1, src[0] // CELL), min(h_ - 1, src[1] // CELL)
        r = TOL // CELL
        ys, xs = np.nonzero(m[max(0, y - r):y + r + 1, max(0, x - r):x + r + 1])
        out = np.full(m.shape, np.inf)
        if not len(xs):
            return out
        k = int(np.argmin((xs + max(0, x - r) - x) ** 2 + (ys + max(0, y - r) - y) ** 2))
        i = int(idx[ys[k] + max(0, y - r), xs[k] + max(0, x - r)])
        d = csgraph.dijkstra(g, directed=False, indices=i)
        out[m] = d[idx[m]] * CELL
        return out


# ---------------------------------------------------------------- dati originali
def mode_tie(values, key):
    c = collections.Counter(values)
    best = max(c.values())
    cand = [v for v in c if c[v] == best]
    return min(cand, key=key)


def chain_groups(pts, r=TRIG):
    """Gruppi a catena entro r (come lo schema per le porte)."""
    groups = []
    for p in pts:
        hit = [g for g in groups if any(dd(p[:2], q[:2]) <= r for q in g)]
        for g in hit:
            groups.remove(g)
        groups.append(sum(hit, []) + [p])
    return groups


def door_spec(did):
    """Uscita, angolo, arrivo e verso di una porta dalle sole missioni di storia (decisioni 13-10)."""
    d = DOORS[did]
    ms = [m for m in d['missions'] if m['type'] in STORY]
    sm = d.get('story_median') or {}
    if sm:
        x, y = sm['x'], sm['y']
    else:
        x, y = int(np.median([m['x'] for m in ms])), int(np.median([m['y'] for m in ms]))
    ang = mode_tie([m['angle'] for m in ms],
                   key=lambda a: min(dd((m['x'], m['y']), (x, y)) for m in ms if m['angle'] == a))
    arr = [(m['arrive'][0], m['arrive'][1], m) for m in ms]
    grp = max(chain_groups(arr), key=lambda g: (len(g), -min(q[0] for q in g)))
    ax, ay = int(np.median([q[0] for q in grp])), int(np.median([q[1] for q in grp]))
    face = mode_tie([q[2]['facing'] for q in grp], key=lambda f: (f != 0, f))
    return {'id': did, 'room': d['room'], 'dest': d['dest'], 'x': int(x), 'y': int(y), 'angle': int(ang),
            'angles': dict(collections.Counter(m['angle'] for m in ms)), 'ax': ax, 'ay': ay, 'facing': int(face),
            'n_story': len(ms), 'arrive_groups': len(chain_groups(arr)),
            'stages': sorted({m['stageId'] for m in ms})[:12]}


def stg_header(sid):
    base = os.path.join(CFG['stg_dir'], 'mappoi_stg%05d' % sid)
    cands = [base + '.bin'] + glob.glob(base + '.*.bin')
    cands = [c for c in cands if os.path.exists(c)]
    if not cands:
        return None
    cur = max(cands, key=lambda c: int(c.split('.')[-2]) if c.count('.') >= 2 and c.split('.')[-2].isdigit() else -1)
    b = open(cur, 'rb').read()
    return struct.unpack_from('<16i', b) if len(b) >= 64 and b[:4] == b'STG\0' else None


STARTS = collections.defaultdict(list)     # stanza -> [(x, y, stageId)] partenze delle missioni di storia
for st in json.load(open(CFG['stages'], encoding='utf-8'))['stages']:
    if st.get('stage_type') not in STORY:
        continue
    h = stg_header(st['stageId'])
    if not h:
        continue
    room = (st.get('rooms') or {}).get(str(h[2] >> 16))
    if room:
        STARTS[room].append((h[3], h[4], st['stageId']))

# ---------------------------------------------------------------- modello MAP (come gen_story_maps.py)
tmpl = open(CFG['template'], 'rb').read()
u32 = lambda b, o: struct.unpack_from('<i', b, o)[0]  # noqa: E731
TX = u32(tmpl, 0x24)
ARENA = bytes(tmpl[TX + 0x3c:TX + 0x3c + 0x44])
enemies = json.load(open(CFG['enemies'], encoding='utf-8'))
SHADOW = min(e['enemyId'] for e in enemies if e['name'].lower() == 'shadow' and 10000 <= e['enemyId'] < 20000)


def build_part(room, exits, target, uid):
    """Parte MAP (stesso formato di gen_story_maps.build_part_mr): uscite (9 int), un'area bersaglio con
    lo Shadow se target = (x, y, poligono), niente forzieri/oggetti. Ritorna (bytes, aree, nemici, uid)."""
    areas, ens = [], []
    if target:
        (tx, ty), poly = target
        rec = bytearray(ARENA)
        struct.pack_into('<2i', rec, 0, 0, 1)
        struct.pack_into('<i', rec, 0x14, uid)
        uid += 1
        struct.pack_into('<8i', rec, 0x24, *poly)
        areas.append(bytes(rec))
        ens.append((tx, ty, SHADOW, 1, 1, 1, 1, uid))
        uid += 1
    body = bytearray(tmpl[:0x34])
    nm = room.encode()
    body[0x0c:0x0c + 16] = nm + b'\0' * (16 - len(nm))
    body += struct.pack('<i', len(exits))
    for e in exits:
        body += struct.pack('<9i', *e)
    X = len(body) - 0x34
    body += struct.pack('<2i', len(areas), len(ens))
    struct.pack_into('<2i', body, 0x20, 0, X)
    for a in areas:
        body += a
    for e in ens:
        body += struct.pack('<8i', *e)
    A = len(body)
    body += struct.pack('<i', 0)
    B = len(body)
    body += struct.pack('<i', 0)
    C = len(body)
    body += b'\0' * 64
    struct.pack_into('<3i', body, 0x28, A - 0x34, B - 0x34, C - 0x34)
    return bytes(body), areas, ens, uid


# ---------------------------------------------------------------- zone
def story_doors(world):
    return [d for d in schema['worlds'][world].get('doors_story', [])
            if DOORS[d]['scope'] == 'storia' and DOORS[d]['dest'] and DOORS[d]['dest'][:2] == world
            and DOORS[d]['room'][:2] == world]


def components(nodes, edges):
    adj = collections.defaultdict(set)
    for a, b in edges:
        if a in nodes and b in nodes:
            adj[a].add(b)
            adj[b].add(a)
    seen, out = set(), []
    for n in sorted(nodes):
        if n in seen:
            continue
        comp, q = [], [n]
        seen.add(n)
        while q:
            c = q.pop()
            comp.append(c)
            for m in sorted(adj[c]):
                if m not in seen:
                    seen.add(m)
                    q.append(m)
        out.append(sorted(comp))
    return out


def zones_of(world):
    """[(etichetta, stanze)] dalle zone di _graphs.json o dalle componenti del grafo di storia."""
    zs = graphs.get(world, {}).get('zone_storia') or []
    if zs:
        return [(z['img'].replace('_grafo_storia_', ''), sorted(z['rooms'])) for z in zs]
    doors = story_doors(world)
    nodes = {DOORS[d]['room'] for d in doors} | {DOORS[d]['dest'] for d in doors}
    comps = sorted(components(nodes, [(DOORS[d]['room'], DOORS[d]['dest']) for d in doors]), key=lambda c: (-len(c), c))
    return [('c%d' % (i + 1), c) for i, c in enumerate(comps)]


def name_of(room):
    return (ROOMS.get(room) or {}).get('name') or room


# ---------------------------------------------------------------- un tour
POI = {}


def build_tour(world, zlabel, rooms, sid):
    rep = {'stageId': sid, 'world': world, 'zone': zlabel, 'omitted_doors': [], 'notes': [], 'excluded_rooms': []}
    zset = set(rooms)
    nodes = zset & AVAIL
    rep['excluded_rooms'] += [{'room': r, 'name': name_of(r), 'why': 'non disponibile'} for r in sorted(zset - nodes)]
    cand = []
    for did in story_doors(world):
        d = DOORS[did]
        if d['room'] not in nodes:
            continue
        if d['dest'] == d['room']:
            rep['omitted_doors'].append({'door': did, 'why': 'verso la stessa stanza (anello: nel tour una parte per '
                                                           'stanza, il passaggio vuole una parte diversa)'})
        elif d['dest'] not in zset:
            rep['omitted_doors'].append({'door': did, 'why': 'destinazione fuori zona'})
        elif d['dest'] not in nodes:
            rep['omitted_doors'].append({'door': did, 'why': 'destinazione non disponibile'})
        else:
            cand.append(door_spec(did))
    # stesse porte verso varianti diverse (<= 96 nella stessa stanza): una sola
    keep = []
    for r in sorted({c['room'] for c in cand}):
        for g in chain_groups([(c['x'], c['y'], c) for c in cand if c['room'] == r]):
            g = [q[2] for q in g]
            # piu' missioni di storia; a parita' la destinazione con il nome minore (stabile)
            best = min(g, key=lambda c: (-c['n_story'], c['dest'], c['id']))
            keep.append(best)
            for c in g:
                if c is not best:
                    rep['omitted_doors'].append({'door': c['id'], 'why': 'stessa porta (<= %d) di %s' % (TRIG, best['id'])})
    cand = keep
    return cand, nodes, rep


def start_point(room):
    """Partenza: medoide delle partenze originali (STG JP) nella stanza, agganciato; altrimenti il centro
    della componente percorribile piu' grande."""
    r = Room.get(room)
    sp = STARTS.get(room, [])
    if sp:
        med = min(sp, key=lambda p: sum(dd(p, q) for q in sp))
        n = r.nearest(med[0], med[1], min_size=MIN_COMP, rmax=200)
        if n:
            ok = r.walkable(*med[:2]) and r.comp_at(*med[:2]) == n[3]
            return (med[0], med[1]) if ok else (n[0], n[1]), \
                'medoide di %d partenze originali (stage %d)%s' % (len(sp), med[2], '' if ok else ', agganciato')
    c = int(np.argmax(r.size[1:])) + 1
    ys, xs = np.nonzero(r.lab == c)
    k = int(np.argmin((xs - xs.mean()) ** 2 + (ys - ys.mean()) ** 2))
    return (int(xs[k]), int(ys[k])), 'centro della componente piu\' grande'


def fixpoint(start_room, cand, notes):
    """Punto fisso della raggiungibilita' (come validate_maps.reach_check) dalla partenza seguendo le uscite:
    un'uscita e' attiva se il punto originale (o il pixel percorribile piu' vicino entro SNAP_MAX) sta in una
    componente gia' raggiunta della sua stanza; il suo arrivo raggiunge la componente della destinazione."""
    start, src = start_point(start_room)
    reached = collections.defaultdict(set)
    reached[start_room] = Room.get(start_room).close({Room.get(start_room).comp_at(*start)})
    active = {}
    changed = True
    while changed:
        changed = False
        for c in cand:
            if c['id'] in active or not reached[c['room']]:
                continue
            rk, rj = Room.get(c['room']), Room.get(c['dest'])
            if rk.walkable(c['x'], c['y']) and rk.comp_at(c['x'], c['y']) in reached[c['room']]:
                ex, sh = (c['x'], c['y']), 0.0
            else:
                n = rk.nearest(c['x'], c['y'], comps=reached[c['room']])
                if not n:
                    continue
                ex, sh = (n[0], n[1]), n[2]
            ca = rj.comp_at(c['ax'], c['ay'])
            if rj.walkable(c['ax'], c['ay']) and ca and rj.size[ca] >= MIN_COMP:
                ar, ash, acomp = (c['ax'], c['ay']), 0.0, ca
            else:
                n = rj.nearest(c['ax'], c['ay'], min_size=MIN_COMP)
                if not n:
                    if notes is not None and not any(n_.startswith(c['id'] + ': arrivo') for n_ in notes):
                        notes.append('%s: arrivo (%d,%d) senza zona percorribile entro %d' % (c['id'], c['ax'], c['ay'], SNAP_MAX))
                    continue
                ar, ash, acomp = (n[0], n[1]), n[2], n[3]
            active[c['id']] = dict(c, ex=ex, ex_shift=round(sh, 1), ar=ar, ar_shift=round(ash, 1), acomp=acomp)
            reached[c['dest']] = rj.close(reached[c['dest']] | {acomp})
            changed = True
    rooms = {start_room} | {a['dest'] for a in active.values()}
    return start, src, reached, active, rooms


def assemble(world, zlabel, part_rooms, cand, rep, sid):
    """Tour su un pezzo connesso: partenza, punto fisso della raggiungibilita', bersaglio, file."""
    R0 = set(part_rooms)
    cand = sorted([c for c in cand if c['room'] in R0 and c['dest'] in R0], key=lambda c: c['id'])
    # stanza di partenza: fra le stanze con piu' partenze di missioni di storia (fino a 6) e quelle che nel
    # grafo raggiungono piu' stanze, quella che col punto fisso raggiunge piu' stanze (poi piu' partenze)
    def graph_reach(s):
        seen, q_ = {s}, [s]
        while q_:
            c_ = q_.pop()
            for e in cand:
                if e['room'] == c_ and e['dest'] not in seen:
                    seen.add(e['dest'])
                    q_.append(e['dest'])
        return len(seen)
    gr = {r: graph_reach(r) for r in R0}
    pool = sorted(R0, key=lambda r: (-len(STARTS.get(r, [])), -gr[r], r))[:6]
    pool += [r for r in sorted(R0, key=lambda r: (-gr[r], r))[:3] if r not in pool]
    # il «centro» della zona (piu' partenze di storia) vince se raggiunge almeno 3/4 delle stanze del migliore;
    # le stanze che restano fuori fanno un tour a parte
    nreach = {r: len(fixpoint(r, cand, None)[4]) for r in pool}
    top = max(nreach.values())
    start_room = max(pool, key=lambda r: (nreach[r] >= 0.75 * top, len(STARTS.get(r, [])), nreach[r], gr[r], r))
    start, start_src, reached, active, got = fixpoint(start_room, cand, rep['notes'])
    rep['start_room'] = start_room
    rep['start_room_story_starts'] = len(STARTS.get(start_room, []))
    rep['start_candidates'] = pool
    # ordine BFS sulle uscite attive
    order, q = [start_room], collections.deque([start_room])
    while q:
        c = q.popleft()
        for a in sorted(active.values(), key=lambda a: a['id']):
            if a['room'] == c and a['dest'] not in order:
                order.append(a['dest'])
                q.append(a['dest'])
    rep['left_out'] = sorted(R0 - set(order))      # non raggiunte: tour a parte (main)
    for c in cand:
        if c['id'] not in active and c['room'] in order:
            n = Room.get(c['room']).nearest(c['x'], c['y'], min_size=MIN_COMP, rmax=400)
            info = ('zona percorribile piu\' vicina a %.0f, componente %d (%d pixel) non raggiunta' % (
                n[2], n[3], Room.get(c['room']).size[n[3]]) if n and n[3] not in reached[c['room']]
                else 'zona raggiunta a %.0f' % n[2] if n else 'nessuna zona percorribile entro 400')
            rep['omitted_doors'].append({'door': c['id'], 'why': 'uscita irraggiungibile nel giro (nessuna zona percorribile '
                                                                  'raggiunta entro %d dal punto originale): %s' % (SNAP_MAX, info)})
    idx = {r: k for k, r in enumerate(order)}
    R = len(order)
    rm = [Room.get(r) for r in order]
    reached = [reached[r] for r in order]
    active = {i: dict(a, k=idx[a['room']], j=idx[a['dest']]) for i, a in active.items()}
    exits = [[a for a in active.values() if a['k'] == k] for k in range(R)]
    for k in range(R):
        exits[k].sort(key=lambda a: a['id'])
    # uscite della stessa parte troppo vicine fra loro (destinazioni diverse dopo l'aggancio)
    for k in range(R):
        for i, a in enumerate(exits[k]):
            for b in exits[k][i + 1:]:
                if dd(a['ex'], b['ex']) <= TRIG:
                    rep['notes'].append('parte %d: uscite %s e %s a %.0f (<= %d)' % (k, a['id'], b['id'], dd(a['ex'], b['ex']), TRIG))
    # arrivi troppo vicini alle uscite della parte di destinazione
    for a in active.values():
        j = a['j']
        others = [b['ex'] for b in exits[j]]
        if others and min(dd(a['ar'], e) for e in others) <= ARR_CLEAR:
            r = rm[j]
            ys, xs = np.nonzero(r.lab == a['acomp'])
            ok = np.ones(len(xs), bool)
            for e in others:
                ok &= np.hypot(xs - e[0], ys - e[1]) >= ARR_MOVE
            if ok.any():
                kk = int(np.argmin(np.where(ok, (xs - a['ar'][0]) ** 2 + (ys - a['ar'][1]) ** 2, np.inf)))
                new = (int(xs[kk]), int(ys[kk]))
                rep['notes'].append('%s: arrivo (%d,%d) a %.0f da un\'uscita della parte %d -> (%d,%d) (%.0f dall\'originale)' % (
                    a['id'], a['ar'][0], a['ar'][1], min(dd(a['ar'], e) for e in others), j, new[0], new[1], dd(new, (a['ax'], a['ay']))))
                a['ar'], a['ar_moved'] = new, True
            else:
                rep['notes'].append('%s: arrivo vicino a un\'uscita e nessun punto libero a >= %d' % (a['id'], ARR_MOVE))
    # partenza lontana dalle uscite della parte 0
    if exits[0] and min(dd(start, a['ex']) for a in exits[0]) < 200:
        c0 = rm[0].comp_at(*start)
        ys, xs = np.nonzero(rm[0].lab == c0)
        ok = np.ones(len(xs), bool)
        for a in exits[0]:
            ok &= np.hypot(xs - a['ex'][0], ys - a['ex'][1]) >= 300
        if ok.any():
            kk = int(np.argmin(np.where(ok, (xs - start[0]) ** 2 + (ys - start[1]) ** 2, np.inf)))
            rep['notes'].append('partenza (%d,%d) a meno di 200 da un\'uscita -> (%d,%d)' % (start[0], start[1], xs[kk], ys[kk]))
            start = (int(xs[kk]), int(ys[kk]))
            start_src += ', spostata a >= 300 dalle uscite'
    # passi nel grafo e parte del bersaglio
    hops, q = {0: 0}, collections.deque([0])
    while q:
        c = q.popleft()
        for a in exits[c]:
            if a['j'] not in hops:
                hops[a['j']] = hops[c] + 1
                q.append(a['j'])
    tpart = max(range(R), key=lambda k: (hops.get(k, -1), -k))
    entry = start if tpart == 0 else next(a['ar'] for k in sorted(hops, key=hops.get) for a in exits[k] if a['j'] == tpart)
    r = rm[tpart]
    dist = r.walk_from(entry)
    m = r.graph()[0]
    cy, cx = np.nonzero(m & np.isin(r.lab[::CELL, ::CELL], list(reached[tpart])) & np.isfinite(dist))
    px, py = cx * CELL, cy * CELL
    tgt = None
    walk = r.free[np.minimum(py, r.H - 1), np.minimum(px, r.W - 1)]
    for ko in KEEP_OUT:
        ok = walk.copy()
        for a in exits[tpart]:
            ok &= np.hypot(px - a['ex'][0], py - a['ex'][1]) >= ko
        if ok.any():
            # il piu' lontano a piedi, ma senza «giro lungo» (validate_maps: > 1,5 volte la linea d'aria e > 800)
            # se possibile: camminando verso il bersaglio non si resta contro un muro
            wd = dist[cy, cx]
            straight = ok & ((wd <= 1.5 * np.hypot(px - entry[0], py - entry[1])) | (wd <= 800))
            if straight.any() and wd[straight].max() >= 0.5 * wd[ok].max():
                ok = straight
            kk = int(np.argmax(np.where(ok, wd, -1)))
            tgt = (int(px[kk]), int(py[kk]))
            rep['target_keepout'] = ko
            break
    if tgt is None:
        tgt = entry
        rep['notes'].append('bersaglio: nessun punto lontano dalle uscite, messo sull\'ingresso')
    poly = (tgt[0] + 120, tgt[1] - 40, tgt[0] + 120, tgt[1] + 40, tgt[0] - 120, tgt[1] + 40, tgt[0] - 120, tgt[1] - 40)
    # distanza residua [3] e campo [4] (1 + passi dalla destinazione al bersaglio)
    back, q = {tpart: 0}, collections.deque([tpart])
    while q:
        c = q.popleft()
        for k in range(R):
            if k not in back and any(a['j'] == c for a in exits[k]):
                back[k] = back[c] + 1
                q.append(k)
    memo = {}

    def cost(j, pt, depth=0):
        if j == tpart:
            return dd(pt, tgt)
        best = [a for a in exits[j] if back.get(a['j'], 99) < back.get(j, 99)]
        if not best or depth > 40:
            return 99999
        a = min(best, key=lambda a: dd(pt, a['ex']))
        if a['id'] not in memo:
            memo[a['id']] = cost(a['j'], a['ar'], depth + 1)
        return dd(pt, a['ex']) + memo[a['id']]
    parts, uid, tot_a, tot_e = [], 1, 0, 0
    rep_rooms = []
    poi = {'chests': [], 'enemies': []}
    for k in range(R):
        ex9 = [(a['ex'][0], a['ex'][1], a['angle'], int(min(99999, round(cost(a['j'], a['ar'])))),
                1 + back[a['j']] if a['j'] in back else 1, a['ar'][0], a['ar'][1], a['j'], a['facing'])
               for a in exits[k]]
        body, areas, ens, uid = build_part(order[k], ex9, (tgt, poly) if k == tpart else None, uid)
        parts.append(body)
        tot_a += len(areas)
        tot_e += len(ens)
        poi['enemies'] += [{'uid': e[7], 'enemyId': e[2], 'reward': e[6], 'map': k} for e in ens]
        rr = []
        for a, e9 in zip(exits[k], ex9):
            arrow = []
            for dist_ in (40, 60, 80):
                ax_ = int(a['ex'][0] - dist_ * math.sin(math.radians(a['angle'])))
                ay_ = int(a['ex'][1] + dist_ * math.cos(math.radians(a['angle'])))
                arrow.append([ax_, ay_, bool(rm[k].walkable(ax_, ay_))])
            if not all(p[2] for p in arrow):
                rep['notes'].append('parte %d, %s: freccia (40-80 prima dell\'uscita, angolo %d) su pixel bloccato a d=%s' % (
                    k, a['id'], a['angle'], [d_ for d_, p in zip((40, 60, 80), arrow) if not p[2]]))
            rr.append({'door': a['id'], 'to_part': a['j'], 'to': order[a['j']], 'to_name': name_of(order[a['j']]),
                       'exit_orig': [a['x'], a['y']], 'exit': list(a['ex']), 'exit_shift': a['ex_shift'],
                       'angle': a['angle'], 'angles_story': a['angles'], 'arrive_orig': [a['ax'], a['ay']],
                       'arrive': list(a['ar']), 'arrive_shift': round(dd(a['ar'], (a['ax'], a['ay'])), 1),
                       'arrive_groups': a['arrive_groups'], 'facing': a['facing'], 'n_story': a['n_story'],
                       'rem': e9[3], 'field4': e9[4], 'arrow_40_60_80': arrow, 'stages': a['stages']})
        rep_rooms.append({'part': k, 'room': order[k], 'name': name_of(order[k]), 'hops': hops.get(k),
                          'exits': rr})
    hdr = struct.pack('<16i', 4674643, 16, R, start[0], start[1], 2, SHADOW, 1, tot_a, tot_e, 0, 1, tpart, 0, 0, 0)
    rep.update(parts=R, rooms=rep_rooms, start=list(start), start_src=start_src, target_part=tpart,
               target_room=order[tpart], target=list(tgt), target_entry=list(entry), mapName=name_of(order[0]))
    return rep, hdr, parts, poi


def write_md(rep):
    L = ['# Tour %d - %s zona %s' % (rep['stageId'], rep['world'], rep['zone']), '',
         'Generato da `recon/tools/gen_tours_v2.py` (docs/notes/mappe_storia.md#tour-v2). Porte di storia dello '
         'schema v2; uscita = mediana di storia, angolo piu\' frequente, arrivo del gruppo principale.', '',
         '- Parti: %d; partenza %s (%s) in %s; bersaglio (Shadow) parte %d %s in %s' % (
             rep['parts'], rep['start'], rep['start_src'], rep['start_room'], rep['target_part'],
             rep['target_room'], rep['target']), '',
         '| parte | stanza | nome | passi | uscite |', '|---|---|---|---|---|']
    for r in rep['rooms']:
        L.append('| %d | %s | %s | %s | %d |' % (r['part'], r['room'], r['name'], r['hops'], len(r['exits'])))
    L += ['', '## Porte usate', '', '| parte | porta | -> parte | uscita (orig -> usata) | angolo (storia) | arrivo (orig -> usato) | verso | missioni |',
          '|---|---|---|---|---|---|---|---|']
    for r in rep['rooms']:
        for e in r['exits']:
            L.append('| %d | %s | %d %s | %s -> %s (%s) | %d %s | %s -> %s (%s) | %d | %d |' % (
                r['part'], e['door'], e['to_part'], e['to_name'], tuple(e['exit_orig']), tuple(e['exit']), e['exit_shift'],
                e['angle'], e['angles_story'], tuple(e['arrive_orig']), tuple(e['arrive']), e['arrive_shift'],
                e['facing'], e['n_story']))
    L += ['', '## Porte omesse', '']
    L += ['- `%s`: %s' % (o['door'], o['why']) for o in rep['omitted_doors']] or ['- nessuna']
    L += ['', '## Stanze escluse', '']
    L += ['- %s (%s): %s' % (x['room'], x['name'], x['why']) for x in rep['excluded_rooms']] or ['- nessuna']
    L += ['', '## Note', '']
    L += ['- ' + n for n in rep['notes']] or ['- nessuna']
    open(os.path.join(OUT, 'reports', '%d.md' % rep['stageId']), 'w', encoding='utf-8').write('\n'.join(L) + '\n')


tours, skipped = [], []
for f in os.listdir(OUT):
    if re.fullmatch(r'mappoi_stg99\d{4}(_\d+)?\.bin', f):
        os.remove(os.path.join(OUT, f))
for f in os.listdir(os.path.join(OUT, 'reports')):
    if re.fullmatch(r'99\d{4}\.(json|md)', f):
        os.remove(os.path.join(OUT, 'reports', f))
for world in schema['worlds']:
    if CFG['worlds'] and world not in CFG['worlds']:
        continue
    if not story_doors(world):
        continue
    zn = 0
    for zlabel, zrooms in zones_of(world):
        cand, nodes, rep0 = build_tour(world, zlabel, zrooms, 0)
        work = sorted(components(nodes, [(c['room'], c['dest']) for c in cand]), key=lambda p: (-len(p), p))
        pieces_done = 0
        while work:
            p = work.pop(0)
            if len(p) < 2:
                skipped.append({'world': world, 'zone': zlabel, 'room': p[0], 'name': name_of(p[0]),
                                'why': 'stanza disponibile senza porte di storia utilizzabili verso altre stanze '
                                       'disponibili della zona'})
                continue
            rep = json.loads(json.dumps(rep0))
            rep['zone_rooms'] = zrooms
            rep['omitted_doors'] = [o for o in rep['omitted_doors'] if DOORS[o['door']]['room'] in p]
            rep['excluded_rooms'] = rep['excluded_rooms'] if not pieces_done else []
            rep, hdr, parts, poi = assemble(world, zlabel, p, [c for c in cand if c['room'] in p], rep, 0)
            rest = sorted(set(rep['left_out']))
            if rest:
                sub = [c for c in cand if c['room'] in rest and c['dest'] in rest]
                work += sorted(components(set(rest), [(c['room'], c['dest']) for c in sub]), key=lambda p: (-len(p), p))
            if rep['parts'] < 2:
                skipped.append({'world': world, 'zone': zlabel, 'room': rep['start_room'], 'name': name_of(rep['start_room']),
                                'why': 'giro di una sola stanza (nessuna uscita attiva verso altre stanze)'})
                continue
            zn += 1
            pieces_done += 1
            sid = CFG['base'] + WIDX[world] * 100 + zn
            rep['stageId'] = sid
            rep['zone'] = zlabel if pieces_done == 1 else '%s.%d' % (zlabel, pieces_done)
            open(os.path.join(OUT, 'mappoi_stg%05d.bin' % sid), 'wb').write(hdr)
            for k, pb in enumerate(parts):
                open(os.path.join(OUT, 'mappoi_stg%05d_%02d.bin' % (sid, k)), 'wb').write(pb)
            POI[str(sid)] = poi
            json.dump(rep, open(os.path.join(OUT, 'reports', '%d.json' % sid), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
            write_md(rep)
            tours.append({'stageId': sid, 'id': sid - 900000, 'world': world, 'worldId': WIDX[world] if WIDX[world] <= 8 else 1,
                          'zone': rep['zone'], 'parts': rep['parts'], 'rooms': [r['room'] for r in rep['rooms']],
                          'start_room': rep['start_room'], 'mapName': rep['mapName'], 'target_room': rep['target_room'],
                          'thumbId': int(rep['start_room'][3:7]) * 10000 + int(rep['start_room'][8:10]) * 100 + int(rep['start_room'][11:13]),
                          'name': 'Tour %s%d %s' % (world, zn, rep['mapName']),
                          'doors': sum(len(r['exits']) for r in rep['rooms']), 'omitted': len(rep['omitted_doors']),
                          'notes': len(rep['notes'])})
            print('tour', sid, world, rep['zone'], rep['parts'], 'parti, bersaglio in', rep['target_room'],
                  '| porte', tours[-1]['doors'], '| omesse', tours[-1]['omitted'], '| note', tours[-1]['notes'])
json.dump({'_doc': 'Indice dei tour v2 (gen_tours_v2.py). Righe del master: make-game-tables.js con KHUX_TOURS_V2=<questo file>.',
           'tours': tours, 'single_rooms': skipped}, open(os.path.join(OUT, 'tours.json'), 'w', encoding='utf-8'),
          ensure_ascii=False, indent=1)
json.dump(POI, open(os.path.join(OUT, 'stage_poi_tours_v2.json'), 'w', encoding='utf-8'), separators=(',', ':'))
print('tour:', len(tours), '| parti:', sum(t['parts'] for t in tours), '| stanze singole saltate:', len(skipped))
