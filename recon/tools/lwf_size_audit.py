"""Served LWF textures whose file size differs from the size the LWF texture table declares (3 Nov 2026).

Some JP 4.3.1 textures are stored larger (~2x-2.5x) than their LWF declares: the client draws them at the declared
resolution and the animation scales them up, so they come out blurry (Spirit parts 407009/407043/402029, fixed with
jp_pet_parts.hires_lwf). This scan looks at the files the client actually loads: the served layers in pack order, a
later layer winning on a repeated name (as build-resources.ps1 merges OBB+addnl, the static packs and stage_gen).

A layer is either a folder of served files (`label=D:\\...\\stage_gen\\files`) or a resource index with its data
(`label=names.tsv|data_dir`, records read with the private bgad module; key in BGAD_KEY). For an index layer only the
first bytes of each texture record are decrypted (ChaCha is a stream cipher, zlib streams decode from the start).

Texture file of an LWF texture: `<folder of the LWF>/<texture name>` (the table holds the served file name,
`<LWF base>_<hex of the Flash name>.png`), else `<folder>/<LWF base>_<hex of the texture name>.png`; a texture whose
file is not served is reported as `missing`. Real size: BTF canvas (or image when the canvas is 0x0), PNG IHDR.

    python -I recon/tools/lwf_size_audit.py --layer ww=names_v4.tsv|resource_data\\7\\data --layer stage=stage_gen\\files
        [--layer ...] [--prefix lwf/] [--save-lwf DIR] [--jp JP_ROOT] --out audit.tsv

TSV: one row per (served LWF, texture) whose file is not the declared size, plus the bitmap scale range of the
fragments of that texture (own matrix only: the parents' animation is not followed). `--save-lwf` writes the served
LWF bytes of the mismatched rows (for rendering), `--jp` adds whether the served LWF equals the JP dump's copy.
"""
import argparse
import bisect
import hashlib
import os
import re
import struct
import sys
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
FLAG = 0x80000000
TEX_SEC, FRAG_SEC, BITMAP_SEC, BITMAPEX_SEC, STR_SEC, TR_SEC, MAT_SEC = 8, 9, 10, 11, 35, 2, 3


def image_size(head):
    """(w, h, kind) from the first bytes of a served texture (BTF or PNG), None if neither."""
    if head[:4] == b'\x89BTF' and len(head) >= 0x22:
        cw, ch, _ox, _oy, w, h = struct.unpack_from('<6H', head, 0x16)
        return (cw, ch, 'btf') if cw and ch else (w, h, 'btf')
    if head[:4] == b'\x89PNG' and len(head) >= 24:
        w, h = struct.unpack('>II', head[16:24])
        return w, h, 'png'
    return None


def lwf_textures(d):
    """[(name, declared w, h, scale field, (min, max) bitmap scale)] from LWF bytes; None if not an LWF."""
    if d[:4] != b'LWF\0' or len(d) < 32 + 8 * 36:
        return None
    sec = [struct.unpack_from('<2i', d, 32 + 8 * i) for i in range(36)]
    sb = sec[0][0]
    so, sn = sec[STR_SEC]
    strs = []
    for k in range(sn):
        a, n = struct.unpack_from('<2i', d, so + 8 * k)
        strs.append(d[sb + a:sb + a + n].decode('utf-8', 'replace'))
    to, tn = sec[TEX_SEC]
    fo, fn = sec[FRAG_SEC]
    mo = sec[MAT_SEC][0]
    frag_tex = [struct.unpack_from('<2i', d, fo + 36 * f)[1] for f in range(fn)]
    scales = {}
    for s, fmt in ((BITMAP_SEC, '<2i'), (BITMAPEX_SEC, '<3i4f')):
        o, n = sec[s]
        size = struct.calcsize(fmt)
        for i in range(n):
            mid, fid = struct.unpack_from(fmt, d, o + size * i)[:2]
            mid &= 0xffffffff
            if mid & FLAG:
                sx, sy, k0, k1 = struct.unpack_from('<4f', d, mo + 24 * (mid & 0x7fffffff))
                sc = max((sx * sx + k1 * k1) ** .5, (sy * sy + k0 * k0) ** .5)
            else:
                sc = 1.0
            if 0 <= fid < fn:
                t = frag_tex[fid]
                lo, hi = scales.get(t, (sc, sc))
                scales[t] = (min(lo, sc), max(hi, sc))
    out = []
    for t in range(tn):
        sid, _fmt, w, h, scale = struct.unpack_from('<4if', d, to + 20 * t)
        out.append((strs[sid], w, h, scale, scales.get(t)))
    return out


class DirLayer:
    def __init__(self, label, root):
        self.label, self.root = label, root
        self.names = set()
        for dp, _dn, fs in os.walk(root):
            rel = os.path.relpath(dp, root).replace('\\', '/')
            rel = '' if rel == '.' else rel + '/'
            self.names.update(rel + f for f in fs)

    def read(self, name, n=None):
        with open(os.path.join(self.root, *name.split('/')), 'rb') as fh:
            return fh.read(n) if n else fh.read()


class IndexLayer:
    """names.tsv (name<TAB>offset on the concatenated pieces of data_dir) read with the private bgad module."""

    def __init__(self, label, tsv, datadir, key):
        sys.path.insert(0, HERE)
        import bgad
        self.bgad, self.label, self.key = bgad, label, key
        self.off = {}
        with open(tsv, encoding='utf-8') as fh:
            next(fh)
            for line in fh:
                name, off = line.rstrip('\n').split('\t')
                self.off[name] = int(off)
        self.names = set(self.off)
        self.pieces = [os.path.join(datadir, f) for f in sorted(os.listdir(datadir))]
        self.starts, total = [], 0
        for p in self.pieces:
            self.starts.append(total)
            total += os.path.getsize(p)
        self.fh = {}

    def _raw(self, off, n):
        out = b''
        while n > 0:
            i = bisect.bisect_right(self.starts, off) - 1
            fh = self.fh.get(i) or self.fh.setdefault(i, open(self.pieces[i], 'rb'))
            fh.seek(off - self.starts[i])
            b = fh.read(n)
            if not b:
                break
            out += b
            off += len(b)
            n -= len(b)
        return out

    def read(self, name, n=None):
        bg = self.bgad
        off = self.off[name]
        h = bg.parse(self._raw(off, bg.HDR.size))
        if n is None or h['enc'] != 3 or not h['flags'] & 4:
            buf = self._raw(off, h['hsize'] + h['nlen'] + h['size'])
            return bg.decode(buf, bg.parse(buf), self.key)
        data_off = off + h['hsize'] + h['nlen']
        nonce = self._raw(data_off + h['size'] - 8, 8)
        iv = struct.pack('<Q', struct.unpack('<Q', nonce)[0] ^ bg.NONCE_XOR)
        take = min(h['size'] - 8, n if h['comp'] not in (1, 2) else max(4096, n * 4))
        data = bg.chacha_xor(self._raw(data_off, take), self.key, iv, 8)
        if h['comp'] in (1, 2):
            data = zlib.decompressobj().decompress(data, n)
            if len(data) < n and take < h['size'] - 8:
                return self.read(name)[:n]
        return data[:n]


def make_layer(spec, key):
    label, _, src = spec.partition('=')
    if '|' in src:
        tsv, datadir = src.split('|', 1)
        return IndexLayer(label, tsv, datadir, key)
    return DirLayer(label, src)


REV = re.compile(r'^(.*?)(?:\.(\d{8}))?\.(png|lwf)$')


def jp_copy(jp_root, name):
    """Bytes of the highest revision of `name` in the JP dump (file.YYYYMMDD.ext next to file.ext), None if absent."""
    folder = os.path.join(jp_root, *name.split('/')[:-1])
    base = name.split('/')[-1]
    if not os.path.isdir(folder):
        return None
    best = None
    for f in os.listdir(folder):
        m = REV.match(f)
        if m and m.group(1) + '.' + m.group(3) == base:
            rev = int(m.group(2) or 0)
            if best is None or rev > best[0]:
                best = (rev, f)
    return open(os.path.join(folder, best[1]), 'rb').read() if best else None


def scan(layers, prefix='lwf/', jp_root=None, save_lwf=None, log=print):
    owner = {}
    for L in layers:
        for n in L.names:
            owner[n] = L
    lwfs = sorted(n for n in owner if n.startswith(prefix) and n.endswith('.lwf'))
    log('served LWF: %d' % len(lwfs))
    rows, stats = [], dict(lwf=0, textures=0, ok=0, larger=0, smaller=0, other=0, missing=0, unreadable=0)
    ww = next((L for L in layers if isinstance(L, IndexLayer)), None)
    for k, name in enumerate(lwfs):
        L = owner[name]
        try:
            d = L.read(name)
            texs = lwf_textures(d)
        except Exception as e:  # noqa: BLE001
            log('unreadable %s: %s' % (name, e))
            texs = None
        if texs is None:
            stats['unreadable'] += 1
            continue
        stats['lwf'] += 1
        folder, base = name.rsplit('/', 1)
        base = base[:-4]
        src = None
        for tname, w, h, scale, sc in texs:
            stats['textures'] += 1
            tfile = '%s/%s' % (folder, tname)
            if tfile not in owner:
                tfile = '%s/%s_%s.png' % (folder, base, tname.encode('utf-8').hex())
            T = owner.get(tfile)
            if T is None:
                stats['missing'] += 1
                kind, rw, rh, tl = 'missing', 0, 0, ''
            else:
                try:
                    r = image_size(T.read(tfile, 0x40))
                except Exception:  # noqa: BLE001
                    r = None
                if r is None:
                    stats['unreadable'] += 1
                    continue
                rw, rh, _ = r
                tl = T.label
                if (rw, rh) == (w, h):
                    stats['ok'] += 1
                    continue
                kind = ('larger' if rw >= w and rh >= h else 'smaller' if rw <= w and rh <= h else 'other')
                stats[kind] += 1
            if src is None:
                src = L.label
                if ww is not None and L is not ww and name in ww.names:
                    try:
                        if ww.read(name) == d:
                            src += ':=ww'
                    except Exception:  # noqa: BLE001
                        pass
                if jp_root and not src.endswith(':=ww'):
                    j = jp_copy(jp_root, name)
                    src += ':=jp' if j == d else ':jp-differs' if j is not None else ':no-jp'
                if save_lwf:
                    p = os.path.join(save_lwf, *name.split('/'))
                    os.makedirs(os.path.dirname(p), exist_ok=True)
                    open(p, 'wb').write(d)
            rows.append(dict(lwf=name, lwf_layer=src, texture=tname, declared='%dx%d' % (w, h),
                             file='%dx%d' % (rw, rh), kind=kind, tex_layer=tl,
                             rx=round(rw / w, 3) if w else 0, ry=round(rh / h, 3) if h else 0,
                             scale_field=round(scale, 3),
                             bmp_scale='' if sc is None else '%.3f-%.3f' % sc,
                             sha1=hashlib.sha1(d).hexdigest()[:10]))
        if k % 1000 == 999:
            log('  %d/%d' % (k + 1, len(lwfs)))
    return rows, stats


COLS = ['lwf', 'lwf_layer', 'texture', 'declared', 'file', 'rx', 'ry', 'kind', 'tex_layer', 'scale_field',
        'bmp_scale', 'sha1']


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--layer', action='append', required=True, help='label=folder or label=names.tsv|data_dir')
    ap.add_argument('--prefix', default='lwf/')
    ap.add_argument('--jp')
    ap.add_argument('--save-lwf')
    ap.add_argument('--out', required=True)
    a = ap.parse_args(argv)
    key = bytes.fromhex(os.environ['BGAD_KEY']) if os.environ.get('BGAD_KEY') else None
    layers = [make_layer(s, key) for s in a.layer]
    rows, stats = scan(layers, a.prefix, a.jp, a.save_lwf)
    with open(a.out, 'w', encoding='utf-8', newline='') as fh:
        fh.write('\t'.join(COLS) + '\n')
        for r in rows:
            fh.write('\t'.join(str(r[c]) for c in COLS) + '\n')
    print(stats)


if __name__ == '__main__':
    main()
