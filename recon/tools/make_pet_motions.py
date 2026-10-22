"""Animazioni del pet (lwf/pet/motion/<nome>/<nome>.lwf) ed effetti dei suoi colpi
(lwf/ability/hit_effect/pet_eff_000N), assenti da ogni risorsa: LWF NOSTRI, scritti da zero
(nessun byte degli originali). I movimenti sono scheletri che muovono le parti del pet gia'
servite (lwf/pet/part/001, 9 parti); gli effetti hanno texture disegnate qui.

Perche' (ISSUES I-005, docs/notes/home_profilo.md#pet): con userDetail.isPet 1 la battaglia mostra
il pet e lo anima con questi LWF.

Cosa si aspetta il client:
- il LWF del movimento non contiene grafica: il client cerca i movie con questi NOMI DI ISTANZA
  (ac_mask, ac_hat1-4, ear_front1_am, ear_front2_am, ear_back_am, face_sp, ac_necklace1-3,
  left_front_leg, left_back_leg, right_front_leg, right_back_leg, bag_front, bag_back, body_main,
  tail_front, tail_back, ac_special, ac_mouth) e al loro «load» vi attacca il LWF della parte
  lwf/pet/part/%03d/<nome>/<nome>.lwf con %03d = id della parte % 1000 (se < 400000);
- l'id viene dal coordinato del pet (pet.userPetCoordinate di /pet/profile): accessoryMask
  (ac_mask), accessoryHat (ac_hat1-4), earPartsId (ear_*), facePartsId (face_sp),
  accessoryNecklace (ac_necklace1-3), legPartsId (4 zampe), accessoryBackpack (bag_*), bodyPartsId
  (body_main), tailPartsId (tail_*), accessorySpecial, accessoryMouth. Con 0 il percorso e'
  .../000/..., assente.
- altri movie: body_sp (facoltativo), spt_shadow (ombra), pet_center (dentro face_sp),
  <parte>_top, spirit. head_sp invece e' obbligatorio non appena si carica face_sp (vedi HEAD
  sotto: senza, crash della home nel ritratto del pet).
- il pet guarda come l'avatar: le parti 001 guardano a sinistra, quindi «avanti» = -x.

Quindi qui ogni movimento e' una radice con head_sp + 9 movie vuoti chiamati come le parti di 001
(nessun movie per le parti che non esistono: niente load, niente file mancanti), con le matrici
di una piccola posa per fotogramma. Il server deve mandare earPartsId, facePartsId, legPartsId,
bodyPartsId e tailPartsId = 1 (server/pet.js); con 0 il pet resta invisibile come prima.

Eventi: il pet cambia stato solo sull'evento LWF «end»; i movimenti in ciclo (wait, bwait, walk,
run, win, waitb, rolling1/2, training*) non hanno «end». Nel turno del 6° slot con un attacco
singolo o su tutti il pet gioca battle_normal / battle_all e l'avatar resta fermo; con uno
speciale l'avatar fa la sua speciale anche nel turno del pet, come nell'originale
(reference\\pet\\pet_battle_0*.png). Il danno del pet parte dagli eventi del suo LWF come per
l'avatar (atk2: «knockback_2» + «effectStart_1» nello stesso fotogramma): «effectStart» apre
lwf/ability/hit_effect/pet_eff_%04d (codice dell'effetto - 10; 0xb battle_normal, 0xc battle_all,
0xd battle_skill); se il file manca il client va in crash.

Formato 0x121010 come gli originali (lwf/avatar/motion/atk2, lwf/pet/part/001/*): stringhe,
nomi di istanza, eventi e linkage in ordine alfabetico; place = (profondita', oggetto|1<<31,
istanza, matrice); matrici con il bit 31 (tabella matrix); alpha senza bit (alphaTransform);
ogni fotogramma elenca tutti gli oggetti (PLACE al primo, MOVEM/MOVEMC dopo).

    python -I recon/tools/make_pet_motions.py <uscita> (es. stage_gen\\files)

Lo chiama anche make_layouts.py (dopo i LWF vuoti), quindi build-resources.ps1 lo include."""
import math
import os
import struct
import sys
import zlib

# indice -> nome
MOTIONS = ['wait', 'bwait', 'walk', 'run', 'jump', 'win', 'wait_accent', 'battle_normal', 'battle_all',
           'deathblow_normal', 'deathblow_normal_after', 'battle_skill', 'recovery_skill', 'jump2',
           'deathblow_normal2', 'deathblow_normal_after2', 'jump3', 'waitb', 'rolling1', 'rolling2',
           'rolling3', 'pvp_start', 'pvp_turn_win', 'pvp_turn_lose', 'pvp_total_win', 'pvp_total_lose',
           'pvp_total_draw', 'training1', 'training2', 'training3']
# quelli di cui gestisce la fine (casi 4, 6, 7-0x10, 0x14-0x1a)
WITH_END = {4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 20, 21, 22, 23, 24, 25, 26}
# colpi: contraccolpo e colpo nello stesso fotogramma e ordine dell'avatar (atk2)
HIT = ['knockback_2', 'effectStart_1']
WITH_HIT = {7, 8, 11}   # battle_normal, battle_all, battle_skill
# effetti del colpo del pet (pet_eff_%04d, codice 0xb-0xd - 10)
PET_EFFECTS = ['pet_eff_%04d' % i for i in (1, 2, 3)]

# sezioni dell'intestazione del formato 0x121010 (ordine verificato sugli originali)
SECTIONS = ['stringBytes', 'animationBytes', 'translate', 'matrix', 'color', 'alphaTransform',
            'colorTransform', 'objectData', 'texture', 'textureFragment', 'bitmap', 'bitmapEx', 'font',
            'textProperty', 'text', 'particleDatabase', 'particle', 'programObject', 'graphicObject',
            'graphic', 'animation', 'buttonCondition', 'button', 'label', 'instanceName', 'eventName',
            'place', 'controlMoveM', 'controlMoveC', 'controlMoveMC', 'control', 'frame',
            'movieClipEvent', 'movie', 'movieLinkage', 'stringData']
HEADER = 0x20 + 8 * len(SECTIONS) + 4
FLAG = 0x80000000
EVENT, STOP = 8, 2
MOVE, MOVEM, MOVEMC, ANIMATION = 0, 1, 3, 4
BITMAP, MOVIE = 3, 2


def pad4(b):
    return b + b'\0' * (-len(b) % 4)


def i32(v):
    return struct.pack('<i', v - (1 << 32) if v >= 1 << 31 else v)


class Lwf:
    """Costruttore minimo di LWF 0x121010. Movie 0 = _root, 1 = _empty."""

    def __init__(self, name, size=(640, 640)):
        self.name, self.size = name, size
        self.strings = {'_empty', '_root', name}
        self.matrices, self.alphas = [], [1.0]       # alphaTransform 0 = identita'
        self.textures, self.bitmaps = [], []          # (file, w, h), (matrice, texture)
        self.movies = [None, {'link': '_empty', 'frames': [[]], 'depths': 0}]
        self.objects = [(MOVIE, 0), (MOVIE, 1)]
        self.instances = ['_root']
        self.places, self.movem, self.movemc = [], [], []
        self.anims = []                               # [(op, nome evento|None)]
        self.events = []

    def matrix(self, m):
        m = tuple(round(v, 4) for v in m)
        if m not in self.matrices:
            self.matrices.append(m)
        return FLAG | self.matrices.index(m)

    def alpha(self, a):
        a = round(a, 3)
        if a >= 1.0:
            return 0
        if a not in self.alphas:
            self.alphas.append(a)
        return self.alphas.index(a)

    def movie(self, link, depths=0, frames=None):
        self.strings.add(link)
        self.movies.append({'link': link, 'frames': frames or [[]], 'depths': depths})
        self.objects.append((MOVIE, len(self.movies) - 1))
        return len(self.objects) - 1

    def bitmap(self, fname, w, h, m):
        self.strings.add(fname)
        self.textures.append((fname, w, h))
        self.bitmaps.append((self.matrix(m), len(self.textures) - 1))
        self.objects.append((BITMAP, len(self.bitmaps) - 1))
        return len(self.objects) - 1

    def instance(self, n):
        self.strings.add(n)
        if n not in self.instances:
            self.instances.append(n)
        return n

    def place(self, depth, obj, inst, mid):
        self.places.append((depth, obj, inst, mid))
        return (MOVE, len(self.places) - 1)

    def move(self, place_ctrl, mid, aid=0):
        pid = place_ctrl[1]
        if aid:
            self.movemc.append((pid, mid, aid))
            return (MOVEMC, len(self.movemc) - 1)
        self.movem.append((pid, mid))
        return (MOVEM, len(self.movem) - 1)

    def anim(self, ops):
        for op, ev in ops:
            if ev:
                self.strings.add(ev)
                if ev not in self.events:
                    self.events.append(ev)
        self.anims.append(ops)
        return (ANIMATION, len(self.anims) - 1)

    def build(self, root_frames, root_depths):
        self.movies[0] = {'link': '_root', 'frames': root_frames, 'depths': root_depths}
        strings = sorted(self.strings)
        sid = {s: i for i, s in enumerate(strings)}
        insts = sorted(self.instances)
        iid = {s: i for i, s in enumerate(insts)}
        events = sorted(self.events)
        sbytes, sdata = b'', []
        for s in strings:
            sdata.append((len(sbytes), len(s.encode())))
            sbytes += s.encode() + b'\0'
        abytes, anims = b'', []
        for ops in self.anims:
            chunk = b''.join(bytes([op]) + (struct.pack('<i', events.index(ev)) if ev else b'')
                             for op, ev in ops) + b'\0'
            anims.append((len(abytes), len(chunk)))
            abytes += chunk
        controls, frames, movies = [], [], []
        for mv in self.movies:
            off = len(frames)
            for fr in mv['frames']:
                frames.append((len(controls), len(fr)))
                controls.extend(fr)
            movies.append((mv['depths'], 0, 0, off, len(mv['frames']), 0, 0))
        links = sorted((mv['link'], i) for i, mv in enumerate(self.movies))
        places = [(d, FLAG | o, iid[n] if n else -1, m) for d, o, n, m in self.places]
        data = {
            'stringBytes': (pad4(sbytes), len(pad4(sbytes))),
            'animationBytes': (pad4(abytes), len(pad4(abytes))),
            'translate': (struct.pack('<2f', 0, 0), 1),
            'matrix': (b''.join(struct.pack('<6f', *m) for m in self.matrices), len(self.matrices)),
            'alphaTransform': (b''.join(struct.pack('<f', a) for a in self.alphas), len(self.alphas)),
            'objectData': (b''.join(struct.pack('<2i', *o) for o in self.objects), len(self.objects)),
            'texture': (b''.join(struct.pack('<4if', sid[f], 1, w, h, 1.0) for f, w, h in self.textures),
                        len(self.textures)),
            'textureFragment': (b''.join(struct.pack('<9i', sid[f], i, 0, 0, 0, 0, 0, w, h)
                                         for i, (f, w, h) in enumerate(self.textures)), len(self.textures)),
            'bitmap': (b''.join(i32(m) + struct.pack('<i', t) for m, t in self.bitmaps), len(self.bitmaps)),
            'animation': (b''.join(struct.pack('<2i', *a) for a in anims), len(anims)),
            'instanceName': (b''.join(struct.pack('<i', sid[s]) for s in insts), len(insts)),
            'eventName': (b''.join(struct.pack('<i', sid[s]) for s in events), len(events)),
            'place': (b''.join(struct.pack('<i', d) + i32(o) + struct.pack('<i', n) + i32(m)
                               for d, o, n, m in places), len(places)),
            'controlMoveM': (b''.join(struct.pack('<i', p) + i32(m) for p, m in self.movem), len(self.movem)),
            'controlMoveMC': (b''.join(struct.pack('<i', p) + i32(m) + struct.pack('<i', a)
                                       for p, m, a in self.movemc), len(self.movemc)),
            'control': (b''.join(struct.pack('<2i', *c) for c in controls), len(controls)),
            'frame': (b''.join(struct.pack('<2i', *f) for f in frames), len(frames)),
            'movie': (b''.join(struct.pack('<7i', *m) for m in movies), len(movies)),
            'movieLinkage': (b''.join(struct.pack('<2i', sid[n], i) for n, i in links), len(links)),
            'stringData': (b''.join(struct.pack('<2i', *s) for s in sdata), len(sdata)),
        }
        body, secs = b'', []
        for n in SECTIONS:
            blob, count = data.get(n, (b'', 0))
            secs.append((HEADER + len(body), count))
            body += blob
        total = HEADER + len(body)
        head = b'LWF\0' + bytes([0x12, 0x10, 0x10, 0])
        head += struct.pack('<6i', self.size[0], self.size[1], 30, 0, sid[self.name], 0xffffff)
        head += b''.join(struct.pack('<2i', *s) for s in secs) + struct.pack('<i', total)
        assert len(head) == HEADER
        return head + body


# ---- matrici (scaleX, scaleY, skew0, skew1, tx, ty): x' = sx*x + k0*y + tx; y' = k1*x + sy*y + ty

def mat(tx=0.0, ty=0.0, rot=0.0, sx=1.0, sy=1.0):
    c, s = math.cos(math.radians(rot)), math.sin(math.radians(rot))
    return (c * sx, c * sy, -s * sy, s * sx, tx, ty)


def mul(a, b):
    return (a[0] * b[0] + a[2] * b[3], a[3] * b[2] + a[1] * b[1],
            a[0] * b[2] + a[2] * b[1], a[3] * b[0] + a[1] * b[3],
            a[0] * b[4] + a[2] * b[5] + a[4], a[3] * b[4] + a[1] * b[5] + a[5])


# ---- il pet: 9 parti di lwf/pet/part/001 (origine = attacco della parte; y in giu'; muso a -x)
# ordine = profondita' (dietro -> davanti); (x, y) dell'origine della parte in posa di riposo
RIG = [('tail_back', 13, -16), ('ear_back_am', -23, -47), ('right_back_leg', 10, -14),
       ('right_front_leg', -10, -14), ('body_main', 6, -11), ('left_back_leg', 6, -15),
       ('left_front_leg', -15, -15), ('face_sp', -9, -24), ('ear_front1_am', -9, -48)]
CENTER = (-2, -24)          # perno del corpo per rotazioni e schiacciamenti
# movie vuoto obbligatorio appena il muso c'e': il «load» di face_sp registra «pet_center» sulla
# parte (pet) e il ritratto del pet
# (icona della home) chiede la testa, che controlla solo e
# poi legge/getY (movie) di head_sp («load» di un
# movie chiamato head_sp): senza head_sp e' NULL -> SIGSEGV a 0xf0 in home
# (banco 11-10 notte, crash dopo /system/push/regist). Testa = head_sp + pet_center.
HEAD = 'head_sp'
LEGS = {'right_back_leg', 'right_front_leg', 'left_back_leg', 'left_front_leg'}


def pose(dx=0.0, dy=0.0, rot=0.0, sx=1.0, sy=1.0, legs=0.0, tail=0.0, ears=0.0, head=0.0):
    """Matrici delle 9 parti: spostamento/rotazione/scala del corpo intero attorno a CENTER (con i
    piedi fermi a terra se sy cambia), zampe che oscillano di `legs` gradi (coppie opposte),
    coda, orecchie e testa ruotate attorno al loro attacco."""
    cx, cy = CENTER
    squash = mul(mat(dx + cx, dy), mul(mat(0, 0, 0, sx, sy), mat(-cx, 0)))   # piedi a terra
    body = mul(squash, mul(mat(cx, cy, rot), mat(-cx, -cy)))
    out = []
    for name, x, y in RIG:
        r = 0.0
        if name in LEGS:
            r = legs if name in ('left_front_leg', 'right_back_leg') else -legs
        elif name == 'tail_back':
            r = tail
        elif name.startswith('ear'):
            r = ears + head
        elif name == 'face_sp':
            r = head
        local = mat(x, y, r)
        if name.startswith('ear'):          # le orecchie seguono la testa
            hx, hy = -9, -24
            local = mul(mat(hx, hy, head), mul(mat(x - hx, y - hy), mat(0, 0, ears)))
        out.append((name, mul(body, local)))
    return out


def lerp(a, b, t):
    return a + (b - a) * t


def ease(t):
    return 0.5 - 0.5 * math.cos(math.pi * t)


def keys(n, ks):
    """ks = [(fotogramma, dict di pose)]: interpolazione morbida tra le chiavi."""
    out = []
    for f in range(n):
        for (f0, k0), (f1, k1) in zip(ks, ks[1:]):
            if f0 <= f <= f1:
                t = ease((f - f0) / max(1, f1 - f0))
                p = {k: lerp(k0.get(k, 0.0 if k not in ('sx', 'sy') else 1.0),
                             k1.get(k, 0.0 if k not in ('sx', 'sy') else 1.0), t)
                     for k in set(k0) | set(k1)}
                out.append(p)
                break
        else:
            out.append(dict(ks[-1][1]))
    return out


def loop(n, fn):
    return [fn(2 * math.pi * f / n) for f in range(n)]


# movimenti: lista di pose per fotogramma + fotogramma del colpo (o None)
def motion(name):
    # training1/2: pet nelle vignette del fumetto dello Spirit Training (fermo, respira);
    # training3: il pet intero (4Pet) che corre nella fascia azzurra -> come run
    if name in ('wait', 'bwait', 'waitb', 'training1', 'training2', 'wait_accent'):
        n = 30 if name != 'wait_accent' else 20
        return loop(n, lambda a: dict(sy=1 + 0.03 * math.sin(a), sx=1 - 0.015 * math.sin(a),
                                      tail=8 * math.sin(a), ears=3 * math.sin(a + 1))), None
    if name in ('walk', 'run', 'training3'):
        n = 16 if name == 'walk' else 10
        return loop(n, lambda a: dict(dy=-2.5 * abs(math.sin(a)), legs=25 * math.sin(a),
                                      tail=10 * math.sin(a), rot=2 * math.sin(a))), None
    if name in ('rolling1', 'rolling2', 'rolling3'):
        n = 16
        return [dict(dy=-10 * math.sin(math.pi * f / n), rot=-360.0 * f / n, legs=0) for f in range(n)], None
    if name in ('jump', 'jump2', 'jump3', 'recovery_skill', 'pvp_start', 'pvp_turn_win', 'win',
                'pvp_total_win', 'deathblow_normal_after', 'deathblow_normal_after2'):
        return keys(16, [(0, dict()), (3, dict(sy=0.85, sx=1.1)), (5, dict(dy=-12, sy=1.08, sx=0.95, legs=20)),
                         (9, dict(dy=-26, legs=30, tail=20, ears=-8)), (13, dict(dy=0, sy=0.9, sx=1.08)),
                         (15, dict())]), None
    if name in ('pvp_turn_lose', 'pvp_total_lose', 'pvp_total_draw'):
        return keys(16, [(0, dict()), (6, dict(sy=0.9, head=12, ears=15, tail=-15)), (15, dict(head=8, ears=10))]), None
    if name in ('battle_normal', 'deathblow_normal', 'deathblow_normal2'):
        # carica, balzo in avanti (-x) con capocciata, rimbalzo indietro, atterraggio
        return keys(24, [(0, dict()), (4, dict(sy=0.82, sx=1.12, dx=6, head=-6, ears=10)),
                         (8, dict(dx=-50, dy=-22, rot=-15, legs=35, tail=25, ears=-10)),
                         (10, dict(dx=-80, dy=-8, rot=-20, sx=1.1, sy=0.92, legs=40, head=-10)),
                         (14, dict(dx=-40, dy=-24, rot=10, legs=-20, tail=-10)),
                         (19, dict(dx=0, dy=0, sy=0.9, sx=1.08)), (23, dict())]), 10
    if name == 'battle_all':
        # salto alto con giro su se stesso e tonfo (colpo a tutti)
        return keys(26, [(0, dict()), (4, dict(sy=0.8, sx=1.15)), (8, dict(dy=-40, rot=-180, legs=30, tail=20)),
                         (12, dict(dy=-30, rot=-360, legs=30)), (14, dict(dy=0, rot=-360, sy=0.78, sx=1.2)),
                         (19, dict(rot=-360, dy=-6)), (25, dict(rot=-360))]), 14
    if name == 'battle_skill':
        # Blast: rannicchiato (bagliore nel video originale), scatto lungo, ritorno
        return keys(28, [(0, dict()), (6, dict(sy=0.75, sx=1.15, rot=8, dx=8, head=-8, ears=15)),
                         (10, dict(dx=-95, dy=-10, rot=-25, sx=1.15, sy=0.9, legs=45, tail=30)),
                         (12, dict(dx=-110, dy=-6, rot=-25, legs=45)),
                         (18, dict(dx=-50, dy=-30, rot=-200, legs=10)), (23, dict(dx=0, dy=0, rot=-360, sy=0.88)),
                         (27, dict(rot=-360))]), 12
    return [dict()], None


def build_motion(i, name):
    poses, hit = motion(name)
    if i in WITH_HIT and hit is None:
        hit = len(poses) // 2
    if i not in WITH_HIT:
        hit = None
    lw = Lwf(name)
    objs = {pn: lw.movie(pn) for pn in [HEAD] + [pn for pn, _, _ in RIG]}
    for pn in objs:
        lw.instance(pn)
    places, frames = {}, []
    for f, p in enumerate(poses):
        ctrls = []
        parts = pose(**p)
        # head_sp a profondita' 0 (si carica prima di face_sp e del suo pet_center), stessa
        # matrice del muso
        for d, (pn, m) in enumerate([(HEAD, dict(parts)['face_sp'])] + parts):
            mid = lw.matrix(m)
            if f == 0:
                places[pn] = lw.place(d, objs[pn], pn, mid)
                ctrls.append(places[pn])
            else:
                ctrls.append(lw.move(places[pn], mid))
        ops = []
        if f == hit:
            ops += [(EVENT, e) for e in HIT]
        if i in WITH_END and f == len(poses) - 1:
            ops += [(STOP, None), (EVENT, 'end_1')]
        if ops:
            ctrls.append(lw.anim(ops))
        frames.append(ctrls)
    return lw.build(frames, len(RIG) + 1)


# ---- effetti d'impatto del pet: texture disegnate qui (RGBA premoltiplicato, BTF tipo 8)

def btf8(w, h, px):
    """px = bytes RGBA premoltiplicati w*h*4 -> BTF tipo 8 (stessa intestazione di btf.encode)."""
    z = zlib.compress(px, 9)
    head = b'\x89BTF' + bytes([0, 0, 1, 0]) + bytes(8) + bytes([8, 0, 0, 0, 0, 0])
    head += struct.pack('<6HI', w, h, 0, 0, w, h, len(z))
    return head + z


def draw(w, h, fn):
    out = bytearray()
    for y in range(h):
        for x in range(w):
            r, g, b, a = fn((x + 0.5 - w / 2) / (w / 2), (y + 0.5 - h / 2) / (h / 2))
            a = max(0.0, min(1.0, a))
            out += bytes(int(round(255 * max(0.0, min(1.0, c)) * a)) for c in (r, g, b)) + bytes([int(round(255 * a))])
    return bytes(out)


def tex_star(col):
    """stella a 4 punte con alone (scintilla), colore col al bordo e bianco al centro."""
    def fn(x, y):
        r = math.hypot(x, y)
        ang = math.atan2(y, x)
        spike = 0.18 + 0.82 * abs(math.cos(2 * ang)) ** 10
        core = max(0.0, 1 - r / spike)
        glow = max(0.0, 1 - r) ** 2 * 0.55
        a = min(1.0, core * 1.6 + glow)
        t = min(1.0, r / max(spike, 0.2))
        return lerp(1, col[0], t), lerp(1, col[1], t), lerp(1, col[2], t), a
    return fn


def tex_ring(col):
    def fn(x, y):
        r = math.hypot(x, y)
        a = max(0.0, 1 - abs(r - 0.8) / 0.16) ** 1.5
        return lerp(1, col[0], 0.5), lerp(1, col[1], 0.5), lerp(1, col[2], 0.5), a
    return fn


def tex_slash(col):
    def fn(x, y):
        a = max(0.0, 1 - abs(y) / (0.85 * (1 - x * x) + 0.05)) * max(0.0, 1 - abs(x)) ** 0.5
        return lerp(1, col[0], abs(y)), lerp(1, col[1], abs(y)), lerp(1, col[2], abs(y)), a * 1.3
    return fn


GOLD, PINK, CYAN = (1.0, 0.82, 0.25), (1.0, 0.45, 0.75), (0.45, 0.85, 1.0)
# (texture: nome, w, h, disegno), tracce: (texture, [(fotogramma, scala, rot, alpha)...])
EFFECTS = {
    'pet_eff_0001': ([('star', 64, 64, tex_star(GOLD)), ('slash', 128, 32, tex_slash(PINK))],
                     [('slash', [(0, 0.4, -20, 1), (3, 1.4, -20, 1), (8, 1.6, -20, 0)]),
                      ('star', [(0, 0.3, 0, 1), (3, 1.3, 45, 1), (10, 0.6, 90, 0)])]),
    'pet_eff_0002': ([('star', 64, 64, tex_star(PINK)), ('ring', 96, 96, tex_ring(CYAN))],
                     [('ring', [(0, 0.2, 0, 1), (6, 1.6, 0, 0.8), (12, 2.0, 0, 0)]),
                      ('star', [(0, 0.4, 0, 1), (4, 1.6, 30, 1), (12, 0.8, 90, 0)])]),
    'pet_eff_0003': ([('star', 64, 64, tex_star(GOLD)), ('ring', 96, 96, tex_ring(GOLD)),
                      ('slash', 128, 32, tex_slash(GOLD))],
                     [('ring', [(0, 0.3, 0, 1), (7, 2.0, 0, 0.7), (14, 2.4, 0, 0)]),
                      ('slash', [(0, 0.5, 0, 1), (4, 1.8, 0, 1), (10, 2.0, 0, 0)]),
                      ('star', [(0, 0.5, 0, 1), (4, 2.0, 45, 1), (14, 0.8, 120, 0)])]),
}


def track(keyframes, f):
    for (f0, *a), (f1, *b) in zip(keyframes, keyframes[1:]):
        if f0 <= f <= f1:
            t = (f - f0) / max(1, f1 - f0)
            return [lerp(x, y, t) for x, y in zip(a, b)]
    return list(keyframes[-1][1:])


def build_effect(name):
    texs, tracks = EFFECTS[name]
    lw = Lwf(name, (256, 256))
    files, objs = {}, {}
    for key, w, h, fn in texs:
        fname = '%s_%s.png' % (name, key)     # comincia col nome del LWF: file servito omonimo
        files[fname] = btf8(w, h, draw(w, h, fn))
        objs[key] = lw.bitmap(fname, w, h, mat(-w / 2, -h / 2))
    n = max(k[-1][0] for _, k in tracks) + 1
    frames, places = [], {}
    for f in range(n):
        ctrls = []
        for d, (key, kf) in enumerate(tracks):
            s, r, a = track(kf, f)
            mid, aid = lw.matrix(mat(0, 0, r, s, s)), lw.alpha(a)
            if f == 0:
                places[key] = lw.place(d, objs[key], None, mid)
                ctrls.append(places[key] if not aid else lw.move(places[key], mid, aid))
            else:
                ctrls.append(lw.move(places[key], mid, aid))
        frames.append(ctrls)
    return lw.build(frames, len(tracks)), files


def write_all(out):
    n = 0
    for i, name in enumerate(MOTIONS):
        d = os.path.join(out, 'lwf', 'pet', 'motion', name)
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, name + '.lwf'), 'wb') as fh:
            fh.write(build_motion(i, name))
        n += 1
    for name in PET_EFFECTS:
        d = os.path.join(out, 'lwf', 'ability', 'hit_effect', name)
        os.makedirs(d, exist_ok=True)
        data, files = build_effect(name)
        with open(os.path.join(d, name + '.lwf'), 'wb') as fh:
            fh.write(data)
        for fname, blob in files.items():
            with open(os.path.join(d, fname), 'wb') as fh:
                fh.write(blob)
        n += 1
    return n


def pose_frames(name):
    """Per l'anteprima: [(parte, matrice)] per fotogramma."""
    return [pose(**p) for p in motion(name)[0]]


if __name__ == '__main__':
    print('pet: %d LWF (30 movimenti con le 9 parti di 001, %d con «end», %d con il colpo; '
          '%d effetti pet_eff)' % (write_all(sys.argv[1]), len(WITH_END), len(WITH_HIT), len(PET_EFFECTS)))
