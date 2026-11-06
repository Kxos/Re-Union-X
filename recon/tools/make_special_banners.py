"""Banners of the Special tab (640x140 PNG) and their -kept copies (spec 2026-10-30-special-tab-design.md 4, 10).

    python -I recon/tools/make_special_banners.py [--index F] [--rules F] [--src D] [--out D] [--enemies D]
        [--mode palette|full] [--section all|special|raid|event] [--raid-index F] [--raid-img D]
        [--event-index F] [--event-config F] [--event-img D]
        -> server/game_data/special_img/<evStageId>.png and <evStageId>-kept.png (git-ignored)
        -> raid section: server/game_data/raid_img/8000.png (Raid Catalog banner) and <evStageId>-kept.png (git-ignored)
        -> event section: server/game_data/event_img/20000.png (Event Catalog banner) and <evStageId>-kept.png (git-ignored)

Event section (Events Part 1, Task 6; run after make_event_banners.py, whose event cards it reads; not part of «all»): the
Event Catalog banner (server/event_config.json catalogEvStage, 20000), its own design (user 06-11: never the Raid Catalog
layout): cyan -> green background, the game's Event Coin as emblem, a large white «EVENT CATALOG», the subtitle and the
TRAINING sticker; and for every event of server/game_data/events.json a -kept copy of its card with a gold «KEPT EVENT» tab
(top left, or top right where event_config.json keptTab says so). After a change bump imgVersion in
server/event_config.json, then the master revision.

Raid section (raids Part 2, Task 9; run after make_raid_banners.py): the Raid Catalog banner (raids.json catalog.evStageId,
8000; redesigned 06-11 on the user's request): a red background with light rays, a group of original raid bosses (their
wait pose from the local raid rigs, --raid-rigs, RAID_BOSSES), the large gold «RAID CATALOG», the subtitle and the TRAINING
sticker (a tap opens the Training Grounds); and for every raid week a -kept copy of its card with a gold «KEPT RAID» tab
(the kept raid of the Raid Catalog in the Events tab; --catalog-only leaves them as they are).
After a change of these files bump RAID_IMG_VERSION (server/routes-raid.js), then the master revision.

Index: server/game_data/special.json (make-special.js). Each entry names the original khuxwiki banner file in `banner`
(server/special_periods.json, entries and campaigns); the originals are downloaded by hand into reference\\special_banners\\
(local only, never in the repo) and resized to 640x140 (fit of make_banner_images.py: centre crop when the ratio differs).
Entries without an original (or with the file missing) get a generated plate in the style of make_banner_images.plate:
quest name on a gradient in the colour of the family (SQ code), except the campaigns whose original is lost and whose
rules carry a `reconstruct` spec (--rules, server/special_periods.json; C44151, C48395): those are rebuilt in the style
of the original VIP quest banners from local in-game screenshots (reconstructed_banner).
Catalogue banner (catalog.evStageId, 7000; Task 14, user 30-10): darkened oblique strips of original Special banners
(CATALOG_STRIPS), «SPECIAL CATALOG» in the gold lettering with brown outline of the originals, the subtitle, and on the
right what a tap opens: the training quest's Large Body and Shadow (drawn from the local enemy rigs, --enemies: LWF +
BTF parts of the game dump, never in the repo; left out when missing), a «TRAINING» sticker in the style of the
«Ultra Challenge!» sticker of the MOG banner and a tap arrow with its ripple.
-kept copies (pinned quest, spec 4.2; Task 14): a gold «KEPT QUEST» tab at the top left, the shape of the red «VIP Quest»
tab of the originals (measured on «VIP Get Draw Tickets x30»: band y 6-33, solid to x 143 then fading out over ~25 px,
straight cut, white ~18 px lettering with a dark outline); on a banner that already has such a tab the KEPT tab replaces
it (widened to cover it). The Shop's KEPT tag (kept_banner_badge.badge) is not used here and stays unchanged.
None for the catalogue banner, which is never pinned.
Needs Pillow; the catalogue figures also need numpy and btf.py / lwf_rig.py (recon/tools). When those or the rigs are
missing a WARNING line on stderr names the figure left out and why; the banner is still written.
"""
import argparse
import hashlib
import json
import math
import os
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kept_banner_badge as kept  # noqa: E402
import make_banner_images as mbi  # noqa: E402
import make_shop_art  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
ROOT = os.path.dirname(os.path.dirname(REPO))
KEPT_TEXT = 'KEPT QUEST'
CATALOG_TITLE, CATALOG_SUB = 'SPECIAL CATALOG', 'Tap: Training Grounds · Details: all quests'
# Raid Catalog (raids Part 2, Task 9): banner evStage 8000 in game_data/raid_img, kept raid cards <evStageId>-kept.png
RAID_CATALOG_EV, RAID_CATALOG_TITLE, RAID_CATALOG_SUB = 8000, 'RAID CATALOG', 'Tap: Training Grounds · Details: all raids'
RAID_KEPT_TEXT, RAID_STRIPS = 'KEPT RAID', 5
# Raid Catalog bosses (redesign 06-11): original raid boss rigs (lwf/character/raid/<model>/wait, LWF + textures of the game
# data, local only, --raid-rigs) as (model, height, centre x, baseline y, dark shade 0-1); back row first
RAID_RIGS = os.path.join(ROOT, 'tmp', 'raid_p2', 'files', 'lwf', 'character', 'raid')
RAID_BOSSES = [('1009', 80, 596, 86, .3), ('1005', 114, 418, 124, .2), ('0004', 116, 500, 140, 0), ('0013', 104, 594, 142, 0)]
# Event Catalog (Events Part 1, Task 6): banner evStage 20000 in game_data/event_img, kept event cards <evStageId>-kept.png
EVENT_CATALOG_TITLE, EVENT_CATALOG_SUB = 'EVENT CATALOG', 'Tap: Training Grounds · Details: all events'
EVENT_KEPT_TEXT = 'KEPT EVENT'
# originals cut into the oblique strips of the catalogue banner (reference\special_banners; missing ones are skipped)
CATALOG_STRIPS = [
    'Special - EXP Medals Power banner KHUX.png',
    'Special - Evolve Medals banner KHUX.png',
    'Special - Daily Cid Medal Challenge banner KHUX.png',
    "Special - Get the Moogle O' Glory and level it up, kupo! banner KHUX.png",
    'Special - Munny Medals 2 banner KHUX.png',
]
# enemy rigs of the game dump (LWF + BTF parts, local only): 1 = Shadow, 7 = Large Body (training quest 970000)
ENEMIES = os.path.join(ROOT, 'tmp', 'thethiny_x', 'bundle2016', 'files', 'lwf', 'character', 'enemy')
FIGURES = {7: 'Large Body', 1: 'Shadow'}


def warn(msg):
    """a WARNING line on stderr (missing local art: the banner is still written, without that piece)"""
    print('WARNING: ' + msg, file=sys.stderr)


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


# ---- KEPT tab (Special only; the Shop keeps kept_banner_badge.badge) ----
S = 4                                    # supersampling
TAB_Y0, TAB_Y1 = 6, 34                   # band rows of the red «VIP Quest» tab of the originals (y 6-33)
TAB_SOLID, TAB_FADE = 143, 26            # solid part, then fading out (no slanted cut on the originals)
BROWN = (92, 50, 8, 255)


def _dist(p, q):
    return max(abs(a - b) for a, b in zip(p[:3], q[:3]))


def vip_tab_end(im):
    """x where the coloured top-left tab band of an original (VIP Quest, Limited-Time VIP Quests...) ends, 0 when there
    is none. Sampled at x 8 (inside the frame some originals have, before the lettering): a saturated run of 20-32 rows
    starting in the top 9 rows; its end is where both rows just inside the band edges (above / below the lettering) stop
    matching the band colour, before x 340 (a band running further is a background, not a tab), and the rows under the
    band differ from it along most of its length (a stripe, not the top of a larger shape)."""
    im = im.convert('RGB')
    if im.size != (640, 140):
        im = im.resize((640, 140))
    x0 = 8
    c = im.getpixel((x0, 18))
    if max(c) - min(c) < 90:
        return 0
    y0 = y1 = 18
    while y0 > 0 and _dist(im.getpixel((x0, y0 - 1)), c) < 50:
        y0 -= 1
    while y1 < 60 and _dist(im.getpixel((x0, y1 + 1)), c) < 50:
        y1 += 1
    if y0 > 9 or not 20 <= y1 - y0 + 1 <= 32:
        return 0
    ra, rb = y0 + 2, y1 - 2
    x = x0
    while x < 340 and (_dist(im.getpixel((x, ra)), c) < 60 or _dist(im.getpixel((x, rb)), c) < 60):
        x += 1
    if x < 60 or x >= 340:
        return 0
    under = [_dist(im.getpixel((xs, min(139, y1 + 4))), c) >= 60 for xs in range(x0, x, 4)]
    return x if sum(under) >= .7 * len(under) else 0


def kept_tab(im, text=KEPT_TEXT, side='left'):
    """copy of the banner with the gold «KEPT QUEST» tab (or «KEPT RAID», text) at the top left (RGBA, 640x140); side
    'right': the same tab mirrored at the top right (event cards whose top-left art it would hide, event_config keptTab)"""
    im = im.convert('RGBA')
    if im.size != (640, 140):
        im = im.resize((640, 140), Image.LANCZOS)
    if side == 'left':
        solid = max(TAB_SOLID, vip_tab_end(im) + 4)
    else:   # as short as the text allows: the right side of the originals holds art too
        solid = int(ImageDraw.Draw(im).textlength(text, font=make_shop_art.font(18))) + 22
    return _tab(im, text, kept.GOLD_HI, kept.GOLD_LO, kept.GOLD_DK, solid, side=side)


def _tab(im, text, hi, lo, dk, solid, size=18, side='left'):
    """the top-left tab band of the originals (KEPT QUEST gold, VIP Quest red) over an RGBA 640x140 banner (side 'right':
    mirrored, text aligned right)"""
    W, H = 640 * S, 140 * S
    y0, y1, xs, xf = TAB_Y0 * S, TAB_Y1 * S, solid * S, (solid + TAB_FADE) * S
    alpha = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(alpha)
    d.rectangle([0, y0, xs, y1 - 1], fill=255)
    for x in range(xs, xf):
        t = (x - xs) / (xf - xs)
        d.line([(x, y0), (x, y1 - 1)], fill=int(255 * (1 - t * t * (3 - 2 * t))))   # smoothstep fade-out
    # alpha set on the gold itself: paste() with a mask would also blend the colour towards the transparent black of
    # the layer, the dark edge of the fade (fix round 1)
    L = kept.vgrad((W, H), hi, lo, y0, y1)
    L.putalpha(alpha)
    edge = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    de = ImageDraw.Draw(edge)
    de.rectangle([0, y1 - S, xf, y1 - 1], fill=dk)                          # dark lower edge
    de.rectangle([0, y0 + S, xf, y0 + 2 * S - 1], fill=(255, 252, 228, 200))  # light upper edge
    edge.putalpha(ImageChops.multiply(edge.getchannel('A'), alpha))
    L = Image.alpha_composite(L, edge)
    right = side == 'right'
    if right:
        L, alpha = L.transpose(Image.FLIP_LEFT_RIGHT), alpha.transpose(Image.FLIP_LEFT_RIGHT)
    ImageDraw.Draw(L).text((W - 9 * S if right else 9 * S, (y0 + y1) / 2 + S * .5), text, font=make_shop_art.font(size * S),
                           fill=(255, 255, 255, 255), anchor='rm' if right else 'lm', stroke_width=int(2.2 * S), stroke_fill=BROWN)
    sh = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    # drop shadow only under the solid part: it fades out much faster than the band (cube of the band alpha), so
    # it never shows through the half-transparent fade as a dark edge (fix round 1)
    sh.putalpha(alpha.point(lambda v: v ** 3 // 255 ** 2).filter(ImageFilter.GaussianBlur(1.5 * S)).point(lambda v: v * 90 // 255))
    out = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    out.paste(sh, (0, 2 * S))
    L = Image.alpha_composite(out, L)
    return Image.alpha_composite(im, L.resize((640, 140), Image.LANCZOS))


# ---- catalogue banner ----
def enemy_figure(eid, root=None, frame=0, size=800):
    """RGBA of an enemy in its wait pose, drawn from the local LWF rig (None when the rig is missing). The ground
    shadow piece (alpha < 1) is left out; flash masks are ignored (the two training enemies have none)."""
    d = os.path.join(root or ENEMIES, str(eid), 'wait')
    p = os.path.join(d, 'wait.lwf')
    name = FIGURES.get(eid, 'enemy %s' % eid)
    try:
        import numpy as np
        import btf
        from lwf_rig import LWF
    except ImportError as e:
        warn('%s left out of the catalog banner: %s (btf.py / lwf_rig.py of recon/tools and numpy are needed)' % (name, e))
        return None
    if not os.path.exists(p):
        warn('%s left out of the catalog banner: enemy rig %s not found' % (name, p))
        return None
    L = LWF(p)
    tex = {}
    for i, t in enumerate(L.textures):
        q = os.path.join(d, t[0])
        if os.path.exists(q):
            with open(q, 'rb') as f:
                b = f.read()
            tex[i] = (Image.open(q) if b[:4] == b'\x89PNG' else btf.decode(b)).convert('RGBA')
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    off = np.array([[1, 0, size / 2], [0, 1, size * .7], [0, 0, 1.]])
    for dr in L.draws(L.links.get('all', L.root), frame):
        ti, (u, v, fw, fh), M, mul, add = dr
        if ti not in tex or mul[3] < .99:
            continue
        A = np.linalg.inv(off @ M @ np.array([[1, 0, u], [0, 1, v], [0, 0, 1.]]))
        layer = tex[ti].crop((u, v, u + fw, v + fh)).transform((size, size), Image.AFFINE, tuple(A[:2].ravel()), Image.BICUBIC)
        out = Image.alpha_composite(out, layer)
    bb = out.getbbox()
    return out.crop(bb) if bb else None


def gold_text(im, xy, text, f, outline=5, anchor='lm', top=(255, 250, 200), bot=(232, 150, 20)):
    """gold lettering of the original banners: vertical light-yellow -> orange gradient, thick brown outline"""
    ImageDraw.Draw(im).text(xy, text, font=f, anchor=anchor, fill=BROWN, stroke_width=outline, stroke_fill=BROWN)
    m = Image.new('L', im.size, 0)
    ImageDraw.Draw(m).text(xy, text, font=f, anchor=anchor, fill=255)
    bb = m.getbbox()
    if bb:
        im.paste(kept.vgrad(im.size, top, bot, bb[1], bb[3]), (0, 0), m)
        hl = Image.new('L', im.size, 0)
        ImageDraw.Draw(hl).rectangle([bb[0], bb[1], bb[2], bb[1] + (bb[3] - bb[1]) * .3], fill=110)
        im.paste(Image.new('RGBA', im.size, (255, 255, 255, 255)), (0, 0), ImageChops.multiply(m, hl))


def sticker(text='TRAINING', w=124, h=50, angle=8):
    """«Ultra Challenge!»-style sticker: yellow spiky burst, italic orange -> red lettering with a black outline"""
    W, H = w * S, h * S
    L = Image.new('RGBA', (W + 16 * S, H + 16 * S), (0, 0, 0, 0))
    cx, cy = L.width / 2, L.height / 2
    n, pts = 22, []
    for i in range(2 * n):
        r = 1.0 if i % 2 == 0 else .82
        a = math.pi * i / n
        pts.append((cx + math.cos(a) * W / 2 * r, cy + math.sin(a) * H / 2 * r))
    d = ImageDraw.Draw(L)
    d.polygon([(x + 2 * S, y + 3 * S) for x, y in pts], fill=(60, 30, 0, 120))
    d.polygon(pts, fill=(255, 240, 0, 255))
    f = kept.font(int(H * .46))
    tl = Image.new('RGBA', L.size, (0, 0, 0, 0))
    ImageDraw.Draw(tl).text((cx, cy), text, font=f, anchor='mm', fill=(0, 0, 0, 255), stroke_width=int(1.8 * S),
                            stroke_fill=(0, 0, 0, 255))
    m = Image.new('L', L.size, 0)
    ImageDraw.Draw(m).text((cx, cy), text, font=f, anchor='mm', fill=255)
    bb = m.getbbox()
    tl.paste(kept.vgrad(L.size, (255, 176, 30), (226, 40, 10), bb[1], bb[3]), (0, 0), m)
    tl = tl.transform(tl.size, Image.AFFINE, (1, .22, -.22 * cy, 0, 1, 0), Image.BICUBIC)   # italic
    L = Image.alpha_composite(L, tl).rotate(angle, Image.BICUBIC, expand=True)
    return L.resize((L.width // S, L.height // S), Image.LANCZOS)


def tap_arrow(size=40):
    """white arrow with a brown outline pointing down-left (RGBA, tip at the bottom-left corner)"""
    W = size * S
    L = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    d = ImageDraw.Draw(L)
    pts = [(x * W, y * W) for x, y in ((.06, .94), (.08, .40), (.25, .57), (.72, .10), (.92, .30), (.45, .76), (.60, .93))]
    d.polygon(pts, fill=BROWN)
    d.line(pts + [pts[0]], fill=BROWN, width=int(3.5 * S), joint='curve')
    c = (sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))
    d.polygon([(c[0] + (x - c[0]) * .74, c[1] + (y - c[1]) * .74) for x, y in pts], fill=(255, 255, 255, 255))
    return L.resize((size, size), Image.LANCZOS)


def catalog_banner(src_dir, enemies=None, title=CATALOG_TITLE, sub=CATALOG_SUB, strips=None, art_only=False):
    """640x140 RGBA of the catalogue banner (evStage 7000; the Raid Catalog's 8000 with its own title, subtitle and strips:
    raid_catalog_banner)"""
    im = Image.new('RGBA', (640, 140), (24, 30, 70, 255))
    bg = ImageDraw.Draw(im)
    for y in range(140):
        bg.line((0, y, 639, y), fill=(18, 30 + y // 3, 80 + y // 3, 255))
    if strips is None:
        strips = [os.path.join(src_dir, f) for f in CATALOG_STRIPS if os.path.exists(os.path.join(src_dir, f))]
    strips = [p for p in strips if os.path.exists(p)]
    if strips:
        n, slant = len(strips), 34
        w = (640 + slant) / n
        for i, p in enumerate(strips):
            ban = mbi.fit(Image.open(p)).convert('RGBA')
            x0 = i * w - slant
            m = Image.new('L', (640, 140), 0)
            ImageDraw.Draw(m).polygon([(x0 + slant, 0), (x0 + w + slant + 1, 0), (x0 + w + 1, 140), (x0, 140)], fill=255)
            sh = Image.new('RGBA', (640, 140), (0, 0, 0, 0))
            sh.paste(ban, (int(x0 + w / 2 + slant / 2 - 320), 0))
            im.paste(sh, (0, 0), ImageChops.multiply(m, sh.getchannel('A')))
        d = ImageDraw.Draw(im)
        for i in range(1, n):
            x0 = i * w - slant
            d.line([(x0 + slant, 0), (x0, 140)], fill=(236, 196, 84, 255), width=2)
    # darken (more on the left, behind the title)
    dark = Image.new('RGBA', (640, 140), (0, 0, 0, 0))
    dd = ImageDraw.Draw(dark)
    for x in range(640):
        dd.line((x, 0, x, 139), fill=(8, 6, 24, int(206 - 106 * x / 639)))
    im = Image.alpha_composite(im, dark)
    # what a tap opens: the training enemies on the right, on a soft floor shadow
    glow = Image.new('RGBA', (640, 140), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse((430, 30, 650, 170), fill=(170, 200, 255, 120))
    im = Image.alpha_composite(im, glow.filter(ImageFilter.GaussianBlur(18)))
    floor = Image.new('RGBA', (640, 140), (0, 0, 0, 0))
    ImageDraw.Draw(floor).ellipse((436, 122, 636, 144), fill=(0, 0, 0, 140))
    im = Image.alpha_composite(im, floor.filter(ImageFilter.GaussianBlur(3)))
    if not enemies:
        warn('Large Body and Shadow left out of the catalog banner: no enemy rig folder given (--enemies)')
    else:
        for eid, h, x, yb in ((7, 100, 506, 137), (1, 64, 446, 135)):
            fig = enemy_figure(eid, enemies)
            if fig is not None:
                fig = fig.resize((max(1, int(fig.width * h / fig.height)), h), Image.LANCZOS)
                im.alpha_composite(fig, (x, yb - h))
    if art_only:   # catalogue options: the art and the tap mark, title / sticker / frame by family_finish
        return _tap_mark(im)
    gold_text(im, (20, 50), title, make_shop_art.font(40))
    ImageDraw.Draw(im).text((22, 104), sub, font=make_shop_art.font(19), anchor='lm', fill=(255, 255, 255, 255),
                            stroke_width=3, stroke_fill=(20, 16, 40, 255))
    im.alpha_composite(sticker(w=108, h=42), (414, -4))
    im = _tap_mark(im)
    ImageDraw.Draw(im).rectangle((1, 1, 638, 138), outline=(236, 196, 84, 255), width=3)   # square corners like the original cards (user 04-11)
    return im


def _tap_mark(im):
    rp = Image.new('RGBA', (640, 140), (0, 0, 0, 0))
    dr = ImageDraw.Draw(rp)
    tx, ty = 572, 98                     # the tap: ripple on the Large Body's belly, arrow coming from the top right
    for r, a in ((6, 255), (12, 190), (18, 110)):
        dr.ellipse((tx - r, ty - r * .7, tx + r, ty + r * .7), outline=(255, 255, 255, a), width=2)
    im = Image.alpha_composite(im, rp)
    im.alpha_composite(tap_arrow(44), (tx + 3, ty - 47))
    return im


# ---- reconstructed banners (campaigns whose original is lost; round 3, 30-10) ----
VIP_RED = ((255, 72, 60), (214, 18, 24), (96, 8, 10, 255))   # the red «VIP Quest» tab of the originals (249,39,39)
VIP_GRAD = ((150, 24, 120), (70, 18, 120))                  # VIP pink (left) -> purple (right)
TITLE_FONTS = [r'C:\Windows\Fonts\ARLRDBD.TTF', 'ARLRDBD.TTF']   # rounded heavy lettering, closest to the originals'


def title_font(px):
    from PIL import ImageFont
    for f in TITLE_FONTS:
        try:
            return ImageFont.truetype(f, px)
        except OSError:
            pass
    return make_shop_art.font(px)


def _fit_font(text, px, width, outline):
    f = title_font(px)
    while px > 14 and f.getlength(text) + 2 * outline > width:
        px -= 1
        f = title_font(px)
    return f


def reconstruct_sources(spec, src_dir):
    """True when every local source of a `reconstruct` spec (board, icon, tile) is in src_dir"""
    return bool(spec) and all(spec.get(k) and os.path.exists(os.path.join(src_dir, spec[k])) for k in ('board', 'icon', 'tile'))


def reconstructed_banner(spec, src_dir):
    """640x140 RGBA banner rebuilt in the style of the original VIP quest banners for a campaign whose banner is lost
    (rules.campaigns[key].reconstruct): spec {board, crop [x0, y0, x1, y1] of the board screenshot, icon (Limited VIP
    Coin), tile (board preview tile), title, sub, tab?}. Background: the crop of the real board screenshot, darkened
    and blended into the VIP pink -> purple gradient, with a soft glow behind the lettering; the red «VIP Quest» tab at
    the top left; the title in the gold lettering with the dark outline (gold_text), the sub line in white with a
    dark plum outline; on the right the board tile with the Limited VIP Coin over its lower-left corner."""
    board = Image.open(os.path.join(src_dir, spec['board'])).convert('RGB')
    if spec.get('crop'):
        board = board.crop(tuple(spec['crop']))
    bg = mbi.fit(board).convert('RGB')
    bg = ImageChops.multiply(bg, Image.new("RGB", bg.size, (185, 185, 185)))          # darken
    grad = Image.new('RGB', (640, 1))
    for x in range(640):
        t = x / 639
        grad.putpixel((x, 0), tuple(int(a + (b - a) * t) for a, b in zip(*VIP_GRAD)))
    grad = grad.resize((640, 140))
    im = Image.blend(bg, ImageChops.screen(bg, grad), .75).convert("RGBA")
    im = Image.blend(im, grad.convert("RGBA"), .18)
    # light rays + glow behind the title (the originals' sparkle backdrop, kept soft)
    glow = Image.new('RGBA', (640, 140), (0, 0, 0, 0))
    dg = ImageDraw.Draw(glow)
    dg.ellipse((40, 40, 470, 150), fill=(255, 150, 220, 80))
    for i in range(9):
        a = -math.pi * (.05 + .1 * i)
        dg.polygon([(250, 150), (250 + math.cos(a - .04) * 700, 150 + math.sin(a - .04) * 700),
                    (250 + math.cos(a + .04) * 700, 150 + math.sin(a + .04) * 700)], fill=(255, 220, 245, 26))
    im = Image.alpha_composite(im, glow.filter(ImageFilter.GaussianBlur(14)))
    sp = Image.new('RGBA', (640, 140), (0, 0, 0, 0))
    ds = ImageDraw.Draw(sp)
    h = int(hashlib.md5(spec['board'].encode()).hexdigest(), 16)
    for i in range(16):                                                               # sparkles (stable per board)
        x, y, r = 20 + (h >> (3 * i)) % 440, 10 + (h >> (5 * i + 1)) % 120, 2 + (h >> (7 * i + 2)) % 3
        ds.polygon([(x, y - 3 * r), (x + r * .5, y), (x, y + 3 * r), (x - r * .5, y)], fill=(255, 255, 255, 170))
        ds.polygon([(x - 3 * r, y), (x, y - r * .5), (x + 3 * r, y), (x, y + r * .5)], fill=(255, 255, 255, 170))
    im = Image.alpha_composite(im, sp)
    # right: the board tile (gold frame of the preview) with a drop shadow, the Limited VIP Coin over its corner
    tile = Image.open(os.path.join(src_dir, spec['tile'])).convert('RGBA')
    tile = tile.resize((118, int(tile.height * 118 / tile.width)), Image.LANCZOS)
    tx, ty = 508, (140 - tile.height) // 2 + 2
    shd = Image.new('RGBA', (640, 140), (0, 0, 0, 0))
    shd.paste((20, 0, 30, 170), (tx + 4, ty + 5, tx + 4 + tile.width, ty + 5 + tile.height))
    im = Image.alpha_composite(im, shd.filter(ImageFilter.GaussianBlur(4)))
    im.alpha_composite(tile, (tx, ty))
    coin = Image.open(os.path.join(src_dir, spec['icon'])).convert('RGBA')
    coin = coin.resize((66, int(coin.height * 66 / coin.width)), Image.LANCZOS)
    im.alpha_composite(coin, (tx - 40, 140 - coin.height - 4))
    # lettering
    title, sub = spec.get('title', ''), spec.get('sub', '')
    f = _fit_font(title, 44, 450, 6)
    gold_text(im, (18, 64 if sub else 76), title, f, outline=6, bot=(240, 120, 10))
    if sub:
        fs = _fit_font(sub, 24, 440, 3)
        ImageDraw.Draw(im).text((24, 108), sub, font=fs, anchor='lm', fill=(255, 255, 255, 255),
                                stroke_width=3, stroke_fill=(70, 10, 60, 255))
    return _tab(im, spec.get('tab', 'VIP Quest'), VIP_RED[0], VIP_RED[1], VIP_RED[2], 100)


def source_counts(rules, src_dir):
    """banners of the rules (entries + campaigns): {'original': n, 'plate': n, 'reconstructed': n, 'missing': [names
    not in src_dir]}"""
    names = [(e.get('banner', ''), None) for e in rules.get('entries', [])]
    names += [(c.get('banner', ''), c.get('reconstruct')) for k, c in (rules.get('campaigns') or {}).items() if not k.startswith('_')]
    r = {'original': 0, 'plate': 0, 'reconstructed': 0, 'missing': []}
    for b, rc in names:
        if not b and rc and reconstruct_sources(rc, src_dir):
            r['reconstructed'] += 1
        elif not b:
            r['plate'] += 1
        elif os.path.exists(os.path.join(src_dir, b)):
            r['original'] += 1
        else:
            r['missing'].append(b)
    return r


def build_all(index, src_dir, out_dir, mode, enemies=None, rules=None):
    """writes the PNGs of the catalogue banner and of every entry; returns the counts original / plate / catalog /
    reconstructed (rules: server/special_periods.json, whose campaigns[key].reconstruct rebuilds a lost banner)"""
    os.makedirs(out_dir, exist_ok=True)
    n = {'original': 0, 'plate': 0, 'catalog': 0, 'reconstructed': 0}
    camps = (rules or {}).get('campaigns') or {}
    cat = index.get('catalog') or {}
    if cat.get('evStageId'):
        mbi.save_png(special_option(CATALOG_CHOICE['special'], src_dir, enemies), os.path.join(out_dir, '%d.png' % cat['evStageId']), mode)
        n['catalog'] += 1
    for e in index.get('entries', []):
        p = os.path.join(src_dir, e['banner']) if e.get('banner') else None
        rc = (camps.get(e.get('key')) or {}).get('reconstruct')
        if p and os.path.exists(p):
            im = mbi.fit(Image.open(p))
            n['original'] += 1
        elif not p and reconstruct_sources(rc, src_dir):
            im = reconstructed_banner(rc, src_dir)
            n['reconstructed'] += 1
        else:
            im = plate(e['name'], e.get('family', '')).convert('RGBA')
            n['plate'] += 1
        mbi.save_png(im, os.path.join(out_dir, '%d.png' % e['evStageId']), mode)
        mbi.save_png(kept_tab(im), os.path.join(out_dir, '%d-kept.png' % e['evStageId']), mode)
    return n


# ---- Raid Catalog (raids Part 2, Task 9) ----
def raid_cards(raid_img, skip=()):
    """the weekly event cards of make_raid_banners.py in raid_img (<evStageId>.png, by id), without the plain plate 0.png,
    the catalogue banner, the -kept copies and the evStageIds in skip (the Japan-only rows: their cards stay off the
    catalogue banner, which shows the WW raids)"""
    if not os.path.isdir(raid_img):
        return []
    ids = sorted(int(f[:-4]) for f in os.listdir(raid_img) if f.endswith('.png') and f[:-4].isdigit()
                 and int(f[:-4]) not in (0, RAID_CATALOG_EV) and int(f[:-4]) not in skip)
    return [os.path.join(raid_img, '%d.png' % i) for i in ids]


def raid_catalog_banner(rigs=None, bosses=None, title=RAID_CATALOG_TITLE, sub=RAID_CATALOG_SUB, art_only=False):
    """640x140 RGBA of the Raid Catalog banner (evStage 8000; redesigned 06-11 on the user's request: red, the raid bosses):
    a red background with light rays (the red of the original raid banners), a group of original raid bosses on the right
    (their wait pose drawn from the local raid rigs, RAID_BOSSES; one missing -> left out with a WARNING), the large gold
    «RAID CATALOG», the subtitle, the TRAINING sticker (a tap opens the Training Grounds) and the square gold frame"""
    W, H = 640, 140
    im = Image.new('RGBA', (W, H))
    im.paste(kept.vgrad((W, H), (214, 34, 30), (92, 6, 12), 0, H), (0, 0))
    rays = Image.new('RGBA', (W * S, H * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(rays)
    cx, cy = 470 * S, 64 * S
    for k in range(18):
        a0 = math.pi * 2 * k / 18
        a1 = a0 + math.pi / 30
        r = 900 * S
        d.polygon([(cx, cy), (cx + math.cos(a0) * r, cy + math.sin(a0) * r), (cx + math.cos(a1) * r, cy + math.sin(a1) * r)],
                  fill=(255, 190, 120, 34))
    im = Image.alpha_composite(im, rays.resize((W, H), Image.LANCZOS))
    glow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse((330, -10, 620, 150), fill=(255, 150, 60, 120))
    im = Image.alpha_composite(im, glow.filter(ImageFilter.GaussianBlur(24)))
    dark = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    dd = ImageDraw.Draw(dark)
    for x in range(W):
        dd.line((x, 0, x, H - 1), fill=(30, 0, 4, max(0, int(150 - 150 * x / 360))))
    im = Image.alpha_composite(im, dark)
    # the bosses: back row first (smaller, darker), the front one last
    figs = []
    for mid, h, x, yb, shade in (bosses if bosses is not None else RAID_BOSSES):
        f = enemy_figure(mid, rigs or RAID_RIGS, frame=10, size=1600)
        if f is None:
            warn('raid boss %s left out of the Raid Catalog banner (rig not found in %s)' % (mid, rigs or RAID_RIGS))
            continue
        f = f.resize((max(1, int(f.width * h / f.height)), h), Image.LANCZOS)
        if shade:
            f = Image.alpha_composite(f, Image.composite(Image.new('RGBA', f.size, (40, 0, 8, int(255 * shade))),
                                                         Image.new('RGBA', f.size, (0, 0, 0, 0)), f.getchannel('A')))
        figs.append(mid)
        sh = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        sh.alpha_composite(f, (int(x - f.width / 2), yb - h))
        a = sh.getchannel('A').filter(ImageFilter.GaussianBlur(4)).point(lambda v: v * 120 // 255)
        shadow = Image.new('RGBA', (W, H), (20, 0, 0, 0))
        shadow.putalpha(a)
        im = Image.alpha_composite(im, shadow)
        im = Image.alpha_composite(im, sh)
    if art_only:
        im.info['bosses'] = figs
        return im
    gold_text(im, (20, 50), title, title_font(44), outline=6)
    ImageDraw.Draw(im).text((22, 106), sub, font=make_shop_art.font(19), anchor='lm', fill=(255, 255, 255, 255),
                            stroke_width=3, stroke_fill=(50, 4, 8, 255))
    im.alpha_composite(sticker(w=92, h=34, angle=-6), (300, -2))
    ImageDraw.Draw(im).rectangle((1, 1, 638, 138), outline=(236, 196, 84, 255), width=3)   # square gold frame (user 04-11)
    im.info['bosses'] = figs
    return im


def build_raid(index, raid_img, mode, rigs=None, catalog_only=False):
    """writes raid_img/8000.png (index.catalog of raids.json: raid_catalog_banner) and, unless catalog_only, <evStageId>-kept.png
    for every raid week of the index, the card with a «KEPT RAID» tab (its own card, else the plain plate 0.png; none:
    skipped). Run after make_raid_banners.py. Returns the counts catalog / kept / missing."""
    os.makedirs(raid_img, exist_ok=True)
    n = {'catalog': 0, 'kept': 0, 'missing': 0}
    cat = index.get('catalog') or {}
    if cat.get('evStageId'):
        mbi.save_png(raid_option(CATALOG_CHOICE['raid'], rigs), os.path.join(raid_img, '%d.png' % cat['evStageId']), mode)
        n['catalog'] += 1
    if catalog_only:
        return n
    for ev in sorted({e['evStageId'] for e in index.get('entries', []) if e.get('evStageId')}):
        src = next((p for p in (os.path.join(raid_img, '%d.png' % ev), os.path.join(raid_img, '0.png')) if os.path.exists(p)), None)
        if not src:
            n['missing'] += 1
            continue
        mbi.save_png(kept_tab(Image.open(src), RAID_KEPT_TEXT), os.path.join(raid_img, '%d-kept.png' % ev), mode)
        n['kept'] += 1
    return n


# ---- Event Catalog (Events Part 1, Task 6; redesigned in fix round 1, user 06-11: clearly apart from the Raid Catalog) ----
# the Event Coin of the game UI (reward type 15, the coin printed on the event cards): img/incentive/IncentiveIcon_15.png of the
# local JP 4.3.1 data (private_tools jp_data; never in the repo); missing -> the banner is written without it (WARNING)
EVENT_COIN = ('img', 'incentive', 'IncentiveIcon_15.png')
EVENT_TOP, EVENT_BOT = (64, 214, 214), (34, 150, 96)     # cyan -> green of the 3rd Anniversary event cards
EVENT_INK = (8, 70, 72, 255)                            # dark teal outline of the lettering


def event_coin_path():
    try:
        import private_tools
        return private_tools.local_path('jp_data', *EVENT_COIN)
    except Exception:  # noqa: BLE001 - no local data: no coin
        return None


def game_image(p):
    """an image of the game data: PNG, or BTF (btf.py) when the file is one"""
    with open(p, 'rb') as f:
        data = f.read()
    if data[:4] == b'\x89BTF':
        import btf
        return btf.decode(data).convert('RGBA')
    return Image.open(p).convert('RGBA')


def event_catalog_banner(coin=None, title=EVENT_CATALOG_TITLE, sub=EVENT_CATALOG_SUB, art_only=False, dx=0):
    """640x140 RGBA of the Event Catalog banner (evStage 20000; user 06-11: cyan/green, clearly apart from the Raid Catalog,
    then «more beautiful»): a cyan -> green background with light rays and soft bokeh as the original event banners, the
    game's Event Coin three times (a large one in front of two tilted ones) on a glow with sparkles, the large title with
    the original banners' lettering (white -> pale cyan fill, dark teal outline, white outer rim, drop shadow), the subtitle
    on a dark teal ribbon with a white edge, the small TRAINING sticker and a thin white frame"""
    import random
    W, H = 640, 140
    rnd = random.Random(20000)
    im = Image.new('RGBA', (W, H))
    im.paste(kept.vgrad((W, H), EVENT_TOP, EVENT_BOT, 0, H), (0, 0))
    rays = Image.new('RGBA', (W * S, H * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(rays)
    cx, cy = (74 + dx) * S, 70 * S
    for k in range(16):
        a0 = math.pi * 2 * k / 16
        a1 = a0 + math.pi / 26
        r = 900 * S
        d.polygon([(cx, cy), (cx + math.cos(a0) * r, cy + math.sin(a0) * r), (cx + math.cos(a1) * r, cy + math.sin(a1) * r)],
                  fill=(255, 255, 255, 30))
    im = Image.alpha_composite(im, rays.resize((W, H), Image.LANCZOS))
    # bokeh: soft round lights
    bk = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    db = ImageDraw.Draw(bk)
    for _ in range(26):
        x, y, r = rnd.randint(150, 640), rnd.randint(-10, 150), rnd.randint(6, 22)
        db.ellipse((x - r, y - r, x + r, y + r), fill=(255, 255, 240, rnd.randint(28, 70)))
    im = Image.alpha_composite(im, bk.filter(ImageFilter.GaussianBlur(2.5)))
    band = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(band).polygon([(250, 0), (330, 0), (230, 140), (150, 140)], fill=(255, 255, 255, 26))
    im = Image.alpha_composite(im, band.filter(ImageFilter.GaussianBlur(6)))
    glow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse((4 + dx, 4, 150 + dx, 136), fill=(255, 255, 230, 170))
    im = Image.alpha_composite(im, glow.filter(ImageFilter.GaussianBlur(14)))
    if coin and os.path.exists(coin):
        c = game_image(coin)
        for size, ang, x, y, shade in ((62, 24, 4, 8, .25), (62, -20, 84, 6, .25), (104, 0, 22, 26, 0)):
            ci = c.resize((size, size), Image.LANCZOS).rotate(ang, Image.BICUBIC, expand=True)
            if shade:
                ci = Image.alpha_composite(ci, Image.composite(Image.new('RGBA', ci.size, (0, 60, 60, int(255 * shade))),
                                                               Image.new('RGBA', ci.size, (0, 0, 0, 0)), ci.getchannel('A')))
            sh = Image.new('RGBA', (W, H), (0, 0, 0, 0))
            sh.alpha_composite(ci, (x + dx, y))
            a = sh.getchannel('A').filter(ImageFilter.GaussianBlur(3)).point(lambda v: v * 110 // 255)
            shadow = Image.new('RGBA', (W, H), (0, 40, 40, 0))
            shadow.putalpha(a)
            im = Image.alpha_composite(im, shadow)
            im = Image.alpha_composite(im, sh)
    else:
        warn('Event Coin left out of the Event Catalog banner: %s not found (local JP data)' % (coin or '/'.join(EVENT_COIN)))
    sp = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ds = ImageDraw.Draw(sp)
    for x, y, r in ((128, 22, 4), (20, 112, 3), (140, 112, 3), (560, 60, 4), (604, 112, 3), (470, 124, 2), (380, 16, 2)):
        ds.polygon([(x, y - r * 3), (x + r, y), (x, y + r * 3), (x - r, y)], fill=(255, 255, 255, 230))
        ds.polygon([(x - r * 3, y), (x, y - r), (x + r * 3, y), (x, y + r)], fill=(255, 255, 255, 230))
    im = Image.alpha_composite(im, sp)
    if art_only:
        return im
    # title: drop shadow, white outer rim, dark teal outline, white -> pale cyan fill
    f = title_font(46)
    tx, ty = 150, 54
    shd = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(shd).text((tx + 3, ty + 4), title, font=f, anchor='lm', fill=(0, 40, 40, 150), stroke_width=9, stroke_fill=(0, 40, 40, 150))
    im = Image.alpha_composite(im, shd.filter(ImageFilter.GaussianBlur(2)))
    ImageDraw.Draw(im).text((tx, ty), title, font=f, anchor='lm', fill=(255, 255, 255, 255), stroke_width=9, stroke_fill=(255, 255, 255, 255))
    ImageDraw.Draw(im).text((tx, ty), title, font=f, anchor='lm', fill=EVENT_INK, stroke_width=6, stroke_fill=EVENT_INK)
    m = Image.new('L', (W, H), 0)
    ImageDraw.Draw(m).text((tx, ty), title, font=f, anchor='lm', fill=255)
    bb = m.getbbox()
    if bb:
        im.paste(kept.vgrad((W, H), (255, 255, 255), (178, 240, 236), bb[1], bb[3]), (0, 0), m)
        hl = Image.new('L', (W, H), 0)
        ImageDraw.Draw(hl).rectangle([bb[0], bb[1], bb[2], bb[1] + (bb[3] - bb[1]) * .35], fill=90)
        im.paste(Image.new('RGBA', (W, H), (255, 255, 255, 255)), (0, 0), ImageChops.multiply(m, hl))
    # subtitle ribbon
    fs = make_shop_art.font(18)
    tw = ImageDraw.Draw(im).textlength(sub, font=fs)
    x0, x1, y0, y1 = 140, 140 + tw + 28, 94, 120
    rib = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    dr = ImageDraw.Draw(rib)
    dr.polygon([(x0, y0), (x1, y0), (x1 - 8, (y0 + y1) / 2), (x1, y1), (x0, y1), (x0 + 8, (y0 + y1) / 2)], fill=(10, 86, 88, 235),
               outline=(255, 255, 255, 255))
    dr.line([(x0, y0), (x1, y0)], fill=(255, 255, 255, 255), width=2)
    dr.line([(x0, y1), (x1, y1)], fill=(255, 255, 255, 255), width=2)
    im = Image.alpha_composite(im, rib)
    ImageDraw.Draw(im).text((x0 + 14, (y0 + y1) / 2 + 1), sub, font=fs, anchor='lm', fill=(255, 255, 255, 255),
                            stroke_width=2, stroke_fill=(0, 40, 40, 255))
    im.alpha_composite(sticker(w=92, h=34, angle=-6), (540, 0))
    ImageDraw.Draw(im).rectangle((1, 1, 638, 138), outline=(255, 255, 255, 255), width=3)   # square corners as the cards
    return im


def event_cards(index, event_img):
    """the event cards of make_event_banners.py for the events of events.json (entries with an evStageId, index order),
    the ones written only"""
    ids = []
    for e in index.get('entries', []):
        ev = e.get('evStageId')
        if ev and ev not in ids and os.path.exists(os.path.join(event_img, '%d.png' % ev)):
            ids.append(ev)
    return [os.path.join(event_img, '%d.png' % i) for i in ids]


def build_event(index, catalog_ev, event_img, mode, coin=None, kept_side=None):
    """writes event_img/<catalog_ev>.png (the Event Catalog banner, event_catalog_banner; no -kept copy: it is never kept)
    and <evStageId>-kept.png for every event of the index (its card, else 0.png; none: skipped), the KEPT EVENT tab on the
    side kept_side {evStageId: 'left'|'right'} names (event_config.json keptTab; default left). Run after
    make_event_banners.py. Returns the counts catalog / kept / missing."""
    os.makedirs(event_img, exist_ok=True)
    n = {'catalog': 0, 'kept': 0, 'missing': 0}
    sides = {int(k): v for k, v in (kept_side or {}).items()}
    if catalog_ev:
        mbi.save_png(event_option(CATALOG_CHOICE['event'], coin), os.path.join(event_img, '%d.png' % catalog_ev), mode)
        n['catalog'] += 1
    for ev in sorted({e['evStageId'] for e in index.get('entries', []) if e.get('evStageId')}):
        src = next((p for p in (os.path.join(event_img, '%d.png' % ev), os.path.join(event_img, '0.png')) if os.path.exists(p)), None)
        if not src:
            n['missing'] += 1
            continue
        side = sides.get(ev, 'left')
        if side not in ('left', 'right'):
            raise ValueError('keptTab %d: side %r (left or right)' % (ev, side))
        mbi.save_png(kept_tab(Image.open(src), EVENT_KEPT_TEXT, side), os.path.join(event_img, '%d-kept.png' % ev), mode)
        n['kept'] += 1
    return n


# ---- Catalogue card options (user 06-11: every catalogue card with the gold frame and the gold title, each design
# different; options A/B/C per catalogue, chosen later with --catalog-style; nothing here changes a served card) ----
# the options the user chose (06-11): what the normal builds (build_all / build_raid / build_event) write for 7000 / 8000 /
# 20000. After a change: bump SPECIAL_IMG_VERSION (server/special.js), RAID_IMG_VERSION (server/routes-raid.js), imgVersion
# (server/event_config.json), then the master run
CATALOG_CHOICE = {'special': 'B', 'raid': 'B1', 'event': 'A'}
FAMILY_GOLD = (236, 196, 84, 255)
STICKER_WH = (78, 30)
FRAME_INNER = (4, 4, 635, 135)             # inside the 3 px gold frame drawn at (1, 1, 638, 138)
STICKER_MARGIN = 4                         # the TRAINING sticker sits this far inside the frame's inner edge (user 06-11)


def family_sticker():
    """(sticker image, (x, y) of its top-left, box of its opaque pixels on the card): top right, fully inside the frame"""
    st = sticker(w=STICKER_WH[0], h=STICKER_WH[1], angle=-6)
    bb = st.getbbox()
    x = FRAME_INNER[2] - STICKER_MARGIN - bb[2]
    y = FRAME_INNER[1] + STICKER_MARGIN - bb[1]
    return st, (x, y), (x + bb[0], y + bb[1], x + bb[2], y + bb[3])


TITLE_MAX_RIGHT = family_sticker()[2][0] - 24   # the title keeps clear of the TRAINING sticker
MEDALS = os.path.join(ROOT, 'medal_gen', 'files', 'img', 'medal')


def jp_img(*parts):
    """a file of the local JP 4.3.1 img/ folder (private_tools jp_data), None without the local data"""
    try:
        import private_tools
        return private_tools.local_path('jp_data', 'img', *parts)
    except Exception:  # noqa: BLE001
        return None


def art(path, size, what):
    """an original image of the game data fitted in a size x size box, None (WARNING) when it is not there"""
    if not path or not os.path.exists(path):
        warn('%s left out of a catalogue option: %s not found' % (what, path))
        return None
    im = game_image(path)
    im.thumbnail((size, size), Image.LANCZOS)
    return im


def tinted(im, rgba):
    """im with a flat colour laid over its own shape (silhouettes, back-row shading)"""
    return Image.alpha_composite(im, Image.composite(Image.new('RGBA', im.size, rgba), Image.new('RGBA', im.size, (0, 0, 0, 0)), im.getchannel('A')))


def paste_shadowed(im, piece, xy, blur=3, alpha=110, colour=(0, 0, 0)):
    lay = Image.new('RGBA', im.size, (0, 0, 0, 0))
    lay.alpha_composite(piece, (int(xy[0]), int(xy[1])))
    sh = Image.new('RGBA', im.size, colour + (0,))
    sh.putalpha(lay.getchannel('A').filter(ImageFilter.GaussianBlur(blur)).point(lambda v: v * alpha // 255))
    return Image.alpha_composite(Image.alpha_composite(im, sh), lay)


def background(top, bot, ray=None, centre=(480, 70), n=16, ray_alpha=30):
    im = Image.new('RGBA', (640, 140))
    im.paste(kept.vgrad((640, 140), top, bot, 0, 140), (0, 0))
    if ray:
        L = Image.new('RGBA', (640 * S, 140 * S), (0, 0, 0, 0))
        d = ImageDraw.Draw(L)
        cx, cy = centre[0] * S, centre[1] * S
        for k in range(n):
            a0 = math.pi * 2 * k / n
            a1 = a0 + math.pi / (2 * n)
            d.polygon([(cx, cy), (cx + math.cos(a0) * 4000, cy + math.sin(a0) * 4000), (cx + math.cos(a1) * 4000, cy + math.sin(a1) * 4000)],
                      fill=tuple(ray) + (ray_alpha,))
        im = Image.alpha_composite(im, L.resize((640, 140), Image.LANCZOS))
    return im


def left_shade(im, rgb, strength=150, width=380):
    dark = Image.new('RGBA', im.size, (0, 0, 0, 0))
    dd = ImageDraw.Draw(dark)
    for x in range(im.width):
        dd.line((x, 0, x, im.height - 1), fill=tuple(rgb) + (max(0, int(strength - strength * x / width)),))
    return Image.alpha_composite(im, dark)


def family_finish(im, title, sub, ink):
    """the common part of every catalogue card: gold title (the old Raid Catalog lettering) as large as fits left of the
    TRAINING sticker, the white subtitle, the sticker in the top right corner and the square gold frame.
    im.info['title_box'] = the title's box (tests: never under the sticker)"""
    im = im.copy()
    px = 46
    while px > 28 and 20 + ImageDraw.Draw(im).textlength(title, font=title_font(px)) + 6 > TITLE_MAX_RIGHT:
        px -= 1
    f = title_font(px)
    m = Image.new('L', im.size, 0)
    ImageDraw.Draw(m).text((20, 52), title, font=f, anchor='lm', fill=255, stroke_width=6, stroke_fill=255)
    gold_text(im, (20, 52), title, f, outline=6)
    ImageDraw.Draw(im).text((22, 108), sub, font=make_shop_art.font(19), anchor='lm', fill=(255, 255, 255, 255),
                            stroke_width=3, stroke_fill=tuple(ink) + (255,))
    st, xy, sbox = family_sticker()
    im.alpha_composite(st, xy)
    im.info['sticker_box'] = sbox
    ImageDraw.Draw(im).rectangle((1, 1, 638, 138), outline=FAMILY_GOLD, width=3)
    im.info['title_box'] = m.getbbox()
    return im


# Special Catalog
def special_option(style, src=None, enemies=None):
    if style == 'A':   # the current design (strips of original Special banners, Training Grounds figures) in the family
        art_im = catalog_banner(src or os.path.join(ROOT, 'reference', 'special_banners'), enemies or ENEMIES, art_only=True)
        return family_finish(art_im, CATALOG_TITLE, CATALOG_SUB, (20, 16, 40))
    if style == 'B':   # violet, the elemental orbs of the Special quests around a Moogle medal
        im = background((150, 70, 200), (46, 12, 86), ray=(230, 200, 255), centre=(520, 70))
        glow = Image.new('RGBA', im.size, (0, 0, 0, 0))
        ImageDraw.Draw(glow).ellipse((440, 0, 600, 140), fill=(255, 230, 255, 140))
        im = Image.alpha_composite(im, glow.filter(ImageFilter.GaussianBlur(18)))
        for i, mid in enumerate((47, 50, 51, 52, 53, 54, 55, 49, 48)):
            a = math.pi * (0.75 + 1.5 * i / 8)
            o = art(jp_img('material', 'material_%d.png' % mid), 34, 'orb material_%d' % mid)
            if o is not None:
                im = paste_shadowed(im, o, (520 + math.cos(a) * 84 - 17, 70 + math.sin(a) * 52 - 17), alpha=90)
        med = art(os.path.join(MEDALS, 'Medal_L_90016.png'), 112, 'Moogle medal')
        if med is not None:
            im = paste_shadowed(im, med, (520 - med.width / 2, 72 - med.height / 2))
        return family_finish(left_shade(im, (30, 0, 50)), CATALOG_TITLE, CATALOG_SUB, (40, 10, 60))
    if style == 'C':   # warm gold-orange, a fan of the medals the Special quests give (Moogle, Huey, Dewey, Louie)
        im = background((250, 176, 60), (170, 70, 10), ray=(255, 240, 200), centre=(520, 150), n=20, ray_alpha=40)
        ids = (90011, 90021, 90031, 90041, 90016)
        for i, mid in enumerate(ids):
            med = art(os.path.join(MEDALS, 'Medal_L_%d.png' % mid), 80, 'medal %d' % mid)
            if med is None:
                continue
            ang = 24 - 12 * i
            med = med.rotate(ang, Image.BICUBIC, expand=True)
            im = paste_shadowed(im, med, (458 + 40 * i - med.width / 2, 88 - med.height / 2 + abs(i - 2) * 7), alpha=120)
        return family_finish(left_shade(im, (90, 30, 0)), CATALOG_TITLE, CATALOG_SUB, (80, 30, 0))
    raise ValueError('special style %r' % style)


# Raid Catalog
RAID_PORTRAITS = ['0004', '0013', '1005', '1009']


def raid_option(style, rigs=None):
    rigs = rigs or RAID_RIGS
    if style in RAID_B_VARIANTS:
        return raid_b_variant(style, rigs)
    if style == 'A':   # the current red design: rays and a group of raid bosses
        return family_finish(raid_catalog_banner(rigs, art_only=True), RAID_CATALOG_TITLE, RAID_CATALOG_SUB, (50, 4, 8))
    if style == 'B':   # black -> dark red, raid board cells, one large boss as a silhouette with a red rim
        im = background((70, 6, 12), (10, 0, 4))
        cell_r = art(jp_img('sphere_board', 'Board_0102.png'), 30, 'board cell')
        cell_g = art(jp_img('sphere_board', 'Board_0002.png'), 30, 'board cell')
        lay = Image.new('RGBA', im.size, (0, 0, 0, 0))
        for r in range(5):
            for c in range(12):
                cell = cell_g if (r * 3 + c) % 7 == 0 else cell_r
                if cell is not None:
                    lay.alpha_composite(cell, (290 + c * 30 + (r % 2) * 15, -6 + r * 30))
        fade = Image.new('L', im.size, 0)
        fd = ImageDraw.Draw(fade)
        for x in range(640):
            fd.line((x, 0, x, 139), fill=max(0, min(110, int((x - 280) * 0.6))))
        lay.putalpha(ImageChops.multiply(lay.getchannel('A'), fade))
        im = Image.alpha_composite(im, lay)
        f = enemy_figure('0013', rigs, frame=10, size=1600)
        if f is None:
            warn('raid boss 0013 left out of Raid option B')
        else:
            f = f.resize((int(f.width * 170 / f.height), 170), Image.LANCZOS)
            sil = tinted(f, (12, 0, 4, 255))
            rim = Image.new('RGBA', im.size, (0, 0, 0, 0))
            rim.alpha_composite(f, (int(520 - f.width / 2), 150 - 170))
            glow = Image.new('RGBA', im.size, (255, 40, 30, 0))
            glow.putalpha(rim.getchannel('A').filter(ImageFilter.MaxFilter(7)).filter(ImageFilter.GaussianBlur(5)))
            im = Image.alpha_composite(im, glow)
            im.alpha_composite(sil, (int(520 - f.width / 2), 150 - 170))
            # the boss's eyes / heart: the lit original pieces over the silhouette, faint
            lit = rim.copy()
            lit.putalpha(rim.getchannel('A').point(lambda v: v * 50 // 255))
            im = Image.alpha_composite(im, lit)
        return family_finish(left_shade(im, (0, 0, 0), 120), RAID_CATALOG_TITLE, RAID_CATALOG_SUB, (50, 4, 8))
    if style == 'C':   # crimson with rays, the raid bosses as round portraits in gold rings
        im = background((196, 20, 46), (96, 0, 24), ray=(255, 200, 200), centre=(500, 92), ray_alpha=28)
        for i, mid in enumerate(RAID_PORTRAITS):
            f = enemy_figure(mid, rigs, frame=10, size=1600)
            if f is None:
                warn('raid boss %s left out of Raid option C' % mid)
                continue
            side = min(f.width, int(f.height * .72))
            crop = f.crop(((f.width - side) // 2, 0, (f.width - side) // 2 + side, side)).resize((60, 60), Image.LANCZOS)
            disc = Image.new('RGBA', (60, 60), (60, 0, 14, 255))
            disc.alpha_composite(crop)
            mask = Image.new('L', (60 * S, 60 * S), 0)
            ImageDraw.Draw(mask).ellipse((0, 0, 60 * S - 1, 60 * S - 1), fill=255)
            disc.putalpha(mask.resize((60, 60), Image.LANCZOS))
            ring = Image.new('RGBA', (68 * S, 68 * S), (0, 0, 0, 0))
            ImageDraw.Draw(ring).ellipse((0, 0, 68 * S - 1, 68 * S - 1), fill=(150, 96, 10, 255))
            ImageDraw.Draw(ring).ellipse((2 * S, 2 * S, 66 * S - 1, 66 * S - 1), fill=(244, 206, 96, 255))
            ring = ring.resize((68, 68), Image.LANCZOS)
            ring.alpha_composite(disc, (4, 4))
            im = paste_shadowed(im, ring, (438 + 54 * i - 34, 90 - 34 + (8 if i % 2 else 0)), alpha=140)
        return family_finish(left_shade(im, (60, 0, 10), 120), RAID_CATALOG_TITLE, RAID_CATALOG_SUB, (60, 0, 12))
    raise ValueError('raid style %r' % style)


# Event Catalog
def event_option(style, coin=None):
    coin = coin or event_coin_path()
    if style == 'A':   # the current cyan / green design (rays, bokeh, three Event Coins)
        return family_finish(event_catalog_banner(coin, art_only=True, dx=432), EVENT_CATALOG_TITLE, EVENT_CATALOG_SUB, (8, 70, 72))
    if style == 'B':   # deep teal, a rain of Event Coins (near ones sharp, far ones small and soft)
        import random
        rnd = random.Random(7)
        im = background((30, 150, 160), (6, 64, 84), ray=(200, 255, 250), centre=(500, -20), ray_alpha=24)
        c0 = art(coin, 86, 'Event Coin')
        if c0 is not None:
            for _ in range(34):
                size = rnd.choice((16, 20, 24, 30, 38, 48, 58))
                x, y = (rnd.randint(300, 620), rnd.randint(-20, 130)) if size < 30 else (rnd.randint(430, 600), rnd.randint(-10, 110))
                ci = c0.resize((size, size), Image.LANCZOS).rotate(rnd.randint(-40, 40), Image.BICUBIC, expand=True)
                if size < 30:
                    ci = ci.filter(ImageFilter.GaussianBlur(1.2))
                    ci.putalpha(ci.getchannel('A').point(lambda v: v * 150 // 255))
                im = paste_shadowed(im, ci, (x, y), alpha=70 if size >= 30 else 0)
        return family_finish(left_shade(im, (0, 30, 40), 150), EVENT_CATALOG_TITLE, EVENT_CATALOG_SUB, (0, 50, 60))
    if style == 'C':   # green -> blue with a ribbon across and a calendar page with the Event Coin on one day
        im = background((70, 200, 150), (30, 100, 180), ray=(255, 255, 255), centre=(540, 70), ray_alpha=22)
        rib = Image.new('RGBA', im.size, (0, 0, 0, 0))
        dr = ImageDraw.Draw(rib)
        dr.polygon([(250, 140), (640, 34), (640, 76), (300, 140)], fill=(255, 255, 255, 60))
        im = Image.alpha_composite(im, rib)
        page = Image.new('RGBA', (124 * S, 112 * S), (0, 0, 0, 0))
        dp = ImageDraw.Draw(page)
        dp.rounded_rectangle((0, 6 * S, 124 * S - 1, 112 * S - 1), 8 * S, fill=(255, 255, 255, 255))
        dp.rounded_rectangle((0, 6 * S, 124 * S - 1, 30 * S), 8 * S, fill=(20, 120, 120, 255))
        dp.rectangle((0, 22 * S, 124 * S - 1, 30 * S), fill=(20, 120, 120, 255))
        for x in (30, 94):
            dp.ellipse(((x - 5) * S, 0, (x + 5) * S, 14 * S), fill=(200, 210, 210, 255), outline=(90, 110, 110, 255), width=S)
        for r in range(3):
            for c in range(5):
                x0, y0 = (8 + c * 22) * S, (38 + r * 23) * S
                dp.rounded_rectangle((x0, y0, x0 + 19 * S, y0 + 19 * S), 3 * S, fill=(214, 240, 236, 255))
        page = page.resize((124, 112), Image.LANCZOS).rotate(-6, Image.BICUBIC, expand=True)
        im = paste_shadowed(im, page, (452, 16), alpha=120)
        c0 = art(coin, 64, 'Event Coin')
        if c0 is not None:
            im = paste_shadowed(im, c0, (560, 72), alpha=120)
            im = paste_shadowed(im, c0.resize((22, 22), Image.LANCZOS), (509, 82), blur=1, alpha=60)
        return family_finish(left_shade(im, (0, 50, 60), 140), EVENT_CATALOG_TITLE, EVENT_CATALOG_SUB, (0, 60, 70))
    raise ValueError('event style %r' % style)


# ---- Raid option B variants (user 06-11: «Raid B, improved»): dark red / black, raid board cells, one big boss ----
RAID_B_VARIANTS = ('B1', 'B2', 'B3', 'B4')


def lit_boss(mid, rigs, h, rim=(255, 70, 40)):
    """the boss in full colour (wait pose) at height h with a red rim light on its outline and a soft red glow behind;
    (figure, glow) RGBA pieces of the figure's size + margin, or (None, None) without the rig"""
    f = enemy_figure(mid, rigs, frame=10, size=2400)
    if f is None:
        warn('raid boss %s left out of a Raid B variant (rig not found in %s)' % (mid, rigs))
        return None, None
    f = f.resize((max(1, int(f.width * h / f.height)), h), Image.LANCZOS)
    pad = 16
    big = Image.new('RGBA', (f.width + 2 * pad, f.height + 2 * pad), (0, 0, 0, 0))
    big.alpha_composite(f, (pad, pad))
    a = big.getchannel('A')
    edge = ImageChops.subtract(a, a.filter(ImageFilter.MinFilter(5))).filter(ImageFilter.GaussianBlur(1))
    rim_l = Image.new('RGBA', big.size, rim + (0,))
    rim_l.putalpha(edge.point(lambda v: v * 200 // 255))
    lit = Image.alpha_composite(big, rim_l)
    glow = Image.new('RGBA', big.size, rim + (0,))
    glow.putalpha(a.filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.GaussianBlur(8)).point(lambda v: v * 210 // 255))
    return lit, glow


def burst(im, centre, colour=(255, 60, 30), n=22, alpha=60, core=150):
    """red energy rays and a hot core behind the boss"""
    L = Image.new('RGBA', (640 * S, 140 * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(L)
    cx, cy = centre[0] * S, centre[1] * S
    for k in range(n):
        a0 = math.pi * 2 * k / n + (0.05 if k % 2 else 0)
        a1 = a0 + math.pi / (n * (1.2 if k % 2 else 2.2))
        d.polygon([(cx, cy), (cx + math.cos(a0) * 4000, cy + math.sin(a0) * 4000), (cx + math.cos(a1) * 4000, cy + math.sin(a1) * 4000)],
                  fill=colour + (alpha if k % 2 else alpha // 2,))
    im = Image.alpha_composite(im, L.resize((640, 140), Image.LANCZOS))
    g = Image.new('RGBA', im.size, (0, 0, 0, 0))
    ImageDraw.Draw(g).ellipse((centre[0] - 90, centre[1] - 70, centre[0] + 90, centre[1] + 70), fill=(255, 120, 60, core))
    return Image.alpha_composite(im, g.filter(ImageFilter.GaussianBlur(26)))


def board_layer(cols, rows, cell=30, icons=False, gold_every=7):
    """a raid board made of the original board cells (red cells, a gold one every gold_every) and, with icons, some original
    reward icons (Moogle medal, Special quest orbs) on the gold cells; RGBA cols*cell x rows*cell"""
    red = art(jp_img('sphere_board', 'Board_0102.png'), cell, 'board cell')
    gold_c = art(jp_img('sphere_board', 'Board_0002.png'), cell, 'board cell')
    ico = []
    if icons:
        ico = [x for x in (art(os.path.join(MEDALS, 'Medal_L_90016.png'), int(cell * .8), 'Moogle medal'),
                           art(jp_img('material', 'material_48.png'), int(cell * .7), 'orb'),
                           art(jp_img('material', 'material_55.png'), int(cell * .75), 'orb'),
                           art(event_coin_path(), int(cell * .7), 'coin')) if x is not None]
    L = Image.new('RGBA', (cols * cell, rows * cell), (0, 0, 0, 0))
    k = 0
    for r in range(rows):
        for c in range(cols):
            g = (r * 3 + c) % gold_every == 0
            t = gold_c if g else red
            if t is not None:
                L.alpha_composite(t, (c * cell, r * cell))
            if g and ico:
                i = ico[k % len(ico)]
                k += 1
                L.alpha_composite(i, (c * cell + (cell - i.width) // 2, r * cell + (cell - i.height) // 2))
    return L


def perspective(layer, quad, size=(640, 140)):
    """layer mapped onto quad [(x,y) top-left, top-right, bottom-right, bottom-left] of a size canvas"""
    import numpy as np
    w, h = layer.size
    src = [(0, 0), (w, 0), (w, h), (0, h)]
    A, B = [], []
    for (x, y), (u, v) in zip(quad, src):     # canvas -> layer
        A.append([x, y, 1, 0, 0, 0, -u * x, -u * y]); B.append(u)
        A.append([0, 0, 0, x, y, 1, -v * x, -v * y]); B.append(v)
    coeffs = np.linalg.solve(np.array(A, float), np.array(B, float))
    return layer.transform(size, Image.PERSPECTIVE, tuple(coeffs), Image.BICUBIC)


def fade_left(layer, x0, x1, top=255):
    m = Image.new('L', layer.size, 0)
    d = ImageDraw.Draw(m)
    for x in range(layer.width):
        d.line((x, 0, x, layer.height - 1), fill=max(0, min(top, int(top * (x - x0) / max(1, x1 - x0)))))
    layer.putalpha(ImageChops.multiply(layer.getchannel('A'), m))
    return layer


def hp_gauge(im, x0, y0, x1, y1, fill=.72):
    """a slim boss HP gauge (dark track, red -> orange fill, gold edge): the raid fight motif"""
    L = Image.new('RGBA', ((x1 - x0) * S, (y1 - y0) * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(L)
    W, H = L.size
    d.rounded_rectangle((0, 0, W - 1, H - 1), H // 2, fill=(20, 0, 4, 230), outline=(236, 196, 84, 255), width=int(1.5 * S))
    fw = int((W - 4 * S) * fill)
    bar = kept.vgrad((fw, H - 4 * S), (255, 150, 60), (200, 20, 20), 0, H - 4 * S)
    m = Image.new('L', bar.size, 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, bar.width - 1, bar.height - 1), bar.height // 2, fill=255)
    L.paste(bar, (2 * S, 2 * S), m)
    im.alpha_composite(L.resize((x1 - x0, y1 - y0), Image.LANCZOS), (x0, y0))
    return im


def raid_b_variant(style, rigs=None):
    rigs = rigs or RAID_RIGS
    im = background((76, 6, 14), (8, 0, 4))
    if style == 'B1':   # B with the boss lit (full colour, red rim and glow) on a red burst; flat board cells as B
        im = burst(im, (520, 70))
        cells = fade_left(board_layer(12, 5), 0, 140, 110)
        im.alpha_composite(cells, (290, -6))
        boss, x, h, yb = '0013', 520, 150, 146
    elif style == 'B2':   # the classic dark raid boss (0001) lit, gold/orange cells with reward icons, burst
        im = burst(im, (520, 66), alpha=70)
        cells = fade_left(board_layer(12, 5, icons=True, gold_every=5), 0, 160, 150)
        im.alpha_composite(cells, (290, -6))
        boss, x, h, yb = '0001', 528, 156, 148
    elif style == 'B3':   # the board as a floor in perspective under a lit boss (0004), a slim HP gauge
        im = burst(im, (520, 60), alpha=50, core=120)
        floor = perspective(board_layer(14, 6, cell=40, icons=True, gold_every=6), [(330, 78), (660, 78), (720, 150), (250, 150)])
        im = Image.alpha_composite(im, fade_left(floor, 250, 400, 170))
        boss, x, h, yb = '0004', 516, 118, 130
    elif style == 'B4':   # all together: classic boss 0001 lit on a burst, perspective board floor with icons, HP gauge
        im = burst(im, (522, 58), alpha=70)
        floor = perspective(board_layer(14, 6, cell=40, icons=True, gold_every=5), [(340, 84), (660, 84), (720, 150), (260, 150)])
        im = Image.alpha_composite(im, fade_left(floor, 260, 420, 170))
        boss, x, h, yb = '0001', 522, 150, 138
    else:
        raise ValueError('raid B variant %r' % style)
    lit, glow = lit_boss(boss, rigs, h)
    if lit is not None:
        pos = (int(x - lit.width / 2), int(yb - lit.height + 16))
        g = Image.new('RGBA', im.size, (0, 0, 0, 0))
        g.alpha_composite(glow, pos)
        im = Image.alpha_composite(im, g)
        im = paste_shadowed(im, lit, pos, blur=4, alpha=120)
        im.info['boss'] = boss
    if style in ('B3', 'B4'):
        im = hp_gauge(im, 430, 124, 618, 133, .72)
    boss_id = im.info.get('boss')
    out = family_finish(left_shade(im, (0, 0, 0), 130), RAID_CATALOG_TITLE, RAID_CATALOG_SUB, (50, 4, 8))
    out.info['boss'] = boss_id
    return out


def raid_b_sheets(out_dir):
    """raid_b_variants.png (old B and B1-B4 at real size) and raid_family.png (Special B, each Raid B variant, Event A in a
    column) in out_dir; returns the two paths"""
    from PIL import ImageFont
    os.makedirs(out_dir, exist_ok=True)
    try:
        f = ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 16)
    except OSError:
        f = ImageFont.load_default()
    cards = [('Raid B (old)', raid_option('B'))] + [('Raid %s' % v, raid_b_variant(v)) for v in RAID_B_VARIANTS]
    sheet = Image.new('RGB', (660, len(cards) * 168 + 10), (36, 36, 44))
    d = ImageDraw.Draw(sheet)
    for i, (t, c) in enumerate(cards):
        d.text((10, 10 + i * 168), t, font=f, fill=(255, 255, 255))
        sheet.paste(c.convert('RGB'), (10, 32 + i * 168))
    p1 = os.path.join(out_dir, 'raid_b_variants.png')
    sheet.save(p1)
    sp, ev = special_option('B').convert('RGB'), event_option('A').convert('RGB')
    n = len(RAID_B_VARIANTS)
    fam = Image.new('RGB', (n * 660 + 20, 3 * 152 + 50), (22, 30, 58))
    d = ImageDraw.Draw(fam)
    for i, (t, c) in enumerate(cards[1:]):
        x = 20 + i * 660
        d.text((x, 14), 'Special B + %s + Event A' % t, font=f, fill=(255, 255, 255))
        for j, card in enumerate((sp, c.convert('RGB'), ev)):
            fam.paste(card, (x, 44 + j * 152))
    p2 = os.path.join(out_dir, 'raid_family.png')
    fam.save(p2)
    return p1, p2


CATALOG_OPTIONS = {'special': special_option, 'raid': raid_option, 'event': event_option}


def parse_styles(text):
    """'special=A,raid=B' -> {'special': 'A', 'raid': 'B'} (styles A, B, C)"""
    out = {}
    for part in filter(None, (text or '').split(',')):
        k, _, v = part.partition('=')
        if k not in CATALOG_OPTIONS or v not in ('A', 'B', 'C') + (RAID_B_VARIANTS if k == 'raid' else ()):
            raise ValueError('catalog style %r: use special|raid|event=A|B|C (raid also B1-B4)' % part)
        out[k] = v
    return out


def options_sheets(out_dir, combo=(('special', 'B'), ('raid', 'A'), ('event', 'A'))):
    """catalog_options.png (rows Special A/B/C, Raid A/B/C, Event A/B/C at real size) and catalog_family.png (one
    combination as the cards follow each other in the Events / Special tab) in out_dir; returns the two paths"""
    from PIL import ImageFont
    os.makedirs(out_dir, exist_ok=True)
    try:
        f = ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 16)
    except OSError:
        f = ImageFont.load_default()
    rows = [(k, s) for k in ('special', 'raid', 'event') for s in 'ABC']
    sheet = Image.new('RGB', (660, len(rows) * 168 + 10), (36, 36, 44))
    d = ImageDraw.Draw(sheet)
    cards = {}
    for i, (k, s) in enumerate(rows):
        cards[(k, s)] = CATALOG_OPTIONS[k](s)
        d.text((10, 10 + i * 168), '%s %s' % (k.capitalize(), s), font=f, fill=(255, 255, 255))
        sheet.paste(cards[(k, s)].convert('RGB'), (10, 32 + i * 168))
    p1 = os.path.join(out_dir, 'catalog_options.png')
    sheet.save(p1)
    fam = Image.new('RGB', (680, 3 * 152 + 50), (22, 30, 58))
    d = ImageDraw.Draw(fam)
    d.text((20, 14), 'family: ' + ', '.join('%s %s' % (k.capitalize(), s) for k, s in combo), font=f, fill=(255, 255, 255))
    for i, ks in enumerate(combo):
        fam.paste(cards[ks].convert('RGB'), (20, 44 + i * 152))
    p2 = os.path.join(out_dir, 'catalog_family.png')
    fam.save(p2)
    return p1, p2


def main():
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except AttributeError:
        pass
    ap = argparse.ArgumentParser()
    ap.add_argument('--index', default=os.path.join(REPO, 'server', 'game_data', 'special.json'))
    ap.add_argument('--src', default=os.path.join(ROOT, 'reference', 'special_banners'))
    ap.add_argument('--out', default=os.path.join(REPO, 'server', 'game_data', 'special_img'))
    ap.add_argument('--enemies', default=ENEMIES, help='enemy rigs (LWF + BTF) for the catalogue figures; missing -> none')
    ap.add_argument('--rules', default=os.path.join(REPO, 'server', 'special_periods.json'),
                    help='campaigns[key].reconstruct: banners rebuilt from local sources (originals lost)')
    ap.add_argument('--mode', choices=['palette', 'full'], default='palette')
    ap.add_argument('--section', choices=['all', 'special', 'raid', 'event'], default='all',
                    help='special: the Special tab banners; raid: the Raid Catalog banner and the kept raid cards; '
                         'event (not in all): the Event Catalog banner and the kept event cards')
    ap.add_argument('--raid-index', default=os.path.join(REPO, 'server', 'game_data', 'raids.json'))
    ap.add_argument('--raid-rigs', default=RAID_RIGS, help='raid boss rigs lwf/character/raid (LWF + textures) for the Raid Catalog banner')
    ap.add_argument('--catalog-only', action='store_true', help='raid section: only the Raid Catalog banner, not the kept raid cards')
    ap.add_argument('--raid-img', default=os.path.join(REPO, 'server', 'game_data', 'raid_img'),
                    help='the weekly event cards of make_raid_banners.py (run it first); output goes here too')
    ap.add_argument('--event-index', default=os.path.join(REPO, 'server', 'game_data', 'events.json'))
    ap.add_argument('--event-config', default=os.path.join(REPO, 'server', 'event_config.json'))
    ap.add_argument('--event-coin', help='Event Coin icon of the Event Catalog banner (default: local JP data img/incentive/IncentiveIcon_15.png)')
    ap.add_argument('--event-img', default=os.path.join(REPO, 'server', 'game_data', 'event_img'),
                    help='the event cards of make_event_banners.py (run it first); output goes here too')
    ap.add_argument('--catalog-style', help='build only these catalogue cards in the chosen option, e.g. special=B,raid=A,event=C '
                    '(Catalog options: A/B/C each; 7000 in --out, 8000 in --raid-img, 20000 in --event-img)')
    ap.add_argument('--raid-b-sheets', help='write raid_b_variants.png and raid_family.png (Raid B variants B1-B4) in this folder')
    ap.add_argument('--options-sheet', help='write catalog_options.png and catalog_family.png (all options) in this folder, nothing else')
    a = ap.parse_args()
    if a.raid_b_sheets:
        print('raid B variants: %s, %s' % raid_b_sheets(a.raid_b_sheets))
        return
    if a.options_sheet:
        print('catalog options: %s, %s' % options_sheets(a.options_sheet))
        return
    if a.catalog_style:
        targets = {'special': os.path.join(a.out, '%d.png' % 7000), 'raid': os.path.join(a.raid_img, '%d.png' % RAID_CATALOG_EV)}
        with open(a.event_config, encoding='utf-8') as f:
            targets['event'] = os.path.join(a.event_img, '%d.png' % json.load(f)['catalogEvStage'])
        for k, st in parse_styles(a.catalog_style).items():
            im = special_option(st, a.src, a.enemies) if k == 'special' else raid_option(st, a.raid_rigs) if k == 'raid' else event_option(st, a.event_coin)
            os.makedirs(os.path.dirname(targets[k]), exist_ok=True)
            mbi.save_png(im, targets[k], a.mode)
            print('catalog %s: option %s -> %s (bump its image version, then the master revision)' % (k, st, targets[k]))
        return
    if a.section == 'event':
        with open(a.event_index, encoding='utf-8') as f:
            eix = json.load(f)
        with open(a.event_config, encoding='utf-8') as f:
            ecfg = json.load(f)
        er = build_event(eix, ecfg.get('catalogEvStage'), a.event_img, a.mode, a.event_coin or event_coin_path(), ecfg.get('keptTab'))
        print('event banners: %d catalog, %d kept cards, %d events without a card -> %s' % (er['catalog'], er['kept'], er['missing'], a.event_img))
        return
    if a.section in ('all', 'raid'):
        if os.path.exists(a.raid_index):
            with open(a.raid_index, encoding='utf-8') as f:
                rr = build_raid(json.load(f), a.raid_img, a.mode, a.raid_rigs, a.catalog_only)
            print('raid banners: %d catalog, %d kept cards, %d weeks without a card -> %s' % (rr['catalog'], rr['kept'], rr['missing'], a.raid_img))
        else:
            warn('%s not found: no Raid Catalog banner' % a.raid_index)
        if a.section == 'raid':
            return
    with open(a.index, encoding='utf-8') as f:
        index = json.load(f)
    rules = None
    if os.path.exists(a.rules):
        with open(a.rules, encoding='utf-8') as f:
            rules = json.load(f)
    r = build_all(index, a.src, a.out, a.mode, a.enemies, rules)
    print('special banners: %d originals, %d reconstructed, %d plates, %d catalog -> %s'
          % (r['original'], r['reconstructed'], r['plate'], r['catalog'], a.out))


if __name__ == '__main__':
    main()
