"""Banners of the Special tab (640x140 PNG) and their -kept copies (spec 2026-10-30-special-tab-design.md 4, 10).

    python -I recon/tools/make_special_banners.py [--index F] [--src D] [--out D] [--enemies D] [--mode palette|full]
        -> server/game_data/special_img/<evStageId>.png and <evStageId>-kept.png (git-ignored)

Index: server/game_data/special.json (make-special.js). Each entry names the original khuxwiki banner file in `banner`
(server/special_periods.json, entries and campaigns); the originals are downloaded by hand into reference\\special_banners\\
(local only, never in the repo) and resized to 640x140 (fit of make_banner_images.py: centre crop when the ratio differs).
Entries without an original (or with the file missing) get a generated plate in the style of make_banner_images.plate:
quest name on a gradient in the colour of the family (SQ code).
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


def kept_tab(im):
    """copy of the banner with the gold «KEPT QUEST» tab at the top left (RGBA, 640x140)"""
    im = im.convert('RGBA')
    if im.size != (640, 140):
        im = im.resize((640, 140), Image.LANCZOS)
    solid = max(TAB_SOLID, vip_tab_end(im) + 4)
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
    L = kept.vgrad((W, H), kept.GOLD_HI, kept.GOLD_LO, y0, y1)
    L.putalpha(alpha)
    edge = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    de = ImageDraw.Draw(edge)
    de.rectangle([0, y1 - S, xf, y1 - 1], fill=kept.GOLD_DK)                 # dark lower edge
    de.rectangle([0, y0 + S, xf, y0 + 2 * S - 1], fill=(255, 252, 228, 200))  # light upper edge
    edge.putalpha(ImageChops.multiply(edge.getchannel('A'), alpha))
    L = Image.alpha_composite(L, edge)
    ImageDraw.Draw(L).text((9 * S, (y0 + y1) / 2 + S * .5), KEPT_TEXT, font=make_shop_art.font(18 * S),
                           fill=(255, 255, 255, 255), anchor='lm', stroke_width=int(2.2 * S), stroke_fill=BROWN)
    sh = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    # drop shadow only under the solid part: it fades out much faster than the band (cube of the band alpha), so
    # it never shows through the half-transparent fade as a dark edge (fix round 1)
    sh.putalpha(alpha.point(lambda v: v ** 3 // 255 ** 2).filter(ImageFilter.GaussianBlur(1.5 * S)).point(lambda v: v * 90 // 255))
    out = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    out.paste(sh, (0, 2 * S))
    L = Image.alpha_composite(out, L)
    return Image.alpha_composite(im, L.resize((640, 140), Image.LANCZOS))


# ---- catalogue banner ----
def enemy_figure(eid, root=None):
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
    size = 800
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    off = np.array([[1, 0, size / 2], [0, 1, size * .7], [0, 0, 1.]])
    for dr in L.draws(L.links.get('all', L.root), 0):
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


def catalog_banner(src_dir, enemies=None):
    """640x140 RGBA of the catalogue banner (evStage 7000)"""
    im = Image.new('RGBA', (640, 140), (24, 30, 70, 255))
    bg = ImageDraw.Draw(im)
    for y in range(140):
        bg.line((0, y, 639, y), fill=(18, 30 + y // 3, 80 + y // 3, 255))
    strips = [os.path.join(src_dir, f) for f in CATALOG_STRIPS if os.path.exists(os.path.join(src_dir, f))]
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
    gold_text(im, (20, 50), CATALOG_TITLE, make_shop_art.font(40))
    ImageDraw.Draw(im).text((22, 104), CATALOG_SUB, font=make_shop_art.font(19), anchor='lm', fill=(255, 255, 255, 255),
                            stroke_width=3, stroke_fill=(20, 16, 40, 255))
    im.alpha_composite(sticker(w=108, h=42), (414, -4))
    rp = Image.new('RGBA', (640, 140), (0, 0, 0, 0))
    dr = ImageDraw.Draw(rp)
    tx, ty = 572, 98                     # the tap: ripple on the Large Body's belly, arrow coming from the top right
    for r, a in ((6, 255), (12, 190), (18, 110)):
        dr.ellipse((tx - r, ty - r * .7, tx + r, ty + r * .7), outline=(255, 255, 255, a), width=2)
    im = Image.alpha_composite(im, rp)
    im.alpha_composite(tap_arrow(44), (tx + 3, ty - 47))
    ImageDraw.Draw(im).rounded_rectangle((1, 1, 638, 138), radius=8, outline=(236, 196, 84, 255), width=3)
    return im


def source_counts(rules, src_dir):
    """banners of the rules (entries + campaigns): {'original': n, 'plate': n, 'missing': [names not in src_dir]}"""
    names = [e.get('banner', '') for e in rules.get('entries', [])]
    names += [c.get('banner', '') for k, c in (rules.get('campaigns') or {}).items() if not k.startswith('_')]
    r = {'original': 0, 'plate': 0, 'missing': []}
    for b in names:
        if not b:
            r['plate'] += 1
        elif os.path.exists(os.path.join(src_dir, b)):
            r['original'] += 1
        else:
            r['missing'].append(b)
    return r


def build_all(index, src_dir, out_dir, mode, enemies=None):
    """writes the PNGs of the catalogue banner and of every entry; returns the counts original / plate / catalog"""
    os.makedirs(out_dir, exist_ok=True)
    n = {'original': 0, 'plate': 0, 'catalog': 0}
    cat = index.get('catalog') or {}
    if cat.get('evStageId'):
        mbi.save_png(catalog_banner(src_dir, enemies), os.path.join(out_dir, '%d.png' % cat['evStageId']), mode)
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
        mbi.save_png(kept_tab(im), os.path.join(out_dir, '%d-kept.png' % e['evStageId']), mode)
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
    ap.add_argument('--enemies', default=ENEMIES, help='enemy rigs (LWF + BTF) for the catalogue figures; missing -> none')
    ap.add_argument('--mode', choices=['palette', 'full'], default='palette')
    a = ap.parse_args()
    with open(a.index, encoding='utf-8') as f:
        index = json.load(f)
    r = build_all(index, a.src, a.out, a.mode, a.enemies)
    print('special banners: %d originals, %d plates, %d catalog -> %s' % (r['original'], r['plate'], r['catalog'], a.out))


if __name__ == '__main__':
    main()
