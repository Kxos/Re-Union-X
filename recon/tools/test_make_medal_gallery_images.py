"""Test of make_medal_gallery_images.py and make_medal_gallery_groups.py:
    python recon/tools/test_make_medal_gallery_images.py"""
import json
import os
import sys
import tempfile

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import make_medal_gallery_groups as mgg  # noqa: E402
import make_medal_gallery_images as mg  # noqa: E402

medals = [
    {'medalId': 1, 'thumbId': 11, 'bgm': 5},
    {'medalId': 2, 'thumbId': 12, 'imageCategory': 2, 'artId': 21266},
    {'medalId': 3, 'imageId': 13, 'imageCategory': 2, 'artId': 21266},
    {'medalId': 4, 'thumbId': 14},
]
assert mg.gallery_ids(medals) == ([11, 12, 13], [21266], [5]), mg.gallery_ids(medals)
ogg = b'OggS\x00\x02rest'
assert mg.akb_ogg(b'AKB \x02\x00' + b'\x00' * 20 + ogg) == ogg
assert mg.akb_ogg(b'AKB ' + b'\x00' * 30) is None and mg.akb_ogg(b'RIFF' + ogg) is None

with tempfile.TemporaryDirectory() as d:
    src, art, aud, gd = (os.path.join(d, x) for x in ('m', 'a', 'au', 'gd'))
    for x in (src, art, aud):
        os.makedirs(x)
    Image.new('RGBA', (190, 190), (255, 0, 0, 128)).save(os.path.join(src, 'Medal_S_11.png'))
    Image.new('RGBA', (640, 640), (255, 0, 0, 128)).save(os.path.join(src, 'Medal_L_11.png'))
    Image.new('RGBA', (640, 960), (0, 0, 255, 255)).save(os.path.join(art, 'Art_21266.png'))
    with open(os.path.join(aud, '000000005.akb'), 'wb') as f:
        f.write(b'AKB \x02\x00' + b'\x00' * 20 + ogg)
    mp = os.path.join(d, 'medal.json')
    with open(mp, 'w') as f:
        json.dump(medals, f)
    assert mg.main([mp, gd, '--medals', src, '--art', art, '--audio', aud]) == 0
    out = os.path.join(gd, 'medal_img')
    assert sorted(os.listdir(out)) == ['11-l.png', '11.png', 'art_21266-l.jpg', 'art_21266.jpg'], os.listdir(out)
    assert Image.open(os.path.join(out, '11.png')).size == (128, 128)
    assert Image.open(os.path.join(out, '11-l.png')).size == (320, 320)
    assert Image.open(os.path.join(out, 'art_21266.jpg')).size == (160, 240)
    assert Image.open(os.path.join(out, 'art_21266-l.jpg')).size == (480, 720)
    with open(os.path.join(gd, 'medal_bgm', '5.ogg'), 'rb') as f:
        assert f.read() == ogg

    # groups: two cards with the same picture are joined, a different one is not; per list (BGM / one artwork)
    rows = [
        {'medalId': 10, 'name': 'X', 'rare': 7, 'thumbId': 10, 'bgm': 1},
        {'medalId': 20, 'name': 'SN - X', 'rare': 7, 'thumbId': 20, 'bgm': 1},
        {'medalId': 30, 'name': 'Y', 'rare': 7, 'thumbId': 30, 'bgm': 1},
        {'medalId': 40, 'name': 'Y', 'rare': 6, 'thumbId': 40, 'bgm': 1},
        {'medalId': 120, 'name': 'SN - X', 'rare': 7, 'thumbId': 20, 'bgm': 1, 'groupId': 20},
    ]
    red, blue = Image.new('RGBA', (190, 190), (200, 0, 0, 255)), Image.new('RGBA', (190, 190), (0, 0, 200, 255))
    for t, im in ((10, red), (20, red), (30, blue), (40, red)):
        im.save(os.path.join(src, 'Medal_S_%d.png' % t))
    assert mgg.gallery_lists(rows)['bgm'] == [('X', 10, 10), ('SN - X', 20, 20), ('Y', 30, 30)], mgg.gallery_lists(rows)
    with open(mp, 'w') as f:
        json.dump(rows, f)
    gp = os.path.join(d, 'groups.json')
    assert mgg.main([mp, '--medals', src, '--out', gp]) == 0
    with open(gp) as f:
        doc = json.load(f)
    assert doc['threshold'] == mgg.THRESHOLD and [(x['list'], x['ids']) for x in doc['groups']] == [('bgm', [10, 20])], doc
print('OK: medal gallery images, music and groups')
