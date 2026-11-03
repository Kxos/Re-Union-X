"""Tests of lwf_size_audit.py on a synthetic LWF (no game data): python -I recon/tools/test_lwf_size_audit.py"""
import os
import shutil
import struct
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import lwf_size_audit as A  # noqa: E402


def lwf(textures, bitmaps, matrices):
    """Minimal LWF bytes: 36 sections, only strings, matrix, texture, fragment, bitmap filled.
    textures [(name, w, h)], bitmaps [(matrix id, texture index)] (one fragment per bitmap)."""
    names = [t[0].encode() for t in textures]
    sbytes = b''.join(names)
    secs = {}
    body = b''
    base = 0x20 + 8 * 36 + 4

    def put(i, blob, n):
        nonlocal body
        secs[i] = (base + len(body), n)
        body += blob
    put(0, sbytes + b'\0' * (-len(sbytes) % 4), len(sbytes))
    put(3, b''.join(struct.pack('<6f', *m) for m in matrices), len(matrices))
    put(8, b''.join(struct.pack('<4if', i, 0, w, h, 1.0) for i, (_n, w, h) in enumerate(textures)), len(textures))
    put(9, b''.join(struct.pack('<9i', 0, t, 0, 0, 0, 0, 0, 10, 10) for _m, t in bitmaps), len(bitmaps))
    put(10, b''.join(struct.pack('<2i', m - (1 << 32) if m & A.FLAG else m, f) for f, (m, _t) in enumerate(bitmaps)),
        len(bitmaps))
    offs, o = [], 0
    for n in names:
        offs.append((o, len(n)))
        o += len(n)
    put(35, b''.join(struct.pack('<2i', *x) for x in offs), len(offs))
    head = b'LWF\0' + b'\0' * 28
    table = b''.join(struct.pack('<2i', *secs.get(i, (base + len(body), 0))) for i in range(36))
    return head + table + struct.pack('<i', base + len(body)) + body


def btf(cw, ch, w, h):
    return b'\x89BTF' + b'\0' * 12 + bytes([8]) + b'\0' * 5 + struct.pack('<6H', cw, ch, 0, 0, w, h) + b'\0' * 8


def png(w, h):
    return b'\x89PNG\r\n\x1a\n' + struct.pack('>I', 13) + b'IHDR' + struct.pack('>II', w, h) + b'\x08\x06\0\0\0'


assert A.image_size(btf(64, 32, 60, 30)) == (64, 32, 'btf')
assert A.image_size(btf(0, 0, 60, 30)) == (60, 30, 'btf')
assert A.image_size(png(7, 9)) == (7, 9, 'png')
assert A.image_size(b'nope' * 10) is None

texs = [('a_61.png', 40, 20), ('a_62.png', 16, 16), ('a_63.png', 8, 8), ('a_64.png', 4, 4)]
data = lwf(texs, [(A.FLAG | 0, 0), (1, 1), (A.FLAG | 1, 0)], [(2.5, 2.5, 0, 0, 0, 0), (0.5, 0.5, 0, 0, 1, 1)])
t = A.lwf_textures(data)
assert [x[:3] for x in t] == texs, t
assert t[0][4] == (0.5, 2.5) and t[1][4] == (1.0, 1.0) and t[2][4] is None, t

tmp = tempfile.mkdtemp()
try:
    low, high = os.path.join(tmp, 'low'), os.path.join(tmp, 'high')
    for root in (low, high):
        os.makedirs(os.path.join(root, 'lwf', 'x', 'a'))
    w = lambda root, n, b: open(os.path.join(root, 'lwf', 'x', 'a', n), 'wb').write(b)  # noqa: E731
    w(low, 'a.lwf', data)
    w(low, 'a_61.png', btf(40, 20, 40, 20))     # matches in the low layer...
    w(high, 'a_61.png', png(100, 50))           # ...but the later layer wins: 2.5x larger
    w(low, 'a_62.png', btf(16, 16, 16, 16))     # matches
    w(high, 'a_63.png', btf(4, 4, 4, 4))        # smaller (stretched)
    rows, stats = A.scan([A.DirLayer('low', low), A.DirLayer('high', high)], log=lambda *_: None)
    assert stats == dict(lwf=1, textures=4, ok=1, larger=1, smaller=1, other=0, missing=1, unreadable=0), stats
    by = {r['texture']: r for r in rows}
    assert by['a_61.png']['kind'] == 'larger' and by['a_61.png']['rx'] == 2.5 and by['a_61.png']['tex_layer'] == 'high'
    assert by['a_61.png']['lwf_layer'] == 'low' and by['a_61.png']['bmp_scale'] == '0.500-2.500'
    assert by['a_63.png']['kind'] == 'smaller' and by['a_64.png']['kind'] == 'missing'
finally:
    shutil.rmtree(tmp)
print('OK: lwf_size_audit')
