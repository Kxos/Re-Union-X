"""Offline test of raid_board_screens.py on synthetic screenshots (no original pictures needed).

    python -I recon/tools/test_raid_board_screens.py   -> «OK: ...» or «ERRORS (n)», exit 1

Checks: the fixed card box of the 1919 x 739 screenshots; the card found by colour on other sizes (event boards of
2016-2018: 1024 x 409, 1280 x 544, 1919 x 819...), lilac-pink (raid) and lilac-blue (event) cards; event board keys
(«WW-E17890-1:ev1-zootopia-m») written under a file name without «:» (not allowed on Windows).
"""
import json
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import raid_board_screens as rbs  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402

errors = []


def check(cond, msg):
    if not cond:
        errors.append(msg)


def shot(size, box, card=(235, 190, 235)):
    """Dark board screen with a light card at box (x, y, s) and a red square inside it."""
    im = Image.new('RGB', size, (15, 25, 60))
    d = ImageDraw.Draw(im)
    x, y, s = box
    d.rounded_rectangle((x, y, x + s - 1, y + s - 1), radius=max(2, s // 12), fill=card)
    d.rectangle((x + s // 4, y + s // 4, x + s // 2, y + s // 2), fill=(200, 30, 30))
    # nodes on the right: light circles, must not be taken for the card
    for k in range(4):
        d.ellipse((size[0] // 2 + k * 90, 40, size[0] // 2 + k * 90 + 70, 110), fill=(120, 130, 200))
    return im


# fixed box of the weekly screenshots
check(rbs.find_box(shot((1919, 739), (221, 69, 258))) == (221, 69, 258), 'fixed box of 1919x739')
# found by colour
for size, box, card in [((1024, 409), (102, 37, 144), (235, 190, 235)), ((1280, 544), (192, 40, 189), (235, 190, 235)),
                        ((1919, 819), (139, 75, 285), (200, 205, 245)), ((1456, 557), (195, 50, 195), (200, 205, 245))]:
    got = rbs.find_box(shot(size, box, card))
    check(got is not None and all(abs(a - b) <= 2 for a, b in zip(got, box)), 'box of %s: %s, expected %s' % (size, got, box))
# no card: clear error
try:
    rbs.find_box(Image.new('RGB', (1000, 400), (15, 25, 60)))
    check(False, 'a screenshot with no card must raise')
except SystemExit:
    pass

# file names
check(rbs.file_name('radiant-12') == 'radiant-12', 'weekly key unchanged')
check(rbs.file_name('WW-E17890-1:ev1-zootopia-m') == 'WW-E17890-1_ev1-zootopia-m', 'event key without colon')

# whole run: config with a weekly and an event key
with tempfile.TemporaryDirectory() as tmp:
    shots = os.path.join(tmp, 'shots'); os.makedirs(shots)
    shot((1919, 739), (221, 69, 258)).save(os.path.join(shots, 'a.png'))
    shot((1024, 409), (102, 37, 144)).save(os.path.join(shots, 'b.png'))
    cfg = os.path.join(tmp, 'raid_config.json')
    json.dump({'boards': {'art': {'radiant-12': {'screenshot': 'a.png'}, 'x': {'jp': 'img/sphere_incentive/1.png'}},
                          }}, open(cfg, 'w'))
    patch = os.path.join(tmp, 'patch.json')
    json.dump({'WW-E1-1:ev1-b-m': {'screenshot': 'b.png'}}, open(patch, 'w'))
    board = os.path.join(tmp, 'Board_0005.png')
    Image.new('RGBA', (306, 306), (240, 200, 240, 255)).save(board)
    loc = os.path.join(tmp, 'loc')
    rbs.main([cfg, shots, board, loc, patch])
    out = os.path.join(loc, 'img', 'sphere_incentive_ww')
    names = sorted(os.listdir(out))
    check(names == ['WW-E1-1_ev1-b-m.png', 'radiant-12.png'], 'files written: %s' % names)
    im = Image.open(os.path.join(out, 'WW-E1-1_ev1-b-m.png'))
    check(im.size == (306, 306), 'card size %s' % (im.size,))
    # the red square of the card lands at the same place (1/4..1/2 of the card)
    px = im.convert('RGB').getpixel((115, 115))
    check(px[0] > 150 and px[1] < 80, 'red square inside the cut card: %s' % (px,))

if errors:
    print('ERRORS (%d)' % len(errors))
    for e in errors:
        print(' -', e)
    sys.exit(1)
print('OK: raid_board_screens (fixed box, colour box on 4 sizes, event key file names, run with patch)')
