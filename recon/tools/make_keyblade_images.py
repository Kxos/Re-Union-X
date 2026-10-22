"""Immagini dei keyblade img/keyBlade/KeyBlade_%06d.png (displayId della tabella keyblade),
assenti da ogni risorsa servita: le ricostruisce dalla grafica vera del keyblade, la bitmap
del LWF lwf/avatar/keyblade/keyblade_%04d_%02d (displayId / 100, displayId % 100).

Chi le usa: (icona e nome di un premio per tipo; tipo 13 = keyblade:
sprintf(KeyBlade_%06d, = displayId)), da cui il popup
BattleResult_KB («Set Medals in your new Keyblade!»); anche. Senza il file l'ImageView KB teneva la texture del layout
(Deck_KeyBlade_0701_05 = Olympia, nuvole bianche) per ogni keyblade.

Formato come Deck_KeyBlade_0701_05 (l'unica immagine «da deck» rimasta, 440x340): keyblade in
diagonale, impugnatura in basso a sinistra, punta in alto a destra. Le bitmap dei LWF sono
in due pose (verticale con la punta in alto, oppure orizzontale con la punta a sinistra):
l'asse principale dell'alpha da' l'angolo, la posa da' il verso della punta.

    python recon/tools/make_keyblade_images.py <keyblade.json> <cartella estratta> <uscita> [anteprima.png]

<cartella estratta> = res_bulk.py con il prefisso lwf/avatar/keyblade/ (e
cocostudio/publish/Deck_KeyBlade_0701_05.png per la calibrazione); <uscita> = stage_gen\\files.
Pillow e numpy: senza -I.
"""
import json
import math
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import btf  # noqa: E402

CANVAS = (440, 340)
BOX = (416, 285)          # ingombro dell'immagine ritagliata in Deck_KeyBlade_0701_05
BITMAP1 = 'ビットマップ 1'


def axis_angle(im):
    """Angolo (gradi, y verso l'alto) dell'asse principale dei pixel opachi."""
    a = np.asarray(im)[..., 3]
    ys, xs = np.nonzero(a > 32)
    x = xs - xs.mean()
    y = -(ys - ys.mean())
    cov = np.cov(np.vstack([x, y]))
    w, v = np.linalg.eigh(cov)
    vx, vy = v[:, np.argmax(w)]
    return math.degrees(math.atan2(vy, vx))


def tip_angle(im, vertical):
    """Direzione impugnatura -> punta: in verticale la punta e' in alto, in orizzontale a
    sinistra (pose delle bitmap dei LWF)."""
    t = axis_angle(im)
    vx, vy = math.cos(math.radians(t)), math.sin(math.radians(t))
    if (vertical and vy < 0) or (not vertical and vx > 0):
        t += 180
    return t


def pick_bitmap(folder):
    """La bitmap del keyblade: «ビットマップ 1» (stadi 01-05); allo stadio 06 il LWF ha
    decine di bitmap (effetti, bagliori): la piu' grande fra quelle allungate."""
    best, area = None, -1
    base = os.path.basename(folder) + '_'
    for f in os.listdir(folder):
        if not f.endswith('.png'):
            continue
        p = os.path.join(folder, f)
        try:
            name = bytes.fromhex(f[len(base):-4]).decode('utf-8')
        except ValueError:
            name = f[len(base):-4]
        if name == BITMAP1:
            return p
        i = btf.info(open(p, 'rb').read())
        if not i or i['type'] not in (8, 9):
            continue
        w, h = i['size']
        if max(w, h) >= 1.9 * min(w, h) and w * h > area:
            best, area = p, w * h
    return best


def render(src, target):
    im = btf.decode(open(src, 'rb').read())
    im = im.crop(im.getbbox())
    vertical = im.height > im.width
    rot = target - tip_angle(im, vertical)
    im = im.rotate(rot, resample=Image.BICUBIC, expand=True)
    im = im.crop(im.getbbox())
    k = min(BOX[0] / im.width, BOX[1] / im.height)
    im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
    out = Image.new('RGBA', CANVAS, (0, 0, 0, 0))
    out.paste(im, ((CANVAS[0] - im.width) // 2, (CANVAS[1] - im.height) // 2), im)
    return out


def main():
    master_path, src, out = sys.argv[1:4]
    preview = sys.argv[4] if len(sys.argv) > 4 else None
    deck = os.path.join(src, 'cocostudio', 'publish', 'Deck_KeyBlade_0701_05.png')
    if os.path.exists(deck):
        # immagine originale: impugnatura in basso a sinistra, quindi la punta e' l'estremo a destra
        t = axis_angle(btf.decode(open(deck, 'rb').read()))
        target = t if math.cos(math.radians(t)) > 0 else t + 180
    else:
        target = 33.0
    print('angolo della punta (Deck_KeyBlade_0701_05): %.1f' % target)
    dst = os.path.join(out, 'img', 'keyBlade')
    os.makedirs(dst, exist_ok=True)
    done, missing, tiles = 0, [], []
    for disp in sorted({r['displayId'] for r in json.load(open(master_path, encoding='utf-8'))}):
        lwf = 'keyblade_%04d_%02d' % (disp // 100, disp % 100)
        folder = os.path.join(src, 'lwf', 'avatar', 'keyblade', lwf)
        bmp = pick_bitmap(folder) if os.path.isdir(folder) else None
        if not bmp:
            missing.append(lwf)
            continue
        im = render(bmp, target)
        # palette (tipo 9): 64 immagini in ~1 MB invece di ~4 (riserva del pacchetto generato)
        p = os.path.join(dst, 'KeyBlade_%06d.png' % disp)
        open(p, 'wb').write(btf.encode_palette(im))
        tiles.append(btf.decode(open(p, 'rb').read()))   # anteprima dal file scritto
        done += 1
    print('immagini dei keyblade: %d; senza LWF: %s' % (done, ', '.join(missing) or 'nessuno'))
    if preview and tiles:
        cols = 8
        sheet = Image.new('RGBA', (cols * 220, -(-len(tiles) // cols) * 170), (40, 40, 70, 255))
        for n, im in enumerate(tiles):
            t = im.resize((220, 170), Image.LANCZOS)
            sheet.paste(t, ((n % cols) * 220, (n // cols) * 170), t)
        sheet.save(preview)


if __name__ == '__main__':
    main()
