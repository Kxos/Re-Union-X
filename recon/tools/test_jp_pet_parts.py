"""Tests of jp_pet_parts.hires_lwf (blur fix, 3 Nov 2026): python -I recon/tools/test_jp_pet_parts.py
Runs on the JP 4.3.1 dump when present (Flying Carpet 407043, Balloon Fairies 407009), else it is skipped."""
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import jp_pet_parts as jpp  # noqa: E402
import lwf_rig  # noqa: E402
import deep_donors as dd  # noqa: E402


def corners(L, mid, frag):
    """stage corners of a bitmap: its matrix, then the fragment quad (x, y, x + w, y + h)"""
    sid, tex, rot, x, y, u, v, w, h = frag
    M = L.mat(mid)
    return np.array([(M @ np.array([px, py, 1.]))[:2] for px, py in ((x, y), (x + w, y), (x, y + h), (x + w, y + h))])


def check(part, folder, expect):
    d = os.path.join(dd.JP431, 'lwf', 'pet', 'part', part, folder)
    src = os.path.join(d, folder + '.lwf')
    if not os.path.isfile(src):
        print('skip %s: no JP dump' % part)
        return
    L = lwf_rig.LWF(src)
    real = {t[0]: jpp._png_size(os.path.join(d, t[0])) for t in L.textures if os.path.isfile(os.path.join(d, t[0]))}
    data = jpp.hires_lwf(open(src, 'rb').read(), real)
    assert data is not None, part
    tmp = os.path.join(os.environ.get('TEMP', '.'), 'jpp_test.lwf')
    open(tmp, 'wb').write(data)
    P = lwf_rig.LWF(tmp)
    os.remove(tmp)
    changed = [i for i, (t, n) in enumerate(zip(L.textures, P.textures)) if t != n]
    assert changed == expect, (part, changed)
    for i in changed:
        assert P.textures[i][2:4] == real[P.textures[i][0]], 'declared = real size'
    # every bitmap still lands on the same stage rectangle (to the rounding of the integer fragment offset)
    for (m0, f0), (m1, f1) in zip(L.bitmaps, P.bitmaps):
        a, b = corners(L, m0, L.frags[f0]), corners(P, m1, P.frags[f1])
        assert np.abs(a - b).max() < 1.0, (part, a, b)
    # nothing else moved: same sections apart from the longer matrix table, same animation and placements
    assert P.matrix[:len(L.matrix)] == L.matrix and P.place == L.place and P.movie == L.movie
    assert P.S == L.S and len(data) == os.path.getsize(src) + 24 * (len(P.matrix) - len(L.matrix))
    print('OK: %s %s, %d textures re-declared, %d matrices added' % (part, folder, len(changed), len(P.matrix) - len(L.matrix)))


# a texture that matches its declared size leaves the LWF alone
src = os.path.join(dd.JP431, 'lwf', 'pet', 'part', '407044', 'bag_back', 'bag_back.lwf')
if os.path.isfile(src):
    L = lwf_rig.LWF(src)
    assert jpp.hires_lwf(open(src, 'rb').read(), {t[0]: (t[2], t[3]) for t in L.textures}) is None
    # and a file smaller than declared (the 51x60 sparkle placeholders) too
    assert jpp.hires_lwf(open(src, 'rb').read(), {t[0]: (t[2] // 2, t[3] // 2) for t in L.textures}) is None
check('407043', 'bag_back', [0, 1, 2, 3])
check('407009', 'bag_back', [2])
