"""Banners of the Special tab (640x140 PNG) and their -kept copies (spec 2026-10-30-special-tab-design.md 4, 10).

    python -I recon/tools/make_special_banners.py [--index F] [--src D] [--out D] [--mode palette|full]
        -> server/game_data/special_img/<evStageId>.png and <evStageId>-kept.png (git-ignored)

Index: server/game_data/special.json (make-special.js). Each entry names the original khuxwiki banner file in `banner`
(server/special_periods.json); the originals are downloaded by hand into reference\\special_banners\\ (local only,
never in the repo) and resized to 640x140 (fit of make_banner_images.py: centre crop when the ratio differs).
Entries without an original (or with the file missing) get a generated plate in the style of make_banner_images.plate:
quest name on a gradient in the colour of the family (SQ code). The catalogue banner (catalog.evStageId, 7000) gets
the «SPECIAL CATALOG» plate drawn like the Shop BANNER CATALOG plate (make_shop_art.banner, /web/gacha/img/9001.png).
-kept copies (pinned quest, spec 4.2): the Shop KEPT tag of kept_banner_badge.py (style KEPT_STYLE of server/gacha.js)
with the words «KEPT QUEST»; none for the catalogue banner, which is never pinned.
"""
import argparse
import hashlib
import json
import os
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kept_banner_badge as kept  # noqa: E402
import make_banner_images as mbi  # noqa: E402
import make_shop_art  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
ROOT = os.path.dirname(os.path.dirname(REPO))
KEPT_WORDS = ('KEPT', 'QUEST')
CATALOG_TITLE, CATALOG_SUB = 'SPECIAL CATALOG', 'Every Special quest - open Details'
# gradient (top, bottom) per family; the hues of the original banners of each family where there is one
FAMILY = {
    'SQ12': ((0x8a, 0x6a, 0x08), (0xc8, 0x9c, 0x1c)),   # Daily Cid: gold
    'SQ13': ((0x4a, 0x1a, 0x7a), (0x7a, 0x34, 0xa8)),   # Evolve / EXP / Munny: purple
    'SQ11': ((0x0d, 0x4a, 0x8a), (0x1c, 0x7c, 0xc4)),   # Skill: blue
    'SQ09': ((0x8a, 0x14, 0x1c), (0xc4, 0x2c, 0x34)),   # Moogle O' Glory: red
    'SQ22': ((0x8a, 0x1a, 0x6a), (0xc8, 0x48, 0x9c)),   # VIP: pink
    'SQ21': ((0x8a, 0x1a, 0x6a), (0xc8, 0x48, 0x9c)),   # VIP campaigns (Task 12): the VIP pink
    'SQ23': ((0x8a, 0x1a, 0x6a), (0xc8, 0x48, 0x9c)),   # VIP! Materials: the VIP pink
}


def plate_color(family):
    """(top, bottom) RGB of the plate of a family; unknown families: a stable dark hue from the code."""
    if family in FAMILY:
        return FAMILY[family]
    h = int(hashlib.md5((family or '').encode()).hexdigest(), 16)
    base = [0x20 + (h >> (8 * i)) % 0x50 for i in range(3)]
    return tuple(base), tuple(min(255, c + 0x30) for c in base)


def plate(name, family):
    top, bot = plate_color(family)
    return mbi.plate(name, top, bot)


def build_all(index, src_dir, out_dir, mode):
    """writes the PNGs of the catalogue banner and of every entry; returns the counts original / plate / catalog"""
    os.makedirs(out_dir, exist_ok=True)
    n = {'original': 0, 'plate': 0, 'catalog': 0}
    cat = index.get('catalog') or {}
    if cat.get('evStageId'):
        mbi.save_png(make_shop_art.banner(CATALOG_TITLE, CATALOG_SUB), os.path.join(out_dir, '%d.png' % cat['evStageId']), mode)
        n['catalog'] += 1
    for e in index.get('entries', []):
        p = os.path.join(src_dir, e['banner']) if e.get('banner') else None
        if p and os.path.exists(p):
            im = mbi.fit(Image.open(p))
            n['original'] += 1
        else:
            im = plate(e['name'], e.get('family', '')).convert('RGBA')
            n['plate'] += 1
        mbi.save_png(im, os.path.join(out_dir, '%d.png' % e['evStageId']), mode)
        mbi.save_png(kept.badge(im, KEPT_WORDS), os.path.join(out_dir, '%d-kept.png' % e['evStageId']), mode)
    return n


def main():
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except AttributeError:
        pass
    ap = argparse.ArgumentParser()
    ap.add_argument('--index', default=os.path.join(REPO, 'server', 'game_data', 'special.json'))
    ap.add_argument('--src', default=os.path.join(ROOT, 'reference', 'special_banners'))
    ap.add_argument('--out', default=os.path.join(REPO, 'server', 'game_data', 'special_img'))
    ap.add_argument('--mode', choices=['palette', 'full'], default='palette')
    a = ap.parse_args()
    with open(a.index, encoding='utf-8') as f:
        index = json.load(f)
    r = build_all(index, a.src, a.out, a.mode)
    print('special banners: %d originals, %d plates, %d catalog -> %s' % (r['original'], r['plate'], r['catalog'], a.out))


if __name__ == '__main__':
    main()
