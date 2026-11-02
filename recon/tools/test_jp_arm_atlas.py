"""Test of the JP_ARM atlases of import_jp_coco.py (I-222): the served plist of each slot keeps every original WW
frame (rect unchanged, pixels unchanged) and gains the frames of the JP armatures put on it.

    python recon/tools/test_jp_arm_atlas.py [--out <stage_gen\\files>]   -> «OK: ...» or «ERRORS (n)», exit 1

Pillow and numpy are needed (no -I). Checks:
- merge (atlas_merge.merge, in memory) of every JP_ARM slot: served frames with the same rect, served pixels
  byte-identical (premultiplied), JP frames present with the JP pixels, no overlap, power-of-two canvas;
- MyPageAnime0 keeps the home WARNING bar frames (Ticker_Warning_Logo1/2, Home_Warning_Anim1-8, Home_Warning_Base)
  and gains Rank_Panel_User_Eff.png (Cursor_Anim_Ranking/Ranking2);
- the files written in <out>/cocostudio/publish (the generated pack, default stage_gen\\files) for every slot: the
  same frames, texture canvas equal to the plist size, and every frame of the JP_ARM ExportJson found in the plist.
  Before a rebuild with the fixed import_jp_coco.py this part fails (MyPageAnime0 without Home_Warning_*).
"""
import argparse
import ast
import json
import os
import re
import sys

sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import atlas_merge  # noqa: E402
import btf  # noqa: E402
import private_tools  # noqa: E402
from PIL import Image, ImageChops  # noqa: E402

D = r'D:\Progetto_Restauro_KH_UX'
ap = argparse.ArgumentParser()
ap.add_argument('--out', default=os.path.join(D, 'stage_gen', 'files'))
args = ap.parse_args()
JP_PUB = private_tools.local_path('jp_data', 'cocostudio', 'publish')
SERVED_PUB = os.path.join(D, 'catalog', 'files', 'cocostudio', 'publish')
OUT_PUB = os.path.join(args.out, 'cocostudio', 'publish')
WARNING = ['Ticker_Warning_Logo1.png', 'Ticker_Warning_Logo2.png', 'Home_Warning_Base.png'] + \
          ['Home_Warning_Anim%d.png' % i for i in range(1, 9)]

errors = []


def check(cond, msg):
    if not cond:
        errors.append(msg)


def same(a, b):
    return ImageChops.difference(a, b).getbbox() is None


src = open(os.path.join(HERE, 'import_jp_coco.py'), encoding='utf-8').read()
JP_ARM = ast.literal_eval(re.search(r'^JP_ARM = (\{.*?\})\n', src, re.S | re.M).group(1))
check(JP_ARM.get('Cursor_Anim_Ranking', ('',))[0] == 'MyPageAnime0', 'Cursor_Anim_Ranking is no longer on MyPageAnime0')
slots = {}
for arm, (slot, jp_src) in sorted(JP_ARM.items()):
    slots.setdefault(slot, {'srcs': [], 'arms': []})
    slots[slot]['arms'].append(arm)
    if jp_src not in slots[slot]['srcs']:
        slots[slot]['srcs'].append(jp_src)


def rects(text):
    return {f[0]: f[1:5] for f in atlas_merge.frames(text)}


n_frames = 0
for slot, s in sorted(slots.items()):
    served_pl = atlas_merge.read_text(os.path.join(SERVED_PUB, slot + '.plist'))
    served_tx = open(os.path.join(SERVED_PUB, slot + '.png'), 'rb').read()
    served_rects = rects(served_pl)
    served_img = btf.decode_premultiplied(served_tx)
    _m = re.search(r'<key>size</key>\s*<string>\{(\d+),(\d+)\}', served_pl)
    served_size = (int(_m.group(1)), int(_m.group(2))) if _m else None
    jp_add = {}
    pl, tx = served_pl, served_tx
    for jp_src in s['srcs']:
        jp_pl = atlas_merge.read_text(os.path.join(JP_PUB, jp_src + '.plist'))
        jp_img = btf._premultiply(Image.open(os.path.join(JP_PUB, jp_src + '.png')).convert('RGBA'))
        for name, (x, y, w, h) in rects(jp_pl).items():
            jp_add.setdefault(name, jp_img.crop((x, y, x + w, y + h)))
        pl, tx, rep = atlas_merge.merge(pl, tx, jp_pl, Image.open(os.path.join(JP_PUB, jp_src + '.png')))

    def verify(label, pl, tx):
        global n_frames
        r = rects(pl)
        img = btf.decode_premultiplied(tx)
        cw, ch = img.size
        check(cw & (cw - 1) == 0 and ch & (ch - 1) == 0, '%s %s: canvas %dx%d not a power of two' % (label, slot, cw, ch))
        m = re.search(r'<key>size</key>\s*<string>\{(\d+),(\d+)\}', pl)
        size = (int(m.group(1)), int(m.group(2))) if m else None
        # the served ActMapTreasureBoxAnim0.plist already says {2048,1024} for a 1024x512 texture: kept as served
        # while the canvas is the served one, the canvas when the merge enlarges it
        check(size == (cw, ch) or (size == served_size and (cw, ch) == served_img.size),
              '%s %s: plist size %s, texture canvas %dx%d' % (label, slot, size, cw, ch))
        for name, rc in served_rects.items():
            check(r.get(name) == rc, '%s %s: served frame %s moved or lost (%s -> %s)' % (label, slot, name, rc, r.get(name)))
            if r.get(name) == rc:
                x, y, w, h = rc
                check(same(img.crop((x, y, x + w, y + h)), served_img.crop((x, y, x + w, y + h))),
                      '%s %s: pixels of %s changed' % (label, slot, name))
        for name, px in jp_add.items():
            check(name in r, '%s %s: JP frame %s missing' % (label, slot, name))
            if name in r and name not in served_rects:
                x, y, w, h = r[name]
                check(same(img.crop((x, y, x + w, y + h)), px), '%s %s: pixels of JP frame %s differ' % (label, slot, name))
        items = sorted(r.items())
        for i, (a, (ax, ay, aw, ah)) in enumerate(items):
            check(ax + aw <= cw and ay + ah <= ch, '%s %s: %s outside the canvas' % (label, slot, a))
            for b, (bx, by, bw, bh) in items[i + 1:]:
                if a in served_rects and b in served_rects:
                    continue
                check(not (ax < bx + bw and bx < ax + aw and ay < by + bh and by < ay + ah),
                      '%s %s: %s overlaps %s' % (label, slot, a, b))
        if slot == 'MyPageAnime0':
            for name in WARNING + ['Rank_Panel_User_Eff.png']:
                check(name in r, '%s MyPageAnime0: %s missing (home WARNING bar / ranking cursor)' % (label, name))
        n_frames += len(r)
        return r

    verify('merge', pl, tx)
    # written files of the generated pack
    out_pl = os.path.join(OUT_PUB, slot + '.plist')
    if not os.path.exists(out_pl):
        check(False, 'generated %s absent (%s)' % (slot + '.plist', OUT_PUB))
        continue
    r = verify('generated', atlas_merge.read_text(out_pl), open(os.path.join(OUT_PUB, slot + '.png'), 'rb').read())
    for arm in s['arms']:
        ej = os.path.join(OUT_PUB, arm + '.ExportJson')
        if not os.path.exists(ej):
            check(False, 'generated %s absent' % (arm + '.ExportJson'))
            continue
        data = json.load(open(ej, encoding='utf-8-sig'))
        check(data.get('config_file_path') == [slot + '.plist'], '%s: config_file_path %s' % (arm, data.get('config_file_path')))
        used = set(re.findall(r'"name":\s*"([^"]+\.png)"', json.dumps(data)))
        for f in sorted(used):
            check(f in r, '%s: frame %s not in the generated %s.plist' % (arm, f, slot))

if errors:
    print('ERRORS (%d)' % len(errors))
    for e in errors:
        print(' -', e)
    sys.exit(1)
print('OK: %d JP_ARM atlases (%s) keep every served frame and carry the JP frames; %d frame checks, out %s'
      % (len(slots), ', '.join(sorted(slots)), n_frames, args.out))
