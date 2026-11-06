"""Variant groups of the Medal Gallery (I-242, server/medal-gallery.js; docs/notes/medaglie.md#medal-gallery).

    python recon/tools/make_medal_gallery_groups.py <master medal.json> [--medals D] [--out server/medal_gallery_groups.json]
    (Pillow: without -I)

The gallery shows ONCE the Medals whose pictures are practically identical (user 06-11): Illustrated Aqua A / SN / SN+,
Supernova / Supernova+ HD Terra, an SN++ reissue and its Medal ... The others become a «Variants:» line of the card.
«Same picture» is decided by the pictures, not by the names: each gallery card (one per Medal name, the picture of its
highest star, as cardsOf in medal-gallery.js) is compared with the other cards of the same list (the BGM tab; one Full Art
section) on the client's Medal_S_<thumbId> of the local medal_gen pack (BTF or PNG): 64x64, on black, mean absolute
difference of the RGB channels (0-255). Cards at most THRESHOLD apart are joined (connected groups).
Measured 06-11 on master revision 274: identical pictures 0.00; the same art in a 6* frame and in a 7* frame 9.57
(Illustrated Aqua / Illustrated Aqua A); the closest different pictures 12.11 (Illustrated Marluxia [EX] / SN++ -
Illustrated Zexion) and 12.64 (Illustrated Xion / Illustrated Xion [EX]): THRESHOLD 10.
Output (in the repo: Medal ids, names and distances only, no picture): {"threshold", "groups": [{"list": "bgm" | <artId>,
"ids": [top medalId of each card], "names": [...], "maxDist"}]}. Run again after a master regeneration that adds BGM or
Art Medals (test-medal-gallery.js checks that every group still matches the cards of the master).
"""
import json
import os
import sys

from PIL import Image, ImageChops, ImageStat

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import btf  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(HERE))))
MEDALS = os.path.join(ROOT, 'medal_gen', 'files', 'img', 'medal')
OUT = os.path.join(os.path.dirname(os.path.dirname(HERE)), 'server', 'medal_gallery_groups.json')
THRESHOLD = 10.0
IMAGE_CATEGORY_ART = 2


def base_of(m):
    g = m.get('groupId') or 0
    return g if g and g != m['medalId'] else m['medalId']


def cards_of(rows):
    """[(name, top medalId, thumbId)] one per name, the highest star (then the highest medalId), as cardsOf in JS"""
    by = {}
    for m in rows:
        by.setdefault(m['name'], []).append(m)
    out = []
    for name, lst in by.items():
        top = sorted(lst, key=lambda m: (m.get('rare', 0), m['medalId']))[-1]
        out.append((name, top['medalId'], top.get('thumbId') or top.get('imageId') or top['medalId']))
    return sorted(out, key=lambda c: c[1])


def gallery_lists(medals):
    """{'bgm': cards, <artId>: cards} of the base rows"""
    bases = [m for m in medals if base_of(m) == m['medalId']]
    lists = {'bgm': cards_of([m for m in bases if m.get('bgm')])}
    for m in bases:
        if m.get('imageCategory') == IMAGE_CATEGORY_ART and m.get('artId'):
            lists.setdefault(m['artId'], [])
    for a in [k for k in lists if k != 'bgm']:
        lists[a] = cards_of([m for m in bases if m.get('imageCategory') == IMAGE_CATEGORY_ART and m.get('artId') == a])
    return lists


def picture(medals_dir, thumb, cache):
    if thumb not in cache:
        p = os.path.join(medals_dir, 'Medal_S_%d.png' % thumb)
        if not os.path.exists(p):
            cache[thumb] = None
        else:
            with open(p, 'rb') as f:
                b = f.read()
            im = (Image.open(p) if b[:4] == b'\x89PNG' else btf.decode(b)).convert('RGBA').resize((64, 64), Image.LANCZOS)
            bg = Image.new('RGBA', im.size, (0, 0, 0, 255))
            bg.alpha_composite(im)
            cache[thumb] = bg.convert('RGB')
    return cache[thumb]


def distance(a, b):
    return sum(ImageStat.Stat(ImageChops.difference(a, b)).mean) / 3


def groups_of(cards, pic, threshold=THRESHOLD):
    """connected groups (size >= 2) of cards whose pictures are at most threshold apart -> [(cards, maxDist)]"""
    n = len(cards)
    parent = list(range(n))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i
    near = {}
    for i in range(n):
        for j in range(i + 1, n):
            a, b = pic(cards[i]), pic(cards[j])
            if a is None or b is None:
                continue
            d = distance(a, b)
            if d <= threshold:
                parent[find(i)] = find(j)
                near[(i, j)] = d
    out = {}
    for i in range(n):
        out.setdefault(find(i), []).append(i)
    res = []
    for members in out.values():
        if len(members) < 2:
            continue
        md = max([d for (i, j), d in near.items() if i in members and j in members] or [0.0])
        res.append(([cards[i] for i in members], md))
    return res


def main(argv):
    opt = {argv[i]: argv[i + 1] for i in range(len(argv) - 1) if argv[i].startswith('--')}
    args = [a for a in argv if not a.startswith('--') and a not in opt.values()]
    if len(args) != 1:
        print(__doc__)
        return 2
    with open(args[0], encoding='utf-8') as f:
        medals = json.load(f)
    medals_dir, out = opt.get('--medals', MEDALS), opt.get('--out', OUT)
    cache, missing, groups = {}, set(), []

    def pic(card):
        im = picture(medals_dir, card[2], cache)
        if im is None:
            missing.add(card[2])
        return im
    lists = gallery_lists(medals)
    for key in ['bgm'] + sorted(k for k in lists if k != 'bgm'):
        for cards, md in groups_of(lists[key], pic):
            groups.append({'list': key, 'ids': [c[1] for c in cards], 'names': [c[0] for c in cards], 'maxDist': round(md, 2)})
    doc = {'_doc': 'Medal Gallery variant groups: cards whose Medal_S pictures are at most threshold apart (mean abs RGB diff, '
           '64x64 on black). Written by recon/tools/make_medal_gallery_groups.py; docs/notes/medaglie.md#medal-gallery.',
           'threshold': THRESHOLD, 'groups': groups}
    with open(out, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)
        f.write('\n')
    if missing:
        print('WARNING: %d pictures missing (cards not compared): %s' % (len(missing), ' '.join(map(str, sorted(missing)))), file=sys.stderr)
    print('medal gallery groups: %d groups (%d cards joined) -> %s' % (len(groups), sum(len(g['ids']) for g in groups), out))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
