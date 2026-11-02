"""English subtitles in the raid demos taken from the JP data (I-221).

    python -I recon/tools/raid_demo_english.py --jp JP_FINAL --b16 BUNDLE2016 --out DIR [--models 0018,0019,...]
        -> DIR/lwf/raid/demo/<demo>/<demo>.lwf (patched copies) and DIR/originals_raid_english.tsv (lines for originals.tsv)

The JP start / escape / put_down demos draw a JP subtitle under ENCOUNTER / FAILURE / SUCCESS («レイドボス出現！»…) as two
textures (328x41 start, 504x40 escape, 416x41 put_down). The 2016 English demos draw the same subtitle at the same
place and scale with wider textures (657x48, 688x48, 774x48), identical in all 27 2016 demos of each kind. A JP LWF
cannot take a wider image under its declared size, so the copy written here changes, for those two textures only, the
declared size (texture table) and the fragment (w, h, and x, y shifted by half the growth, so the subtitle keeps its
centre). Nothing else in the LWF changes. The PNGs are the 2016 English files, served under the JP texture names.
The patched LWFs live outside the repo (generated, like enemy_gen_src); originals.tsv reads them with the `loc` source.
"""
import argparse
import os
import re
import struct
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import lwf_rig  # noqa: E402

KINDS = {'start': ((328, 41), (657, 48)), 'escape': ((504, 40), (688, 48)), 'put_down': ((416, 41), (774, 48))}
NO_START = {'9102', '9103'}      # not served: no start images in any source (raid.md, models)
REV = re.compile(r'^(.*)\.(\d{8})(\.[^.]+)$')


def latest(folder, stem):
    best = None
    for f in os.listdir(folder):
        mm = REV.match(f)
        n, r = (mm.group(1) + mm.group(3), int(mm.group(2))) if mm else (f, -1)
        if n == stem and (best is None or r > best[0]):
            best = (r, f)
    return os.path.join(folder, best[1]) if best else None


def patch(data, L, texs, new_wh):
    """bytes of the LWF with textures `texs` declared as new_wh and their fragments resized around the centre"""
    b = bytearray(data)
    to, tn = L.sec['texture']
    fo, fn = L.sec['textureFragment']
    for t in texs:
        off = to + t * struct.calcsize('<4if')
        s, f, w, h, sc = struct.unpack_from('<4if', b, off)
        struct.pack_into('<4if', b, off, s, f, new_wh[0], new_wh[1], sc)
        for k in range(fn):
            o = fo + k * struct.calcsize('<9i')
            sid, tex, rot, x, y, u, v, fw, fh = struct.unpack_from('<9i', b, o)
            if tex != t:
                continue
            x -= (new_wh[0] - fw) // 2
            y -= (new_wh[1] - fh) // 2
            struct.pack_into('<9i', b, o, sid, tex, rot, x, y, u, v, new_wh[0], new_wh[1])
    return bytes(b)


def english_refs(b16):
    """{kind: [png path of layer 0, layer 1]} from the 2016 start_0007 / escape_0007 / put_down_0007"""
    out = {}
    for kind, (jp_wh, en_wh) in KINDS.items():
        d = os.path.join(b16, 'lwf', 'raid', 'demo', '%s_0007' % kind)
        L = lwf_rig.LWF(os.path.join(d, '%s_0007.lwf' % kind))
        out[kind] = [os.path.join('lwf', 'raid', 'demo', '%s_0007' % kind, t[0]).replace(os.sep, '/')
                     for t in L.textures if (t[2], t[3]) == en_wh]
    return out


def run(jp, b16, out, models):
    refs = english_refs(b16)
    lines = []
    for m in models:
        for kind, (jp_wh, en_wh) in KINDS.items():
            if kind == 'start' and m in NO_START:
                continue
            demo = '%s_%s' % (kind, m)
            folder = os.path.join(jp, 'lwf', 'raid', 'demo', demo)
            if not os.path.isdir(folder):
                continue
            src = latest(folder, demo + '.lwf')
            if not src:
                continue
            L = lwf_rig.LWF(src)
            texs = [i for i, t in enumerate(L.textures) if (t[2], t[3]) == jp_wh]
            if len(texs) != len(refs[kind]):
                print('skip %s: %d JP subtitle textures' % (demo, len(texs)))
                continue
            data = patch(open(src, 'rb').read(), L, texs, en_wh)
            rel = 'lwf/raid/demo/%s/%s.lwf' % (demo, demo)
            dst = os.path.join(out, *rel.split('/'))
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            open(dst, 'wb').write(data)
            lines.append('%s\tloc\t=%s\t# JP demo with the English subtitle (declared size of 2 textures, centred)' % (rel, rel))
            for t, en in zip(texs, refs[kind]):
                lines.append('lwf/raid/demo/%s/%s\tb16\t%s\t# English subtitle, 2016 package' % (demo, L.textures[t][0], en))
    open(os.path.join(out, 'originals_raid_english.tsv'), 'w', encoding='utf-8', newline='\n').write('\n'.join(lines) + '\n')
    return lines


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--jp', required=True)
    ap.add_argument('--b16', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--models', default='0018,0019,0020,0021,0022,0023,0024,0025,0026,0027,0028,0030,0031,0032,1011,9101,9102,9103')
    a = ap.parse_args(argv)
    lines = run(a.jp, a.b16, a.out, a.models.split(','))
    print('raid demos in English: %d LWFs patched, %d lines' % (sum(1 for x in lines if '\tloc\t' in x), len(lines)))


if __name__ == '__main__':
    sys.exit(main())
