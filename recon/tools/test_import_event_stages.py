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
finally:
    shutil.rmtree(t, ignore_errors=True)
print('OK: test_import_event_stages')
