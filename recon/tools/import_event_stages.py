"""Original JP 4.3.1 maps of the served event quests (Events Part 1, Task 6), as import_orig_stages.py does for the story.

    python -I recon/tools/import_event_stages.py [--maps F] [--jp D] [--out D] [--master D] [--stage-dir D] [--poi F]

--maps: server/game_data/event_maps.json (make-events.js): one item per served event stage {stageId, key, censusId, name,
enemies: [{name, enemyId, n, ...}], drops: {enemies: [{rewardId}], chests: [{reward}]}}. The stage row of the quest has
stageBinId = key, so the client loads mappoi_stg<key>.bin + _NN.bin (docs/notes/events.md), the names the JP files have:
the files are copied byte for byte, never renamed or edited.
--jp: the JP 4.3.1 stage/ folder (private_tools.local_path('jp_data', 'stage'); `<name>.<entry id>.bin`: the highest
revision wins, mapfile.iter_stage_files).
For every item: read with mapfile.py (the client's format); a missing STG or part, an old format or an incoherent stage is
reported and the stage is left out (never invented). Checks, all in <out>/report.json (nothing is changed by them):
  * rooms: every part's room must be served (names_v4.tsv, names_addnl.tsv, rooms_gen/stage_gen files/map), else the
    client crashes on the room: such a stage is left out;
  * enemies: every enemyId of the map must be in the master enemy table, else the stage is left out (its quest is not
    served yet); the map's enemy ids are compared with the quest's (event_maps.json): a difference is reported as
    `differs` (the quest stays as built; who decides is the user), the stage is still imported;
  * rewards: every reward id of enemies and chests must be in the master reward table (the client reads that row after
    /stage/start: missing -> crash); missing ones are listed in `rewards_missing` (make-game-tables.js writes the rows of
    the POI files given in KHUX_STAGE_POI_EXTRA: pass <out>/stage_poi_events.json there on the next master run).
Output: <out>/stage/ (the imported files, cleared at each run), <out>/stage_poi_events.json (stage_poi.py format, keyed by
the map key: the server's poiStageId reads an event stage's POI by its stageBinId), <out>/report.json.
--stage-dir: also copy the imported files into this folder (the resource staging, stage_gen/files/stage). --poi: also
merge the POI into this file (server/game_data/stage_poi.json; read by the server at start only).
"""
import argparse
import json
import os
import re
import shutil
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mapfile  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
D = os.path.dirname(os.path.dirname(REPO))
ROOM_RE = re.compile(r'map/([A-Z]{2}_\d{4}_\d\d_\d\d)/\1_info\.bin\t')


def served_rooms(d=D):
    """rooms of the served resources (as import_orig_stages.served_rooms)"""
    rooms = set()
    for tsv in (os.path.join(d, 'resource_data', 'names_v4.tsv'), os.path.join(d, 'ipa431', 'names_addnl.tsv')):
        if os.path.exists(tsv):
            for line in open(tsv, encoding='utf-8'):
                m = ROOM_RE.match(line)
                if m:
                    rooms.add(m.group(1))
    for base in (os.path.join(d, 'rooms_gen', 'files', 'map'), os.path.join(d, 'stage_gen', 'files', 'map')):
        if os.path.isdir(base):
            rooms |= {r for r in os.listdir(base) if os.path.exists(os.path.join(base, r, r + '_info.bin'))}
    return rooms


def file_names(key, nparts):
    """client names of a stage: mappoi_stg<key>.bin + _NN.bin (5 digits at least, as the story maps)"""
    return ['mappoi_stg%05d.bin' % key] + ['mappoi_stg%05d_%02d.bin' % (key, k) for k in range(nparts)]


def poi_of(parts):
    """{chests, enemies} of the parts in the stage_poi.py format"""
    out = {'chests': [], 'enemies': []}
    for k, p in enumerate(parts):
        out['enemies'] += [{'uid': e['uid'], 'enemyId': e['enemyId'], 'reward': e['reward'], 'map': k} for e in p['enemies']]
        out['chests'] += [{'uid': c['uid'], 'reward': c['reward'], 'kind': c['kind'], 'map': k} for c in p['chests']]
    return out


def check_item(item, files, rooms, enemy_ids, reward_ids):
    """-> (result dict, raw [bytes] or None). result: {stageId, key, name, status, why?, parts, rooms, enemies {id: n},
    quest_enemies, differs?, rewards_missing, warnings}"""
    key = item['key']
    res = {'stageId': item['stageId'], 'key': key, 'censusId': item.get('censusId'), 'name': item.get('name')}
    try:
        stg, parts = mapfile.load_stage(files, key)
    except mapfile.FormatError as e:
        have = sorted(k[1] for k in files if k[0] == key and k[1] is not None)
        stg_ok = (key, None) in files
        return dict(res, status='missing', why='%s (STG %s, parts in the JP data: %s)' % (e, 'present' if stg_ok else 'absent', have)), None
    if not stg['client_layout'] or not all(p['client_layout'] for p in parts):
        return dict(res, status='skipped', why='old format (version < 13)'), None
    bad, warn = mapfile.check_stage(stg, parts)
    res['warnings'] = warn
    if bad:
        return dict(res, status='skipped', why='incoherent: ' + '; '.join(bad)), None
    res['parts'] = len(parts)
    res['rooms'] = [p['room'] for p in parts]
    counts = {}
    for p in parts:
        for e in p['enemies']:
            counts[e['enemyId']] = counts.get(e['enemyId'], 0) + 1
    res['enemies'] = {str(k): v for k, v in sorted(counts.items())}
    quest = sorted({e['enemyId'] for e in item.get('enemies') or [] if e.get('enemyId')})
    res['quest_enemies'] = quest
    if set(counts) != set(quest):
        res['differs'] = {'map_only': sorted(set(counts) - set(quest)), 'quest_only': sorted(set(quest) - set(counts))}
    rw = {e['reward'] for p in parts for e in p['enemies']} | {c['reward'] for p in parts for c in p['chests']}
    res['rewards_missing'] = sorted(r for r in rw if r not in reward_ids)
    miss_rooms = [r for r in res['rooms'] if r not in rooms]
    if miss_rooms:
        return dict(res, status='skipped', why='rooms not served: ' + ', '.join(miss_rooms)), None
    miss_en = sorted(e for e in counts if e not in enemy_ids)
    if miss_en:
        return dict(res, status='skipped', why='enemies not in the master: %s' % miss_en), None
    raw = [open(files[(key, None)], 'rb').read()] + [open(files[(key, k)], 'rb').read() for k in range(len(parts))]
    res['status'] = 'imported'
    res['poi'] = poi_of(parts)
    return res, raw


def run(items, files, rooms, enemy_ids, reward_ids, out):
    """imports every item; returns the report {summary, stages}"""
    sdir = os.path.join(out, 'stage')
    shutil.rmtree(sdir, ignore_errors=True)
    os.makedirs(sdir)
    stages, poi, seen = [], {}, set()
    for it in items:
        if it['key'] in seen:
            stages.append({'stageId': it['stageId'], 'key': it['key'], 'status': 'skipped', 'why': 'map key twice in the list'})
            continue
        seen.add(it['key'])
        res, raw = check_item(it, files, rooms, enemy_ids, reward_ids)
        if raw:
            for name, b in zip(file_names(it['key'], len(raw) - 1), raw):
                with open(os.path.join(sdir, name), 'wb') as f:
                    f.write(b)
            poi[str(it['key'])] = res.pop('poi')
        stages.append(res)
    with open(os.path.join(out, 'stage_poi_events.json'), 'w', encoding='utf-8') as f:
        json.dump(poi, f, indent=1)
    by = {}
    for s in stages:
        by[s['status']] = by.get(s['status'], 0) + 1
    rep = {'summary': {'items': len(items), 'by_status': by, 'files': len(os.listdir(sdir)),
                       'differs': [s['stageId'] for s in stages if s.get('differs')],
                       'rewards_missing': sorted({r for s in stages if s['status'] == 'imported' for r in s.get('rewards_missing', [])})},
           'stages': stages}
    with open(os.path.join(out, 'report.json'), 'w', encoding='utf-8') as f:
        json.dump(rep, f, indent=1, ensure_ascii=False)
    return rep


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--maps', default=os.path.join(REPO, 'server', 'game_data', 'event_maps.json'))
    ap.add_argument('--jp', help='JP 4.3.1 stage/ folder (default: private_tools jp_data/stage)')
    ap.add_argument('--out', default=os.path.join(D, 'stage_gen', 'event_stages'))
    ap.add_argument('--master', default=os.path.join(REPO, 'server', 'master_data'))
    ap.add_argument('--stage-dir', help='also copy the imported files here (stage_gen/files/stage)')
    ap.add_argument('--poi', help='also merge the POI into this file (server/game_data/stage_poi.json)')
    a = ap.parse_args(argv)
    if not a.jp:
        import private_tools
        a.jp = private_tools.local_path('jp_data', 'stage')
    items = json.load(open(a.maps, encoding='utf-8'))
    rows = lambda n: json.load(open(os.path.join(a.master, n + '.json'), encoding='utf-8'))
    rep = run(items, mapfile.iter_stage_files(a.jp), served_rooms(), {r['enemyId'] for r in rows('enemy')},
              {r['rewardId'] for r in rows('reward')}, a.out)
    sdir = os.path.join(a.out, 'stage')
    if a.stage_dir:
        os.makedirs(a.stage_dir, exist_ok=True)
        for f in os.listdir(sdir):
            shutil.copyfile(os.path.join(sdir, f), os.path.join(a.stage_dir, f))
    if a.poi:
        poi = json.load(open(os.path.join(a.out, 'stage_poi_events.json'), encoding='utf-8'))
        old = json.load(open(a.poi, encoding='utf-8')) if os.path.exists(a.poi) else {}
        with open(a.poi, 'w', encoding='utf-8') as f:
            json.dump(dict(sorted(dict(old, **poi).items(), key=lambda kv: int(kv[0]))), f)
    s = rep['summary']
    print('event stages: %d items, %s, %d files -> %s; map differs from the quest: %s; reward rows missing: %s' % (
        s['items'], s['by_status'], s['files'], sdir, s['differs'], s['rewards_missing']))
    for st in rep['stages']:
        if st['status'] != 'imported':
            print('  %s %s (%s): %s %s' % (st['stageId'], st['key'], st.get('name'), st['status'], st.get('why')))
    return 0


if __name__ == '__main__':
    sys.exit(main())
