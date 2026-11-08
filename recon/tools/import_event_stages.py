"""Original JP 4.3.1 maps of the served event quests (Events Part 1, Task 6), as import_orig_stages.py does for the story.

    python -I recon/tools/import_event_stages.py [--maps F] [--jp D] [--out D] [--master D] [--stage-dir D] [--poi F]

--maps: server/game_data/event_maps.json (make-events.js): one item per candidate event stage (served or held back for its map) {stageId, key, censusId, name,
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
  * rewards: the reward ids of enemies and chests not in the master reward table are listed in `rewards_missing` (the
    client reads that row after /stage/start: missing -> crash). make-events.js writes them from the record's original
    drop rows on the master run, or does not serve the stage (`reward rows missing`).
Enemy swaps (user ruling 06-11; server/event_config.json mapEnemySwaps {mapKey: [{from, to}]}, also read by make-events.js):
in the copy of that map the enemy records with enemyId `from` get `to` (only the id: position, count, level, drop slot and
uid stay; STG [6] target / [10] card id too when they name `from`), never in the JP folder; a swap that finds no record stops
the stage (status skipped). The report lists the patched records under `swapped`.
Output: <out>/stage/ (the imported files, cleared at each run), <out>/stage_poi_events.json (stage_poi.py format, keyed by
the map key: the server's poiStageId reads an event stage's POI by its stageBinId), <out>/report.json.
Other copies (Events Part 4 Task 2): an STG or part the JP copy lacks is taken from another original copy of the same bin,
the WW 2016 bundle (--b2016), byte for byte (`copies` in the stage's report); the WW 2018 global container is known by its
name index only (--index2018) and is listed in `tried`. A stage left out gets `cause` (summary by_cause: STG absent, part N
absent, rooms not served, ...), a missing one `tried` (what each copy holds). --rooms-out: the rooms of every map that could
be read (imported or left out for its rooms), for make_jp_rooms.py (--event-rooms), which then builds them with --story-only.
--stage-dir: also copy the imported files into this folder (the resource staging, stage_gen/files/stage). The POI is not
merged here: make-events.js (master run) reads report.json + stage_poi_events.json, serves only the imported stages whose
reward rows it can write, and merges their POI into server/game_data/stage_poi.json in the same run.
"""
import argparse
import json
import struct
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


def patch_swaps(raw, swaps):
    """raw [STG bytes, part bytes...] -> (new raw, [{part, record, uid, from, to}]); only enemy ids change"""
    to = {int(w['from']): int(w['to']) for w in swaps}
    out, done = [bytearray(raw[0])], []
    stg = mapfile.parse_stg(bytes(raw[0]))
    for off in (24, 40):  # STG [6] target, [10] card enemy
        v = struct.unpack_from('<i', out[0], off)[0]
        if v in to:
            struct.pack_into('<i', out[0], off, to[v])
            done.append({'part': None, 'record': 'STG[%d]' % (off // 4), 'from': v, 'to': to[v]})
    for k, b in enumerate(raw[1:]):
        p = mapfile.parse_map(bytes(b), k)
        nb = bytearray(b)
        base = p['ends']['enemies'] - 0x20 * len(p['enemies'])
        for i, e in enumerate(p['enemies']):
            if e['enemyId'] in to:
                struct.pack_into('<i', nb, base + 0x20 * i + 8, to[e['enemyId']])
                done.append({'part': k, 'record': i, 'uid': e['uid'], 'from': e['enemyId'], 'to': to[e['enemyId']]})
        out.append(nb)
    del stg
    return [bytes(x) for x in out], done


def poi_of(parts):
    """{chests, enemies} of the parts in the stage_poi.py format"""
    out = {'chests': [], 'enemies': []}
    for k, p in enumerate(parts):
        out['enemies'] += [{'uid': e['uid'], 'enemyId': e['enemyId'], 'reward': e['reward'], 'map': k} for e in p['enemies']]
        out['chests'] += [{'uid': c['uid'], 'reward': c['reward'], 'kind': c['kind'], 'map': k} for c in p['chests']]
    return out


def pick_files(key, copies, indexes=None):
    """copies [(label, {(key, part|None): path or bytes})], in order of trust (JP 4.3.1 first): the STG from the first copy
    that has it, then each part it names from the first copy that has it (a part found in another original copy of the same
    bin is used; nothing else is ever put in). indexes {label: set of client names}: copies known by name only (no bytes),
    listed in `tried`. -> (files {(key, part|None): ...}, sources {client name: label}, tried [{copy, stg, parts}])"""
    tried = []
    for label, fs in copies:
        tried.append({'copy': label, 'stg': (key, None) in fs, 'parts': sorted(k[1] for k in fs if k[0] == key and k[1] is not None)})
    for label, names in (indexes or {}).items():
        stg_name = file_names(key, 0)[0]
        parts = sorted(int(n[-6:-4]) for n in names if n.startswith(stg_name[:-4] + '_') and n.endswith('.bin'))
        tried.append({'copy': label, 'stg': stg_name in names, 'parts': parts, 'names_only': True})
    out, src = {}, {}

    def take(k, name):
        for label, fs in copies:
            if k in fs:
                out[k] = fs[k]
                src[name] = label
                return

    take((key, None), file_names(key, 0)[0])
    if (key, None) in out:
        rd = out[(key, None)]
        try:
            n = mapfile.parse_stg(rd if isinstance(rd, (bytes, bytearray)) else open(rd, 'rb').read())['parts']
        except Exception:  # noqa: BLE001  (mapfile.load_stage reports it)
            n = 0
        for k, name in enumerate(file_names(key, n)[1:]):
            take((key, k), name)
    return out, src, tried


def cause_of(why):
    """short cause of a stage left out (report summary by_cause)"""
    m = re.match(r'(STG assente|parte (\d+) assente)', why or '')
    if m:
        return 'part %s absent' % m.group(2) if m.group(2) else 'STG absent'
    for pre, c in (('rooms not served', 'rooms not served'), ('enemies not in the master', 'enemies not in the master'),
                   ('old format', 'old format'), ('incoherent', 'incoherent'), ('enemy swap', 'enemy swap finds no record'),
                   ('map key twice', 'map key twice')):
        if (why or '').startswith(pre):
            return c
    return 'other'


def check_item(item, files, rooms, enemy_ids, reward_ids, swaps=None):
    """-> (result dict, raw [bytes] or None). result: {stageId, key, name, status, why?, parts, rooms, enemies {id: n},
    quest_enemies, differs?, swapped?, rewards_missing, warnings}"""
    key = item['key']
    res = {'stageId': item['stageId'], 'key': key, 'censusId': item.get('censusId'), 'name': item.get('name')}
    rd = lambda x: x if isinstance(x, (bytes, bytearray)) else open(x, 'rb').read()
    try:
        stg, parts = mapfile.load_stage(files, key)
        raw = [rd(files[(key, None)])] + [rd(files[(key, k)]) for k in range(len(parts))]
        if swaps:
            raw, done = patch_swaps(raw, swaps)
            res['swapped'] = done
            stg, parts = mapfile.load_stage({(key, None): raw[0], **{(key, k): b for k, b in enumerate(raw[1:])}}, key)
            unused = sorted({int(w['from']) for w in swaps} - {d['from'] for d in done})
            if unused:
                return dict(res, status='skipped', why='enemy swap finds no record of %s' % unused), None
    except mapfile.FormatError as e:
        have = sorted(k[1] for k in files if k[0] == key and k[1] is not None)
        stg_ok = (key, None) in files
        return dict(res, status='missing', why='%s (STG %s, parts found: %s)' % (e, 'present' if stg_ok else 'absent', have)), None
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
    res['status'] = 'imported'
    res['poi'] = poi_of(parts)
    return res, raw


def run(items, files, rooms, enemy_ids, reward_ids, out, swaps=None, others=None, indexes=None, rooms_out=None):
    """imports every item (swaps: {str(map key): [{from, to}]}); files = the JP 4.3.1 copy; others [(label, files)] = the
    other original copies of the same bins, tried in order for an STG or part the JP copy lacks; indexes {label: names}:
    copies known by name only (reported in `tried`). rooms_out: write the rooms of every map that could be read (imported
    or left out for its rooms) for make_jp_rooms.py. Returns the report {summary, stages}"""
    sdir = os.path.join(out, 'stage')
    shutil.rmtree(sdir, ignore_errors=True)
    os.makedirs(sdir)
    stages, poi, seen, by_room = [], {}, set(), {}
    copies = [('jp431', files)] + list(others or [])
    for it in items:
        if it['key'] in seen:
            stages.append({'stageId': it['stageId'], 'key': it['key'], 'status': 'skipped', 'why': 'map key twice in the list',
                           'cause': 'map key twice'})
            continue
        seen.add(it['key'])
        fk, src, tried = pick_files(it['key'], copies, indexes)
        res, raw = check_item(it, fk, rooms, enemy_ids, reward_ids, (swaps or {}).get(str(it['key'])))
        if any(v != 'jp431' for v in src.values()):
            res['copies'] = {n: v for n, v in sorted(src.items()) if v != 'jp431'}
        if res['status'] != 'imported':
            res['cause'] = cause_of(res.get('why'))
            if res['status'] == 'missing':
                res['tried'] = tried
                res['why'] += '; copies tried: ' + '; '.join('%s STG %s parts %s' % (
                    c['copy'], 'present' if c['stg'] else 'absent', c['parts']) for c in tried)
        for r in res.get('rooms') or []:
            by_room.setdefault(r, [])
            if it['key'] not in by_room[r]:
                by_room[r].append(it['key'])
        if raw:
            for name, b in zip(file_names(it['key'], len(raw) - 1), raw):
                with open(os.path.join(sdir, name), 'wb') as f:
                    f.write(b)
            poi[str(it['key'])] = res.pop('poi')
        stages.append(res)
    with open(os.path.join(out, 'stage_poi_events.json'), 'w', encoding='utf-8') as f:
        json.dump(poi, f, indent=1)
    by, causes = {}, {}
    for s in stages:
        by[s['status']] = by.get(s['status'], 0) + 1
        if s.get('cause'):
            causes[s['cause']] = causes.get(s['cause'], 0) + 1
    if rooms_out:
        os.makedirs(os.path.dirname(os.path.abspath(rooms_out)), exist_ok=True)
        with open(rooms_out, 'w', encoding='utf-8') as f:
            json.dump({'_doc': 'rooms of every event map import_event_stages.py could read (imported or left out for its rooms), '
                               'with the map keys that use them; read by make_jp_rooms.py (--story-only builds them too)',
                       'rooms': sorted(by_room), 'by_room': {r: sorted(k) for r, k in sorted(by_room.items())}}, f, indent=1)
    rep = {'summary': {'items': len(items), 'by_status': by, 'by_cause': causes, 'files': len(os.listdir(sdir)),
                       'copies_used': sorted(s['key'] for s in stages if s.get('copies')),
                       'differs': [s['stageId'] for s in stages if s.get('differs')],
                       'swapped': [s['stageId'] for s in stages if s.get('swapped')],
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
    ap.add_argument('--config', default=os.path.join(REPO, 'server', 'event_config.json'), help='mapEnemySwaps')
    ap.add_argument('--b2016', help='WW 2016 bundle stage/ folder (default: private_tools ref_work bundle2016/files/stage)')
    ap.add_argument('--index2018', help='WW 2018 global container name index (default: ref_work bundle2016/names.tsv; '
                                        'names only, the container is not on disk)')
    ap.add_argument('--rooms-out', default=os.path.join(D, 'tmp', 'events', 'maps', 'event_rooms.json'),
                    help='rooms of the event maps, read by make_jp_rooms.py')
    a = ap.parse_args(argv)
    if not a.jp or not a.b2016 or not a.index2018:
        import private_tools
        a.jp = a.jp or private_tools.local_path('jp_data', 'stage')
        a.b2016 = a.b2016 or private_tools.local_path('ref_work', 'bundle2016', 'files', 'stage')
        a.index2018 = a.index2018 or private_tools.local_path('ref_work', 'bundle2016', 'names.tsv')
    others = [('bundle2016', mapfile.iter_stage_files(a.b2016))] if os.path.isdir(a.b2016) else []
    indexes = {}
    if os.path.exists(a.index2018):
        indexes['ww2018 index'] = {line.split('\t', 1)[0].rsplit('/', 1)[-1] for line in open(a.index2018, encoding='utf-8')
                                   if line.startswith('stage/mappoi_stg')}
    items = json.load(open(a.maps, encoding='utf-8'))
    rows = lambda n: json.load(open(os.path.join(a.master, n + '.json'), encoding='utf-8'))
    rep = run(items, mapfile.iter_stage_files(a.jp), served_rooms(), {r['enemyId'] for r in rows('enemy')},
              {r['rewardId'] for r in rows('reward')}, a.out, json.load(open(a.config, encoding='utf-8')).get('mapEnemySwaps') or {},
              others, indexes, a.rooms_out)
    sdir = os.path.join(a.out, 'stage')
    if a.stage_dir:
        os.makedirs(a.stage_dir, exist_ok=True)
        for f in os.listdir(sdir):
            shutil.copyfile(os.path.join(sdir, f), os.path.join(a.stage_dir, f))
    s = rep['summary']
    print('event stages: %d items, %s, %d files -> %s; enemies swapped: %s; map differs from the quest: %s; reward ids not in the '
          'master (make-events.js writes them from the drops): %s' % (
              s['items'], s['by_status'], s['files'], sdir, s['swapped'], s['differs'], s['rewards_missing']))
    print('left out by cause: %s; parts from another original copy: %s; rooms list: %s' % (
        s['by_cause'], s['copies_used'] or 'none', a.rooms_out))
    for st in rep['stages']:
        if st['status'] != 'imported':
            print('  %s %s (%s): %s %s' % (st['stageId'], st['key'], st.get('name'), st['status'], st.get('why')))
    return 0


if __name__ == '__main__':
    sys.exit(main())
