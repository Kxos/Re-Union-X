"""Prova offline di make_nova_logo.py (build() su immagini sintetiche).

    python recon/tools/test_make_nova_logo.py        -> «OK: ...» oppure «ERRORI (n)», uscita 1

Logo JP finto 422x142: icona (disco opaco con alone sfumato) a sinistra, scritta «vecchia» (due barre
arancio con bordo nero e contorno chiaro) a destra. Fotogramma finto: lo stesso logo in scala 2 su uno
sfondo scuro rumoroso, con una scritta «nuova» di forma diversa (barre spostate) nello stesso stile.
"""
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage as nd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import make_nova_logo as m  # noqa: E402

errori = []


def check(cond, msg):
    if not cond:
        errori.append(msg)


W, H = 422, 142


def scritta(draw, rects, k):
    """Barre in stile logo (scala k): contorno chiaro, bordo nero, riempimento arancio."""
    for x0, y0, x1, y1 in rects:
        draw.rounded_rectangle([(x0 - 8) * k, (y0 - 8) * k, (x1 + 8) * k, (y1 + 8) * k], 6 * k,
                               fill=(250, 250, 250, 220))
    for x0, y0, x1, y1 in rects:
        draw.rounded_rectangle([(x0 - 4) * k, (y0 - 4) * k, (x1 + 4) * k, (y1 + 4) * k], 4 * k,
                               fill=(0, 0, 0, 255))
    for x0, y0, x1, y1 in rects:
        draw.rectangle([x0 * k, y0 * k, x1 * k, y1 * k], fill=(255, 110, 20, 255))


def icona(k):
    im = Image.new('RGBA', (W * k, H * k), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.ellipse([22 * k, 23 * k, 118 * k, 119 * k], fill=(250, 90, 90, 120))
    im = im.filter(ImageFilter.GaussianBlur(3 * k))
    d = ImageDraw.Draw(im)
    d.ellipse([30 * k, 31 * k, 110 * k, 111 * k], fill=(20, 20, 20, 255))
    d.ellipse([40 * k, 41 * k, 100 * k, 101 * k], fill=(230, 40, 30, 255))
    d.ellipse([60 * k, 61 * k, 80 * k, 81 * k], fill=(255, 220, 60, 255))
    return im


VECCHIA = [(140, 40, 250, 100), (275, 55, 380, 100)]
NUOVA = [(140, 30, 200, 100), (225, 45, 300, 95), (325, 40, 395, 100)]

jp = icona(1)
scritta(ImageDraw.Draw(jp), VECCHIA, 1)
jp_glow = Image.new('RGBA', (W, H), (255, 255, 255, 0))
ga = np.zeros((H, W), np.uint8)
ga[15:127, 15:125] = 200                                 # bagliore JP dell'icona (solo a sinistra)
jp_glow.putalpha(Image.fromarray(ga).filter(ImageFilter.GaussianBlur(4)))

# fotogramma: sfondo scuro rumoroso, logo in scala 2 con origine (150, 200)
rng = np.random.default_rng(7)
fr = Image.fromarray(rng.integers(0, 90, (800, 1100, 3), dtype=np.uint8), 'RGB')
lg = icona(1).resize((W * 2, H * 2), Image.BICUBIC)   # icona del video = la JP ingrandita
scritta(ImageDraw.Draw(lg), NUOVA, 2)
fr.paste(lg, (150, 200), lg)

logo, glow = m.build(jp, jp_glow, fr)

check(logo.size == (W, H) and glow.size == (W, H), f'dimensioni {logo.size} {glow.size}')
check(logo.mode == 'RGBA', f'modo del logo {logo.mode}')
L = np.array(logo.convert('RGBA')).astype(int)
J = np.array(jp).astype(int)
G = np.array(glow.convert('RGBA')).astype(int)

# icona: colonne a sinistra della scritta (alone compreso) identiche alla JP
check((L[:, :119] == J[:, :119]).all(), 'icona: colonne 0-118 diverse dalla JP')
# la scritta nuova c'e' (riempimento opaco), la vecchia non c'e' piu'
check(L[70, 170, 3] == 255 and L[70, 170, 0] > 200, f'scritta nuova assente in (170,70): {L[70, 170]}')
check(L[50, 350, 3] == 255 and L[50, 350, 0] > 200, f'scritta nuova assente in (350,50): {L[50, 350]}')
check(L[70, 212, 3] < 40, f'scritta vecchia rimasta fra le barre nuove (212,70): {L[70, 212]}')
# bordo nero intorno al riempimento nuovo (a sinistra della prima barra)
check(L[70, 137, 3] == 255 and L[70, 137, :3].max() < 60, f'bordo nero mancante (137,70): {L[70, 137]}')

# bagliore: bianco; icona come la JP; fuori dall'icona alpha > 0 solo entro 8 px dalla scritta nuova
check((G[..., :3][G[..., 3] > 0] >= 240).all(), 'bagliore non bianco')
check((G[:, :100, 3] == np.array(jp_glow)[:, :100, 3]).all(), 'bagliore dell\'icona diverso dalla JP')
vicino = nd.distance_transform_edt(L[..., 3] == 0) <= 8
fuori = ~vicino
fuori[:, :130] = False                                    # zona dell'icona: bagliore JP
check(not (G[..., 3][fuori] > 0).any(), 'bagliore oltre 8 px dalla scritta nuova')
check(G[70, 170, 3] > 200, f'bagliore assente sulla scritta nuova: {G[70, 170, 3]}')
check(G[20, 260, 3] == 0, f'bagliore della scritta vecchia rimasto: {G[20, 260, 3]}')

if errori:
    for e in errori:
        print('  -', e)
    print(f'ERRORI ({len(errori)})')
    sys.exit(1)
print('OK: build() su immagini sintetiche (dimensioni, icona JP intatta, scritta nuova con bordo nero, '
      'bagliore bianco entro 8 px)')
