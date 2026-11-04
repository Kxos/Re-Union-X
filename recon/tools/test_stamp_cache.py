"""Test of stamp_cache.py:  python -I recon/tools/test_stamp_cache.py"""
import os
import shutil
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import jp_sound_effects  # noqa: E402
import stamp_cache  # noqa: E402

t = tempfile.mkdtemp()
try:
    def put(rel, data):
        p = os.path.join(t, 'tree', *rel.split('/'))
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, 'wb') as fh:
            fh.write(data)
        return p

    a = put('a.txt', b'one')
    put('sub/b.lwf', b'LWF')
    put('sub/deep/c.png', b'png')
    calls = []

    def size(p):
        calls.append(p)
        return os.path.getsize(p)
    cp = os.path.join(t, 'cache.json')
    c = stamp_cache.StampCache(cp, 'v1')
    assert c.get('size', a, size) == 3 and c.get('size', a, size) == 3 and len(calls) == 1, 'second get is a hit'
    c.save()
    c = stamp_cache.StampCache(cp, 'v1')
    assert c.get('size', a, size) == 3 and len(calls) == 1, 'value kept across runs'
    assert c.get('other', a, size) == 3 and len(calls) == 2, 'kinds are separate'
    put('a.txt', b'three')
    assert c.get('size', a, size) == 5 and len(calls) == 3, 'a changed file is computed again'
    c.save()
    c = stamp_cache.StampCache(cp, 'v2')
    assert c.get('size', a, size) == 5 and len(calls) == 4, 'another code version discards the cache'
    missing = os.path.join(t, 'none')
    try:
        c.get('size', missing, size)
        raise AssertionError('missing file must raise as without the cache')
    except OSError:
        pass
    assert stamp_cache.StampCache(None, 'v').get('size', a, size) == 5, 'no file: works, remembers nothing on disk'
    # scan_tree: same names and paths as jp_sound_effects.walk_names (os.walk), with sizes from the listing
    root = os.path.join(t, 'tree')
    tree = stamp_cache.scan_tree(root)
    wn = jp_sound_effects.walk_names(root)
    assert {k: v[0] for k, v in tree.items()} == wn and list(tree) == list(wn), (tree, wn)
    assert all(st.st_size == os.path.getsize(p) for p, st in tree.values()), 'listing sizes'
    assert stamp_cache.scan_tree(os.path.join(t, 'absent')) == {}, 'absent root'
finally:
    shutil.rmtree(t)
print('OK: stamp_cache')
