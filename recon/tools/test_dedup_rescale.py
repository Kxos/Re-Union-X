"""Offline test of the pure helpers of dedup_rescale.py (I-194, 23-10; synthetic images only).

    python recon/tools/test_dedup_rescale.py        -> "OK: ..." or "ERRORS (n)", exit 1
"""
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import dedup_rescale as rs  # noqa: E402

errors = []


def check(cond, msg):
    if not cond:
        errors.append(msg)


# sizes: upscale / aspect / tolerance
check(rs.is_upscale((90, 24), (97, 24)) and not rs.is_upscale((855, 214), (97, 24)), 'upscale')
check(not rs.is_upscale((96, 23), (97, 24)), 'within the generator tolerance is not an upscale')
check(rs.aspect_err((855, 214), (97, 24)) < 0.02 and rs.aspect_err((200, 24), (97, 24)) > 0.5, 'aspect')
check(rs.needs_rescale((855, 214), (97, 24)) and not rs.needs_rescale((99, 22), (97, 24)), 'needs_rescale')

# grades
check(rs.grade('A', True, 0.0)[0] == 'R', 'upscale rejected')
check(rs.grade('A', False, 0.05)[0] == 'R', 'aspect rejected')
check(rs.grade('B', False, 0.0, known=1)[0] == 'A', 'confirmed: one up')
check(rs.grade('A', False, 0.0, known=-1)[0] == 'C', 'contradicted: C')
check(rs.grade('A', False, 0.0, scale_ok=False)[0] == 'B', 'odd scale: one down')
check(rs.grade('B', False, 0.0, known=1, scale_ok=False)[0] == 'A', 'confirmed wins over odd scale')
check(rs.grade('C', False, 0.0, scale_ok=False)[0] == 'C', 'never below C')

# downscale: premultiplied (no dark fringe), exact size, refuses upscaling
a = np.zeros((80, 80, 4), np.uint8)
a[20:60, 20:60] = (255, 40, 0, 255)          # opaque red square, transparent BLACK around it
im = rs.downscale(Image.fromarray(a, 'RGBA'), (20, 20))
b = np.asarray(im)
check(im.size == (20, 20), 'size %s' % (im.size,))
edge = b[(b[..., 3] > 10) & (b[..., 3] < 245)]
check(len(edge) > 0 and edge[:, 0].min() >= 235, 'dark fringe: edge reds %s' % (edge[:, 0].min() if len(edge) else None))
check(b[0, 0, 3] == 0 and b[10, 10, 3] == 255, 'alpha')
try:
    rs.downscale(Image.fromarray(a, 'RGBA'), (100, 100))
    errors.append('upscale accepted')
except ValueError:
    pass

# signatures: a downscaled copy matches the small original
small = Image.fromarray(a, 'RGBA').resize((20, 20), Image.LANCZOS)
check(rs.sig_diff(rs.sig(im), rs.sig(small)) < rs.SAME, 'same art at another size')
other = np.zeros((20, 20, 4), np.uint8)
other[:, :10] = (0, 0, 255, 255)
check(rs.sig_diff(rs.sig(im), rs.sig(Image.fromarray(other, 'RGBA'))) > rs.SAME, 'different art')

# scaled alignment: donor table = 3x the enemy table (rounded), with an extra entry, forward and reversed
seq = [(10, 20), (33, 12), (40, 40), (7, 9), (50, 25)]
dseq = [(30, 60), (99, 36), (500, 500), (120, 121), (21, 27), (150, 75)]
mp, rn = rs.align_scaled(seq, dseq, 3.0)
check(mp == {0: 0, 1: 1, 2: 3, 3: 4, 4: 5}, 'forward %s' % mp)
mp, rn = rs.align_scaled(seq, dseq[::-1], 3.0)
check(mp == {0: 5, 1: 4, 2: 2, 3: 1, 4: 0}, 'reversed %s' % mp)
check(rs.runs({0: 0, 1: 1, 2: 3, 3: 4}) == {0: 2, 1: 2, 2: 2, 3: 2}, 'runs')

# k votes: the 3x table gets the votes of every piece in one k bin
W = np.array([w for w, h in dseq] + [10, 33], float)
H = np.array([h for w, h in dseq] + [20, 12], float)
tid = np.array([0] * len(dseq) + [1, 1], float)
v = rs.k_votes([(0, 10, 20), (1, 33, 12), (4, 50, 25)], W, H, tid)
best = v.most_common(1)[0]
check(best[0][0] == 0 and best[1] == 3, 'k votes %s' % v.most_common(3))
check(all(t != 1 for t, k in v), 'same-size table must not vote (no rescale)')

if errors:
    print('ERRORS (%d)' % len(errors))
    for e in errors:
        print(' -', e)
    sys.exit(1)
print('OK: dedup_rescale helpers (sizes, grades, premultiplied downscale, signatures, scaled alignment, k votes)')
