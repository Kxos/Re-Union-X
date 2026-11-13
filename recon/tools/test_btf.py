"""btf.py: round trip and half-size textures (+0x11 == 4).  python -I recon/tools/test_btf.py"""
import os
import struct
import sys
import zlib

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import btf  # noqa: E402
from PIL import Image  # noqa: E402


def half_btf(small, w, h):
    """type-8 BTF that declares w x h but stores `small` (ceil(w/2) x ceil(h/2)) with the half flag"""
    z = zlib.compress(small.tobytes(), 9)
    head = b'\x89BTF' + bytes([0, 0, 1, 0]) + bytes(8) + bytes([8, 4, 0, 0, 0, 0])
    return head + struct.pack('<6HI', w, h, 0, 0, w, h, len(z)) + z


def main():
    im = Image.new('RGBA', (7, 5), (255, 200, 100, 255))
    d = btf.encode(im)
    assert not btf.info(d)['half']
    assert btf.decode(d).getpixel((3, 2)) == (255, 200, 100, 255)
    small = Image.new('RGBA', (4, 3), (255, 200, 100, 255))       # opaque: premultiplied == straight
    d = half_btf(small, 7, 5)
    i = btf.info(d)
    assert i['half'] and i['size'] == (7, 5)
    out = btf.decode(d)
    assert out.size == (7, 5), out.size
    assert out.getpixel((6, 4)) == (255, 200, 100, 255), out.getpixel((6, 4))
    assert btf.decode_premultiplied(d).size == (7, 5)
    print('test_btf: all passed')


if __name__ == '__main__':
    main()
