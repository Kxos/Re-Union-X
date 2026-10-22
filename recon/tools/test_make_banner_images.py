"""Prova di make_banner_images.py (immagini 640x140 dei banner originali).

    python recon/tools/test_make_banner_images.py        -> «OK: ...» oppure «ERRORI (n)», uscita 1
"""
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image  # noqa: E402
import make_banner_images as m  # noqa: E402

try:
    sys.stdout.reconfigure(encoding='utf-8')
except AttributeError:
    pass

errori = []


def check(cond, msg):
    if not cond:
        errori.append(msg)


tmp = tempfile.mkdtemp(prefix='khux_banner_img_')

im = m.fit(Image.new('RGB', (1001, 219), (200, 10, 10)))
check(im.size == (640, 140), 'ridimensionata')
im = m.fit(Image.new('RGB', (640, 160), (0, 0, 0)))
check(im.size == (640, 140), 'ritagliata al centro se il rapporto differisce oltre l\'1%')
# il ritaglio e' centrale: una riga rossa al centro verticale resta, i bordi alti e bassi (nero) vanno via
src = Image.new('RGB', (640, 160), (0, 0, 255))
src.paste((255, 0, 0), (0, 10, 640, 150))
out = m.fit(src)
check(out.getpixel((320, 0))[:3] == (255, 0, 0) and out.getpixel((320, 139))[:3] == (255, 0, 0), 'ritaglio centrale')
# l'alfa degli angoli trasparenti si conserva (non diventano verdi/neri)
tr = Image.new('RGBA', (640, 140), (0, 0, 0, 0))
tr.putpixel((320, 70), (255, 255, 255, 255))
f = m.fit(tr)
check(f.mode == 'RGBA' and f.getpixel((0, 0))[3] == 0 and f.getpixel((320, 70))[3] == 255, 'alfa conservato')
p = m.plate('Big Deal!!')
check(p.size == (640, 140) and p.mode == 'RGB', 'piastra generata')
long_name = m.plate('LIMITED TIME: Illus. Kairi [EX] Falling Price Deal is Back! Really Quite Long Name')
check(long_name.size == (640, 140), 'piastra con nome lungo')
a = os.path.join(tmp, 'a.png')
check(m.save_png(Image.new('RGB', (640, 140)), a, 'palette') and Image.open(a).mode == 'P', 'palette')
check(Image.open(a).size == (640, 140), 'misura salvata')
b = os.path.join(tmp, 'b.png')
check(m.save_png(tr, b, 'palette') and Image.open(b).mode == 'P' and 'transparency' in Image.open(b).info
      and Image.open(b).convert('RGBA').getpixel((0, 0))[3] == 0, 'palette con trasparenza')
c = os.path.join(tmp, 'c.png')
check(m.save_png(Image.new('RGB', (640, 140)), c, 'full') and Image.open(c).mode == 'RGB', 'full')

# scelta dell'immagine: propria, imageFrom, fratello di serie, piastra
img_dir = os.path.join(tmp, 'img')
os.makedirs(img_dir)
Image.new('RGB', (640, 140), (1, 2, 3)).save(os.path.join(img_dir, 'x.png'))
Image.new('RGB', (1280, 280), (4, 5, 6)).save(os.path.join(img_dir, 'y.png'))
bs = [
    {'rowId': 'B0001', 'name': 'Alfa', 'image': 'x.png', 'imageFrom': 'B0001'},
    {'rowId': 'B0002', 'name': 'Alfa', 'image': 'x.png', 'imageFrom': 'B0001'},
    {'rowId': 'B0003', 'name': 'Alfa Deal', 'image': None, 'imageFrom': None},
    {'rowId': 'B0004', 'name': 'Beta', 'image': 'y.png', 'imageFrom': 'B0004'},
    {'rowId': 'B0005', 'name': 'Gamma!', 'image': None, 'imageFrom': None},
    {'rowId': 'B0006', 'name': 'Rara', 'image': 'manca.png', 'imageFrom': 'B0006'},
]
res = m.build_all(bs, img_dir, os.path.join(tmp, 'out'), 'palette')
check(res['copiate'] == 1 and res['ridimensionate'] == 1 and res['fratello'] == 2 and res['generate'] == 2,
      f'conteggi {res}')
for b_ in bs:
    fn = os.path.join(tmp, 'out', f'{10000 + int(b_["rowId"][1:])}.png')
    check(os.path.exists(fn) and Image.open(fn).size == (640, 140), f'file {fn}')
check(not os.path.exists(os.path.join(tmp, 'out', '9001.png')), '9001.png non toccato')

if errori:
    print(f'ERRORI ({len(errori)})')
    for e in errori:
        print(' -', e)
    sys.exit(1)
print('OK: fit, piastra, palette/full con alfa, scelta dell\'immagine')
