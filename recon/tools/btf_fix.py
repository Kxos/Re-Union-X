"""Porta le texture generate al formato delle originali: BTF con alpha premoltiplicata.

    python recon/tools/btf_fix.py <cartella> [...]

- PNG veri (immagini scaricate o disegnate, es. stage_gen\\boards\\files) -> BTF (btf.encode);
- BTF scritti prima della correzione di btf.encode (colore > alpha in qualche pixel: non
  premoltiplicati, bordi semitrasparenti schiariti) -> riletti senza conversione e riscritti.
I BTF gia' premoltiplicati (originali o nuovi) restano com'erano. Pillow e numpy: senza -I.
"""
import os
import sys
import zlib
from multiprocessing import Pool

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import btf  # noqa: E402


def fix(p):
    d = open(p, 'rb').read()
    if d[:8] == b'\x89PNG\r\n\x1a\n':
        im = Image.open(p).convert('RGBA')
    elif d[:4] == b'\x89BTF':
        i = btf.info(d)
        if i is None or i['type'] != 8:
            return 0
        w, h = i['size']
        raw = zlib.decompressobj().decompress(d[0x26:])[:w * h * 4]
        px = np.frombuffer(raw, np.uint8).reshape(h, w, 4)
        if not (px[..., :3].max(axis=2) > px[..., 3]).any():
            return 0
        im = Image.new('RGBA', i['canvas'] if all(i['canvas']) else (w, h))
        im.paste(Image.fromarray(px.copy(), 'RGBA'), i['offset'])
    else:
        return 0
    open(p, 'wb').write(btf.encode(im))
    return 1


if __name__ == '__main__':
    files = [os.path.join(r, f) for top in sys.argv[1:] for r, _, fs in os.walk(top) for f in fs
             if f.lower().endswith('.png')]
    with Pool() as pool:
        n = sum(pool.map(fix, files, chunksize=16))
    print('texture riscritte: %d su %d' % (n, len(files)))
