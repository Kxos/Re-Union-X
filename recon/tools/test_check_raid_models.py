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
