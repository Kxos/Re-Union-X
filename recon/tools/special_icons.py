"""Icons of the Special Catalog (Filters chips TYPE / SHOW, row status pills, Keep button).

Original game icons where the client has one (Square Enix assets: NOT in the repo): copied from the JP 4.3.1 dump into
server/game_data/special_icons/<key>.png (git-ignored folder), each fitted into 48x48 RGBA, proportions kept, transparent
margin, like shop_icons.py. Where the client has no such icon (calendar, pin, swap arrows, hourglass, play mark, medal,
open padlock) a flat status dot in the Shop catalogue's colours is drawn here with Pillow: those are our own drawings.

Usage: python -I recon/tools/special_icons.py [BASE_JP] [OUT_DIR]
       BASE_JP also from env KHUX_JP_BASE (folder jp_final_4.3.1 with cocostudio/ and img/).
Keys: the same list as SPECIAL_ICON_KEYS in server/special-pages.js.
"""
import os
import sys
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # with python -I the script folder is not on sys.path
import private_tools  # noqa: E402  (local reference data folders, see private_tools.py)
DEFAULT_BASE = private_tools.local_path('jp_data')  # a local reference data folder, not provided by this project
SIZE = 48
BIG = SIZE * 4  # drawn at 4x, then reduced (smooth edges)

# key -> path in the JP base (original icons)
ORIGINAL = {
    'vip': 'cocostudio/publish/Hs_Ico_Crown.png',            # VIP crown (also the Shop's VIP icon)
    'daily': 'img/medal/Medal_S_90076.png',                  # Cid Medal (Daily Challenge: Cid)
    'mog': 'cocostudio/publish/LoginBonus_Mog.png',          # Moogle (Moogle O' Glory, Keyblade Materials)
    'skill': 'cocostudio/publish/Skill_Icon3.png',           # skill-up icon
    'camp': 'cocostudio/publish/IncentiveIcon_PresentBox.png',  # present box (campaigns)
    'lock': 'cocostudio/publish/Lock_Icon.png',              # padlock (VIP only, locked)
    'removed': 'cocostudio/publish/NotUsed_Icon.png',        # «not usable» sign (not restored)
    # REWARDS chips (round 7): the client's reward icons (IncentiveIcon_<n>)
    'jewel': 'cocostudio/publish/IncentiveIcon_01.png',      # Jewel (also the Shop's Jewel icon)
    'avatar': 'img/incentive/IncentiveIcon_20.png',          # avatar part (reward type 20)
    'material': 'cocostudio/publish/IncentiveIcon_02.png',   # crystal of the material rewards
}
# share of the height kept from the top (full-body pictures too thin at chip size)
TOP_SHARE = {'mog': 0.58}
OUTLINE = (20, 28, 48, 255)


def normalize(im, size=SIZE):
    """Fit the image into size x size: proportions kept, centred, transparent background."""
    im = im.convert('RGBA')
    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)
    im.thumbnail((size, size), Image.LANCZOS)
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    out.paste(im, ((size - im.width) // 2, (size - im.height) // 2), im)
    return out


def gradient(size, top, bottom):
    """Vertical gradient image (RGBA) from top to bottom colour."""
    w, h = size
    g = Image.new('RGBA', (w, h))
    px = g.load()
    for y in range(h):
        t = y / max(1, h - 1)
        c = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(4))
        for x in range(w):
            px[x, y] = c
    return g


def fill_shape(canvas, draw_mask, top, bottom, outline=OUTLINE, width=10):
    """Paint the shape drawn by draw_mask(ImageDraw) with a gradient and a dark outline (outline = the mask grown)."""
    mask = Image.new('L', canvas.size, 0)
    draw_mask(ImageDraw.Draw(mask))
    from PIL import ImageFilter
    grown = mask.filter(ImageFilter.MaxFilter(width * 2 + 1))
    canvas.paste(Image.new('RGBA', canvas.size, outline), (0, 0), grown)
    canvas.paste(gradient(canvas.size, top, bottom), (0, 0), mask)


GOLD = ((255, 236, 140, 255), (214, 140, 20, 255))
BLUE = ((140, 220, 255, 255), (30, 110, 200, 255))
GREEN = ((150, 240, 140, 255), (30, 140, 50, 255))
RED = ((255, 150, 150, 255), (200, 30, 40, 255))
WHITE = ((255, 255, 255, 255), (200, 220, 235, 255))


# Drawn icons in the Shop catalogue's look (round 15, user: «the Shop's filter icons look better»): a flat status dot
# in the colour of the Shop pills (s-now green, s-pinned gold, s-later / unlocked blue, s-locked grey) with a white
# glyph, like the «▶» / padlock marks of the Shop's SHOW chips and pills. No gradients, no illustrations.
DOT = {'now': (46, 158, 62), 'pin': (184, 134, 11), 'unlocked': (26, 111, 168), 'later': (90, 100, 112),
       'replaced': (90, 100, 112), 'weekday': (10, 143, 163), 'medal': (184, 134, 11)}
WHITE_GLYPH = (255, 255, 255, 255)


def dot(color):
    """BIG x BIG canvas with the flat round dot (a lighter 1/16 ring, like the Shop pills' border)."""
    c = Image.new('RGBA', (BIG, BIG), (0, 0, 0, 0))
    d = ImageDraw.Draw(c)
    ring = tuple(min(255, v + 70) for v in color) + (255,)
    d.ellipse((4, 4, BIG - 4, BIG - 4), fill=ring)
    d.ellipse((14, 14, BIG - 14, BIG - 14), fill=color + (255,))
    return c, d


def draw_now():
    c, d = dot(DOT['now'])
    d.polygon([(76, 54), (76, 138), (144, 96)], fill=WHITE_GLYPH)
    return c


def draw_pin():
    """Push pin, tilted like the usual pin mark: cap, body, collar and needle on a layer turned by 35 degrees."""
    c, _ = dot(DOT['pin'])
    g = Image.new('RGBA', (BIG, BIG), (0, 0, 0, 0))
    d = ImageDraw.Draw(g)
    d.rounded_rectangle((68, 36, 124, 52), 6, fill=WHITE_GLYPH)   # cap
    d.rectangle((80, 52, 112, 92), fill=WHITE_GLYPH)              # body
    d.rounded_rectangle((60, 92, 132, 106), 6, fill=WHITE_GLYPH)  # collar
    d.line((96, 106, 96, 156), fill=WHITE_GLYPH, width=8)         # needle
    g = g.rotate(-35, resample=Image.BICUBIC, center=(96, 96))
    c.alpha_composite(g)
    return c


def draw_unlocked():
    c, d = dot(DOT['unlocked'])
    d.arc((70, 38, 122, 92), 180, 360, fill=WHITE_GLYPH, width=12)   # shackle, open on the right
    d.line((76, 64, 76, 96), fill=WHITE_GLYPH, width=12)
    d.rounded_rectangle((60, 90, 132, 146), 8, fill=WHITE_GLYPH)      # body
    d.ellipse((88, 106, 104, 122), fill=DOT['unlocked'] + (255,))
    return c


def draw_later():
    c, d = dot(DOT['later'])
    d.rectangle((62, 46, 130, 56), fill=WHITE_GLYPH)
    d.rectangle((62, 136, 130, 146), fill=WHITE_GLYPH)
    d.polygon([(70, 56), (122, 56), (96, 96), (122, 136), (70, 136), (96, 96)], fill=WHITE_GLYPH)
    d.polygon([(82, 62), (110, 62), (96, 84)], fill=DOT['later'] + (255,))
    return c


def draw_replaced():
    c, d = dot(DOT['replaced'])
    d.line((60, 76, 124, 76), fill=WHITE_GLYPH, width=12)
    d.polygon([(118, 56), (146, 76), (118, 96)], fill=WHITE_GLYPH)
    d.line((68, 118, 132, 118), fill=WHITE_GLYPH, width=12)
    d.polygon([(74, 98), (46, 118), (74, 138)], fill=WHITE_GLYPH)
    return c


def draw_weekday():
    c, d = dot(DOT['weekday'])
    d.rounded_rectangle((56, 56, 136, 140), 8, outline=WHITE_GLYPH, width=9)
    d.rectangle((56, 56, 136, 78), fill=WHITE_GLYPH)
    d.line((76, 44, 76, 64), fill=WHITE_GLYPH, width=9)
    d.line((116, 44, 116, 64), fill=WHITE_GLYPH, width=9)
    for x in (74, 96, 118):
        for y in (96, 120):
            d.rectangle((x - 6, y - 6, x + 6, y + 6), fill=WHITE_GLYPH)
    return c


def draw_medal():
    import math
    c, d = dot(DOT['medal'])
    pts = [(96 + (52 if i % 2 == 0 else 22) * math.sin(i * math.pi / 5), 100 - (52 if i % 2 == 0 else 22) * math.cos(i * math.pi / 5)) for i in range(10)]
    d.polygon(pts, fill=WHITE_GLYPH)
    return c


DRAWN = {'weekday': draw_weekday, 'pin': draw_pin, 'replaced': draw_replaced, 'later': draw_later, 'now': draw_now, 'medal': draw_medal, 'unlocked': draw_unlocked}


def main(argv):
    base = argv[1] if len(argv) > 1 else os.environ.get('KHUX_JP_BASE', DEFAULT_BASE)
    here = os.path.dirname(os.path.abspath(__file__))
    dest = argv[2] if len(argv) > 2 else os.path.normpath(os.path.join(here, '..', '..', 'server', 'game_data', 'special_icons'))
    os.makedirs(dest, exist_ok=True)
    missing = 0
    for key, rel in ORIGINAL.items():
        src = os.path.join(base, *rel.split('/'))
        if not os.path.isfile(src):
            print('MISSING', key, src)
            missing += 1
            continue
        im = Image.open(src).convert('RGBA')
        if key in TOP_SHARE:  # keep only the top of a tall picture (the Moogle's head and pompom)
            im = im.crop(im.getbbox())
            im = im.crop((0, 0, im.width, int(im.height * TOP_SHARE[key])))
        normalize(im).save(os.path.join(dest, key + '.png'))
        print('original', key)
    for key, fn in DRAWN.items():
        normalize(fn()).save(os.path.join(dest, key + '.png'))
        print('drawn', key)
    return 1 if missing else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
