"""Nomi e header dei primi record BGAD di un file (lettore).

Utile per gli indici (.png): record "/", "md5", "size". I nomi dei record dei
pacchetti (.mp4, OBB) usano un'altra cifratura, non ancora nota.

    python -I recon/tools/bgad_names.py <file> [max record]
"""
import struct
import sys

HDR = struct.Struct('<4sHHHHHHII')


def record_name(buf, off):
    magic, ver, flags, hsize, nlen, enc, comp, size, raw = HDR.unpack_from(buf, off)
    assert magic == b'BGAD', (off, magic)
    name = bytearray(buf[off + hsize:off + hsize + nlen])
    seed = size
    if ver == 1:
        for i in range(len(name)):
            seed = (seed * 0x19660d + 0x3c6ef35f) & 0xffffffff
            name[i] ^= seed & 0xff
    else:
        name += b'\0' * (-len(name) % 4)
        for i in range(0, len(name), 4):
            seed = (seed * 0x19660d + 0x3c6ef35f) & 0xffffffff
            struct.pack_into('<I', name, i, struct.unpack_from('<I', name, i)[0] ^ seed)
        name = name[:nlen]
    return bytes(name), dict(ver=ver, flags=flags, hsize=hsize, enc=enc, comp=comp, size=size,
                             raw=raw, end=off + hsize + nlen + size)


buf = open(sys.argv[1], 'rb').read()
n = int(sys.argv[2]) if len(sys.argv) > 2 else 5
off = 0
for _ in range(n):
    if off + 0x18 > len(buf):
        break
    name, h = record_name(buf, off)
    print(hex(off), name, h)
    off = h['end']
