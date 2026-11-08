"""Test of import_event_stages.py on the local JP 4.3.1 stage files: python -I recon/tools/test_import_event_stages.py

Needs the local reference data (private_tools jp_data); without it the test says SKIP. Checks: files copied byte for
byte from the highest JP revision under the client names (mappoi_stg<key>.bin + _NN.bin), a missing STG / an absent key
reported and left out, a room not served or an enemy not in the master leaves the stage out, a map whose enemies differ
from the quest is imported and flagged, a key twice is imported once, reward ids missing from the master listed, POI in
the stage_poi.py format keyed by the map key.
"""
import json
import os
import shutil
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import import_event_stages as ies  # noqa: E402
import mapfile  # noqa: E402

try:
    import private_tools  # noqa: E402
    JP = private_tools.local_path('jp_data', 'stage')
except Exception:  # noqa: BLE001
    JP = None
if not JP or not os.path.isdir(JP):
    print('SKIP: no local JP 4.3.1 stage folder')
    sys.exit(0)

files = mapfile.iter_stage_files(JP)
stg, parts = mapfile.load_stage(files, 740140)
ids = sorted({e['enemyId'] for p in parts for e in p['enemies']})
rooms = {p['room'] for p in parts}
rewards = {e['reward'] for p in parts for e in p['enemies']} | {c['reward'] for p in parts for c in p['chests']}
items = [
    {'stageId': 1, 'key': 740140, 'name': 'ok', 'enemies': [{'enemyId': i} for i in ids]},
    {'stageId': 2, 'key': 740280, 'name': 'no STG'},
    {'stageId': 3, 'key': 999999, 'name': 'absent'},
    {'stageId': 4, 'key': 740140, 'name': 'twice'},
]
t = tempfile.mkdtemp()
try:
    out = os.path.join(t, 'out')
    some_reward = sorted(rewards)[0]
    rep = ies.run(items, files, rooms, set(ids), rewards - {some_reward}, out)
    st = {s['stageId']: s for s in rep['stages']}
    assert st[1]['status'] == 'imported' and 'differs' not in st[1], st[1]
    assert st[1]['rewards_missing'] == [some_reward], st[1]['rewards_missing']
    assert rep['summary']['rewards_missing'] == [some_reward]
    assert st[2]['status'] == 'missing' and 'STG' in st[2]['why'] and 'absent' in st[2]['why'], st[2]
    assert st[3]['status'] == 'missing', st[3]
    assert st[4]['status'] == 'skipped' and 'twice' in st[4]['why'], st[4]
    names = sorted(os.listdir(os.path.join(out, 'stage')))
    assert names == ies.file_names(740140, len(parts)) == ['mappoi_stg740140.bin'] + [
        'mappoi_stg740140_%02d.bin' % k for k in range(len(parts))], names
    for k, n in zip([None] + list(range(len(parts))), names):
        assert open(os.path.join(out, 'stage', n), 'rb').read() == open(files[(740140, k)], 'rb').read(), 'byte copy ' + n
    poi = json.load(open(os.path.join(out, 'stage_poi_events.json'), encoding='utf-8'))
    assert list(poi) == ['740140'], list(poi)
    assert sum(len(p['enemies']) for p in parts) == len(poi['740140']['enemies'])
    assert set(poi['740140']['enemies'][0]) == {'uid', 'enemyId', 'reward', 'map'}, poi['740140']['enemies'][0]
    assert all(set(c) == {'uid', 'reward', 'kind', 'map'} for c in poi['740140']['chests'])
    # enemies of the map differ from the quest: imported, flagged
    rep2 = ies.run([dict(items[0], enemies=[{'enemyId': ids[0]}, {'enemyId': 424242}])], files, rooms, set(ids), rewards, out)
    s2 = rep2['stages'][0]
    assert s2['status'] == 'imported' and s2['differs']['quest_only'] == [424242], s2
    assert rep2['summary']['differs'] == [1]
    # room not served / enemy not in the master: left out, nothing written (the stage folder is cleared each run)
    rep3 = ies.run(items[:1], files, set(), set(ids), rewards, out)
    assert rep3['stages'][0]['status'] == 'skipped' and 'rooms not served' in rep3['stages'][0]['why']
    assert os.listdir(os.path.join(out, 'stage')) == []
    rep4 = ies.run(items[:1], files, rooms, set(ids[1:]), rewards, out)
    assert rep4['stages'][0]['status'] == 'skipped' and 'enemies not in the master' in rep4['stages'][0]['why']
    # enemy swaps (user ruling 06-11): the real ones of server/event_config.json, only the enemy ids change
    cfg = json.load(open(os.path.join(ies.REPO, 'server', 'event_config.json'), encoding='utf-8'))
    for key, sw in cfg['mapEnemySwaps'].items():
        key = int(key)
        st0, p0 = mapfile.load_stage(files, key)
        raw0 = [open(files[(key, None)], 'rb').read()] + [open(files[(key, k)], 'rb').read() for k in range(len(p0))]
        new, done = ies.patch_swaps(raw0, sw)
        frm, to = sw[0]['from'], sw[0]['to']
        n_from = sum(1 for p in p0 for e in p['enemies'] if e['enemyId'] == frm)
        assert n_from and len([d for d in done if d['part'] is not None]) == n_from, (key, done)
        changed = 0
        for k, (a, b) in enumerate(zip(raw0, new)):
            assert len(a) == len(b), 'same size'
            diff = [i for i in range(len(a)) if a[i] != b[i]]
            changed += len(diff)
            if k:
                pa, pb = mapfile.parse_map(a, k - 1), mapfile.parse_map(b, k - 1)
                for ea, eb in zip(pa['enemies'], pb['enemies']):
                    want = to if ea['enemyId'] == frm else ea['enemyId']
                    assert eb == dict(ea, enemyId=want), (key, ea, eb)
                assert pa['chests'] == pb['chests'] and pa['teams'] == pb['teams'] and pa['exits'] == pb['exits']
        assert 0 < changed <= 4 * (len(done)), (key, changed)
        ids_k = sorted({e['enemyId'] for p in p0 for e in p['enemies']} - {frm} | {to})
        rooms_k = {p['room'] for p in p0}
        rw_k = {e['reward'] for p in p0 for e in p['enemies']} | {c['reward'] for p in p0 for c in p['chests']}
        it = {'stageId': 9, 'key': key, 'name': 'swap', 'enemies': [{'enemyId': i} for i in ids_k]}
        rep5 = ies.run([it], files, rooms_k, set(ids_k), rw_k, out, {str(key): sw})
        s5 = rep5['stages'][0]
        assert s5['status'] == 'imported' and 'differs' not in s5 and s5['swapped'], s5
        st_name = ies.file_names(key, len(p0))
        assert open(os.path.join(out, 'stage', st_name[1]), 'rb').read() != open(files[(key, 0)], 'rb').read() or len(p0) > 1
        assert open(files[(key, None)], 'rb').read() == raw0[0], 'the JP file is never changed'
    # a swap that finds no record: the stage is left out
    rep6 = ies.run(items[:1], files, rooms, set(ids), rewards, out, {'740140': [{'from': 123456789, 'to': 1}]})
    assert rep6['stages'][0]['status'] == 'skipped' and 'finds no record' in rep6['stages'][0]['why'], rep6['stages'][0]
    # Events Part 4 Task 2: causes, other original copies of the same bin, the rooms list for make_jp_rooms.py
    assert st[2]['cause'] == 'STG absent' and st[3]['cause'] == 'STG absent', (st[2], st[3])
    assert rep['summary']['by_cause'] == {'STG absent': 2, 'map key twice': 1}, rep['summary']['by_cause']
    assert [c['copy'] for c in st[2]['tried']] == ['jp431'] and st[2]['tried'][0]['parts'] == [0], st[2]['tried']
    assert rep3['stages'][0]['cause'] == 'rooms not served' and rep3['summary']['by_cause'] == {'rooms not served': 1}
    # a part absent from the JP copy is taken from another original copy of the same bin (byte for byte, recorded)
    jp_less = {k: v for k, v in files.items() if k != (740140, 0)}
    rep7 = ies.run(items[:1], jp_less, rooms, set(ids), rewards, out)
    assert rep7['stages'][0]['status'] == 'missing' and rep7['stages'][0]['cause'] == 'part 0 absent', rep7['stages'][0]
    # fix round 1 (review I1): never a mix of bins or versions
    rb = lambda k: open(files[k], 'rb').read()
    whole = {k: rb(k) for k in files if k[0] == 740140}
    # (a) single-copy pick: the whole map comes from the one copy that has every file, none from the incomplete JP copy
    rep8 = ies.run(items[:1], jp_less, rooms, set(ids), rewards, out, None, [('bundle2016', whole)])
    s8 = rep8['stages'][0]
    assert s8['status'] == 'imported' and s8['copies'] == {n: 'bundle2016' for n in ies.file_names(740140, len(parts))}, s8
    assert open(os.path.join(out, 'stage', 'mappoi_stg740140_00.bin'), 'rb').read() == rb((740140, 0))
    # (b)-(d) a 3-part map (740261) whose JP copy lacks part 1; the lending copy has the STG and part 1, not part 0 (not whole)
    MK = 740261
    stm, pm = mapfile.load_stage(files, MK)
    ids_m = {e['enemyId'] for x in pm for e in x['enemies']}
    rooms_m = {x['room'] for x in pm}
    rw_m = {e['reward'] for x in pm for e in x['enemies']} | {c['reward'] for x in pm for c in x['chests']}
    it_m = {'stageId': 7, 'key': MK, 'name': 'mix', 'enemies': [{'enemyId': i} for i in sorted(ids_m)]}
    jp_m = {k: v for k, v in files.items() if k != (MK, 1)}
    # (b) mixed pick accepted: the shared STG is byte-identical to the JP one
    same = {(MK, None): rb((MK, None)), (MK, 1): rb((MK, 1))}
    s10 = ies.run([it_m], jp_m, rooms_m, ids_m, rw_m, out, None, [('bundle2016', same)])['stages'][0]
    assert s10['status'] == 'imported' and s10['copies'] == {'mappoi_stg740261_01.bin': 'bundle2016'}, s10
    # (c) mixed pick refused: the shared STG differs (another version) -> incomplete, cause 'copies differ', nothing written
    other_stg = bytearray(rb((MK, None)))
    other_stg[-1] ^= 1
    diff = {(MK, None): bytes(other_stg), (MK, 1): rb((MK, 1))}
    s11 = ies.run([it_m], jp_m, rooms_m, ids_m, rw_m, out, None, [('bundle2016', diff)])['stages'][0]
    assert s11['status'] == 'missing' and s11['cause'] == 'copies differ' and 'mappoi_stg740261.bin' in s11['why'], s11
    assert os.listdir(os.path.join(out, 'stage')) == [], 'nothing written for a refused mix'
    # (d) mixed pick refused: the lending copy shares no file with the STG copy (same version not provable)
    s12 = ies.run([it_m], jp_m, rooms_m, ids_m, rw_m, out, None, [('bundle2016', {(MK, 1): rb((MK, 1))})])['stages'][0]
    assert s12['status'] == 'missing' and s12['cause'] == 'copies differ' and 'shares no file' in s12['why'], s12
    rep9 = ies.run(items[1:2], files, rooms, set(ids), rewards, out, None, [('bundle2016', {})], {'ww2018 index': set()})
    assert [c['copy'] for c in rep9['stages'][0]['tried']] == ['jp431', 'bundle2016', 'ww2018 index'], rep9['stages'][0]['tried']
    # rooms of every map that could be read (imported or left out for its rooms): the list make_jp_rooms.py builds
    rl = os.path.join(t, 'event_rooms.json')
    ies.run(items, files, set(), set(ids), rewards, out, rooms_out=rl)
    lst = json.load(open(rl, encoding='utf-8'))
    assert lst['rooms'] == sorted(rooms) and lst['by_room'][sorted(rooms)[0]] == [740140], lst
finally:
    shutil.rmtree(t, ignore_errors=True)
print('OK: test_import_event_stages')
