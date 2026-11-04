"""Tests for raid_weak_points.py: python recon/tools/test_raid_weak_points.py"""
import os
import struct
import sys
import tempfile
import unittest

sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lwf_rig  # noqa: E402
import raid_weak_points as rwp  # noqa: E402


def lwf(movies, root):
    """LWF that lwf_rig reads: movies {movieId: [(instanceName or None, objType, objId, (tx, ty)), ...]}, one frame each;
    objType 2 = movie. Every placement has its own translate matrix."""
    names, inst, objs, places, ctrls, frames, mv, tr = [], [], [], [], [], [], [], []

    def sid(s):
        if s not in names:
            names.append(s)
        return names.index(s)
    for mid in range(max(movies) + 1):
        items = movies.get(mid, [])
        frames.append((len(ctrls), len(items)))
        for d, (n, ot, oo, t) in enumerate(items):
            iid = -1
            if n is not None:
                if sid(n) not in inst:
                    inst.append(sid(n))
                iid = inst.index(sid(n))
            objs.append((ot, oo))
            tr.append(t)
            places.append((d, len(objs) - 1, iid, len(tr) - 1))
            ctrls.append((0, len(places) - 1))
        mv.append((len(items), 0, 0, mid, 1, 0, 0))
    strdata = b''
    ent = []
    for s in names:
        ent.append((len(strdata), len(s.encode())))
        strdata += s.encode()
    secs = {2: ([struct.pack('<2f', *t) for t in tr]), 7: [struct.pack('<2i', *o) for o in objs],
            24: [struct.pack('<i', x) for x in inst], 26: [struct.pack('<4i', *p) for p in places],
            30: [struct.pack('<2i', *c) for c in ctrls], 31: [struct.pack('<2i', *f) for f in frames],
            33: [struct.pack('<7i', *m) for m in mv], 35: [struct.pack('<2i', *e) for e in ent]}
    head = bytearray(324)
    head[:4] = b'LWF\0'
    struct.pack_into('<6i', head, 8, 100, 100, 30, root, 0, 0)
    body = bytearray(strdata)
    for k in range(36):
        rows = secs.get(k, [])
        struct.pack_into('<ii', head, 32 + 8 * k, 324 + len(body) if k else 324, len(rows))
        for r in rows:
            body += r
    return bytes(head) + bytes(body)


def write(data):
    f = tempfile.NamedTemporaryFile(suffix='.lwf', delete=False)
    f.write(data)
    f.close()
    return f.name


class Markers(unittest.TestCase):
    def test_positions_through_the_tree(self):
        # char (10, 20) > parts2 (5, 5) > center (1, 2): weak point 2 at (16, 27); parts3 (100, 0) > attack (3, 3)
        movies = {0: [], 1: [('center', 2, 0, (1, 2))], 2: [('attack', 2, 0, (3, 3))],
                  3: [('parts2', 2, 1, (5, 5)), ('parts3', 2, 2, (100, 0))], 4: [('char', 2, 3, (10, 20))]}
        p = write(lwf(movies, 4))
        try:
            self.assertEqual(rwp.markers(lwf_rig.LWF(p)), [(2, 16.0, 27.0), (3, 113.0, 23.0)])
        finally:
            os.remove(p)

    def test_picture_only_parts_is_no_weak_point(self):
        # parts4 holds only an unnamed movie (Jack in the Box parts4/5): not a weak point
        movies = {0: [], 1: [('center', 2, 0, (0, 0))], 2: [(None, 2, 0, (0, 0))],
                  3: [('parts1', 2, 1, (7, 7)), ('parts4', 2, 2, (50, 50))], 4: [('char', 2, 3, (0, 0))]}
        p = write(lwf(movies, 4))
        try:
            self.assertEqual(rwp.markers(lwf_rig.LWF(p)), [(1, 7.0, 7.0)])
        finally:
            os.remove(p)

    def test_center_nested_below_the_part(self):
        # parts5 > body > center: check_raid_models.weak_slots counts only a center/attack placed directly in the
        # parts<N> movie (the rule that agreed with 26 of 26 smoked models), so this is no weak point here either
        movies = {0: [], 1: [('center', 2, 0, (1, 1))], 2: [('body', 2, 1, (0, 10))],
                  3: [('parts5', 2, 2, (2, 0))], 4: [('char', 2, 3, (0, 0))]}
        p = write(lwf(movies, 4))
        try:
            self.assertEqual(rwp.markers(lwf_rig.LWF(p)), [])
        finally:
            os.remove(p)

    def test_same_slots_as_check_raid_models(self):
        import check_raid_models as crm
        movies = {0: [], 1: [('center', 2, 0, (1, 2)), ('attack', 2, 0, (0, 0))], 2: [(None, 2, 0, (0, 0))],
                  3: [('parts2', 2, 1, (5, 5)), ('parts3', 2, 1, (9, 9)), ('parts4', 2, 2, (0, 0))],
                  4: [('char', 2, 3, (0, 0))]}
        p = write(lwf(movies, 4))
        try:
            self.assertEqual([k for k, x, y in rwp.markers(lwf_rig.LWF(p))], [2, 3])
            self.assertEqual(crm.weak_slots(p), [2, 3])
        finally:
            os.remove(p)


if __name__ == '__main__':
    unittest.main()
