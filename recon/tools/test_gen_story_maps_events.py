"""Test of the "events" config key of gen_story_maps.py (maps of the event quests with no original map, Events Part 5 Task 3).

    python -I recon/tools/test_gen_story_maps_events.py      -> «OK: ...» or «ERRORS (n)», exit 1

Needs the local map data (maps_x, a real MAP template, server/master_data/enemy.json); skipped when missing.
events_list_built: an `events` entry (server/game_data/event_gen_maps.json shape) gives mappoi_stg<stageId>.bin + _00.bin with
the same placement as a `special` entry with the same content (STG and part byte for byte, apart from nothing: the same room,
groups, target and level), so the target is at the farthest point as test_gen_story_maps_special.py checks for the Special maps;
its report entry carries event: true and its census id; the POI is merged. roomCodes: the first code with a collision file is the
room of an event entry.
"""
import json
import os
import shutil
import struct
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
import mapfile  # noqa: E402

try:
    sys.stdout.reconfigure(encoding='utf-8')
except AttributeError:
    pass

CLS = 'D:/Progetto_Restauro_KH_UX/maps_x'
TEMPLATE = 'D:/Progetto_Restauro_KH_UX/stage_gen/files/stage/mappoi_stg01040_00.bin'
ENEMIES = os.path.join(ROOT, 'server', 'master_data', 'enemy.json')
TMP = os.environ.get('KHUX_TMP', 'D:/Progetto_Restauro_KH_UX/tmp')
if not all(os.path.exists(p) for p in (CLS, TEMPLATE, ENEMIES)):
    print('SKIP: local map data missing')
    sys.exit(0)

errors = []


def check(cond, msg):
    if not cond:
        errors.append(msg)


SP, EV, EV2 = 970998, 4009998, 4009997
ROOM = 'Fountain Square'
groups = [[{'name': 'Shadow', 'enemyId': 80001, 'n': 3, 'reward': 1}], [{'name': 'Shadow', 'enemyId': 80001, 'n': 2, 'reward': 1}]]
base = {'world': 1, 'name': 'Test', 'room': ROOM, 'target': 'Shadow', 'targetId': 10001, 'level': 120, 'enemies': groups,
        'treasures': [], 'rooms': 1}
special = dict(base, stageId=SP)
event = dict(base, stageId=EV, roomCodes=[], censusId='EV-TEST')
# roomCodes: a code without a collision file is skipped, the next one is the room
coded_room = sorted(d for d in os.listdir(os.path.join(CLS, 'map')) if d.startswith('BC_'))[0]
event2 = dict(base, stageId=EV2, room='Somewhere Unknown', roomCodes=['XX_9999_99_99', coded_room], censusId='EV-TEST')
os.makedirs(TMP, exist_ok=True)
tmp = tempfile.mkdtemp(prefix='khux_event_maps_', dir=TMP)
try:
    out = os.path.join(tmp, 'stage')
    poi = os.path.join(tmp, 'stage_poi.json')
    json.dump({'1010': {'chests': [], 'enemies': [{'uid': 2, 'enemyId': 1, 'reward': 80001, 'map': 0}]}}, open(poi, 'w'))
    json.dump([special], open(os.path.join(tmp, 'special.json'), 'w'))
    json.dump([event, event2], open(os.path.join(tmp, 'events.json'), 'w'))
    report = os.path.join(tmp, 'report.json')
    cfg = {'rooms': os.path.join(HERE, 'story_rooms.json'), 'template': TEMPLATE, 'cls_dir': CLS, 'enemies': ENEMIES,
           'out': out, 'report': report, 'poi': poi, 'special': os.path.join(tmp, 'special.json'),
           'events': os.path.join(tmp, 'events.json')}
    json.dump(cfg, open(os.path.join(tmp, 'cfg.json'), 'w'))
    r = subprocess.run([sys.executable, '-I', os.path.join(HERE, 'gen_story_maps.py'), os.path.join(tmp, 'cfg.json')],
                       capture_output=True, text=True, encoding='utf-8', errors='replace')
    check(r.returncode == 0, 'generator exit %d: %s' % (r.returncode, r.stderr[-800:]))
    f = lambda sid, part='': os.path.join(out, 'mappoi_stg%d%s.bin' % (sid, part))  # noqa: E731
    for sid in (SP, EV, EV2):
        check(os.path.exists(f(sid)) and os.path.exists(f(sid, '_00')), 'STG and part _00 of %d written' % sid)
        check(not os.path.exists(f(sid, '_01')), 'one part only (%d)' % sid)
    if all(os.path.exists(f(s, p)) for s in (SP, EV) for p in ('', '_00')):
        check(open(f(SP), 'rb').read() == open(f(EV), 'rb').read(), 'STG of the events entry = STG of the special entry')
        check(open(f(SP, '_00'), 'rb').read() == open(f(EV, '_00'), 'rb').read(), 'part of the events entry = part of the special entry')
        h = struct.unpack('<16i', open(f(EV), 'rb').read()[:64])
        check(h[6] == 10001 and h[11] == 120, 'STG target 10001, level 120 (got %d, %d)' % (h[6], h[11]))
        m = mapfile.parse_map(open(f(EV, '_00'), 'rb').read())
        check(len(m['enemies']) == 6 and all(e['level'] == 120 for e in m['enemies']), '5 Shadows + the target at level 120')
        check(m['room'] == 'DB_0000_00_00' or m['room'].startswith('DB_'), 'room of world 1 (%s)' % m['room'])
    if os.path.exists(f(EV2, '_00')):
        check(mapfile.parse_map(open(f(EV2, '_00'), 'rb').read())['room'] == coded_room, 'roomCodes: the first code with a collision file')
    rep = {x['stageId']: x for x in json.load(open(report, encoding='utf-8'))}
    check(rep.get(EV, {}).get('event') is True and rep[EV].get('censusId') == 'EV-TEST' and 'special' not in rep[EV], 'report: event entry')
    check(rep.get(SP, {}).get('special') is True and 'event' not in rep[SP], 'report: special entry unchanged')
    check(rep.get(EV2, {}).get('folder') == coded_room and rep[EV2].get('exact_room') is True, 'report: coded room')
    p = json.load(open(poi, encoding='utf-8'))
    check('1010' in p and str(EV) in p and len(p[str(EV)]['enemies']) == 6, 'POI merged (old entries kept)')
    v = subprocess.run([sys.executable, '-I', os.path.join(HERE, 'validate_maps.py'), out, CLS, '--json', os.path.join(tmp, 'v.json')],
                       capture_output=True, text=True, encoding='utf-8', errors='replace')
    vr = json.load(open(os.path.join(tmp, 'v.json'), encoding='utf-8')) if os.path.exists(os.path.join(tmp, 'v.json')) else {}
    for sid in (EV, EV2):
        check(vr.get(str(sid), {}).get('errors') == [], 'validate_maps %d: no errors (%s)' % (sid, vr.get(str(sid)) or v.stderr[-400:]))
    # layout + targetWith (Task 4 follow-up 2): start and target team at fixed points (here: EV's target spot as the start, EV's
    # start and its first enemy as the target team), one Shadow fighting in the target's team; a layout of another room: error
    if os.path.exists(f(EV, '_00')):
        stg0 = mapfile.parse_stg(open(f(EV), 'rb').read())
        m0 = mapfile.parse_map(open(f(EV, '_00'), 'rb').read())
        tgt = m0['enemies'][-1]
        lay = {'room': m0['room'], 'start': [tgt['x'], tgt['y']], 'groups': [None],
               'target': [list(stg0['start']), [m0['enemies'][0]['x'], m0['enemies'][0]['y']]], 'source': 'test'}
        EV3, EV4 = 4009996, 4009995
        ev3 = dict(base, stageId=EV3, roomCodes=[m0['room']], censusId='EV-TEST', layout=lay,
                   targetWith=[{'name': 'Shadow', 'enemyId': 80001, 'n': 1, 'reward': 1}])
        out3 = os.path.join(tmp, 'stage3')
        json.dump([ev3], open(os.path.join(tmp, 'events3.json'), 'w'))
        cfg3 = dict(cfg, out=out3, report=os.path.join(tmp, 'report3.json'), events=os.path.join(tmp, 'events3.json'))
        cfg3.pop('special')
        json.dump(cfg3, open(os.path.join(tmp, 'cfg3.json'), 'w'))
        r3 = subprocess.run([sys.executable, '-I', os.path.join(HERE, 'gen_story_maps.py'), os.path.join(tmp, 'cfg3.json')],
                            capture_output=True, text=True, encoding='utf-8', errors='replace')
        check(r3.returncode == 0, 'layout run exit %d: %s' % (r3.returncode, r3.stderr[-800:]))
        f3 = lambda part='': os.path.join(out3, 'mappoi_stg%d%s.bin' % (EV3, part))  # noqa: E731
        if os.path.exists(f3('_00')):
            s3 = mapfile.parse_stg(open(f3(), 'rb').read())
            m3 = mapfile.parse_map(open(f3('_00'), 'rb').read())
            check(tuple(s3['start']) == tuple(lay['start']), 'layout start in the STG (%s)' % (s3['start'],))
            check(s3['target_enemy'] == 10001, 'STG target = the target, not its escort (%s)' % s3['target_enemy'])
            last = [e for e in m3['enemies'] if e.get('team') == len(m3['teams']) - 1]
            check([(e['enemyId'], e['x'], e['y']) for e in last] == [(10001, *lay['target'][0]), (80001, *lay['target'][1])],
                  'target team at the layout points, target first then its escort (%s)' % last)
            check(len(m3['enemies']) == 7, '5 Shadows of the groups + 1 escort + the target: %d' % len(m3['enemies']))
            rep3 = json.load(open(os.path.join(tmp, 'report3.json'), encoding='utf-8'))
            check(rep3[0].get('layout') == 'test', 'report: layout source')
            v3 = subprocess.run([sys.executable, '-I', os.path.join(HERE, 'validate_maps.py'), out3, CLS, '--json', os.path.join(tmp, 'v3.json')],
                                capture_output=True, text=True, encoding='utf-8', errors='replace')
            vr3 = json.load(open(os.path.join(tmp, 'v3.json'), encoding='utf-8')) if os.path.exists(os.path.join(tmp, 'v3.json')) else {}
            check(vr3.get(str(EV3), {}).get('errors') == [], 'validate_maps layout map: no errors (%s)' % (vr3.get(str(EV3)) or v3.stderr[-400:]))
        ev4 = dict(ev3, stageId=EV4, layout=dict(lay, room='XX_0000_00_00'))
        json.dump([ev4], open(os.path.join(tmp, 'events3.json'), 'w'))
        r4 = subprocess.run([sys.executable, '-I', os.path.join(HERE, 'gen_story_maps.py'), os.path.join(tmp, 'cfg3.json')],
                            capture_output=True, text=True, encoding='utf-8', errors='replace')
        check(r4.returncode != 0 and 'layout read on room XX_0000_00_00' in r4.stderr, 'layout of another room: error (%s)' % r4.stderr[-300:])
    # multi-area entry (make-events.js genAreasOf): one MAP part per area, chained by forward exits; per-area layout (start of area 0,
    # arrival of the next areas, forward exit, group centres, target team, chests) as in the original maps of the same room
    # (JP 706830: DG_0200_27_00 x3, one enemy per part); an exit closer than 200 to an enemy of its part is moved (validate_maps:
    # error < 96, warning < 200); backExits adds the way back (two rooms, no layout: the generator's rules)
    R27 = 'DG_0200_27_00'
    if os.path.exists(os.path.join(CLS, 'map', R27, R27 + '_cls.bin')):
        B = lambda n: {'name': 'Shadow', 'enemyId': 80001, 'n': n, 'reward': 1}  # noqa: E731
        EVA, EVB = 4009994, 4009993
        eva = dict(base, stageId=EVA, room='Corridor (1)', roomCodes=[R27], censusId='EV-TEST', rooms=3, targetArea=2, backExits=False,
                   layoutSource='test 706830', enemies=[[B(1)], [B(2)]], targetWith=[B(1)], areas=[
                       {'room': 'Corridor (1)', 'roomCodes': [R27], 'enemies': [[B(1)]], 'chests': 1,
                        'layout': {'start': [432, 988], 'exit': [1308, 952], 'groups': [[1296, 1014]], 'chests': [[668, 902]]}},
                       {'room': 'Corridor (2)', 'roomCodes': [R27], 'enemies': [[B(2)]], 'chests': 0,
                        'layout': {'arrive': [475, 978], 'exit': [1500, 980]}},
                       {'room': 'Corridor (3)', 'roomCodes': [R27], 'enemies': [], 'chests': 0,
                        'layout': {'arrive': [445, 988], 'target': [[1270, 1070], [1200, 1100]]}}])
        two = sorted(d for d in os.listdir(os.path.join(CLS, 'map')) if d.startswith('DB_') and d.endswith('_00_00'))[0]
        evb = dict(base, stageId=EVB, room='Room A', roomCodes=[two], censusId='EV-TEST', rooms=2, targetArea=1, backExits=True,
                   layoutSource=None, enemies=[[B(2)], [B(1)]], targetWith=[], areas=[
                       {'room': 'Room A', 'roomCodes': [two], 'enemies': [[B(2)]], 'chests': 1},
                       {'room': 'Room B', 'roomCodes': [R27], 'enemies': [[B(1)]], 'chests': 0}])
        outa = os.path.join(tmp, 'stagea')
        json.dump([eva, evb], open(os.path.join(tmp, 'eventsa.json'), 'w'))
        cfga = dict(cfg, out=outa, report=os.path.join(tmp, 'reporta.json'), events=os.path.join(tmp, 'eventsa.json'))
        cfga.pop('special')
        json.dump(cfga, open(os.path.join(tmp, 'cfga.json'), 'w'))
        ra = subprocess.run([sys.executable, '-I', os.path.join(HERE, 'gen_story_maps.py'), os.path.join(tmp, 'cfga.json')],
                            capture_output=True, text=True, encoding='utf-8', errors='replace')
        check(ra.returncode == 0, 'areas run exit %d: %s' % (ra.returncode, ra.stderr[-800:]))
        fa = lambda sid, part='': os.path.join(outa, 'mappoi_stg%d%s.bin' % (sid, part))  # noqa: E731
        if all(os.path.exists(fa(EVA, p)) for p in ('', '_00', '_01', '_02')):
            s = mapfile.parse_stg(open(fa(EVA), 'rb').read())
            ps = [mapfile.parse_map(open(fa(EVA, '_%02d' % k), 'rb').read(), k) for k in range(3)]
            check((s['parts'], s['start_part'], tuple(s['start']), s['target_enemy'], s['card_level_bonus'], s['field12']) == (3, 0, (432, 988), 10001, 120, 2),
                  'STG: 3 parts, start of area 0 from the layout, target 10001, level 120, target part 2 (%s)' % s)
            check((s['enemies_total'], s['chests_total'], s['teams_total']) == (5, 1, 3), 'STG totals: 5 enemies, 1 chest, 3 teams (%s)' % s)
            check([p['room'] for p in ps] == [R27] * 3, 'one part per area, room of each area')
            check([[(e['dest_part'], e['field4']) for e in p['exits']] for p in ps] == [[(1, 2)], [(2, 1)], []],
                  'forward exits only, field4 = parts left to the target + 1 (as JP 706830): %s' % [p['exits'] for p in ps])
            check((ps[0]['exits'][0]['arrive_x'], ps[0]['exits'][0]['arrive_y']) == (475, 978) and (ps[1]['exits'][0]['arrive_x'], ps[1]['exits'][0]['arrive_y']) == (445, 988),
                  'arrival = the next area\'s layout arrive')
            e0 = ps[0]['enemies'][0]
            check((e0['x'], e0['y']) == (1296, 1014), 'group at the layout centre (%s)' % e0)
            ex = ps[0]['exits'][0]
            check(((ex['x'] - 1296) ** 2 + (ex['y'] - 1014) ** 2) ** 0.5 >= 200, 'exit moved >= 200 from the enemy (%s)' % ex)
            check([(c['x'], c['y']) for c in ps[0]['chests']] == [(668, 902)], 'chest at the layout point')
            last = ps[2]['enemies']
            check([(e['enemyId'], e['x'], e['y'], e['level']) for e in last] == [(10001, 1270, 1070, 120), (80001, 1200, 1100, 120)], 'target team at the layout points (%s)' % last)
            check(ps[2]['teams'][0]['boss'] and not ps[1]['teams'][0]['boss'], 'only the target team is the boss team')
            uids = [x['uid'] for p in ps for x in p['enemies'] + p['chests']] + [t['uid'] for p in ps for t in p['teams']]
            check(len(uids) == len(set(uids)), 'uids unique over the parts')
        if all(os.path.exists(fa(EVB, p)) for p in ('', '_00', '_01')):
            pb = [mapfile.parse_map(open(fa(EVB, '_%02d' % k), 'rb').read(), k) for k in range(2)]
            check([[e['dest_part'] for e in p['exits']] for p in pb] == [[1], [0]], 'backExits: the way back from area 1 (%s)' % [p['exits'] for p in pb])
            check([p['room'] for p in pb] == [two, R27], 'rooms of the two areas')
        repa = {x['stageId']: x for x in json.load(open(os.path.join(tmp, 'reporta.json'), encoding='utf-8'))}
        check(repa.get(EVA, {}).get('parts') == 3 and repa[EVA].get('folders') == [R27] * 3 and repa[EVA].get('event') is True
              and repa[EVA].get('layout') == 'test 706830' and any('exit moved' in d for d in repa[EVA].get('doubts', [])), 'report: parts, folders, layout, exit moved (%s)' % repa.get(EVA))
        pa = json.load(open(poi, encoding='utf-8'))
        check(sorted({x['map'] for x in pa.get(str(EVA), {}).get('enemies', [])}) == [0, 1, 2], 'POI per part')
        va = subprocess.run([sys.executable, '-I', os.path.join(HERE, 'validate_maps.py'), outa, CLS, '--json', os.path.join(tmp, 'va.json')],
                            capture_output=True, text=True, encoding='utf-8', errors='replace')
        vra = json.load(open(os.path.join(tmp, 'va.json'), encoding='utf-8')) if os.path.exists(os.path.join(tmp, 'va.json')) else {}
        for sid in (EVA, EVB):
            check(vra.get(str(sid), {}).get('errors') == [], 'validate_maps areas map %d: no errors (%s)' % (sid, vra.get(str(sid)) or va.stderr[-400:]))
        # a door of an original map at the room's edge (outside the walkable component): snapped to the nearest walkable pixel of the
        # entry's component, noted; facings 0 of the originals -> 1 / 2 (validate_maps)
        edge = dict(eva, stageId=EVB, areas=[dict(eva['areas'][0], layout=dict(eva['areas'][0]['layout'], exit=[1790, 980]))] + [
            dict(eva['areas'][1], layout=dict(eva['areas'][1]['layout'], arriveFacing=0))] + eva['areas'][2:])
        json.dump([edge], open(os.path.join(tmp, 'eventsa.json'), 'w'))
        re_ = subprocess.run([sys.executable, '-I', os.path.join(HERE, 'gen_story_maps.py'), os.path.join(tmp, 'cfga.json')],
                             capture_output=True, text=True, encoding='utf-8', errors='replace')
        check(re_.returncode == 0, 'edge door run exit %d: %s' % (re_.returncode, re_.stderr[-600:]))
        if os.path.exists(fa(EVB, '_00')):
            ee = mapfile.parse_map(open(fa(EVB, '_00'), 'rb').read())['exits'][0]
            check(ee['x'] < 1790 and ee['arrive_facing'] in (1, 2), 'door snapped inside, arrival facing 1/2 (%s)' % ee)
            rep_e = {x['stageId']: x for x in json.load(open(os.path.join(tmp, 'reporta.json'), encoding='utf-8'))}
            check(any('snapped' in d for d in rep_e.get(EVB, {}).get('doubts', [])), 'report: door snapped (%s)' % rep_e.get(EVB))
        # a layout point not reachable from the area's entry: error
        bad = dict(eva, areas=[dict(eva['areas'][0], layout=dict(eva['areas'][0]['layout'], groups=[[5, 5]]))] + eva['areas'][1:])
        json.dump([bad], open(os.path.join(tmp, 'eventsa.json'), 'w'))
        rb = subprocess.run([sys.executable, '-I', os.path.join(HERE, 'gen_story_maps.py'), os.path.join(tmp, 'cfga.json')],
                            capture_output=True, text=True, encoding='utf-8', errors='replace')
        check(rb.returncode != 0 and 'not reachable' in rb.stderr, 'unreachable layout point: error (%s)' % rb.stderr[-300:])
finally:
    shutil.rmtree(tmp, ignore_errors=True)

if errors:
    print('ERRORS (%d)' % len(errors))
    for e in errors:
        print(' -', e)
    sys.exit(1)
print('OK: events_list_built (events entry = special entry byte for byte, target 10001 Lv 120, roomCodes, report event flag, POI merge, validate_maps)')
