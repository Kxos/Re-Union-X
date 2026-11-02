"""Tests for check_raid_models.py: python recon/tools/test_check_raid_models.py"""
import os
import struct
import sys
import tempfile
import unittest

sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import check_raid_models as crm

ANIMS = ('atk1', 'atk2', 'knockback1', 'knockback2', 'wait')


def fake_lwf(names):
    """Smallest binary the texture parser accepts: header, string data, string table, texture table (name index at +0)."""
    strdata = b''
    entries = []
    for n in names:
        raw = n.encode('utf-8')
        entries.append((len(strdata), len(raw)))
        strdata += raw
    head = bytearray(324)
    st_off = 324 + len(strdata)
    tx_off = st_off + 8 * len(entries)
    struct.pack_into('<i', head, 32, 324)
    struct.pack_into('<ii', head, 96, tx_off, len(names))
    struct.pack_into('<ii', head, 312, st_off, len(entries))
    body = b''.join(struct.pack('<ii', *e) for e in entries)
    body += b''.join(struct.pack('<iiiif', i, 0, 64, 64, 1.0) for i in range(len(names)))
    return bytes(head) + strdata + body


def tree_lwf(movies, root):
    """LWF with a display tree and no texture. movies: {movieId: [(instanceName or None, objType, objId), ...]} (one frame
    each, objType 2 = movie, 3 = bitmap); root: the root movie id. Sections as check_raid_models reads them."""
    names, inst, objs, places, ctrls, frames, mv = [], [], [], [], [], [], []

    def sid(s):
        if s not in names:
            names.append(s)
        return names.index(s)
    for mid in range(max(movies) + 1):
        items = movies.get(mid, [])
        frames.append((len(ctrls), len(items)))
        for n, ot, oo in items:
            iid = -1
            if n is not None:
                if sid(n) not in inst:
                    inst.append(sid(n))
                iid = inst.index(sid(n))
            objs.append((ot, oo))
            places.append((0, (len(objs) - 1) | -0x80000000, iid, 0))
            ctrls.append((0, len(places) - 1))
        mv.append((len(items), 0, 0, mid, 1, 0, 0))
    strdata = b''
    ent = []
    for s in names:
        ent.append((len(strdata), len(s.encode())))
        strdata += s.encode()
    secs = {7: (objs, 2), 24: ([(x,) for x in inst], 1), 26: (places, 4), 30: (ctrls, 2), 31: (frames, 2), 33: (mv, 7), 35: (ent, 2)}
    head = bytearray(324)
    struct.pack_into('<i', head, 20, root)
    struct.pack_into('<ii', head, 32, 324, len(strdata))
    body = bytearray(strdata)
    for k in range(36):
        rows, w = secs.get(k, ([], 1))
        struct.pack_into('<ii', head, 32 + 8 * k, 324 + len(body) if k else 324, len(rows))
        for r in rows:
            body += struct.pack('<%di' % w, *r)
    return bytes(head) + bytes(body)


def weak_model(root, mid, live, decor=()):
    """Model whose wait LWF has char > all > parts<N>: live ones hold center + attack, decor ones only a bitmap."""
    movies = {0: [('center', 3, 0), ('attack', 3, 1)], 1: [(None, 3, 2)]}
    alln = 2
    movies[alln] = [('parts%d' % n, 2, 0) for n in live] + [('parts%d' % n, 2, 1) for n in decor]
    movies[3] = [('all', 2, alln)]
    movies[4] = [('char', 2, 3)]
    full_model(root, mid)
    put(root, 'lwf/character/raid/%s/wait/wait.lwf' % mid, tree_lwf(movies, 4))


def put(root, rel, data=b'x'):
    p = os.path.join(root, *rel.split('/'))
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'wb') as f:
        f.write(data)


def folder(root, rel, name, textures, present):
    put(root, '%s/%s.lwf' % (rel, name), fake_lwf(textures))
    for t in present:
        put(root, '%s/%s' % (rel, t))


def full_model(root, mid, skip=None):
    for a in ANIMS:
        tex = ['%s_%d.png' % (a, i) for i in range(3)]
        folder(root, 'lwf/character/raid/%s/%s' % (mid, a), a, tex, tex)
    for k in ('start', 'escape', 'put_down'):
        if k == skip:
            continue
        tex = ['%s_0.png' % k]
        folder(root, 'lwf/raid/demo/%s_%s' % (k, mid), '%s_%s' % (k, mid), tex, tex)


class Check(unittest.TestCase):
    def test_all_present(self):
        with tempfile.TemporaryDirectory() as d:
            full_model(d, '0001')
            self.assertEqual(crm.check_model(d, '0001'), {'fight': True, 'start': True, 'escape': True, 'put_down': True})

    def test_two_of_three_textures(self):
        with tempfile.TemporaryDirectory() as d:
            full_model(d, '0001')
            os.remove(os.path.join(d, 'lwf', 'character', 'raid', '0001', 'atk2', 'atk2_1.png'))
            r = crm.check_model(d, '0001')
            self.assertFalse(r['fight'])
            self.assertTrue(r['put_down'])

    def test_three_textures_two_present(self):
        with tempfile.TemporaryDirectory() as d:
            for a in ANIMS:
                folder(d, 'lwf/character/raid/0002/' + a, a, ['a.png', 'b.png', 'c.png'], ['a.png', 'b.png'] if a == 'wait' else ['a.png', 'b.png', 'c.png'])
            self.assertFalse(crm.check_model(d, '0002')['fight'])

    def test_missing_anim_folder(self):
        with tempfile.TemporaryDirectory() as d:
            full_model(d, '0003')
            import shutil
            shutil.rmtree(os.path.join(d, 'lwf', 'character', 'raid', '0003', 'wait'))
            self.assertFalse(crm.check_model(d, '0003')['fight'])

    def test_missing_demo_folder(self):
        with tempfile.TemporaryDirectory() as d:
            full_model(d, '0004', skip='put_down')
            r = crm.check_model(d, '0004')
            self.assertFalse(r['put_down'])
            self.assertTrue(r['start'] and r['escape'] and r['fight'])

    def test_unknown_model(self):
        with tempfile.TemporaryDirectory() as d:
            self.assertEqual(crm.check_model(d, '7777'), {'fight': False, 'start': False, 'escape': False, 'put_down': False})

    def test_served_folder_counts(self):
        # folder with only a .res; LWF and textures are in the base resources
        with tempfile.TemporaryDirectory() as d:
            put(d, 'lwf/raid/demo/put_down_0005/put_down_0005.res')
            served = {'lwf/raid/demo/put_down_0005/put_down_0005.lwf', 'lwf/raid/demo/put_down_0005/put_down_0005_0.png'}
            notes = []
            self.assertTrue(crm.check_model(d, '0005', served, notes)['put_down'])
            self.assertTrue(any('put_down_0005' in n and 'not parsed' in n for n in notes))
            self.assertFalse(crm.check_model(d, '0005')['put_down'])

    def test_served_partly_is_incomplete(self):
        # LWF on disk names two textures: one on disk, one neither on disk nor served
        with tempfile.TemporaryDirectory() as d:
            folder(d, 'lwf/raid/demo/put_down_0006', 'put_down_0006', ['a.png', 'b.png'], ['a.png'])
            self.assertFalse(crm.check_model(d, '0006', set())['put_down'])
            self.assertTrue(crm.check_model(d, '0006', {'lwf/raid/demo/put_down_0006/b.png'})['put_down'])
            self.assertFalse(crm.check_model(d, '0006', {'lwf/raid/demo/put_down_0006/zzz.png'})['put_down'])

    def test_weak_point_slots(self):
        # Lion Headliner 1005: five weak points (parts1-5 with center/attack); Jack in the Box 1004: parts4/5 are bitmap only
        with tempfile.TemporaryDirectory() as d:
            weak_model(d, '1005', [1, 2, 3, 4, 5])
            weak_model(d, '1004', [1, 2], decor=[3, 4, 5])
            self.assertEqual(crm.check_model(d, '1005')['slots'], [1, 2, 3, 4, 5])
            self.assertEqual(crm.check_model(d, '1004')['slots'], [1, 2])
            self.assertEqual(crm.weak_slots(os.path.join(d, 'lwf', 'character', 'raid', '1005', 'wait', 'wait.lwf')), [1, 2, 3, 4, 5])

    def test_no_slots_without_a_tree(self):
        # texture-only LWF (no movie) or no LWF on disk: no `slots` key, make-raid.js then skips the check
        with tempfile.TemporaryDirectory() as d:
            full_model(d, '0001')
            self.assertNotIn('slots', crm.check_model(d, '0001'))
            self.assertNotIn('slots', crm.check_model(d, '7777'))

    def test_available_and_main(self):
        with tempfile.TemporaryDirectory() as d:
            full_model(d, '0001')
            full_model(d, '0002', skip='start')
            full_model(d, '0003', skip='put_down')
            out = os.path.join(d, 'out.json')
            crm.main(['check_raid_models.py', d, out, '--models', '0001,0002,0003'])
            import json
            with open(out, encoding='utf-8') as f:
                got = json.load(f)
            self.assertEqual(sorted(got), ['0001', '0002', '0003'])
            self.assertEqual([m for m in sorted(got) if crm.available(got[m])], ['0001', '0002'])


if __name__ == '__main__':
    unittest.main()
