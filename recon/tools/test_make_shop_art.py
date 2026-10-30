"""Test of make_shop_art.py: the Shop's «BANNER CATALOG» plate (640x140, /web/gacha/img/9001-v<N>.png).

    python -I recon/tools/test_make_shop_art.py        -> «OK: ...» or «ERRORS (n)», exit 1
"""
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np  # noqa: E402
from PIL import Image, ImageChops  # noqa: E402
import make_shop_art as m  # noqa: E402

try:
    sys.stdout.reconfigure(encoding='utf-8')
except AttributeError:
    pass

errors = []


def check(cond, msg):
    if not cond:
        errors.append(msg)


def gold(im, box):
    """pixels of the gold lettering (light yellow -> orange) inside box"""
    a = np.asarray(im.convert('RGB').crop(box)).astype(int)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    return int(((r > 200) & (g > 120) & (b < 150) & (r - b > 80)).sum())


REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
tmp = tempfile.mkdtemp(prefix='khux_shop_art_')
empty = os.path.join(tmp, 'empty')
os.makedirs(empty)

# without any local art (strips and medals missing): still a full plate, never the old plain one
old = m.banner().convert('RGB')
bare = m.catalog_banner(empty, empty)
check(bare.size == (640, 140), 'size 640x140 (no local art): %s' % (bare.size,))
check(ImageChops.difference(bare.convert('RGB'), old).getbbox() is not None, 'differs from the old plain plate')
check(gold(bare, (14, 22, 400, 78)) > 1500, 'gold title on the left: %d px' % gold(bare, (14, 22, 400, 78)))
check(gold(old, (14, 22, 95, 78)) < 50 < gold(bare, (14, 22, 95, 78)), 'title starts at the left edge (the old one was centred)')

# with fake strips and medals: they show up (the plate changes) and the title stays readable
strips = os.path.join(tmp, 'gacha_img')
medals = os.path.join(tmp, 'medal')
os.makedirs(strips)
os.makedirs(medals)
for i, sid in enumerate(m.CATALOG_STRIPS):
    Image.new('RGB', (640, 140), (40 * i, 200, 255 - 40 * i)).save(os.path.join(strips, '%d.png' % sid))
for mid in m.CATALOG_MEDALS:
    md = Image.new('RGBA', (640, 640), (0, 0, 0, 0))
    md.paste((250, 20, 20, 255), (120, 120, 520, 520))
    md.save(os.path.join(medals, 'Medal_L_%d.png' % mid))
full = m.catalog_banner(strips, medals)
check(full.size == (640, 140), 'size 640x140 (with art)')
check(ImageChops.difference(full.convert('RGB').crop((0, 0, 400, 140)), bare.convert('RGB').crop((0, 0, 400, 140))).getbbox()
      is not None, 'strips drawn behind the title')
a = np.asarray(full.convert('RGB').crop((400, 0, 640, 140))).astype(int)
red = int(((a[..., 0] > 180) & (a[..., 1] < 60) & (a[..., 2] < 60)).sum())
check(red > 1500, 'medal figures on the right: %d px' % red)
check(gold(full, (14, 22, 400, 78)) > 1500, 'gold title over the strips')

# main: texts, icon and 9001.png written into <game_data>/gacha_img, strips read from that same folder
sg = os.path.join(tmp, 'sg')
gd = os.path.join(tmp, 'game_data')
os.makedirs(os.path.join(gd, 'gacha_img'))
for sid in m.CATALOG_STRIPS:
    Image.open(os.path.join(strips, '%d.png' % sid)).save(os.path.join(gd, 'gacha_img', '%d.png' % sid))
argv = sys.argv
sys.argv = ['make_shop_art.py', sg, gd, '--medals', medals]
try:
    rc = m.main()
finally:
    sys.argv = argv
out = os.path.join(gd, 'gacha_img', '9001.png')
check(rc == 0 and os.path.exists(out), 'main writes gacha_img/9001.png')
if os.path.exists(out):
    w = Image.open(out)
    check(w.size == (640, 140) and w.mode == 'RGB', 'written plate RGB 640x140')
    check(ImageChops.difference(w.convert('RGB'), full.convert('RGB')).getbbox() is None, 'written plate = catalog_banner(strips, medals)')
check(os.path.exists(os.path.join(sg, 'text', 'ui', '106140420.txt')) and os.path.exists(os.path.join(sg, 'img', 'incentive', 'Star7_Ticket_39.png')),
      'texts and icon still written')

if errors:
    print('ERRORS (%d)' % len(errors))
    for e in errors:
        print(' -', e)
    sys.exit(1)
print('OK: make_shop_art (catalogue plate 640x140, strips, medals, title, main)')
