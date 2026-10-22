"""Animazione dell'evoluzione del keyblade (lwf/memudemo/KeyBlade_Evolution/KeyBlade_Evolution.lwf),
assente da ogni risorsa: LWF NOSTRO, scritto da zero (nessun byte degli originali), con le
texture disegnate qui. Prima c'era il LWF vuoto di make_layouts.py (si saltava l'animazione).

Cosa si aspetta il client 4.3.1 (I-078):
- dopo la risposta di POST /keyblade/enhance, se il displayId del keyblade cambia, mostra uno
  strato nero a schermo intero con questo LWF al centro (l'origine (0, 0) del LWF e' il centro
  dello schermo); se il file manca va in crash;
- quando il movie «_root» arriva all'ultimo fotogramma toglie strato e LWF e apre il risultato
  (DeckEdit_KBStrength_Result_ver210). Nessun evento «end»;
- al «load» delle istanze «keyblade_previous» e «keyblade» attacca in quel movie il LWF
  lwf/avatar/keyblade/keyblade_%04d_%02d (displayId / 100, displayId % 100) del keyblade di
  prima e di quello nuovo;
- «_root», «keyblade_previous» e «keyblade» devono esserci (altrimenti niente keyblade, e senza
  «_root» il flusso si fermerebbe sul nero).
Quindi: radice con i due movie vuoti (istanze keyblade_previous / keyblade, piazzati dal primo
fotogramma cosi' il «load» arriva subito e il LWF del keyblade nuovo, anche quello da 234
texture del +35, si carica prima di vedersi), bagliore, raggi, lampo e anello; STOP
sull'ultimo fotogramma (il client resta li').

Posa del keyblade: rotazione 161 gradi e centro dell'arte dei LWF del keyblade (~(8, -31) in
coordinate locali, keyblade_rule.lwf_center sugli stadi 01-05) portato sull'origine.

    python -I recon/tools/make_kb_evolution_lwf.py <uscita> (es. stage_gen\\files)"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from make_pet_motions import BITMAP, STOP, Lwf, btf8, draw, lerp, mat, mul  # noqa: E402

NAME = 'KeyBlade_Evolution'
FPS = 30
N = 96                      # 3,2 s
ART_C = (8.0, -31.0)        # centro medio dell'arte nei LWF lwf/avatar/keyblade
ROT, SCALE = 161.0, 2.6


def kb_matrix(scale, rot_off=0.0, dy=0.0):
    """Matrice del movie del keyblade: arte centrata sull'origine (+dy), ruotata e scalata."""
    m = mat(0, 0, ROT + rot_off, scale, scale)
    cx = m[0] * ART_C[0] + m[2] * ART_C[1]
    cy = m[3] * ART_C[0] + m[1] * ART_C[1]
    return (m[0], m[1], m[2], m[3], -cx, -cy + dy)


# ---- texture (RGBA premoltiplicato -> BTF tipo 8, come gli effetti del pet)

def tex_glow(x, y):
    r = math.hypot(x, y)
    a = max(0.0, 1 - r) ** 2
    return lerp(1.0, 1.0, r), lerp(0.95, 0.78, r), lerp(0.75, 0.30, r), a


def tex_rays(x, y):
    r = math.hypot(x, y)
    ang = math.atan2(y, x)
    spoke = (0.5 + 0.5 * math.cos(12 * ang)) ** 8
    a = spoke * max(0.0, 1 - r) ** 1.2 * min(1.0, r * 6)
    return 1.0, 0.9, 0.55, a * 0.9


def tex_star(x, y):
    r = math.hypot(x, y)
    ang = math.atan2(y, x)
    spike = 0.12 + 0.88 * abs(math.cos(2 * ang)) ** 14
    core = max(0.0, 1 - r / spike)
    glow = max(0.0, 1 - r) ** 3 * 0.8
    return 1.0, 1.0, lerp(1.0, 0.7, r), min(1.0, core * 1.8 + glow)


def tex_ring(x, y):
    r = math.hypot(x, y)
    a = max(0.0, 1 - abs(r - 0.82) / 0.12) ** 1.6
    return 1.0, 0.92, 0.6, a


TEXTURES = [('glow', 256, 256, tex_glow), ('rays', 256, 256, tex_rays),
            ('star', 128, 128, tex_star), ('ring', 192, 192, tex_ring)]


def ease(t):
    t = max(0.0, min(1.0, t))
    return 0.5 - 0.5 * math.cos(math.pi * t)


def ramp(f, f0, f1, a, b):
    """a prima di f0, b dopo f1, morbido in mezzo."""
    return lerp(a, b, ease((f - f0) / max(1, f1 - f0)))


def tracks(f):
    """(scala, rotazione, alpha) di ogni strato al fotogramma f; per i keyblade la matrice."""
    t = f / FPS
    flash = 44                                   # picco del lampo
    glow_a = ramp(f, 0, 12, 0.0, 0.55) + ramp(f, flash - 6, flash, 0, 0.45) - ramp(f, flash, flash + 20, 0, 0.35)
    rays_a = ramp(f, 4, 24, 0.0, 0.5) + ramp(f, flash - 8, flash, 0, 0.5) - ramp(f, flash, flash + 24, 0, 0.45)
    out = {
        'glow': (ramp(f, 0, 12, 2.2, 3.2) + 0.08 * math.sin(t * 4), 0.0, glow_a),
        'rays': (ramp(f, 0, flash, 2.4, 3.4), 30.0 * t, rays_a),
        # keyblade di prima: entra, ondeggia, sale di scala e svanisce nel lampo
        'keyblade_previous': (kb_matrix(ramp(f, 0, 12, SCALE * 0.9, SCALE) + ramp(f, 34, flash, 0, SCALE * 0.12),
                                        3.0 * math.sin(t * 3), -4.0 * math.sin(t * 2.5)),
                              None, ramp(f, 0, 10, 0.0, 1.0) - ramp(f, flash - 6, flash + 2, 0.0, 1.0)),
        # keyblade nuovo: appare nel lampo con un piccolo rimbalzo di scala
        'keyblade': (kb_matrix(ramp(f, flash - 2, flash + 10, SCALE * 1.25, SCALE * 0.96) + ramp(f, flash + 10, flash + 18, 0, SCALE * 0.04),
                               0.0, -3.0 * math.sin(max(0.0, t - flash / FPS) * 2.5)),
                     None, ramp(f, flash - 3, flash + 6, 0.0, 1.0)),
        'star': (ramp(f, flash - 8, flash, 0.3, 5.0) + ramp(f, flash, flash + 14, 0, 1.5), 90.0 * t,
                 ramp(f, flash - 8, flash - 2, 0.0, 1.0) - ramp(f, flash + 2, flash + 16, 0.0, 1.0)),
        'ring': (ramp(f, flash, flash + 18, 0.4, 3.6), 0.0, ramp(f, flash, flash + 2, 0.0, 0.9) - ramp(f, flash + 4, flash + 18, 0.0, 0.9)),
        # scintilla finale sulla punta (piccola stella che pulsa)
        'star2': (0.6 + 0.25 * math.sin(t * 9), -60.0 * t, ramp(f, flash + 16, flash + 26, 0.0, 0.85) * (0.6 + 0.4 * math.sin(t * 7))),
    }
    return out


ORDER = ['glow', 'rays', 'keyblade_previous', 'keyblade', 'ring', 'star', 'star2']   # dietro -> davanti
STAR2_POS = (60.0, -95.0)


def build():
    lw = Lwf(NAME, (1136, 640))
    files, objs = {}, {}
    for key, w, h, fn in TEXTURES:
        fname = '%s_%s.png' % (NAME, key)     # comincia col nome del LWF, come gli altri LWF serviti
        files[fname] = btf8(w, h, draw(w, h, fn))
        objs[key] = lw.bitmap(fname, w, h, mat(-w / 2, -h / 2))
    # seconda bitmap sulla stessa texture della stella (nessuna voce texture doppia)
    lw.bitmaps.append((lw.matrix(mat(-64, -64)), [t[0] for t in lw.textures].index('%s_star.png' % NAME)))
    lw.objects.append((BITMAP, len(lw.bitmaps) - 1))
    objs['star2'] = len(lw.objects) - 1
    for inst in ('keyblade_previous', 'keyblade'):
        objs[inst] = lw.movie(inst)
        lw.instance(inst)
    places, frames = {}, []
    for f in range(N):
        tr = tracks(f)
        ctrls = []
        for d, key in enumerate(ORDER):
            s, r, a = tr[key]
            if isinstance(s, tuple):
                m = s
            elif key == 'star2':
                m = mul(mat(*STAR2_POS), mat(0, 0, r, s, s))
            else:
                m = mat(0, 0, r, s, s)
            mid, aid = lw.matrix(m), lw.alpha(max(0.0, min(1.0, a)))   # aid 0 = opaco
            if f == 0:
                places[key] = lw.place(d, objs[key], key if key in ('keyblade_previous', 'keyblade') else None, mid)
                ctrls.append(places[key] if not aid else lw.move(places[key], mid, aid))
            else:
                ctrls.append(lw.move(places[key], mid, aid))
        if f == N - 1:
            ctrls.append(lw.anim([(STOP, None)]))
        frames.append(ctrls)
    return lw.build(frames, len(ORDER)), files


def write_all(out):
    d = os.path.join(out, 'lwf', 'memudemo', NAME)
    os.makedirs(d, exist_ok=True)
    data, files = build()
    with open(os.path.join(d, NAME + '.lwf'), 'wb') as fh:
        fh.write(data)
    for fname, blob in files.items():
        with open(os.path.join(d, fname), 'wb') as fh:
            fh.write(blob)
    return len(data), len(files)


if __name__ == '__main__':
    n, t = write_all(sys.argv[1])
    print('%s: %d byte, %d texture, %d fotogrammi a %d fps' % (NAME, n, t, N, FPS))
