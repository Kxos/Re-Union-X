"""Test of make_special_banners.py (640x140 banners of the Special tab and their -kept copies).

    python -I recon/tools/test_make_special_banners.py        -> «OK: ...» or «ERRORS (n)», exit 1
"""
import json
import os
import shutil
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image, ImageChops  # noqa: E402
import make_special_banners as m  # noqa: E402

try:
    sys.stdout.reconfigure(encoding='utf-8')
except AttributeError:
    pass

errors = []


def check(cond, msg):
    if not cond:
        errors.append(msg)


TMP = os.environ.get('KHUX_TMP', 'D:/Progetto_Restauro_KH_UX/tmp')
os.makedirs(TMP, exist_ok=True)
tmp = tempfile.mkdtemp(prefix='khux_special_banners_', dir=TMP)
try:
    src, out = os.path.join(tmp, 'src'), os.path.join(tmp, 'out')
    os.makedirs(src)
    # an «original» at the wiki size (1202x263, RGBA) and one already 640x140
    Image.new('RGBA', (1202, 263), (200, 30, 30, 255)).save(os.path.join(src, 'Special - Alpha banner KHUX.png'))
    Image.new('RGB', (640, 140), (30, 30, 200)).save(os.path.join(src, 'Special - Beta banner KHUX.png'))
    index = {'catalog': {'evStageId': 7000, 'stageIds': [970000]}, 'entries': [
        {'key': 'alpha', 'evStageId': 7001, 'name': 'Alpha', 'family': 'SQ12', 'banner': 'Special - Alpha banner KHUX.png', 'removed': ''},
        {'key': 'beta', 'evStageId': 7002, 'name': 'Beta', 'family': 'SQ13', 'banner': 'Special - Beta banner KHUX.png', 'removed': ''},
        {'key': 'gamma', 'evStageId': 7003, 'name': 'Gamma Quest With A Long Name', 'family': 'SQ22', 'banner': '', 'removed': ''},
        {'key': 'lost', 'evStageId': 7004, 'name': 'Lost', 'family': 'SQ13', 'banner': 'Special - Missing banner KHUX.png', 'removed': ''},
    ]}
    r = m.build_all(index, src, out, 'palette')
    size = lambda f: Image.open(os.path.join(out, f)).size  # noqa: E731
    for f in ('7000.png', '7001.png', '7001-kept.png', '7002.png', '7002-kept.png', '7003.png', '7003-kept.png', '7004.png', '7004-kept.png'):
        check(os.path.exists(os.path.join(out, f)) and size(f) == (640, 140), '%s: 640x140' % f)
    check(not os.path.exists(os.path.join(out, '7000-kept.png')), 'no -kept for the catalogue banner (never pinned)')
    check(r == {'original': 2, 'plate': 2, 'catalog': 1}, 'counts %s' % r)
    a = Image.open(os.path.join(out, '7001.png')).convert('RGB')
    check(a.getpixel((320, 100))[0] > 150, 'original resized (red), not a plate')
    g = Image.open(os.path.join(out, '7003.png')).convert('RGB')
    l4 = Image.open(os.path.join(out, '7004.png')).convert('RGB')
    check(g.getpixel((320, 120)) != l4.getpixel((320, 120)), 'plates coloured by family (SQ22 != SQ13)')
    k = Image.open(os.path.join(out, '7001-kept.png')).convert('RGB')
    # palette PNGs: the two images are quantised separately, so only differences above the noise count
    bb = ImageChops.difference(a, k).convert('L').point(lambda v: 255 if v > 48 else 0).getbbox()
    check(bb is not None and bb[0] >= 400 and bb[3] <= 60, 'KEPT badge top right only (diff box %s)' % (bb,))
    # the catalogue plate: drawn like the Shop BANNER CATALOG plate (make_shop_art.banner), other title
    import make_shop_art
    shop = make_shop_art.banner().convert('RGB')
    cat = Image.open(os.path.join(out, '7000.png')).convert('RGB')
    near = lambda p, q: all(abs(x - y) <= 16 for x, y in zip(p, q))  # noqa: E731
    check(all(near(cat.getpixel(xy), shop.getpixel(xy)) for xy in ((3, 70), (8, 70), (320, 4), (320, 135))), 'catalog plate in the Shop catalog style')
    check(ImageChops.difference(cat, shop).getbbox() is not None, 'catalog plate has its own title')
    check(m.plate_color('SQ13') == m.plate_color('SQ13') and m.plate_color('SQ13') != m.plate_color('SQ22'), 'family colours')
    check(m.plate_color('SQ21') == m.plate_color('SQ22') == m.plate_color('SQ23'), 'VIP campaigns (SQ21) and Materials (SQ23): the VIP pink of SQ22')
finally:
    shutil.rmtree(tmp, ignore_errors=True)

if errors:
    print('ERRORS (%d)' % len(errors))
    for e in errors:
        print(' -', e)
    sys.exit(1)
print('OK: special banners 640x140 (original, plate, catalog, -kept)')
