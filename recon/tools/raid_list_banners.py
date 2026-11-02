"""Raid boss list banners (img/adventure/boss_L/RaidBoss_<id>.png, 396x191) for the bosses that have none (I-221).

    python -I recon/tools/raid_list_banners.py --jp JP_FINAL --out DIR [--ids 15,16,18,...]
        -> DIR/img/adventure/boss_L/RaidBoss_<id>.png and raid_boss_<id>.png, DIR/originals_raid_banners.tsv

The list draws RaidBoss_<id>; without it the layout's default picture stays (a Darkside on every boss). The 2016 package
and JP 4.3.1 have RaidBoss_<id> only for 1-14, 1000-1010 and 9101-9103. JP 4.3.1 boss_L does hold, for the later
bosses, the boss card raid_boss_<id>.png (410x210, same art family: the boss on the purple glow), either under the
boss id or under the id of its twin model (2000 Jewel Princess, 2001 Adventurer, 2007 Assault Dragon, 2008 Gear Golem,
2012 Closehanded Captain: the census twins whose textures are identical). The card is served as raid_boss_<id> where
the boss id has none (original file, copied), and RaidBoss_<id> is RECONSTRUCTED from it: scaled to width 396 and
centre-cropped to 191 px high (the 2016 RaidBoss_ banners are separate art of the same size; the composition differs).
The reconstructed banners are generated outside the repo and served with the `loc` source of import_originals.py.
"""
import argparse
import os
import re
import sys

TWIN = {18: 2007, 19: 2001, 20: 2000, 21: 2008, 1011: 2012}
REV = re.compile(r'^(.*)\.(\d{8})(\.[^.]+)$')
IDS = [15, 16, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 30, 31, 32, 1011]


def latest(folder, name):
    best = None
    for f in os.listdir(folder):
        mm = REV.match(f)
        n, r = (mm.group(1) + mm.group(3), int(mm.group(2))) if mm else (f, -1)
        if n == name and (best is None or r > best[0]):
            best = (r, f)
    return os.path.join(folder, best[1]) if best else None


def banner(card):
    """396x191 list banner from a 410x210 card: width 396, centre crop"""
    from PIL import Image
    im = card.convert('RGBA')
    h = round(im.height * 396 / im.width)
    im = im.resize((396, h), Image.LANCZOS)
    top = max(0, (h - 191) // 2)
    return im.crop((0, top, 396, top + 191))


def run(jp, out, ids):
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import btf
    from PIL import Image
    import io
    folder = os.path.join(jp, 'img', 'adventure', 'boss_L')
    dst = os.path.join(out, 'img', 'adventure', 'boss_L')
    os.makedirs(dst, exist_ok=True)
    lines, missing = [], []
    for i in ids:
        own = latest(folder, 'raid_boss_%d.png' % i)
        src_id = i if own else TWIN.get(i)
        src = own or (latest(folder, 'raid_boss_%d.png' % src_id) if src_id else None)
        if not src:
            missing.append(i)
            continue
        if not own:
            lines.append('img/adventure/boss_L/raid_boss_%d.png\tjp\timg/adventure/boss_L/raid_boss_%d.png\t# card of the twin model %d (identical textures)' % (i, src_id, src_id))
        data = open(src, 'rb').read()
        card = btf.decode(data) if data[:4] == b'\x89BTF' else Image.open(io.BytesIO(data))
        banner(card).save(os.path.join(dst, 'RaidBoss_%d.png' % i))
        lines.append('img/adventure/boss_L/RaidBoss_%d.png\tloc\t=img/adventure/boss_L/RaidBoss_%d.png\t# RECONSTRUCTED from raid_boss_%d (scaled, cropped)' % (i, i, src_id))
    open(os.path.join(out, 'originals_raid_banners.tsv'), 'w', encoding='utf-8', newline='\n').write('\n'.join(lines) + '\n')
    return lines, missing


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--jp', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--ids', default=','.join(map(str, IDS)))
    a = ap.parse_args(argv)
    lines, missing = run(a.jp, a.out, [int(x) for x in a.ids.split(',')])
    print('raid list banners: %d lines, no card for %s' % (len(lines), missing))


if __name__ == '__main__':
    sys.exit(main())
