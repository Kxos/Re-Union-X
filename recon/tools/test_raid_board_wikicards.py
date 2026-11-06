"""Offline test of raid_board_wikicards.py on synthetic cards (no original pictures needed).

    python -I recon/tools/test_raid_board_wikicards.py   -> «OK: ...» or «ERRORS (n)», exit 1

Checks: the board key of a JP board read back from raid_ids.json (census id + place in the row), the card scaled to 306 x 306
with the alpha of the card background, the file name without «:», boards without a wiki card left alone, a missing board id
or card stops the run.
"""
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import raid_board_wikicards as rbw  # noqa: E402
from PIL import Image  # noqa: E402

errors = []


def check(cond, msg):
    if not cond:
        errors.append(msg)


with tempfile.TemporaryDirectory() as tmp:
    wiki = os.path.join(tmp, 'wiki')
    os.makedirs(wiki)
    Image.new('RGBA', (179, 180), (230, 190, 235, 255)).save(os.path.join(wiki, 'board_raid1610_01.png'))
    Image.new('RGBA', (359, 359), (200, 30, 30, 255)).save(os.path.join(wiki, 'board_raid1702_03.png'))
    bg = Image.new('RGBA', (306, 306), (0, 0, 0, 255))
    for x in range(6):
        for y in range(6):
            bg.putpixel((x, y), (0, 0, 0, 0))  # a transparent corner
    bg_png = os.path.join(tmp, 'Board_0005.png')
    bg.save(bg_png)
    boards = {'rows': {
        'JP-RAID-19': {'boards': [{'name': 'M_Pooh Costume', 'art': {'wiki': 'board_raid1610_01.png'}}, {'name': 'L', 'art': {'jp': 'img/x.png'}}]},
        'JP-RAID-24': {'boards': [{'name': 'Set 1'}, {'name': 'Set 2'}, {'name': 'Bonus', 'art': {'wiki': 'board_raid1702_03.png'}}]}}}
    ids = {'boards': {'JP-RAID-19/JP-RAID-19:jp1-m-pooh-costume': 717, 'JP-RAID-19/JP-RAID-19:jp2-l-pooh-costume': 718,
                      'JP-RAID-19/JP-RAID-19:std3-seasoned-wielder-bonus': 521, 'JP-RAID-24/JP-RAID-24:jp3-seasoned-wielder-bonus': 737}}
    loc = os.path.join(tmp, 'loc')
    done = rbw.run(boards, ids, wiki, bg_png, loc)
    check(done == [('JP-RAID-19:jp1-m-pooh-costume', 'board_raid1610_01.png'), ('JP-RAID-24:jp3-seasoned-wielder-bonus', 'board_raid1702_03.png')], 'cards %r' % done)
    out = os.path.join(loc, 'img', 'sphere_incentive_ww')
    check(sorted(os.listdir(out)) == ['JP-RAID-19_jp1-m-pooh-costume.png', 'JP-RAID-24_jp3-seasoned-wielder-bonus.png'], 'files %r' % os.listdir(out))
    im = Image.open(os.path.join(out, 'JP-RAID-24_jp3-seasoned-wielder-bonus.png'))
    check(im.size == (306, 306) and im.mode == 'RGBA', 'size %r %s' % (im.size, im.mode))
    check(im.getpixel((0, 0))[3] == 0 and im.getpixel((150, 150)) == (200, 30, 30, 255), 'alpha of the background, picture kept')
    # a wiki card whose board has no id yet, or a missing card file: stop
    try:
        rbw.run({'rows': {'JP-RAID-99': {'boards': [{'name': 'X', 'art': {'wiki': 'board_raid1610_01.png'}}]}}}, ids, wiki, bg_png, loc)
        check(False, 'no board id: must stop')
    except SystemExit as e:
        check('no board id' in str(e), str(e))
    try:
        rbw.run({'rows': {'JP-RAID-19': {'boards': [{'name': 'X', 'art': {'wiki': 'nope.png'}}]}}}, ids, wiki, bg_png, loc)
        check(False, 'missing card: must stop')
    except SystemExit as e:
        check('missing' in str(e), str(e))

if errors:
    print('ERRORS (%d)' % len(errors))
    for e in errors:
        print('  ' + e)
    sys.exit(1)
print('OK: raid_board_wikicards (key from raid_ids.json, 306 x 306, background alpha, file name, stops)')
