"""Grafica e testi della piastra «Banner Catalog» dello Shop (docs/superpowers/specs/2026-10-16-shop-banner-design.md 4.1).

    python recon/tools/make_shop_art.py <stage_gen\\files> <server\\game_data> (Pillow: senza -I)

La piastra Catalog e' un'estrazione a Gold Ticket (payType 6) che nessuno possiede: il pulsante resta
grigio e mostra i testi 106140420-424 e l'icona img/incentive/Star7_Ticket_39.png.
Qui i testi diventano l'invito ad aprire Details e l'icona (originale con il segno «仮») diventa un
piccolo elenco di banner. Si scrive anche il banner 640x140 della piastra (servito dal server,
/web/gacha/img/9001-v<N>.png, N = gacha.CATALOG_PLATE_STYLE). Testi dopo la copia dei testi IPA in build-resources.ps1
(altrimenti vincerebbero quelli). Nessuna bitmap nel repo.

Plate art (catalog_banner, user 30-10, in the style of the Special tab's «SPECIAL CATALOG» banner,
make_special_banners.catalog_banner, whose helpers are imported): darkened oblique strips of original Shop banners
(CATALOG_STRIPS, read from <game_data>/gacha_img, the 640x140 copies of make_banner_images.py), «BANNER CATALOG» in
the gold lettering with brown outline of the originals, a subtitle saying what the plate does (the tap does nothing,
the plate is grey; Details opens the catalogue, where one banner can be kept in the Shop), medal art on the right
(CATALOG_MEDALS, the client's img/medal/Medal_L_<id>.png of the local medal_gen pack, --medals; BTF or PNG; left out
with a WARNING when missing), an «ALL BANNERS» sticker and an arrow pointing to the Details button.
New art: raise CATALOG_PLATE_STYLE in server/gacha.js (the URL changes), node server/make-banners.js, revision bump.
    python -I recon/tools/make_shop_art.py <stage_gen\\files> <server\\game_data> [--medals D]
"""
import os
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import btf  # noqa: E402

TEXT = 'Open Details to browse\nthe Banner Catalog'
TEXT_IDS = [106140420, 106140421, 106140422, 106140423, 106140424]
GOLD = (236, 196, 84, 255)
BLUE = (31, 84, 140, 255)
LIGHT = (220, 236, 250, 255)
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(HERE))))
CATALOG_TITLE, CATALOG_SUB = 'BANNER CATALOG', 'Details: every banner \u00b7 keep one in the Shop'
# original Shop banners cut into the oblique strips (drawMedalTypeId: Supernova - Sephiroth, Key Art #19, KH III Kairi,
# HD Xion, HD Ventus); missing ones are skipped
CATALOG_STRIPS = [10397, 10411, 10428, 10438, 10474]
# medal art on the right (Medal_L_<id>), back to front: HD Riku, HD King Mickey, HD Sora
CATALOG_MEDALS = [300744, 300746, 300742]
MEDALS = os.path.join(ROOT, 'medal_gen', 'files', 'img', 'medal')


def font(size):
    for f in (r'C:\Windows\Fonts\arialbd.ttf', r'C:\Windows\Fonts\segoeuib.ttf'):
        if os.path.exists(f):
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()


def icon():
    """83x83: tre piastre impilate (elenco di banner) con bordo dorato."""
    im = Image.new('RGBA', (83, 83), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    for i, y in enumerate((10, 32, 54)):
        d.rounded_rectangle((8, y, 75, y + 18), radius=4, fill=BLUE, outline=GOLD, width=3)
        d.rectangle((14, y + 6, 14 + 30 - i * 6, y + 11), fill=LIGHT)
    return im


def banner(title='BANNER CATALOG', subtitle='Every original banner - open Details'):
    """640x140: fondo blu sfumato, titolo e sottotitolo. The old plain plate (before 30-10), kept for comparisons
    (make_special_banners tests); the Shop plate is catalog_banner."""
    im = Image.new('RGBA', (640, 140), BLUE)
    d = ImageDraw.Draw(im)
    for y in range(140):
        c = int(40 + 60 * y / 139)
        d.line((0, y, 639, y), fill=(18, c, 120 + c // 2, 255))
    d.rounded_rectangle((6, 6, 633, 133), radius=10, outline=GOLD, width=4)
    d.text((320, 52), title, font=font(46), fill=GOLD, anchor='mm', stroke_width=2, stroke_fill=(40, 30, 10, 255))
    d.text((320, 102), subtitle, font=font(24), fill=LIGHT, anchor='mm')
    return im


def medal_figure(mid, medals_dir):
    """RGBA of the medal art Medal_L_<id> (BTF of the client or PNG), cropped to its content; None when missing"""
    p = os.path.join(medals_dir, 'Medal_L_%d.png' % mid)
    if not os.path.exists(p):
        print('WARNING: medal %d left out of the catalog plate: %s not found' % (mid, p), file=sys.stderr)
        return None
    with open(p, 'rb') as f:
        b = f.read()
    im = (Image.open(p) if b[:4] == b'\x89PNG' else btf.decode(b)).convert('RGBA')
    bb = im.getbbox()
    return im.crop(bb) if bb else None


def catalog_banner(strips_dir, medals_dir=None):
    """640x140 RGBA of the «BANNER CATALOG» plate (drawMedalTypeId 9001)"""
    import make_special_banners as sb    # lazy: make_special_banners imports this module
    im = Image.new('RGBA', (640, 140), (24, 30, 70, 255))
    bg = ImageDraw.Draw(im)
    for y in range(140):
        bg.line((0, y, 639, y), fill=(14, 34 + y // 3, 90 + y // 3, 255))
    strips = [os.path.join(strips_dir, '%d.png' % i) for i in CATALOG_STRIPS if os.path.exists(os.path.join(strips_dir, '%d.png' % i))]
    if strips:
        n, slant = len(strips), 34
        w = (640 + slant) / n
        for i, p in enumerate(strips):
            ban = sb.mbi.fit(Image.open(p).convert('RGBA')).convert('RGBA')
            x0 = i * w - slant
            m = Image.new('L', (640, 140), 0)
            ImageDraw.Draw(m).polygon([(x0 + slant, 0), (x0 + w + slant + 1, 0), (x0 + w + 1, 140), (x0, 140)], fill=255)
            sh = Image.new('RGBA', (640, 140), (0, 0, 0, 0))
            sh.paste(ban, (int(x0 + w / 2 + slant / 2 - 320), 0))
            im.paste(sh, (0, 0), ImageChops.multiply(m, sh.getchannel('A')))
        d = ImageDraw.Draw(im)
        for i in range(1, n):
            x0 = i * w - slant
            d.line([(x0 + slant, 0), (x0, 140)], fill=GOLD, width=2)
    dark = Image.new('RGBA', (640, 140), (0, 0, 0, 0))
    dd = ImageDraw.Draw(dark)
    for x in range(640):
        dd.line((x, 0, x, 139), fill=(8, 6, 24, int(210 - 100 * x / 639)))
    im = Image.alpha_composite(im, dark)
    # what Details opens: the medals of every banner, a few of them on the right on a soft glow
    glow = Image.new('RGBA', (640, 140), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse((420, 20, 660, 170), fill=(255, 220, 140, 110))
    im = Image.alpha_composite(im, glow.filter(ImageFilter.GaussianBlur(18)))
    for mid, h, x, y, ang in zip(CATALOG_MEDALS, (92, 92, 118), (400, 524, 450), (40, 36, 18), (12, -12, 0)):
        fig = medal_figure(mid, medals_dir or MEDALS)
        if fig is None:
            continue
        fig = fig.resize((max(1, int(fig.width * h / fig.height)), h), Image.LANCZOS)
        if ang:
            fig = fig.rotate(ang, Image.BICUBIC, expand=True)
        shadow = Image.new('RGBA', fig.size, (0, 0, 0, 0))
        shadow.putalpha(fig.getchannel('A').point(lambda a: a * 120 // 255))
        im.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(3)), (x + 3, y + 4))
        im.alpha_composite(fig, (x, y))
    sb.gold_text(im, (20, 50), CATALOG_TITLE, font(40))
    ImageDraw.Draw(im).text((22, 104), CATALOG_SUB, font=font(18), anchor='lm', fill=(255, 255, 255, 255),
                            stroke_width=3, stroke_fill=(20, 16, 40, 255))
    im.alpha_composite(sb.sticker('ALL BANNERS', w=136, h=42, angle=8), (392, -6))
    # the Details button sits right of the plate: arrow pointing to the right edge, a light ripple on the edge
    rp = Image.new('RGBA', (640, 140), (0, 0, 0, 0))
    dr = ImageDraw.Draw(rp)
    tx, ty = 632, 118
    for r, a in ((6, 255), (12, 190), (18, 110)):
        dr.ellipse((tx - r * .7, ty - r, tx + r * .7, ty + r), outline=(255, 255, 255, a), width=2)
    im = Image.alpha_composite(im, rp)
    arrow = sb.tap_arrow(40).transpose(Image.FLIP_LEFT_RIGHT)        # tip at the bottom-right corner
    im.alpha_composite(arrow, (tx - 42, ty - 38))
    ImageDraw.Draw(im).rounded_rectangle((1, 1, 638, 138), radius=8, outline=GOLD, width=3)
    return im


def main():
    args, medals = sys.argv[1:], None
    if '--medals' in args:
        i = args.index('--medals')
        if i + 1 >= len(args):
            args = []
        else:
            medals = args[i + 1]
            args = args[:i] + args[i + 2:]
    if len(args) != 2:
        print('uso: make_shop_art.py <stage_gen\\files> <server\\game_data> [--medals D]', file=sys.stderr)
        return 2
    sg, game_data = args
    for tid in TEXT_IDS:
        p = os.path.join(sg, 'text', 'ui', f'{tid}.txt')
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, 'w', encoding='utf-8', newline='\n') as f:
            f.write(TEXT)
    p = os.path.join(sg, 'img', 'incentive', 'Star7_Ticket_39.png')
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'wb') as f:
        f.write(btf.encode(icon()))
    out = os.path.join(game_data, 'gacha_img')
    os.makedirs(out, exist_ok=True)
    catalog_banner(out, medals).convert('RGB').save(os.path.join(out, '9001.png'))
    print('make_shop_art: testi', TEXT_IDS, 'icona Star7_Ticket_39, banner 9001')
    return 0


if __name__ == '__main__':
    sys.exit(main())
