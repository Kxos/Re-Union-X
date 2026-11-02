"""Tests of raid_demo_english.py and raid_list_banners.py: python -I recon/tools/test_raid_demo_english.py
The LWF patch runs on a JP start demo of the dump when present, else that part is skipped."""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import lwf_rig  # noqa: E402
import raid_demo_english as rde  # noqa: E402
import raid_list_banners as rlb  # noqa: E402
import deep_donors as dd  # noqa: E402

from PIL import Image  # noqa: E402

# list banner: 410x210 card -> 396x191
b = rlb.banner(Image.new('RGBA', (410, 210), (10, 20, 30, 255)))
assert b.size == (396, 191), b.size

folder = os.path.join(dd.JP431, 'lwf', 'raid', 'demo', 'start_0022')
src = rde.latest(folder, 'start_0022.lwf') if os.path.isdir(folder) else None
if src:
    L = lwf_rig.LWF(src)
    texs = [i for i, t in enumerate(L.textures) if (t[2], t[3]) == (328, 41)]
    assert len(texs) == 2, texs
    before = [f for f in L.frags if f[1] in texs]
    data = rde.patch(open(src, 'rb').read(), L, texs, (657, 48))
    tmp = os.path.join(os.environ.get('TEMP', '.'), 'rde_test.lwf')
    open(tmp, 'wb').write(data)
    P = lwf_rig.LWF(tmp)
    os.remove(tmp)
    assert [P.textures[i][2:4] for i in texs] == [(657, 48), (657, 48)], 'declared size'
    after = [f for f in P.frags if f[1] in texs]
    for a, c in zip(before, after):
        assert c[7:9] == (657, 48), c
        assert c[3] == a[3] - (657 - 328) // 2 and c[4] == a[4] - (48 - 41) // 2, (a, c)   # same centre
    # nothing else changed
    assert len(P.textures) == len(L.textures) and [t for i, t in enumerate(P.textures) if i not in texs] == \
        [t for i, t in enumerate(L.textures) if i not in texs]
    assert len(data) == os.path.getsize(src)
    print('OK: raid_demo_english (LWF patch on start_0022)')
else:
    print('OK: raid_demo_english (dump not present, LWF patch skipped)')
print('OK: raid_list_banners')
