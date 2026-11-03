"""Raid Board card pictures cut from screenshots of the original game (docs/notes/bacheche.md «Raid Boards»).

    python -I recon/tools/raid_board_screens.py <raid_config.json> <screenshot folder> <Board_0005.png> <loc folder>

For every board of raid_config.json boards.art with `screenshot` (no JP 4.3.1 file has its picture), the card is cut from
that khuxwiki screenshot of the WW board screen (reference/raid_boards/wiki, kept outside the repository) and written as
<loc>/img/sphere_incentive_ww/<board key>.png, 306 x 306 like img/sphere_incentive. import_originals.py serves it under each
board id (server/game_data/raid_board_art.tsv, source loc).

Card box: the 1919 x 739 screenshots show the card at x 221, y 69, 258 x 258 px (fitted on Radiant Rewards Boards 11 and 13,
whose JP picture exists: mean difference 3.7-3.9 of 255 after scaling to 306). The corners outside the rounded card take the
alpha of the card background Board_0005, so the dark screen behind the card is not copied.
"""
import json
import os
import sys

from PIL import Image

BOX = {(1919, 739): (221, 69, 258)}
SIZE = 306


def cut(shot, mask):
    im = Image.open(shot).convert('RGBA')
    if im.size not in BOX:
        raise SystemExit('%s: screenshot of %dx%d, card box known only for %s' % (shot, im.size[0], im.size[1], list(BOX)))
    x, y, s = BOX[im.size]
    card = im.crop((x, y, x + s, y + s)).resize((SIZE, SIZE), Image.LANCZOS)
    card.putalpha(mask)
    return card


def main(argv):
    if len(argv) != 4:
        raise SystemExit(__doc__)
    config, shots, board, loc = argv
    art = json.load(open(config, encoding='utf-8'))['boards'].get('art', {})
    mask = Image.open(board).convert('RGBA').resize((SIZE, SIZE)).getchannel('A')
    out = os.path.join(loc, 'img', 'sphere_incentive_ww')
    os.makedirs(out, exist_ok=True)
    n = 0
    for key, a in sorted(art.items()):
        if 'screenshot' not in a:
            continue
        cut(os.path.join(shots, a['screenshot']), mask).save(os.path.join(out, key + '.png'))
        n += 1
    print('raid_board_screens: %d cards -> %s' % (n, out))


if __name__ == '__main__':
    main(sys.argv[1:])
