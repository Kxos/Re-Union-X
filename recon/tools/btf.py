"""Texture BTF delle risorse (i .png di cocostudio/, img/, lwf/ non sono PNG veri).

Intestazione (little endian):
    +0x00 '\\x89BTF' +0x10 u8 tipo
    +0x16 u16 larghezza, u16 altezza della tela
    +0x1a u16 x, u16 y dell'immagine ritagliata dentro la tela
    +0x1e u16 larghezza, u16 altezza dell'immagine
tipo 8: RGBA 32 bit, dati zlib da +0x26
tipo 9: palette, +0x22 u16 numero di colori N, dati zlib da +0x28: N colori RGBA poi un
        indice di un byte per pixel
tipo 1: palette come il 9 ma senza zlib (+0x22 u16 N colori, dati da +0x28): anche texture vere (occhi
        degli NPC, 82 file nel pacchetto 2016; I-216, 29-10), non solo il segnaposto trasparente da 45 byte

    python -I recon/tools/btf.py <file.btf> <uscita.png> (Pillow: senza -I se serve)
"""
import struct
import zlib


def info(d):
    if d[:4] != b'\x89BTF':
        return None
    cw, ch, ox, oy, w, h = struct.unpack_from('<6H', d, 0x16)
    return dict(type=d[0x10], canvas=(cw, ch), offset=(ox, oy), size=(w, h), half=d[0x11] == 4)


def decode(d):
    """Restituisce un'immagine PIL RGBA grande quanto la tela."""
    from PIL import Image
    i = info(d)
    if i is None:
        raise ValueError('non BTF')
    w, h = i['size']
    canvas = Image.new('RGBA', i['canvas'] if all(i['canvas']) else (max(w, 1), max(h, 1)))
    # +0x11 == 4: pixels stored at half size (ceil(w/2) x ceil(h/2)), stretched by the client to the declared
    # size (371 enemy textures of the ReLux EN pack, e.g. the 1638/1639 lantern glow; 13-11)
    sw, sh = ((w + 1) // 2, (h + 1) // 2) if i['half'] else (w, h)
    if i['type'] == 8:
        raw = zlib.decompressobj().decompress(d[0x26:])
        im = Image.frombytes('RGBA', (sw, sh), raw[:sw * sh * 4])
    elif i['type'] in (1, 9):
        n = struct.unpack_from('<H', d, 0x22)[0]
        raw = d[0x28:] if i['type'] == 1 else zlib.decompressobj().decompress(d[0x28:])
        pal = [tuple(raw[k * 4:k * 4 + 4]) for k in range(n)]
        im = Image.new('RGBA', (sw, sh))
        im.putdata([pal[b] if b < n else (0, 0, 0, 0) for b in raw[n * 4:n * 4 + sw * sh]])
    else:
        return canvas
    if i['half']:
        im = Image.merge('RGBA', [c.resize((w, h), Image.BILINEAR) for c in im.split()])   # premultiplied
    canvas.paste(_unpremultiply(im), i['offset'])
    return canvas


# Le texture originali hanno l'alpha premoltiplicata (colore <= alpha in ogni pixel: verificato su
# Z_SpIcon_Eff0, 240.379 pixel semitrasparenti). Senza premoltiplicare, i bordi semitrasparenti
# delle nostre immagini uscivano schiariti (bianco sul cappello e sulla mano di Paperino):
# encode premoltiplica, decode restituisce colori normali.
def _premultiply(im):
    from PIL import Image, ImageChops
    r, g, b, a = im.split()
    return Image.merge('RGBA', [ImageChops.multiply(c, a) for c in (r, g, b)] + [a])


def _unpremultiply(im):
    import numpy as np
    from PIL import Image
    px = np.asarray(im, dtype=np.uint16).copy()
    a = px[..., 3:4]
    rgb = np.where(a > 0, np.minimum(255, (px[..., :3] * 255 + a // 2) // np.maximum(a, 1)), 0)
    px[..., :3] = rgb
    return Image.fromarray(px.astype(np.uint8), 'RGBA')


def decode_premultiplied(d):
    """Like decode() but keeps the stored premultiplied colours (type 8 only): for atlas edits that
    copy original pixels unchanged (no un-/re-premultiply rounding). Other types fall back to decode()."""
    from PIL import Image
    i = info(d)
    if i is None or i['type'] != 8 or i['half']:
        return _premultiply(decode(d))
    w, h = i['size']
    canvas = Image.new('RGBA', i['canvas'] if all(i['canvas']) else (max(w, 1), max(h, 1)))
    raw = zlib.decompressobj().decompress(d[0x26:])
    canvas.paste(Image.frombytes('RGBA', (w, h), raw[:w * h * 4]), i['offset'])
    return canvas


def encode(im, premultiplied=False):
    """Immagine PIL -> BTF tipo 8 (RGBA, tela = immagine). Intestazione come le originali:
    '\\x89BTF', 00 00 01 00, zeri, +0x10 tipo, +0x16 tela, +0x1a 0 0, +0x1e dimensioni,
    +0x22 u32 lunghezza dei dati zlib, dati da +0x26. premultiplied=True: colours already
    premultiplied (decode_premultiplied), stored as they are."""
    im = im.convert('RGBA') if premultiplied else _premultiply(im.convert('RGBA'))
    w, h = im.size
    z = zlib.compress(im.tobytes(), 9)
    head = b'\x89BTF' + bytes([0, 0, 1, 0]) + bytes(8) + bytes([8, 0, 0, 0, 0, 0])
    head += struct.pack('<6HI', w, h, 0, 0, w, h, len(z))
    assert len(head) == 0x26
    return head + z


def encode_palette(im, colors=256):
    """Immagine PIL -> BTF tipo 9 (palette RGBA premoltiplicata, un byte per pixel), circa un
    quarto del tipo 8: per le texture grandi nel pacchetto generato (riserva di 16 MiB).
    Intestazione come le originali (es. keyblade_0001_06_a): +0x22 u16 numero di colori,
    +0x24 u32 lunghezza dei dati zlib, dati da +0x28. La tela resta quella dell'immagine; si
    salva solo il riquadro opaco (offset +0x1a)."""
    from PIL import Image
    im = im.convert('RGBA')
    cw, ch = im.size
    box = im.getbbox() or (0, 0, 1, 1)
    q = _premultiply(im.crop(box)).quantize(colors, method=Image.FASTOCTREE)
    pal = q.getpalette('RGBA') or []
    n = len(pal) // 4
    w, h = q.size
    z = zlib.compress(bytes(pal[:n * 4]) + q.tobytes(), 9)
    head = b'\x89BTF' + bytes([0, 0, 1, 0]) + bytes(8) + bytes([9, 0, 0, 0, 0, 0])
    head += struct.pack('<6HHI', cw, ch, box[0], box[1], w, h, n, len(z))
    assert len(head) == 0x28
    return head + z


if __name__ == '__main__':
    import sys
    decode(open(sys.argv[1], 'rb').read()).save(sys.argv[2])
