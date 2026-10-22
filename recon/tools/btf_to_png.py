"""Converte le texture BTF delle risorse (intestazione '\\x89BTF', dati zlib) in PNG.

    python -I recon/tools/btf_to_png.py <file.png BTF> [...] (scrive <file>.dec.png)

Formato osservato: +0x16 u16 larghezza, +0x18 u16 altezza, poi a un offset variabile
il flusso zlib (78 9c / 78 da / 78 01); i pixel decompressi sono RGBA8888 o, se la
lunghezza e' meta', RGBA4444. Serve Pillow (non con -I se e' installato per l'utente).
"""
import struct
import sys
import zlib

from PIL import Image

for path in sys.argv[1:]:
    b = open(path, 'rb').read()
    if b[:4] != b'\x89BTF':
        print(path, ': non e\' BTF'); continue
    w, h = struct.unpack_from('<HH', b, 0x16)
    z = next(i for i in range(0x10, 0x80) if b[i] == 0x78 and b[i + 1] in (0x01, 0x5e, 0x9c, 0xda))
    raw = zlib.decompress(b[z:])
    if len(raw) == w * h * 4:
        im = Image.frombytes('RGBA', (w, h), raw)
    elif len(raw) == w * h * 2:
        px = struct.unpack('<%dH' % (w * h), raw)
        data = bytearray()
        for v in px:
            data += bytes((((v >> 12) & 15) * 17, ((v >> 8) & 15) * 17, ((v >> 4) & 15) * 17, (v & 15) * 17))
        im = Image.frombytes('RGBA', (w, h), bytes(data))
    elif len(raw) > w * h and (len(raw) - w * h) % 4 == 0:
        # a tavolozza: tavolozza RGBA (n colori) poi un indice per pixel
        n = (len(raw) - w * h) // 4
        pal, idx = raw[:4 * n], raw[4 * n:]
        data = bytearray()
        for i in idx:
            data += pal[4 * i:4 * i + 4] if i < n else b'\0\0\0\0'
        im = Image.frombytes('RGBA', (w, h), bytes(data))
    else:
        print(path, ': %dx%d, %d byte decompressi, formato ignoto' % (w, h, len(raw))); continue
    im.save(path[:-4] + '.dec.png')
    print(path, '%dx%d' % (w, h))
