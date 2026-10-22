"""Prova di bgad.read_index con offset oltre 4 GiB (I-171):  python -I recon/tools/test_bgad_index.py"""
import os
import struct
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bgad  # noqa: E402
from resource_index import obfuscate_name  # noqa: E402


def index_bytes(offsets, names):
    """Indice BGI v3 senza strato interno in un record "/" non cifrato (come resource_pack.py)."""
    pool, name_offs = bytearray(), []
    for name, _ in names:
        name_offs.append(len(pool))
        pool += name.encode() + b'\0'
    bgi = (b'\x89BGI' + struct.pack('<IIII', 3, 0, len(offsets), len(names))
           + struct.pack('<%dQ' % len(offsets), *offsets)
           + struct.pack('<%dI' % len(names), *(r for _, r in names))
           + struct.pack('<%dI' % len(names), *name_offs) + bytes(pool) + b'\0' * 8)
    hdr = bgad.HDR.pack(b'BGAD', 2, 0, bgad.HDR.size, 1, 0, 0, len(bgi), len(bgi))
    return hdr + obfuscate_name(b'/', len(bgi)) + bgi


# offset sopra 2^32 (record nel terzo pezzo misc.mp4.2) e uno con i 32 bit bassi a zero
offs = [0x40, (1 << 32) + 0x1234, 5 << 32, (1 << 33) + 0xfffffff0]
names = [('a/primo', 0), ('b/oltre4g', 1), ('c/basso_zero', 2), ('d/oltre8g', 3), ('e/alias', 1)]
with tempfile.TemporaryDirectory() as td:
    p = os.path.join(td, 'x.png')
    with open(p, 'wb') as fh:
        fh.write(index_bytes(offs, names))
    got = bgad.read_index(p, b'\0' * 32)
want = [('a/primo', 0x40), ('b/oltre4g', (1 << 32) + 0x1234), ('c/basso_zero', 5 << 32),
        ('d/oltre8g', (1 << 33) + 0xfffffff0), ('e/alias', (1 << 32) + 0x1234)]
assert got == want, got
print('bgad.read_index: ok')
