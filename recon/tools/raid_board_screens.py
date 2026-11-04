"""Raid Board card pictures cut from screenshots of the original game (docs/notes/bacheche.md «Raid Boards»).

    python -I recon/tools/raid_board_screens.py <raid_config.json> <screenshot folder> <Board_0005.png> <loc folder> [<art patch.json>]

For every board of raid_config.json boards.art with `screenshot` (no JP 4.3.1 file has its picture), plus the boards of an
optional patch in the same shape ({<board key>: {screenshot: <file>}}, e.g. the event boards proposed by a review), the
card is cut from that khuxwiki screenshot of the WW board screen (reference/raid_boards/wiki, kept outside the repository)
and written as <loc>/img/sphere_incentive_ww/<file name>.png, 306 x 306 like img/sphere_incentive. import_originals.py
serves it under each board id (server/game_data/raid_board_art.tsv, source loc). File name = board key with «:» written
«_» (event board keys «WW-E17890-1:ev1-zootopia-m»; «:» is not allowed in Windows file names).

Card box: the 1919 x 739 screenshots show the card at x 221, y 69, 258 x 258 px (fitted on Radiant Rewards Boards 11 and 13,
whose JP picture exists: mean difference 3.7-3.9 of 255 after scaling to 306). Screenshots of other sizes (the 2016-2018
event boards: 1024 x 409, 1280 x 544, 1919 x 819, ...) are searched for the card by colour: the largest light lilac area
(pink raid card or blue-lilac event card) in the top-left part of the screen, squared (checked on 11 event boards whose JP
picture exists: mean difference 1.8-3.2 of 255 on 1024-1779 px screenshots, 7-14 on 1919 x 819 ones, box within 1 px). The corners outside the rounded card take the alpha of the card background
Board_0005, so the dark screen behind the card is not copied.
"""
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

BOX = {(1919, 739): (221, 69, 258)}
SIZE = 306


def file_name(key):
    return key.replace(':', '_')


def find_box(im):
    """(x, y, side) of the card in a board screenshot."""
    if im.size in BOX:
        return BOX[im.size]
    w, h = im.size
    a = np.asarray(im.convert('RGB')).astype(int)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    m = (r > 150) & (b > 170) & (g > 120) & (b - g > 8)
    m[:, int(w * 0.45):] = False
    m[int(h * 0.75):, :] = False
    m = ndimage.binary_closing(m, iterations=3)
    lab, n = ndimage.label(m)
    if not n:
        raise SystemExit('no card found in a screenshot of %dx%d' % (w, h))
    k = int(np.argmax(ndimage.sum(m, lab, range(1, n + 1)))) + 1
    card = lab == k
    # rows crossing the whole card; the board title just above it (light text merged by the closing) is narrower
    rows = card.sum(axis=1)
    ys = np.where(rows >= rows.max() * 0.6)[0]
    xs = np.where(card[ys.min():ys.max() + 1].any(axis=0))[0]
    side = int(max(xs.max() - xs.min(), ys.max() - ys.min()) + 1)
    if side < h * 0.15:
        raise SystemExit('no card found in a screenshot of %dx%d (largest light area %d px)' % (w, h, side))
    return int(xs.min()), int(ys.min()), side


def cut(shot, mask):
    im = Image.open(shot).convert('RGBA')
    x, y, s = find_box(im)
    card = im.crop((x, y, x + s, y + s)).resize((SIZE, SIZE), Image.LANCZOS)
    card.putalpha(mask)
    return card


def main(argv):
    if len(argv) not in (4, 5):
        raise SystemExit(__doc__)
    config, shots, board, loc = argv[:4]
    art = dict(json.load(open(config, encoding='utf-8'))['boards'].get('art', {}))
    if len(argv) == 5:
        art.update(json.load(open(argv[4], encoding='utf-8')))
    mask = Image.open(board).convert('RGBA').resize((SIZE, SIZE)).getchannel('A')
    out = os.path.join(loc, 'img', 'sphere_incentive_ww')
    os.makedirs(out, exist_ok=True)
    n = 0
    for key, a in sorted(art.items()):
        if 'screenshot' not in a:
            continue
        cut(os.path.join(shots, a['screenshot']), mask).save(os.path.join(out, file_name(key) + '.png'))
        n += 1
    print('raid_board_screens: %d cards -> %s' % (n, out))


if __name__ == '__main__':
    main(sys.argv[1:])
