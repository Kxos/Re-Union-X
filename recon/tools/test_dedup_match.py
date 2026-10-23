"""Test of dedup_match.py (missing enemy textures matched by texture-table order, I-194 proposal).

    python recon/tools/test_dedup_match.py     -> "OK: ..." or "ERRORS (n)", exit 1   (numpy: without -I)

Pure helpers only (no game data): contiguous runs of an alignment, the A/B/C classification, the palette
histogram and the palette choice between same-size variants.
"""
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import deep_donors as dd  # noqa: E402
import dedup_match as dm  # noqa: E402

errors = []


def check(cond, msg):
    if not cond:
        errors.append(msg)


# runs: 0->5, 1->6, 2->7 contiguous; 4->9 alone (3 skipped); 5->11 breaks the diagonal
r = dm.runs({0: 5, 1: 6, 2: 7, 4: 9, 5: 11})
check(r == {0: 3, 1: 3, 2: 3, 4: 1, 5: 1}, 'runs %r' % r)
check(dm.runs({}) == {}, 'runs of an empty alignment')

# lcs_map + runs on a table where the enemy is a contiguous block of the donor
A = [(10, 10), (20, 20), (30, 30), (40, 40)]
B = [(5, 5), (10, 10), (20, 20), (30, 30), (40, 40), (6, 6)]
mp = dd.lcs_map(A, B)
check(mp == {0: 1, 1: 2, 2: 3, 3: 4}, 'lcs block %r' % mp)
check(set(dm.runs(mp).values()) == {4}, 'one run of 4')

base = {'bad': 0, 'ok': 2, 'haves': 3, 'cover': 0.9, 'run': 6, 'nvar': 2, 'area': 400, 'agree': 1,
        'disagree': 0, 'name': 0}


def cl(**kw):
    c = dict(base)
    c.update(kw)
    return dm.classify(c)


check(cl() == 'A', 'long run, clean, confirmed -> A')
check(cl(ok=0) == 'B', 'not confirmed by known pieces -> not A')
check(cl(ok=0, haves=0) == 'A', 'animation with no known piece: the long run alone -> A')
check(cl(run=1, nvar=1, area=30000) == 'A', 'unique large size on a long table -> A')
check(cl(run=1, nvar=1, area=300) == 'B', 'unique small size -> B')
check(cl(run=1, nvar=3) == 'C', 'isolated alignment with variants -> C')
check(cl(disagree=1) == 'C', 'another clean donor disagrees -> C')
check(cl(name=-1) == 'C', 'original layer name contradicts -> C')
check(cl(run=1, nvar=3, name=1) == 'B', 'name match lifts C -> B')
check(cl(bad=3, ok=2) == 'C', 'contradicted donor -> C')
check(cl(bad=1, ok=6) == 'B', 'mostly confirmed donor -> B')

# palette: red and blue 32x32 premultiplied signatures
red = np.zeros((32, 32, 4), np.int16)
red[..., 0] = 200
red[..., 3] = 255
blue = np.zeros((32, 32, 4), np.int16)
blue[..., 2] = 200
blue[..., 3] = 255
pr, pb = dm.palette(red), dm.palette(blue)
check(abs(pr.sum() - 1) < 1e-6 and abs(pb.sum() - 1) < 1e-6, 'palette normalised')
check(np.minimum(pr, pb).sum() < 1e-6, 'red and blue palettes disjoint')
res = dm.pick_by_palette([pb, pr], [pr, pr])
check(res is not None and res[0] == 1 and res[1] > 0.9, 'palette picks the red variant next to red pieces %r' % (res,))
check(dm.pick_by_palette([pr], [pr]) is None, 'single variant: nothing to choose')
check(dm.pick_by_palette([pr, pb], []) is None, 'no trusted neighbour: nothing to choose')

if errors:
    print('ERRORS (%d)' % len(errors))
    for e in errors:
        print(' -', e)
    sys.exit(1)
print('OK: dedup_match runs, classify, palette')
