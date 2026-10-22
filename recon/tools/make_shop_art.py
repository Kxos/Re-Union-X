"""Grafica e testi della piastra «Banner Catalog» dello Shop (docs/superpowers/specs/2026-10-16-shop-banner-design.md 4.1).

    python recon/tools/make_shop_art.py <stage_gen\\files> <server\\game_data> (Pillow: senza -I)

La piastra Catalog e' un'estrazione a Gold Ticket (payType 6) che nessuno possiede: il pulsante resta
grigio e mostra i testi 106140420-424 e l'icona img/incentive/Star7_Ticket_39.png.
Qui i testi diventano l'invito ad aprire Details e l'icona (originale con il segno «仮») diventa un
piccolo elenco di banner. Si scrive anche il banner 640x140 della piastra (servito dal server,
/web/gacha/img/9001.png). Testi dopo la copia dei testi IPA in build-resources.ps1 (altrimenti
vincerebbero quelli). Tutto disegnato qui: nessuna bitmap nel repo.
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import btf  # noqa: E402

TEXT = 'Open Details to browse\nthe Banner Catalog'
TEXT_IDS = [106140420, 106140421, 106140422, 106140423, 106140424]
GOLD = (236, 196, 84, 255)
BLUE = (31, 84, 140, 255)
LIGHT = (220, 236, 250, 255)


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


def banner():
    """640x140: fondo blu sfumato, titolo e sottotitolo."""
    im = Image.new('RGBA', (640, 140), BLUE)
    d = ImageDraw.Draw(im)
    for y in range(140):
        c = int(40 + 60 * y / 139)
        d.line((0, y, 639, y), fill=(18, c, 120 + c // 2, 255))
    d.rounded_rectangle((6, 6, 633, 133), radius=10, outline=GOLD, width=4)
    d.text((320, 52), 'BANNER CATALOG', font=font(46), fill=GOLD, anchor='mm', stroke_width=2, stroke_fill=(40, 30, 10, 255))
    d.text((320, 102), 'Every original banner - open Details', font=font(24), fill=LIGHT, anchor='mm')
    return im


def main():
    if len(sys.argv) != 3:
        print('uso: make_shop_art.py <stage_gen\\files> <server\\game_data>', file=sys.stderr)
        return 2
    sg, game_data = sys.argv[1], sys.argv[2]
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
    banner().convert('RGB').save(os.path.join(out, '9001.png'))
    print('make_shop_art: testi', TEXT_IDS, 'icona Star7_Ticket_39, banner 9001')
    return 0


if __name__ == '__main__':
    sys.exit(main())
