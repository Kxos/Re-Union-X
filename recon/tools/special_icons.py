"""Icons of the Special Catalog (Filters chips TYPE / SHOW, row status pills, Keep button).

Original game icons where the client has one (Square Enix assets: NOT in the repo): copied from the JP 4.3.1 dump into
server/game_data/special_icons/<key>.png (git-ignored folder), each fitted into 48x48 RGBA, proportions kept, transparent
margin, like shop_icons.py. Where the client has no such icon (calendar, pin, swap arrows, hourglass, play mark) a small
icon in the game's style is drawn here with Pillow (gold / blue gradients, dark outline): those are our own drawings.

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


def draw_weekday():
    """Calendar page: blue body, red top band with two rings, white sheet with a grid of days."""
    c = Image.new('RGBA', (BIG, BIG), (0, 0, 0, 0))
    fill_shape(c, lambda d: d.rounded_rectangle((22, 34, 170, 172), 18, fill=255), *BLUE)
    fill_shape(c, lambda d: d.rounded_rectangle((22, 34, 170, 74), 18, fill=255), *RED, width=0)
    fill_shape(c, lambda d: d.rectangle((38, 84, 154, 160), fill=255), *WHITE, width=0)
    d = ImageDraw.Draw(c)
    for x in (58, 134):  # rings
        d.rounded_rectangle((x - 8, 18, x + 8, 54), 8, fill=(230, 236, 242, 255), outline=OUTLINE, width=5)
    for row in range(3):
        for col in range(4):
            x, y = 48 + col * 27, 92 + row * 23
            d.rectangle((x, y, x + 16, y + 13), fill=(30, 110, 200, 255) if (row, col) != (1, 2) else (214, 60, 40, 255))
    return c


def draw_pin():
    """Push pin, tilted: gold head, dark outline, silver needle."""
    c = Image.new('RGBA', (BIG, BIG), (0, 0, 0, 0))
    d = ImageDraw.Draw(c)
    d.line((70, 122, 26, 166), fill=OUTLINE, width=18)
    d.line((70, 122, 30, 162), fill=(210, 220, 230, 255), width=8)
    def head(m):
        m.polygon([(96, 20), (172, 96), (150, 112), (80, 42)], fill=255)  # top disc
        m.polygon([(104, 58), (134, 88), (92, 130), (62, 100)], fill=255)  # body
        m.polygon([(56, 84), (108, 136), (96, 148), (44, 96)], fill=255)  # base disc
    fill_shape(c, head, *GOLD)
    return c


def draw_replaced():
    """Two curved arrows in a circle (swap): blue on a light disc."""
    c = Image.new('RGBA', (BIG, BIG), (0, 0, 0, 0))
    fill_shape(c, lambda d: d.ellipse((14, 14, 178, 178), fill=255), *WHITE)
    d = ImageDraw.Draw(c)
    blue = (30, 110, 200, 255)
    d.arc((44, 44, 148, 148), 200, 340, fill=blue, width=18)
    d.arc((44, 44, 148, 148), 20, 160, fill=blue, width=18)
    d.polygon([(140, 60), (168, 92), (128, 98)], fill=blue)   # head of the upper arrow
    d.polygon([(52, 132), (24, 100), (64, 94)], fill=blue)    # head of the lower arrow
    return c


def draw_later():
    """Hourglass: gold frame, blue sand."""
    c = Image.new('RGBA', (BIG, BIG), (0, 0, 0, 0))
    fill_shape(c, lambda d: d.polygon([(52, 34), (140, 34), (104, 96), (140, 158), (52, 158), (88, 96)], fill=255), *WHITE)
    d = ImageDraw.Draw(c)
    d.polygon([(70, 52), (122, 52), (96, 88)], fill=(90, 170, 240, 255))
    d.polygon([(96, 112), (130, 150), (62, 150)], fill=(30, 110, 200, 255))
    fill_shape(c, lambda m: (m.rounded_rectangle((36, 16, 156, 38), 8, fill=255), m.rounded_rectangle((36, 154, 156, 176), 8, fill=255)), *GOLD, width=6)
    return c


def draw_now():
    """Green play mark (the Shop's «▶ In the Shop now»): green disc with a white triangle."""
    c = Image.new('RGBA', (BIG, BIG), (0, 0, 0, 0))
    fill_shape(c, lambda d: d.ellipse((14, 14, 178, 178), fill=255), *GREEN)
    ImageDraw.Draw(c).polygon([(74, 52), (74, 140), (146, 96)], fill=(255, 255, 255, 255))
    return c


def draw_medal():
    """Medal (no generic medal icon in the client): gold rim, blue face, white star."""
    c = Image.new('RGBA', (BIG, BIG), (0, 0, 0, 0))
    fill_shape(c, lambda d: d.ellipse((14, 14, 178, 178), fill=255), *GOLD)
    fill_shape(c, lambda d: d.ellipse((38, 38, 154, 154), fill=255), *BLUE, width=4)
    import math
    pts = [(96 + (44 if i % 2 == 0 else 19) * math.sin(i * math.pi / 5), 98 - (44 if i % 2 == 0 else 19) * math.cos(i * math.pi / 5)) for i in range(10)]
    ImageDraw.Draw(c).polygon(pts, fill=(255, 255, 255, 255))
    return c


DRAWN = {'weekday': draw_weekday, 'pin': draw_pin, 'replaced': draw_replaced, 'later': draw_later, 'now': draw_now, 'medal': draw_medal}


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
