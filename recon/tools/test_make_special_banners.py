"""Test of make_special_banners.py (640x140 banners of the Special tab and their -kept copies).

    python -I recon/tools/test_make_special_banners.py        -> «OK: ...» or «ERRORS (n)», exit 1
"""
import json
import os
import shutil
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image, ImageChops, ImageStat  # noqa: E402
import make_special_banners as m  # noqa: E402

try:
    sys.stdout.reconfigure(encoding='utf-8')
except AttributeError:
    pass

errors = []


def pixels(im):
    return [im.getpixel((x, y)) for y in range(im.height) for x in range(im.width)]


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
    vt = Image.new('RGB', (640, 140), (30, 140, 60))
    vt.paste((240, 40, 40), (0, 6, 230, 34))
    vt.save(os.path.join(src, 'Special - VIP Tab banner KHUX.png'))
    # catalogue collage sources (the names make_special_banners.CATALOG_STRIPS looks for)
    for i, f in enumerate(m.CATALOG_STRIPS):
        Image.new('RGB', (640, 140), ((60 * i) % 255, 200, (90 * i) % 255)).save(os.path.join(src, f))
    index = {'catalog': {'evStageId': 7000, 'stageIds': [970000]}, 'entries': [
        {'key': 'alpha', 'evStageId': 7001, 'name': 'Alpha', 'family': 'SQ12', 'banner': 'Special - Alpha banner KHUX.png', 'removed': ''},
        {'key': 'beta', 'evStageId': 7002, 'name': 'Beta', 'family': 'SQ13', 'banner': 'Special - Beta banner KHUX.png', 'removed': ''},
        {'key': 'gamma', 'evStageId': 7003, 'name': 'Gamma Quest With A Long Name', 'family': 'SQ22', 'banner': '', 'removed': ''},
        {'key': 'lost', 'evStageId': 7004, 'name': 'Lost', 'family': 'SQ13', 'banner': 'Special - Missing banner KHUX.png', 'removed': ''},
        {'key': 'viptab', 'evStageId': 7005, 'name': 'Tab', 'family': 'SQ22', 'banner': 'Special - VIP Tab banner KHUX.png', 'removed': ''},
    ]}
    r = m.build_all(index, src, out, 'palette')
    size = lambda f: Image.open(os.path.join(out, f)).size  # noqa: E731
    for f in ('7000.png', '7001.png', '7001-kept.png', '7002.png', '7002-kept.png', '7003.png', '7003-kept.png', '7004.png', '7004-kept.png', '7005.png', '7005-kept.png'):
        check(os.path.exists(os.path.join(out, f)) and size(f) == (640, 140), '%s: 640x140' % f)
    check(not os.path.exists(os.path.join(out, '7000-kept.png')), 'no -kept for the catalogue banner (never pinned)')
    check(r == {'original': 3, 'plate': 2, 'catalog': 1}, 'counts %s' % r)
    a = Image.open(os.path.join(out, '7001.png')).convert('RGB')
    check(a.getpixel((320, 100))[0] > 150, 'original resized (red), not a plate')
    g = Image.open(os.path.join(out, '7003.png')).convert('RGB')
    l4 = Image.open(os.path.join(out, '7004.png')).convert('RGB')
    check(g.getpixel((320, 120)) != l4.getpixel((320, 120)), 'plates coloured by family (SQ22 != SQ13)')
    k = Image.open(os.path.join(out, '7001-kept.png')).convert('RGB')
    # palette PNGs: the two images are quantised separately, so only differences above the noise count
    diffbox = lambda p, q: ImageChops.difference(p, q).convert('L').point(lambda v: 255 if v > 48 else 0).getbbox()  # noqa: E731
    bb = diffbox(a, k)
    # Task 14: a gold «KEPT QUEST» tab at the TOP-LEFT, the size of the red «VIP Quest» tab of the originals
    check(bb is not None and bb[0] <= 2 and bb[1] >= 3 and bb[2] <= 175 and bb[3] <= 40, 'KEPT tab top left only (diff box %s)' % (bb,))
    gold = lambda p: p[0] > 190 and 120 < p[1] < 245 and p[2] < 140  # noqa: E731
    check(sum(gold(k.getpixel((x, y))) for x in range(0, 140, 2) for y in range(8, 32, 2)) > 150, 'KEPT tab is gold')
    # a banner that already carries a VIP tab (red band 0..230): the KEPT tab replaces it, no red left
    v = Image.open(os.path.join(src, 'Special - VIP Tab banner KHUX.png')).convert('RGB')
    check(220 <= m.vip_tab_end(v) <= 232 and m.vip_tab_end(Image.new('RGB', (640, 140), (30, 30, 200))) == 0
          and m.vip_tab_end(a) == 0, 'VIP tab detected (%d)' % m.vip_tab_end(v))
    vk = Image.open(os.path.join(out, '7005-kept.png')).convert('RGB')
    red = lambda p: p[0] > 170 and p[1] < 90 and p[2] < 90  # noqa: E731
    check(not any(red(vk.getpixel((x, y))) for x in range(0, 232, 3) for y in range(8, 32, 3)), 'VIP tab covered by the KEPT tab')
    bv = diffbox(Image.open(os.path.join(out, '7005.png')).convert('RGB'), vk)
    check(bv is not None and bv[0] <= 2 and bv[2] <= 268 and bv[3] <= 40, 'KEPT over a VIP tab: top left only (diff box %s)' % (bv,))
    # Task 14: the catalogue banner is a collage of originals with the title, the training figures and a sticker
    import make_shop_art
    cat = Image.open(os.path.join(out, '7000.png')).convert('RGB')
    old = make_shop_art.banner('SPECIAL CATALOG', 'Every Special quest - open Details').convert('RGB')
    mean = lambda im: sum(ImageStat.Stat(im).mean) / 3  # noqa: E731
    check(mean(ImageChops.difference(cat, old)) > 20, 'catalog banner differs from the old plain plate')
    title = cat.crop((10, 12, 450, 82))
    check(sum(gold(p) for p in pixels(title)) > 1500, 'catalog title in gold lettering')
    brown = lambda p: p[0] < 110 and p[1] < 80 and p[2] < 40 and p[0] > p[2]  # noqa: E731
    check(sum(brown(p) for p in pixels(title)) > 800, 'catalog title with a brown outline')
    yellow = lambda p: p[0] > 230 and p[1] > 215 and p[2] < 90  # noqa: E731
    check(sum(yellow(p) for p in pixels(cat.crop((440, 0, 640, 140)))) > 300, 'TRAINING sticker (yellow burst) on the right')
    bare = m.catalog_banner(os.path.join(tmp, 'nothing'), None).convert('RGB')
    check(mean(ImageChops.difference(cat, bare)) > 8, 'catalog background made of the original banners (differs without them)')
    if os.path.isdir(m.ENEMIES):
        for eid in (1, 7):
            fig = m.enemy_figure(eid)
            check(fig is not None and fig.getbbox() is not None, 'enemy %d rendered from the local rig' % eid)
        withf = m.catalog_banner(src, m.ENEMIES).convert('RGB').crop((440, 30, 640, 140))
        nof = m.catalog_banner(src, None).convert('RGB').crop((440, 30, 640, 140))
        check(mean(ImageChops.difference(withf, nof)) > 6, 'Large Body + Shadow on the right of the catalog banner')
    else:
        print('(local enemy rigs %s missing: figure checks skipped)' % m.ENEMIES)
    check(m.plate_color('SQ13') == m.plate_color('SQ13') and m.plate_color('SQ13') != m.plate_color('SQ22'), 'family colours')
    check(m.plate_color('SQ21') == m.plate_color('SQ22') == m.plate_color('SQ23'), 'VIP campaigns (SQ21) and Materials (SQ23): the VIP pink of SQ22')
    # Task 14: the real rules resolve every mapped banner (entries + campaigns) to an original of reference\special_banners
    REF = os.path.join(m.ROOT, 'reference', 'special_banners')
    RULES = os.path.join(m.REPO, 'server', 'special_periods.json')
    if os.path.isdir(REF):
        with open(RULES, encoding='utf-8') as f:
            rules = json.load(f)
        c = m.source_counts(rules, REF)
        named = sum(1 for e in rules['entries'] if e.get('banner')) + sum(1 for k, v in rules['campaigns'].items() if not k.startswith('_') and v.get('banner'))
        check(c['missing'] == [] and c['original'] == named and c['original'] >= 175 and c['plate'] == 7,
              'real rules: originals vs plates %s (named %d)' % (c, named))
        print('real rules: %d originals, %d plates' % (c['original'], c['plate']))
    else:
        print('(reference banners %s missing: real-rules check skipped)' % REF)
finally:
    shutil.rmtree(tmp, ignore_errors=True)

if errors:
    print('ERRORS (%d)' % len(errors))
    for e in errors:
        print(' -', e)
    sys.exit(1)
print('OK: special banners 640x140 (original, plate, catalog, -kept)')
