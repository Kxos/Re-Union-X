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
    # level-shifted twin (Part 5 Task 4): Marluxia I = JP 68710 (Lv 25) at Lv 20, copied under its own key with every enemy
    # level and STG [11] shifted; the JP map itself (another item) stays byte for byte; a wrong `from` leaves it out
    FK, OWN = 68710, 4003322
    stl, pl = mapfile.load_stage(files, FK)
    ids_l = {e['enemyId'] for p in pl for e in p['enemies']}
    rooms_l = {p['room'] for p in pl}
    rw_l = {e['reward'] for p in pl for e in p['enemies']} | {c['reward'] for p in pl for c in p['chests']}
    it_l = {'stageId': OWN, 'key': OWN, 'fromKey': FK, 'levelShift': {'from': 25, 'to': 20, 'delta': -5}, 'name': 'shifted'}
    rep_l = ies.run([it_l, {'stageId': 9, 'key': FK, 'name': 'jp'}], files, rooms_l, ids_l, rw_l, out)
    sl, sj = rep_l['stages']
    assert sl['status'] == 'imported' and sl['levelShifted'] is True and sl['fromKey'] == FK and sl['key'] == OWN, sl
    assert sj['status'] == 'imported' and not sj.get('levelShifted'), sj
    got = sorted(n for n in os.listdir(os.path.join(out, 'stage')) if str(OWN) in n)
    assert got == ies.file_names(OWN, len(pl)), got
    rd = lambda n: open(os.path.join(out, 'stage', n), 'rb').read()
    s_new, p_new = mapfile.load_stage({(OWN, None): rd(got[0]), **{(OWN, k): rd(n) for k, n in enumerate(got[1:])}}, OWN)
    assert s_new['card_level_bonus'] == 20 and stl['card_level_bonus'] == 25, (s_new['card_level_bonus'], stl['card_level_bonus'])
    old_e = [e for p in pl for e in p['enemies']]
    new_e = [e for p in p_new for e in p['enemies']]
    assert [e['level'] for e in new_e] == [e['level'] - 5 for e in old_e] and {e['level'] for e in new_e} == {20}
    assert [{k: v for k, v in e.items() if k != 'level'} for e in new_e] == [{k: v for k, v in e.items() if k != 'level'} for e in old_e]
    for k, n in zip([None] + list(range(len(pl))), ies.file_names(FK, len(pl))):
        assert rd(n) == open(files[(FK, k)], 'rb').read(), 'JP map unchanged ' + n
    poi_l = json.load(open(os.path.join(out, 'stage_poi_events.json'), encoding='utf-8'))
    assert poi_l[str(OWN)] == poi_l[str(FK)], 'same POI under the own key'
    bad = ies.run([dict(it_l, levelShift={'from': 30, 'to': 20, 'delta': -10})], files, rooms_l, ids_l, rw_l, out)['stages'][0]
    assert bad['status'] == 'skipped' and bad['cause'] == 'level shift' and not bad.get('levelShifted'), bad
    assert os.listdir(os.path.join(out, 'stage')) == []
    # part sources (Task 4 follow-up, dedup stubs): The Ultimate Test 740911 has its STG but no part 0 in the dump; part 0 is the
    # byte copy of 740920_00 (same Master). Filled byte for byte, reported; a part the copy holds is never replaced; without the
    # entry the map stays incomplete
    KS, SRC = 740911, 740920
    assert (KS, None) in files and (KS, 0) not in files and (SRC, 0) in files
    _, ps = mapfile.load_stage(files, SRC)
    ids_s = {e['enemyId'] for p in ps for e in p['enemies']}
    rooms_s = {p['room'] for p in ps}
    rw_s = {e['reward'] for p in ps for e in p['enemies']} | {c['reward'] for p in ps for c in p['chests']}
    it_s = {'stageId': 11, 'key': KS, 'name': 'stub', 'partSources': {'0': {'key': SRC, 'part': 0, 'reconstructed': False, 'basis': 'dedupStub'}}}
    rep_s = ies.run([it_s, {'stageId': 12, 'key': SRC, 'name': 'src',
                            'partSources': {'0': {'key': KS, 'part': 0, 'reconstructed': True}}}], files, rooms_s, ids_s, rw_s, out)
    ss, sv = rep_s['stages']
    assert ss['status'] == 'imported' and ss['partSources'] == {'mappoi_stg740911_00.bin': {
        'from': 'mappoi_stg740920_00.bin', 'reconstructed': False, 'basis': 'dedupStub'}}, ss
    assert sv['status'] == 'imported' and 'partSources' not in sv, sv
    assert rep_s['summary']['partSources'] == [KS] and rep_s['summary']['reconstructedParts'] == []
    rd = lambda n: open(os.path.join(out, 'stage', n), 'rb').read()
    assert rd('mappoi_stg740911_00.bin') == open(files[(SRC, 0)], 'rb').read() == rd('mappoi_stg740920_00.bin')
    assert rd('mappoi_stg740911.bin') == open(files[(KS, None)], 'rb').read()
    no = ies.run([dict(it_s, partSources=None)], files, rooms_s, ids_s, rw_s, out)['stages'][0]
    assert no['status'] == 'missing' and no['cause'] == 'part 0 absent' and 'partSources' not in no, no
    # whole-STG dedup stub (user decision 6, 10-11-2026): EV-0761 740280 has its part 0 but no STG in the dump; its STG is the byte
    # copy of mappoi_stg740281.bin (part 'stg', source part null). Filled byte for byte; without the entry the STG stays absent
    KT, SRT = 740280, 740281
    assert (KT, None) not in files and (KT, 0) in files and (SRT, None) in files
    st_t, pt = mapfile.load_stage({**files, (KT, None): files[(SRT, None)]}, KT)
    ids_t = {e['enemyId'] for p in pt for e in p['enemies']}
    rooms_t = {p['room'] for p in pt}
    rw_t = {e['reward'] for p in pt for e in p['enemies']} | {c['reward'] for p in pt for c in p['chests']}
    it_t = {'stageId': 13, 'key': KT, 'name': 'stg stub', 'partSources': {'stg': {'key': SRT, 'part': None, 'reconstructed': False, 'basis': 'stgStub'}}}
    st_r = ies.run([it_t], files, rooms_t, ids_t, rw_t, out)['stages'][0]
    assert st_r['status'] == 'imported' and st_r['partSources'] == {'mappoi_stg740280.bin': {
        'from': 'mappoi_stg740281.bin', 'reconstructed': False, 'basis': 'stgStub'}}, st_r
    assert rd('mappoi_stg740280.bin') == open(files[(SRT, None)], 'rb').read()
    assert rd('mappoi_stg740280_00.bin') == open(files[(KT, 0)], 'rb').read()
    no_t = ies.run([dict(it_t, partSources=None)], files, rooms_t, ids_t, rw_t, out)['stages'][0]
    assert no_t['status'] == 'missing' and no_t['cause'] == 'STG absent', no_t
    # same-series layout twin (user decision 7): Defeat Dragon Maleficent 1/10 (Sept 2020, own map 743430 lost) on the May 2020 map
    # 742530 with the run row 2009001561 in place of 2005001561 (STG target and card too); the JP folder is never changed
    KL, FL, RUN, OLD = 743430, 742530, 2009001561, 2005001561
    _, pl2 = mapfile.load_stage(files, FL)
    rooms_l2 = {p['room'] for p in pl2}
    rw_l2 = {e['reward'] for p in pl2 for e in p['enemies']} | {c['reward'] for p in pl2 for c in p['chests']}
    it_lt = {'stageId': 14, 'key': KL, 'name': 'layout twin', 'fromKey': FL, 'layoutTwin': True, 'enemySwaps': [{'from': OLD, 'to': RUN}],
             'enemies': [{'enemyId': RUN}]}
    lt = ies.run([it_lt], files, rooms_l2, {RUN}, rw_l2, out)['stages'][0]
    assert lt['status'] == 'imported' and lt['layoutTwin'] and lt['fromKey'] == FL and lt['enemies'] == {str(RUN): 1} and 'differs' not in lt, lt
    stg_lt, p_lt = mapfile.load_stage({(KL, None): rd('mappoi_stg743430.bin'), (KL, 0): rd('mappoi_stg743430_00.bin')}, KL)
    assert stg_lt['target_enemy'] == RUN and [e['enemyId'] for p in p_lt for e in p['enemies']] == [RUN]
    assert mapfile.parse_stg(open(files[(FL, None)], 'rb').read())['target_enemy'] == OLD, 'JP map unchanged'
    bad_lt = ies.run([dict(it_lt, enemySwaps=[{'from': 1, 'to': RUN}])], files, rooms_l2, {RUN, OLD}, rw_l2, out)['stages'][0]
    assert bad_lt['status'] == 'skipped' and not bad_lt.get('layoutTwin'), bad_lt
finally:
    shutil.rmtree(t, ignore_errors=True)
print('OK: test_import_event_stages')
