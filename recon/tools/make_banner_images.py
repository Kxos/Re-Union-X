"""Immagini dei banner originali (640x140 PNG), una per banner del catalogo.

    python recon/tools/make_banner_images.py [--mode palette|full] [--img-dir D] [--catalog F] [--out D]
        -> server/game_data/gacha_img/<drawMedalTypeId>.png (ignorato da git)

L'immagine di ogni banner e' quella della riga (`image`); se manca, quella del banner `imageFrom`; se manca,
quella di un banner della stessa serie (`series_key` di make_banner_catalog); se manca, una piastra generata col
nome. Le immagini originali sono gia' 640x140 oppure in scala; quelle con rapporto diverso si ritagliano al centro.
`palette` (256 colori con trasparenza) tiene il totale a pochi decine di MB. Non tocca 9001.png (piastra Catalog,
make_shop_art.py).
"""
import argparse
import datetime as dt
import json
import os
import re
import sys

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import make_banner_catalog as cat  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
ROOT = os.path.dirname(os.path.dirname(REPO))
W, H = 640, 140
FONT = 'C:/Windows/Fonts/arialbd.ttf'


def fit(im):
    """640x140 in RGBA (l'alfa degli angoli trasparenti si conserva): resize se il rapporto e' quello (1%),
    altrimenti ritaglio centrale al rapporto e poi resize."""
    im = im.convert('RGBA')
    w, h = im.size
    target = W / H
    if abs(w / h - target) / target >= 0.01:
        if w / h > target:  # troppo larga: taglia ai lati
            nw = round(h * target)
            x = (w - nw) // 2
            im = im.crop((x, 0, x + nw, h))
        else:  # troppo alta: taglia sopra e sotto
            nh = round(w / target)
            y = (h - nh) // 2
            im = im.crop((0, y, w, y + nh))
    if im.size != (W, H):
        im = im.resize((W, H), Image.LANCZOS)
    return im


def _font(size):
    try:
        return ImageFont.truetype(FONT, size)
    except OSError:
        return ImageFont.load_default()


def plate(name):
    """piastra generata: gradiente blu scuro, bordo oro di 3 px, nome bianco centrato"""
    im = Image.new('RGB', (W, H))
    top, bot = (0x0d, 0x2a, 0x4a), (0x17, 0x4a, 0x5c)
    d = ImageDraw.Draw(im)
    for y in range(H):
        t = y / (H - 1)
        d.line([(0, y), (W, y)], fill=tuple(round(a + (b - a) * t) for a, b in zip(top, bot)))
    d.rectangle([0, 0, W - 1, H - 1], outline=(0xd8, 0xb2, 0x5a), width=3)
    size = 34
    f = _font(size)
    while size > 10 and d.textlength(name, font=f) > 600:
        size -= 1
        f = _font(size)
    d.text((W / 2, H / 2), name, font=f, fill=(255, 255, 255), anchor='mm')
    return im


def save_png(im, path, mode):
    if mode == 'palette':  # MEDIANCUT non accetta RGBA: FASTOCTREE conserva la trasparenza (tRNS)
        im.convert('RGBA').quantize(256, method=Image.Quantize.FASTOCTREE,
                                    dither=Image.Dither.FLOYDSTEINBERG).save(path, optimize=True)
    else:
        im.save(path, optimize=True)
    return True


def _key(name):  # «Supernova+ - Aced Deal Returns!» = «Supernova+ - Aced» (come image_of del catalogo)
    return re.sub(r' deal$', '', cat.series_key(name))


def _gap(x, y):  # giorni tra gli inizi di due banner (senza data: lontanissimi)
    try:
        return abs((dt.date.fromisoformat(x['start']) - dt.date.fromisoformat(y['start'])).days)
    except (KeyError, TypeError, ValueError):
        return 99999


def _file(b):
    return b['image'].split(' ')[0] if b.get('image') else None


def build_all(banners, img_dir, out_dir, mode):
    """scrive un PNG per banner; restituisce i conteggi copiate / ridimensionate / fratello / generate / mb"""
    os.makedirs(out_dir, exist_ok=True)
    by_id = {b['rowId']: b for b in banners}
    n = {'copiate': 0, 'ridimensionate': 0, 'fratello': 0, 'generate': 0}
    total = 0

    def open_img(fn):
        p = os.path.join(img_dir, fn) if fn else None
        return Image.open(p) if p and os.path.exists(p) else None

    for b in banners:
        src, how = open_img(_file(b)), None
        if src is not None:
            how = 'own' if b.get('imageFrom') in (None, b['rowId']) else 'sib'  # il catalogo da' gia' il file del fratello
        if src is None and b.get('imageFrom') and b['imageFrom'] in by_id and b['imageFrom'] != b['rowId']:
            src, how = open_img(_file(by_id[b['imageFrom']])), 'sib'
        if src is None:
            k = _key(b['name'])
            sibs = [y for y in banners if y is not b and _file(y) and _key(y['name']) == k
                    and open_img(_file(y)) is not None]
            if sibs:
                sibs.sort(key=lambda y: (_gap(y, b), y['rowId']))
                src, how = open_img(_file(sibs[0])), 'sib'
        if src is None:
            im, how = plate(b['name']), 'plate'
            n['generate'] += 1
        else:
            same = src.size == (W, H)
            im = fit(src)
            if how == 'sib':
                n['fratello'] += 1
            elif same:
                n['copiate'] += 1
            else:
                n['ridimensionate'] += 1
        path = os.path.join(out_dir, f'{10000 + int(b["rowId"][1:])}.png')
        save_png(im, path, mode)
        total += os.path.getsize(path)
    n['mb'] = round(total / 1048576, 1)
    return n


def main():
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except AttributeError:
        pass
    ap = argparse.ArgumentParser()
    ap.add_argument('--mode', choices=['palette', 'full'], default='palette')
    ap.add_argument('--img-dir', default=os.path.join(ROOT, 'reference', 'banners', 'img'))
    ap.add_argument('--catalog', default=os.path.join(REPO, 'server', 'game_data', 'gacha_catalog.json'))
    ap.add_argument('--out', default=os.path.join(REPO, 'server', 'game_data', 'gacha_img'))
    a = ap.parse_args()
    with open(a.catalog, encoding='utf-8') as f:
        banners = json.load(f)['banners']
    r = build_all(banners, a.img_dir, a.out, a.mode)
    print(f"banner {len(banners)}: copiate {r['copiate']}, ridimensionate {r['ridimensionate']}, "
          f"da fratello {r['fratello']}, generate {r['generate']}; {r['mb']} MB in {a.out}")


if __name__ == '__main__':
    main()
