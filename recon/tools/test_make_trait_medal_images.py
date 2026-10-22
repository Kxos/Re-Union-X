"""Prova di make_trait_medal_images.py:  python recon/tools/test_make_trait_medal_images.py"""
import os
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from make_trait_medal_images import gray  # noqa: E402

img = Image.new('RGBA', (2, 1))
img.putpixel((0, 0), (255, 0, 0, 255))
img.putpixel((1, 0), (10, 200, 30, 77))
g = gray(img)
for x in range(2):
    r, gg, b, a = g.getpixel((x, 0))
    assert r == gg == b, 'grigio'
    assert a == img.getpixel((x, 0))[3], 'alfa invariato'
assert g.getpixel((0, 0))[0] == Image.new('RGB', (1, 1), (255, 0, 0)).convert('L').getpixel((0, 0)), 'luminanza'
print('OK: trait medal images')
