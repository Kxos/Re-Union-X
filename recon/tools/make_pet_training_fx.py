"""Spirit Training (I-082): risultato del trait e animazione del pet, assenti da ogni risorsa.

Scrive (chiamato da make_layouts.py, sezione pet):
- lwf/medal/Kakusei/Kakusei_Get1 e Kakusei_Get2: LWF NOSTRI;
- lwf/medal/Kakusei/Kakusei_Icon%04d: icona del trait (texture img/kakusei/Kakusei_Icon%04d
  copiata), attaccata dal client al movie «Kakusei_Icon»;
- cocostudio/publish/PetTraining_*.png: le vignette del fumetto di PetInfo_TrainingProduction
  (make_layouts.pet_training_production).

Cosa fa l'originale (video kTJoSgXii1E, reference\\pet\\pet_training_anim_*.png, NOTE.md §10) e
cosa si aspetta il client 4.3.1:
1. «Train» -> per ogni medaglia sotto c'e' MedalMixResultScene_ver320 (dettaglio della medaglia,
   Close nascosto), sopra PetInfo_TrainingProduction (azione Training_Anime) = fumetto bianco con
   quattro vignette inclinate (scacchi verde acqua, linee viola, fascia azzurra con stelle,
   selciato arancione) e il pet in ognuna. Fine azione o tocco.
2. Kakusei_Get1 al centro. Raggio bianco da sinistra, anello iridescente, lampo bianco, poi una
   pillola nera col bordo azzurro luminoso con icona e nome del trait in giallo che cambiano come
   una slot machine (~4 al secondo): il client sceglie a caso fra le righe shuffleskill dello
   stesso type con rate != 0, reagisce agli eventi LWF «tgtComment_<testo>» e «dispString_<n>»,
   scrive nome e valore nell'oggetto testo del LWF e attacca lwf/medal/Kakusei/Kakusei_Icon%04d
   nel movie «Kakusei_Icon». Senza oggetto testo nel LWF il client va in crash: serve un testo
   (font «_system» come i drama). Fine di _root (ultimo fotogramma) o tocco -> Get2.
3. Kakusei_Get2: mostra il trait ottenuto. Lampo sulla pillola, stelle gialle; STOP sull'ultimo
   fotogramma: resta visibile e compare «TAP SCREEN»: il trait resta leggibile prima del tocco.
4. Il tocco nasconde Get2: il trait entra nella riga Special Trait di MedalMixResultScene
   (armatura MedalInfo_Anim, dissolvenza) -> TAP SCREEN.
Prima i due LWF erano vuoti: niente roulette ne' trait, subito TAP SCREEN sul dettaglio e il trait
solo dopo il tocco (segnalazione utente 12-10).

Anche il Moogle Shop usa Kakusei_Get1/2 per i trait comprati (type 1): make-pet-tables.js da'
rate 100 ai trait normali perche' la lista della roulette non sia vuota.

    python -I recon/tools/make_pet_training_fx.py <uscita> <cartella layout estratti>"""
import math
import os
import random
import struct
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from make_pet_motions import (EVENT, FLAG, HEADER, SECTIONS, STOP, Lwf, btf8, draw, i32,  # noqa: E402
                              lerp, mat, pad4)
from make_kb_evolution_lwf import ramp  # noqa: E402

FPS = 30
TEXT = 5                    # objectData: tipo TEXT (MOVIE 2, BITMAP 3)
ICONS = (10, 20, 30, 40, 50, 60, 61, 70, 80, 90, 100)   # category dei trait = Kakusei_Icon%04d
TEXT_INST = 'text1'


class TextLwf(Lwf):
    """Lwf di make_pet_motions con colori, font, proprieta' del testo e oggetti testo (formato
    0x121010 come i drama originali, es. lwf/drama/2000001: font Â«_systemÂ», textProperty di 14
    int maxLength, fontId, fontHeight, align, leftMargin, rightMargin, letterSpacing, leading,
    strokeColorId, strokeWidth, shadowColorId, shadowOffsetX/Y, shadowBlur; text = 7 int matrixId
    (senza FLAG = translate), nameStringId, textPropertyId, stringId, colorId, larghezza, altezza)."""

    def __init__(self, name, size):
        super().__init__(name, size)
        self.colors, self.fonts, self.tprops, self.texts = [], [], [], []
        self.strings.add('')

    def color(self, rgba):
        self.colors.append(tuple(rgba))
        return len(self.colors) - 1

    def text(self, w, h, height, rgba, align=0, font='_system'):
        self.strings.add(font)
        if font not in self.fonts:
            self.fonts.append(font)
        self.tprops.append((0, self.fonts.index(font), height, align, 0, 0, 0, 2, -1, 0, -1, 0, 0, 0))
        self.texts.append((0, -1, len(self.tprops) - 1, '', self.color(rgba), w, h))
        self.objects.append((TEXT, len(self.texts) - 1))
        return len(self.objects) - 1

    def build(self, root_frames, root_depths):
        # stessa costruzione di Lwf.build piu' le sezioni color/font/textProperty/text
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
            'color': (b''.join(struct.pack('<4f', *c) for c in self.colors), len(self.colors)),
            'alphaTransform': (b''.join(struct.pack('<f', a) for a in self.alphas), len(self.alphas)),
            'objectData': (b''.join(struct.pack('<2i', *o) for o in self.objects), len(self.objects)),
            'texture': (b''.join(struct.pack('<4if', sid[f], 1, w, h, 1.0) for f, w, h in self.textures),
                        len(self.textures)),
            'textureFragment': (b''.join(struct.pack('<9i', sid[f], i, 0, 0, 0, 0, 0, w, h)
                                         for i, (f, w, h) in enumerate(self.textures)), len(self.textures)),
            'bitmap': (b''.join(i32(m) + struct.pack('<i', t) for m, t in self.bitmaps), len(self.bitmaps)),
            'font': (b''.join(struct.pack('<if', sid[f], 0.0) for f in self.fonts), len(self.fonts)),
            'textProperty': (b''.join(struct.pack('<14i', *p) for p in self.tprops), len(self.tprops)),
            'text': (b''.join(struct.pack('<7i', m, n, p, sid[s], c, w, h) for m, n, p, s, c, w, h in self.texts),
                     len(self.texts)),
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
        head += struct.pack('<6i', self.size[0], self.size[1], FPS, 0, sid[self.name], 0xffffff)
        head += b''.join(struct.pack('<2i', *s) for s in secs) + struct.pack('<i', total)
        assert len(head) == HEADER
        return head + body


# ---- texture degli effetti (funzioni su [-1, 1]^2 -> RGBA, premoltiplicate da draw)

def tex_beam(x, y):
    """raggio orizzontale bianco-azzurro: nucleo bianco largo (come pet_training_anim_07/08, ~1/12
    dell'altezza dello schermo), alone azzurro, coda che sfuma a sinistra, testa arrotondata."""
    core = min(1.0, math.exp(-(y * 2.6) ** 4) * 1.15)
    glow = math.exp(-(y * 1.5) ** 2) * 0.55
    tail = min(1.0, (x + 1) * 2.5)
    head = max(0.0, min(1.0, (1 - x) * 5 - abs(y) * 2.5))
    return lerp(0.7, 1.0, core), lerp(0.86, 1.0, core), 1.0, min(1.0, core + glow) * tail * head


def tex_ring(x, y):
    """anello iridescente (come la bolla del video)."""
    r = math.hypot(x, y)
    a = max(0.0, 1 - abs(r - 0.84) / 0.13) ** 1.2
    h = (math.atan2(y, x) / (2 * math.pi)) % 1.0
    rr = 0.6 + 0.4 * math.cos(2 * math.pi * h)
    gg = 0.6 + 0.4 * math.cos(2 * math.pi * (h - 1 / 3))
    bb = 0.6 + 0.4 * math.cos(2 * math.pi * (h - 2 / 3))
    return rr, gg, bb, a * 0.9


def tex_white(x, y):
    return 1.0, 1.0, 1.0, 1.0


def tex_star5(x, y):
    """stella gialla a 5 punte con bordo arancio e un po' di alone."""
    r = math.hypot(x, y)
    ang = math.atan2(-y, x) - math.pi / 2
    k = abs(((ang * 5 / (2 * math.pi)) % 1.0) - 0.5) * 2      # 1 sulle punte, 0 tra le punte
    edge = lerp(0.42, 0.92, k ** 2.2)
    inside = max(0.0, min(1.0, (edge - r) * 30))
    rim = max(0.0, min(1.0, (edge - r) * 12)) - inside
    glow = max(0.0, 1 - r) ** 3 * 0.35
    g = lerp(0.95, 0.75, r)
    return 1.0, g * inside + 0.6 * rim + 0.9 * glow, 0.25 * inside + 0.6 * glow, inside + rim * 0.9 + glow


PILL_W, PILL_H = 460, 50          # pillola (riferimento: 500x55 su 1280x720 -> scala 640/720)
PILL_PAD = 14                     # bagliore attorno


def _pill_sdf(px, py, w, h):
    r = h / 2
    qx = max(abs(px) - (w / 2 - r), 0.0)
    return math.hypot(qx, py) - r


def pill_pixels(glow_only=False):
    w, h = PILL_W + 2 * PILL_PAD, PILL_H + 2 * PILL_PAD
    out = bytearray()
    for yy in range(h):
        for xx in range(w):
            d = _pill_sdf(xx + 0.5 - w / 2, yy + 0.5 - h / 2, PILL_W, PILL_H)
            if glow_only:                                   # lampo bianco a forma di pillola
                a = max(0.0, min(1.0, 1 - d / PILL_PAD)) if d > 0 else 1.0
                c = (1.0, 1.0, 1.0)
            elif d <= -4:                                   # interno nero-blu
                a = 0.9
                t = (yy - PILL_PAD) / PILL_H
                c = (lerp(0.10, 0.02, t), lerp(0.13, 0.04, t), lerp(0.20, 0.08, t))
            elif d <= 0:                                    # bordo azzurro chiaro
                a = 1.0
                k = (d + 4) / 4
                c = (lerp(0.45, 0.85, k), lerp(0.80, 0.97, k), 1.0)
            else:                                           # alone azzurro
                a = max(0.0, 1 - d / PILL_PAD) ** 2 * 0.85
                c = (0.35, 0.7, 1.0)
            out += bytes(int(round(255 * ch * a)) for ch in c) + bytes([int(round(255 * a))])
    return w, h, bytes(out)


def _effect_textures(lw, name):
    files, objs = {}, {}
    spec = [('beam', 512, 96, tex_beam), ('ring', 192, 192, tex_ring), ('white', 8, 8, tex_white),
            ('star', 64, 64, tex_star5)]
    for key, w, h, fn in spec:
        fname = '%s_%s.png' % (name, key)
        files[fname] = btf8(w, h, draw(w, h, fn))
        objs[key] = lw.bitmap(fname, w, h, mat(-w / 2, -h / 2))
    for key, glow in (('pill', False), ('pillglow', True)):
        w, h, px = pill_pixels(glow)
        fname = '%s_%s.png' % (name, key)
        files[fname] = btf8(w, h, px)
        objs[key] = lw.bitmap(fname, w, h, mat(-w / 2, -h / 2))
    return files, objs


# posizioni nella pillola (origine = centro dello schermo, y verso il basso come nei LWF)
ICON_X, ICON_SIZE = -PILL_W / 2 + 30, 40.0
TEXT_X, TEXT_Y, TEXT_W, TEXT_H = -PILL_W / 2 + 60, -15, 380, 30
YELLOW = (1.0, 0.92, 0.25, 1.0)


def _pill_layers(lw, objs, icon_scale):
    """movie Kakusei_Icon (istanza cercata dal client) e testo text1 (TextRenderer)."""
    objs['icon'] = lw.movie('Kakusei_Icon')
    lw.instance('Kakusei_Icon')
    objs['text'] = lw.text(TEXT_W, TEXT_H, 22, YELLOW)
    lw.instance(TEXT_INST)
    return {'icon': mat(ICON_X, 0, 0, icon_scale, icon_scale), 'text': mat(TEXT_X, TEXT_Y)}


def _frames(lw, objs, order, n, layer_fn, inst, events):
    places, frames = {}, []
    for f in range(n):
        ctrls = []
        for d, key in enumerate(order):
            m, a = layer_fn(f, key)
            mid, aid = lw.matrix(m), lw.alpha(max(0.0, min(1.0, a)))
            if f == 0:
                places[key] = lw.place(d, objs[key], inst.get(key), mid)
                ctrls.append(places[key] if not aid else lw.move(places[key], mid, aid))
            else:
                ctrls.append(lw.move(places[key], mid, aid))
        ops = [(EVENT, ev) for ev in events.get(f, [])]
        if f == n - 1:
            ops.append((STOP, None))
        if ops:
            ctrls.append(lw.anim(ops))
        frames.append(ctrls)
    return lw.build(frames, len(order))


# ---- Kakusei_Get1: raggio, anello, lampo, poi la roulette nella pillola

# Tempi dal foglio pet_training_anim_00_sheet (4 fps): velo bianco residuo del fumetto, raggio da
# sinistra (~1 s, anim_07), anello iridescente sulla testa del raggio (anim_08), lampo bianco a
# tutto schermo (~0,5 s), poi la roulette (~2 s). Prima il lampo arrivava a 1 s e al banco
# raggio/anello quasi non si vedevano.
G1_FLASH = 44              # picco del lampo: la pillola appare sotto il bianco
G1_N = G1_FLASH + 66       # 3,7 s
G1_TICKS = list(range(G1_FLASH + 6, G1_N - 2, 7))     # ~4 nomi al secondo


def build_get1(icon_scale):
    name = 'Kakusei_Get1'
    lw = TextLwf(name, (1136, 640))
    files, objs = _effect_textures(lw, name)
    pos = _pill_layers(lw, objs, icon_scale)
    order = ['beam', 'ring', 'pill', 'icon', 'text', 'white']
    inst = {'icon': 'Kakusei_Icon', 'text': TEXT_INST}
    fl = G1_FLASH

    def layer(f, key):
        if key == 'beam':          # entra da sinistra e si allunga fin oltre il centro
            x = ramp(f, 0, fl - 10, -720, -90)
            return mat(x, 0, 0, ramp(f, 0, fl - 10, 0.8, 2.5), ramp(f, 0, 6, 0.5, 1.0)), \
                ramp(f, 0, 3, 0, 1) - ramp(f, fl - 4, fl + 1, 0, 1)
        if key == 'ring':          # bolla iridescente che si allarga sulla testa del raggio
            s = ramp(f, 10, fl, 0.6, 2.7)
            return mat(40, 0, 0, s, s), ramp(f, 10, 14, 0, 1) - ramp(f, fl - 6, fl + 1, 0, 1)
        if key == 'white':         # velo residuo del fumetto, poi lampo a tutto schermo
            veil = 0.55 * (1 - ramp(f, 0, 8, 0, 1))
            return mat(0, 0, 0, 190, 110), veil + ramp(f, fl - 8, fl, 0, 1) - ramp(f, fl + 3, fl + 16, 0, 1)
        if key in ('pill', 'icon', 'text'):
            s = ramp(f, fl - 2, fl + 6, 0.85, 1.0)
            base = {'pill': mat(), 'icon': pos['icon'], 'text': pos['text']}[key]
            return _scaled(base, s), (ramp(f, fl - 4, fl, 0, 1) if key == 'pill' else 1.0)
        raise KeyError(key)

    events = {fl + 1: ['tgtComment_' + TEXT_INST]}
    for t in G1_TICKS:
        events.setdefault(t, []).append('dispString_1')
    return _frames(lw, objs, order, G1_N, layer, inst, events), files


# ---- Kakusei_Get2: il trait ottenuto, lampo sulla pillola e stelle; resta sull'ultimo fotogramma

G2_N = 45                  # 1,5 s
STARS = [(-200, -40, 14, 0.9), (-120, 30, 20, 0.7), (-40, -45, 9, 1.1), (60, 38, 16, 0.8),
         (150, -42, 12, 1.0), (215, 30, 22, 0.75), (-230, 34, 18, 0.6), (100, -50, 6, 0.85)]


def build_get2(icon_scale):
    name = 'Kakusei_Get2'
    lw = TextLwf(name, (1136, 640))
    files, objs = _effect_textures(lw, name)
    pos = _pill_layers(lw, objs, icon_scale)
    star_tex = [t[0] for t in lw.textures].index('%s_star.png' % name)
    order = ['ring', 'pill', 'icon', 'text', 'pillglow']
    for i in range(len(STARS)):          # una bitmap per stella sulla stessa texture
        lw.bitmaps.append((lw.matrix(mat(-32, -32)), star_tex))
        lw.objects.append((3, len(lw.bitmaps) - 1))
        objs['star%d' % i] = len(lw.objects) - 1
        order.append('star%d' % i)
    inst = {'icon': 'Kakusei_Icon', 'text': TEXT_INST}

    def layer(f, key):
        if key == 'ring':
            s = ramp(f, 0, 14, 0.6, 2.6)
            return mat(0, 0, 0, s * 1.6, s * 0.5), ramp(f, 0, 2, 0, 0.8) - ramp(f, 4, 14, 0, 0.8)
        if key in ('pill', 'icon', 'text'):
            s = 1.0 + ramp(f, 2, 5, 0, 0.08) - ramp(f, 5, 10, 0, 0.08)
            base = {'pill': mat(), 'icon': pos['icon'], 'text': pos['text']}[key]
            return _scaled(base, s), 1.0
        if key == 'pillglow':
            return mat(), 1.0 - ramp(f, 2, 12, 0, 1)
        i = int(key[4:])
        x, y, d, sz = STARS[i]
        t0 = 3 + d // 3
        k = ramp(f, t0, t0 + 18, 0, 1)
        sc = sz * (ramp(f, t0, t0 + 4, 0.2, 1.0) - ramp(f, t0 + 14, t0 + 22, 0, 0.6))
        dx, dy = x * 0.25 * k, y * 0.6 * k
        return mat(x + dx, y + dy, 140 * k, sc, sc), ramp(f, t0, t0 + 2, 0, 1) - ramp(f, t0 + 16, t0 + 26, 0, 1)

    events = {0: ['tgtComment_' + TEXT_INST], 2: ['dispString_1']}
    return _frames(lw, objs, order, G2_N, layer, inst, events), files


def _scaled(m, s):
    """matrice m ingrandita di s attorno all'origine (centro della pillola)."""
    return (m[0] * s, m[1] * s, m[2] * s, m[3] * s, m[4] * s, m[5] * s)


# ---- icone dei trait: lwf/medal/Kakusei/Kakusei_Icon%04d con la texture originale

def btf_size(blob):
    cw, ch, ox, oy, w, h = struct.unpack_from('<6H', blob, 0x16)
    return (cw or w, ch or h)


def build_icon(n, blob):
    name = 'Kakusei_Icon%04d' % n
    w, h = btf_size(blob)
    lw = Lwf(name, (w, h))
    fname = name + '.png'                       # comincia col nome del LWF
    obj = lw.bitmap(fname, w, h, mat(-w / 2, -h / 2))
    p = lw.place(0, obj, None, lw.matrix(mat()))
    return name, lw.build([[p, lw.anim([(STOP, None)])]], 1), {fname: blob}


def _write(out, name, data, files):
    d = os.path.join(out, 'lwf', 'medal', 'Kakusei', name)
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, name + '.lwf'), 'wb') as fh:
        fh.write(data)
    for fname, blob in files.items():
        with open(os.path.join(d, fname), 'wb') as fh:
            fh.write(blob)


def write_kakusei(out, src):
    """Kakusei_Get1/2 e le icone; src = cartella dei layout estratti (contiene img/kakusei)."""
    sizes = []
    for n in ICONS:
        p = os.path.join(src, 'img', 'kakusei', 'Kakusei_Icon%04d.png' % n)
        if not os.path.exists(p):
            continue
        blob = open(p, 'rb').read()
        sizes.append(btf_size(blob)[0])
        _write(out, *build_icon(n, blob))
    icon_scale = ICON_SIZE / (max(sizes) if sizes else ICON_SIZE)
    _write(out, 'Kakusei_Get1', *build_get1(icon_scale))
    _write(out, 'Kakusei_Get2', *build_get2(icon_scale))
    return len(sizes)


# ---- vignette del fumetto (PetInfo_TrainingProduction), texture in cocostudio/publish
#
# Poligoni misurati su pet_training_anim_05 (1280x720 = schermo 16:9 intero) e riportati sul
# layout 960x640. Il client adatta il layout all'altezza (1080/640 = 1,6875 sul banco 1920x1080)
# e lo centra in larghezza: lo schermo 16:9 e' x -88..1048 del layout (1136x640, come lo stage
# dei LWF Kakusei). Quindi x' = x * 8/9 - 88, y' = y * 8/9 dall'alto. (Prima x * 0,75, y * 0,75
# + 50: vignette rimpicciolite e raccolte in alto, segnalazione utente 12-10.)
REF_K, REF_X0 = 640 / 720, -(1136 - 960) / 2


def ref_to_layout(x, y):
    """punto del riferimento 1280x720 -> layout 960x640 (y dall'alto)."""
    return x * REF_K + REF_X0, y * REF_K


def _layout_pts(pts):
    return [ref_to_layout(x, y) for x, y in pts]


PANELS = {
    # nome: poligono (riferimento 1280x720, y verso il basso)
    'Panel1': [(100, 25), (620, 25), (540, 312), (100, 395)],
    'Panel2': [(645, 25), (1180, 25), (1180, 188), (565, 305)],
    # fascia azzurra da bordo a bordo (prolungata oltre lo schermo per i rapporti piu' larghi):
    # bordo alto (0, 452) -> (1280, 210), basso (0, 505) -> (1280, 590)
    'Panel3': [(-140, 478), (1420, 184), (1420, 599), (-140, 496)],
    'Panel4': [(100, 548), (1180, 622), (1180, 692), (100, 692)],
}


def panel_geometry(name):
    """(x0, y0 dall'alto, w, h, punti relativi) della vignetta nel layout 960x640."""
    pts = _layout_pts(PANELS[name])
    x0, y0 = min(p[0] for p in pts), min(p[1] for p in pts)
    x1, y1 = max(p[0] for p in pts), max(p[1] for p in pts)
    w, h = int(math.ceil(x1 - x0)) + 2, int(math.ceil(y1 - y0)) + 2
    return x0 - 1, y0 - 1, w, h, [(x - x0 + 1, y - y0 + 1) for x, y in pts]


def _premul(im):
    raw, px = im.tobytes(), bytearray()
    for i in range(0, len(raw), 4):
        r, g, b, a = raw[i:i + 4]
        px += bytes((r * a // 255, g * a // 255, b * a // 255, a))
    return bytes(px)


def _pattern(name, w, h):
    from PIL import Image, ImageDraw
    im = Image.new('RGBA', (w, h))
    dr = ImageDraw.Draw(im)
    rnd = random.Random(7)
    if name == 'Panel1':          # scacchi a rombi verde acqua
        dr.rectangle((0, 0, w, h), fill=(52, 150, 142, 255))
        s, r = 62, 31             # rombi chiari che si toccano agli angoli = scacchiera a 45 gradi
        for i in range(-1, w // s + 2):
            for j in range(-1, h // s + 2):
                cx, cy = i * s, j * s
                dr.polygon([(cx, cy - r), (cx + r, cy), (cx, cy + r), (cx - r, cy)], fill=(88, 190, 178, 255))
    elif name == 'Panel2':        # linee di velocita' bianche su viola
        dr.rectangle((0, 0, w, h), fill=(78, 52, 205, 255))
        cx, cy = -60, h * 0.55
        for k in range(46):
            a = rnd.uniform(-0.55, 0.55)
            r0, r1 = rnd.uniform(80, 260), rnd.uniform(w * 0.8, w * 1.3)
            wd = rnd.uniform(0.002, 0.008)
            p = [(cx + r0 * math.cos(a), cy + r0 * math.sin(a)),
                 (cx + r1 * math.cos(a - wd), cy + r1 * math.sin(a - wd)),
                 (cx + r1 * math.cos(a + wd), cy + r1 * math.sin(a + wd))]
            dr.polygon(p, fill=(235, 235, 255, 255))
    elif name == 'Panel3':        # fascia azzurra con raggi chiari e stelle
        for y in range(h):
            t = y / max(1, h - 1)
            dr.line((0, y, w, y), fill=(int(lerp(120, 70, t)), int(lerp(200, 160, t)), int(lerp(245, 230, t)), 255))
        cx, cy = w * 0.62, h * 0.45
        for k in range(18):
            a = k * math.pi / 9 + 0.1
            p = [(cx, cy), (cx + 1400 * math.cos(a - 0.05), cy + 1400 * math.sin(a - 0.05)),
                 (cx + 1400 * math.cos(a + 0.05), cy + 1400 * math.sin(a + 0.05))]
            dr.polygon(p, fill=(150, 215, 250, 255))
        for sx, sy, r in ((0.16, 0.62, 40), (0.85, 0.35, 85), (0.4, 0.78, 30), (0.95, 0.8, 36)):
            pts = []
            for i in range(10):
                rr = r if i % 2 == 0 else r * 0.45
                a = -math.pi / 2 + i * math.pi / 5
                pts.append((sx * w + rr * math.cos(a), sy * h + rr * math.sin(a)))
            dr.polygon(pts, outline=(205, 235, 255, 255), width=3)
    else:                         # selciato arancione con una stella azzurra
        dr.rectangle((0, 0, w, h), fill=(205, 140, 70, 255))
        s = 34
        for j in range(-1, h // s + 2):
            for i in range(-1, w // s + 2):
                x = i * s + (s // 2 if j % 2 else 0) + rnd.randint(-4, 4)
                y = j * s + rnd.randint(-3, 3)
                c = rnd.randint(-18, 14)
                dr.rounded_rectangle((x + 2, y + 2, x + s - 3, y + s - 3), radius=6,
                                     fill=(min(255, 238 + c), min(255, 196 + c), max(0, 128 + c), 255))
        cx, cy, r = w * 0.45, h * 0.6, h * 0.7
        pts = [(cx + (r if i % 2 == 0 else r * 0.45) * math.cos(-math.pi / 2 + i * math.pi / 5),
                cy + (r if i % 2 == 0 else r * 0.45) * math.sin(-math.pi / 2 + i * math.pi / 5)) for i in range(10)]
        dr.polygon(pts, outline=(90, 130, 220, 255), width=5)
    return im


# Ritaglio del pet nelle vignette:
# - il pet (scala s = scaleX di «%d_parameter») e' disegnato in una RenderTexture grande quanto la
#   texture di «Pet» (moltiplicata per k), poi la texture di «Pet» ci viene disegnata sopra con
# blend {GL_ZERO, GL_ONE_MINUS_SRC_ALPHA} (0, 0x303): dove la maschera e' OPACA il
#   pet si CANCELLA. La maschera quindi e' bianca FUORI dalla vignetta e trasparente dentro (prima
#   era il contrario: al banco il pet si vedeva solo fuori dalle vignette, nei triangoli bianchi);
# - k = min(max(1, GLView scaleX), |3,9 / s|) (3,9; scaleX = 1080/640 sul banco);
# - origine (piedi) del pet nella maschera, unita' del layout dall'angolo in basso a sinistra,
#   y in su: (hx + k * px, -hy + k * py) con (px, py) = posizione di «%d_parameter» e (hx, hy) =
# testa del pet (head_sp + pet_center = (-9, -24) + (-8,1, -13,85) della parte
# 001/face_sp, y del LWF in giu'); per 2Pet il codice somma anche altezza_testa * s (pet,
#   dalla tabella master 0xb: assente = 0);
# - il ritaglio e' centrato sulla posizione di Pet (e Pet_Shadow), cioe' sul centro della vignetta.
PET_HEAD = (-17.1, -37.85)        # testa del pet a riposo (LWF, y in giu')
PET_SCALE_CAP = 3.9               #
GLVIEW_SCALE = 1080 / 640         # banco 1920x1080


def pet_parameter(scale, foot_x, foot_y, glview=GLVIEW_SCALE):
    """posizione di «%d_parameter» per avere i piedi del pet in (foot_x, foot_y) della maschera
    (unita' del layout dall'angolo in basso a sinistra). Con s >= 3,9 / glview k non dipende dallo
    schermo (k = 3,9 / s)."""
    k = min(max(1.0, glview), abs(PET_SCALE_CAP / scale))
    hx, hy = PET_HEAD[0], -PET_HEAD[1]
    return round((foot_x - hx) / k, 1), round((foot_y + hy) / k, 1)


def pet_feet_for_head(scale, head_x, head_y):
    """piedi del pet che mettono la testa (pet_center) in (head_x, head_y), y in su."""
    return head_x - PET_HEAD[0] * scale, head_y + PET_HEAD[1] * scale


def panel_textures():
    """{nome file: blob BTF} delle vignette (sfondo con bordo nero) e delle maschere (bianco
    FUORI dalla vignetta e sul bordo, trasparente dentro: vedi sopra, il pet si cancella dove la
    maschera e' opaca)."""
    from PIL import Image, ImageDraw
    files = {}
    for name in PANELS:
        x0, y0, w, h, pts = panel_geometry(name)
        mask = Image.new('L', (w, h), 0)
        ImageDraw.Draw(mask).polygon(pts, fill=255)
        bg = _pattern(name, w, h)
        bg.putalpha(mask)
        ImageDraw.Draw(bg).line(pts + [pts[0]], fill=(20, 20, 24, 255), width=6)
        files['PetTraining_%s.png' % name] = btf8(w, h, _premul(bg))
        if name != 'Panel4':
            hole = Image.new('L', (w, h), 255)
            dr = ImageDraw.Draw(hole)
            dr.polygon(pts, fill=0)
            dr.line(pts + [pts[0]], fill=255, width=8)      # il bordo nero resta sopra il pet
            white = Image.new('RGBA', (w, h), (255, 255, 255, 255))
            white.putalpha(hole)
            files['PetTraining_%sMask.png' % name] = btf8(w, h, _premul(white))
    return files


def write_panels(out):
    d = os.path.join(out, 'cocostudio', 'publish')
    os.makedirs(d, exist_ok=True)
    files = panel_textures()
    for fname, blob in files.items():
        with open(os.path.join(d, fname), 'wb') as fh:
            fh.write(blob)
    return sorted(files)


TEXTURE_NAMES = sorted(['PetTraining_%s.png' % n for n in PANELS] +
                       ['PetTraining_%sMask.png' % n for n in PANELS if n != 'Panel4'])


def write_all(out, src):
    n = write_kakusei(out, src)
    return n, write_panels(out)


if __name__ == '__main__':
    icons, tex = write_all(sys.argv[1], sys.argv[2])
    print('Kakusei_Get1/2 + %d icone, %d texture del fumetto' % (icons, len(tex)))
