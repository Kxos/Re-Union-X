"""Test of make_medal_gallery_images.py:  python recon/tools/test_make_medal_gallery_images.py"""
import os
import sys
import tempfile

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import make_medal_gallery_images as mg  # noqa: E402

medals = [
    {'medalId': 1, 'thumbId': 11, 'bgm': 5},
    {'medalId': 2, 'thumbId': 12, 'imageCategory': 2, 'artId': 21266},
    {'medalId': 3, 'imageId': 13, 'imageCategory': 2, 'artId': 21266},
    {'medalId': 4, 'thumbId': 14},
]
assert mg.gallery_ids(medals) == ([11, 12, 13], [21266]), mg.gallery_ids(medals)

with tempfile.TemporaryDirectory() as d:
    src, art, gd = (os.path.join(d, x) for x in ('m', 'a', 'gd'))
    os.makedirs(src)
    os.makedirs(art)
    Image.new('RGBA', (190, 190), (255, 0, 0, 128)).save(os.path.join(src, 'Medal_S_11.png'))
    Image.new('RGBA', (640, 960), (0, 0, 255, 255)).save(os.path.join(art, 'Art_21266.png'))
    import json
    mp = os.path.join(d, 'medal.json')
    with open(mp, 'w') as f:
        json.dump(medals, f)
    assert mg.main([mp, gd, '--medals', src, '--art', art]) == 0
    out = os.path.join(gd, 'medal_img')
    assert sorted(os.listdir(out)) == ['11.png', 'art_21266-l.jpg', 'art_21266.jpg'], os.listdir(out)
    assert Image.open(os.path.join(out, '11.png')).size == (128, 128)
    assert Image.open(os.path.join(out, 'art_21266.jpg')).size == (160, 240)
    assert Image.open(os.path.join(out, 'art_21266-l.jpg')).size == (480, 720)
print('OK: medal gallery images')
