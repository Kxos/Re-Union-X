"""RIPIEGO, non piu' usato dal 19-10: le animazioni della guilt servite sono gli originali JP 4.3.1
(GuiltBonus, _result, _max, cifre Yfix/Rfix) importati da import_jp_raisedraw.py (raisedraw_gen).

Animazione dello sblocco/rilancio della guilt (SP Attack Bonus) nel Level Up
(lwf/medal/guilt_bonus/GuiltBonus/GuiltBonus.lwf), assente da ogni risorsa: LWF NOSTRO, scritto
da zero con le texture disegnate qui (I-079, banco gu_23: crash dopo la risposta).

Cosa si aspetta il client 4.3.1: dopo il risultato del Level Up con una guilt nuova carica questo
LWF (se manca va in crash) sopra la schermata, al centro della medaglia, e va avanti quando il
movie «_root» arriva all'ultimo fotogramma (stesso schema di KeyBlade_Evolution,
make_kb_evolution_lwf.py). Quindi: bagliore viola, raggi, lampo, anello e stella dorati; STOP
sull'ultimo fotogramma.

    python -I recon/tools/make_guilt_bonus_lwf.py <uscita> (es. stage_gen\\files)"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from make_pet_motions import STOP, Lwf, btf8, draw, lerp, mat  # noqa: E402
from make_kb_evolution_lwf import ramp, tex_ring, tex_star  # noqa: E402

NAME = 'GuiltBonus'
FPS = 30
N = 48                      # 1,6 s


def tex_aura(x, y):
    r = math.hypot(x, y)
    a = max(0.0, 1 - r) ** 2
    return lerp(0.95, 0.55, r), lerp(0.6, 0.15, r), 1.0, a


def tex_rays(x, y):
    r = math.hypot(x, y)
    ang = math.atan2(y, x)
    spoke = (0.5 + 0.5 * math.cos(10 * ang)) ** 8
    a = spoke * max(0.0, 1 - r) ** 1.2 * min(1.0, r * 6)
    return 0.85, 0.55, 1.0, a * 0.9


TEXTURES = [('aura', 256, 256, tex_aura), ('rays', 256, 256, tex_rays),
            ('star', 128, 128, tex_star), ('ring', 192, 192, tex_ring)]
ORDER = ['aura', 'rays', 'ring', 'star']   # dietro -> davanti


def tracks(f):
    """(scala, rotazione, alpha) di ogni strato al fotogramma f."""
    t = f / FPS
    peak = 14                                    # picco del lampo
    out = ramp(f, N - 14, N - 1, 0.0, 1.0)       # dissolvenza finale
    return {
        'aura': (ramp(f, 0, peak, 0.6, 1.6) + 0.05 * math.sin(t * 6), 0.0,
                 ramp(f, 0, 8, 0.0, 0.8) - out * 0.8),
        'rays': (ramp(f, 0, peak + 10, 0.8, 1.9), 40.0 * t,
                 ramp(f, 2, peak, 0.0, 0.7) - out * 0.7),
        'ring': (ramp(f, peak, peak + 16, 0.3, 2.2), 0.0,
                 ramp(f, peak, peak + 2, 0.0, 0.9) - ramp(f, peak + 4, peak + 16, 0.0, 0.9)),
        'star': (ramp(f, peak - 6, peak, 0.3, 2.6) - ramp(f, peak, peak + 12, 0, 1.4), 120.0 * t,
                 ramp(f, peak - 6, peak - 1, 0.0, 1.0) - out),
    }


def build():
    lw = Lwf(NAME, (1136, 640))
    files, objs = {}, {}
    for key, w, h, fn in TEXTURES:
        fname = '%s_%s.png' % (NAME, key)     # comincia col nome del LWF, come gli altri LWF serviti
        files[fname] = btf8(w, h, draw(w, h, fn))
        objs[key] = lw.bitmap(fname, w, h, mat(-w / 2, -h / 2))
    places, frames = {}, []
    for f in range(N):
        tr = tracks(f)
        ctrls = []
        for d, key in enumerate(ORDER):
            s, r, a = tr[key]
            mid, aid = lw.matrix(mat(0, 0, r, s, s)), lw.alpha(max(0.0, min(1.0, a)))   # aid 0 = opaco
            if f == 0:
                places[key] = lw.place(d, objs[key], None, mid)
                ctrls.append(places[key] if not aid else lw.move(places[key], mid, aid))
            else:
                ctrls.append(lw.move(places[key], mid, aid))
        if f == N - 1:
            ctrls.append(lw.anim([(STOP, None)]))
        frames.append(ctrls)
    return lw.build(frames, len(ORDER)), files


# Risultato del rilancio (dopo la risposta del Level Up con una guilt nuova):
#  lwf/medal/guilt_bonus/GuiltBonus_result/GuiltBonus_result.lwf (NULL = crash, banco gu_58) con
#  Â«enterFrameÂ» su _root (avanti all'ultimo fotogramma) e un gestore Â«loadÂ» per ogni cifra della
# nuova percentuale sulle istanze num1 (unita'), num2, num3:
# attachLWF nel movie di lwf/medal/guilt_bonus/GuiltBonus_Yfix%d (la cifra).
#  Qui: +, tre movie vuoti per le cifre (da destra a sinistra) e %, che entrano con un rimbalzo.
RESULT = 'GuiltBonus_result'
MAX = 'GuiltBonus_max'
RED = (255, 90, 70, 255)
RN = 40
DIGIT_W, DIGIT_H = 64, 88
FONT = os.path.join(os.environ.get('WINDIR', 'C:\\Windows'), 'Fonts', 'arialbd.ttf')


def glyph(ch, w=DIGIT_W, h=DIGIT_H, fill=(255, 222, 80, 255)):
    """Carattere dorato con bordo scuro, RGBA premoltiplicato."""
    from PIL import Image, ImageDraw, ImageFont
    try:
        font = ImageFont.truetype(FONT, int(h * 0.9))
    except OSError:
        font = ImageFont.load_default()
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    dr = ImageDraw.Draw(im)
    bx = dr.textbbox((0, 0), ch, font=font)
    x, y = (w - (bx[2] - bx[0])) / 2 - bx[0], (h - (bx[3] - bx[1])) / 2 - bx[1]
    dr.text((x, y), ch, font=font, fill=fill, stroke_width=4, stroke_fill=(70, 20, 90, 255))
    raw, px = im.tobytes(), bytearray()
    for i in range(0, len(raw), 4):
        r, g, b, a = raw[i:i + 4]
        px += bytes((r * a // 255, g * a // 255, b * a // 255, a))
    return bytes(px)


def build_digit(n, kind='Y', fill=(255, 222, 80, 255)):
    name = 'GuiltBonus_%sfix%d' % (kind, n)
    lw = Lwf(name, (DIGIT_W, DIGIT_H))
    fname = '%s_digit.png' % name
    obj = lw.bitmap(fname, DIGIT_W, DIGIT_H, mat(-DIGIT_W / 2, -DIGIT_H / 2))
    p = lw.place(0, obj, None, lw.matrix(mat()))
    return name, lw.build([[p, lw.anim([(STOP, None)])]], 1), {fname: btf8(DIGIT_W, DIGIT_H, glyph(str(n), fill=fill))}


def build_result(name=RESULT, fill=(255, 222, 80, 255)):
    lw = Lwf(name, (1136, 640))
    files = {}
    objs = {}
    for key, ch in (('plus', '+'), ('pct', '%')):
        fname = '%s_%s.png' % (name, key)
        files[fname] = btf8(DIGIT_W, DIGIT_H, glyph(ch, fill=fill))
        objs[key] = lw.bitmap(fname, DIGIT_W, DIGIT_H, mat(-DIGIT_W / 2, -DIGIT_H / 2))
    for i in (1, 2, 3):
        objs['num%d' % i] = lw.movie('num%d' % i)
        lw.instance('num%d' % i)
    step = DIGIT_W * 0.8
    xs = {'pct': 2 * step, 'num1': step, 'num2': 0.0, 'num3': -step, 'plus': -2 * step}
    order = ['plus', 'num3', 'num2', 'num1', 'pct']
    places, frames = {}, []
    for f in range(RN):
        ctrls = []
        s = ramp(f, 0, 8, 0.2, 1.25) - ramp(f, 8, 14, 0.0, 0.25)
        a = ramp(f, 0, 4, 0.0, 1.0)
        for d, key in enumerate(order):
            mid, aid = lw.matrix(mat(xs[key] * s, 0, 0, s, s)), lw.alpha(a)
            if f == 0:
                places[key] = lw.place(d, objs[key], key if key.startswith('num') else None, mid)
                ctrls.append(places[key] if not aid else lw.move(places[key], mid, aid))
            else:
                ctrls.append(lw.move(places[key], mid, aid))
        if f == RN - 1:
            ctrls.append(lw.anim([(STOP, None)]))
        frames.append(ctrls)
    return lw.build(frames, len(order)), files


def _write(out, name, data, files):
    d = os.path.join(out, 'lwf', 'medal', 'guilt_bonus', name)
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, name + '.lwf'), 'wb') as fh:
        fh.write(data)
    for fname, blob in files.items():
        with open(os.path.join(d, fname), 'wb') as fh:
            fh.write(blob)


def write_all(out):
    data, files = build()
    _write(out, NAME, data, files)
    _write(out, RESULT, *build_result())
    # guilt arrivata al massimo: GuiltBonus_max + cifre GuiltBonus_Rfix%d (stesso
    # schema: enterFrame su _root, load su num1..num3); rosse
    _write(out, MAX, *build_result(MAX, RED))
    for n in range(10):
        _write(out, *build_digit(n))
        _write(out, *build_digit(n, 'R', RED))
    return len(data), len(files)


if __name__ == '__main__':
    n, t = write_all(sys.argv[1])
    print('%s: %d byte, %d texture, %d fotogrammi a %d fps' % (NAME, n, t, N, FPS))
