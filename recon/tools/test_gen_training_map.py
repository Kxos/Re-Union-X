"""Test of the training map of the Special Catalog banner (stage 970000, spec 7): "training": true in the "special"
list of gen_story_maps.py.

    python -I recon/tools/test_gen_training_map.py      -> «OK: ...» or «ERRORS (n)», exit 1

Needs the local map data (maps_x, a real MAP template, server/master_data/enemy.json); skipped when missing.
One training entry in the 1st District (DB_0004_00_00): two paths from the start, path A to the Shadow target arena
(with the normal Shadow groups), path B to the training dummy group with the CP chests before it. Checks (walking
distance on the collision, 8-px cells as test_gen_story_maps_special.py):
- the target and the dummy are in different areas, the dummy area is a normal one (not the target area);
- the start is near the branch point: the shared stretch of the two walks start -> target and start -> dummy
  ((d(S,T) + d(S,D) - d(T,D)) / 2) is under a quarter of the shorter one;
- every chest is closer (walking) to the dummy than to the target, and nearer to the start than the dummy is
  (taken before reaching it); every Shadow is on path A (its walk to the dummy goes back through the start);
- the dummy is close to the start in a straight line (<= 520 units: visible from the start);
- chest records: the given CP reward row, one per entry of "chests"; dummy record: its enemyId and reward 1;
- POI entry with the chests and the dummy; validate_maps.py reports no errors.
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


SID, ROOM_NAME, DUMMY, CP = 970998, '1st District', 970007, 979999
SH = {'name': 'Shadow', 'enemyId': 80001, 'n': 1, 'reward': 1}
entry = {'stageId': SID, 'world': 1, 'name': 'Training Grounds', 'room': ROOM_NAME, 'target': 'Shadow', 'targetId': 10001,
         'targetReward': 1, 'level': 1, 'enemies': [[SH, SH], [SH, SH], [SH, SH]], 'treasures': [], 'rooms': 1,
         'training': True, 'dummy': [{'name': 'Training Dummy', 'enemyId': DUMMY, 'n': 1, 'reward': 1}], 'chests': [CP] * 5}
os.makedirs(TMP, exist_ok=True)
tmp = tempfile.mkdtemp(prefix='khux_training_map_', dir=TMP)
try:
    out = os.path.join(tmp, 'stage')
    poi = os.path.join(tmp, 'stage_poi.json')
    json.dump({}, open(poi, 'w'))
    json.dump([entry], open(os.path.join(tmp, 'special.json'), 'w'))
    cfg = {'rooms': os.path.join(HERE, 'story_rooms.json'), 'template': TEMPLATE, 'cls_dir': CLS, 'enemies': ENEMIES,
           'out': out, 'report': os.path.join(tmp, 'report.json'), 'poi': poi, 'special': os.path.join(tmp, 'special.json')}
    json.dump(cfg, open(os.path.join(tmp, 'cfg.json'), 'w'))
    r = subprocess.run([sys.executable, '-I', os.path.join(HERE, 'gen_story_maps.py'), os.path.join(tmp, 'cfg.json')],
                       capture_output=True, text=True, encoding='utf-8', errors='replace')
    check(r.returncode == 0, 'generator exit %d: %s' % (r.returncode, r.stderr[-800:]))
    stg_p = os.path.join(out, 'mappoi_stg%d.bin' % SID)
    part_p = os.path.join(out, 'mappoi_stg%d_00.bin' % SID)
    check(os.path.exists(stg_p) and os.path.exists(part_p), 'STG and part _00 written')
    if os.path.exists(stg_p) and os.path.exists(part_p):
        h = struct.unpack('<16i', open(stg_p, 'rb').read()[:64])
        m = mapfile.parse_map(open(part_p, 'rb').read())
        ens, teams, chests = m['enemies'], m['teams'], m['chests']
        check(m['room'] == 'DB_0004_00_00', 'room 1st District (got %s)' % m['room'])
        check(h[2] == 1 and h[6] == 10001 and h[8] == len(teams) and h[9] == len(ens) and h[14] == len(chests),
              'STG: 1 part, target 10001, totals (got %s)' % (h[:16],))
        tg = [t for t in teams if t['flags'] & 1]
        check(len(tg) == 1 and tg[0]['count'] == 1 and ens[tg[0]['first']]['enemyId'] == 10001, 'one target area, the target alone')
        dteam = [t for t in teams if any(e['enemyId'] == DUMMY for e in ens[t['first']:t['first'] + t['count']])]
        check(len(dteam) == 1 and not dteam[0]['flags'] & 1 and dteam[0]['count'] == 1, 'dummy alone in a normal area (not the target one)')
        check(len(teams) == 5 and len(ens) == 8, '3 Shadow groups + dummy + target (got %d areas, %d enemies)' % (len(teams), len(ens)))
        dum = [e for e in ens if e['enemyId'] == DUMMY]
        check(len(dum) == 1 and dum[0]['reward'] == 1, 'dummy record: reward row 1')
        check(not any(e['reward'] == 0 for e in ens), 'no enemy record with reward 0')
        check(all(e['level'] == 1 for e in ens), 'level 1 on every enemy record')
        check(len(chests) == 5 and all(c['reward'] == CP for c in chests), 'five chests on the CP row (got %s)' % [c['reward'] for c in chests])
        uids = [t['uid'] for t in teams] + [e['uid'] for e in ens] + [c['uid'] for c in chests]
        check(len(set(uids)) == len(uids), 'uids unique')
        # walking distances (free pixels with > 16 of room, 8-px cells)
        import numpy as np
        from scipy import ndimage
        from scipy.sparse import csgraph, coo_matrix
        room = m['room']
        cls = open(os.path.join(CLS, 'map', room, room + '_cls.bin'), 'rb').read()
        W, H, stride = struct.unpack_from('<3i', cls, 4)
        free = np.unpackbits(np.frombuffer(cls, np.uint8, stride * H, 16).reshape(H, stride), axis=1)[:, :W] == 0
        free = ndimage.distance_transform_edt(free) > 16
        F = 8
        Hc, Wc = -(-H // F), -(-W // F)
        pad = np.zeros((Hc * F, Wc * F), bool)
        pad[:H, :W] = free
        cell = pad.reshape(Hc, F, Wc, F).any(axis=(1, 3))
        idx = -np.ones(cell.shape, np.int64)
        idx[cell] = np.arange(int(cell.sum()))
        rows, cols = [], []
        for dy, dx in ((0, 1), (1, 0)):
            a = idx[:Hc - dy, :Wc - dx]
            b = idx[dy:, dx:]
            k = (a >= 0) & (b >= 0)
            rows.append(a[k])
            cols.append(b[k])
        n = int(cell.sum())
        g = coo_matrix((np.ones(sum(len(x) for x in rows)), (np.concatenate(rows), np.concatenate(cols))), shape=(n, n)).tocsr()

        def node(x, y):
            y0, x0 = max(0, y // F - 6), max(0, x // F - 6)
            ys, xs = np.nonzero(idx[y0:y // F + 7, x0:x // F + 7] >= 0)
            k = int(np.argmin((xs + x0 - x // F) ** 2 + (ys + y0 - y // F) ** 2))
            return int(idx[ys[k] + y0, xs[k] + x0])
        S = (h[3], h[4])
        T = [(e['x'], e['y']) for e in ens if e['enemyId'] == 10001][0]
        D = (dum[0]['x'], dum[0]['y']) if dum else T
        dS, dT, dD = (csgraph.shortest_path(g, directed=False, unweighted=True, indices=node(*p)) for p in (S, T, D))
        sT, sD, tD = dS[node(*T)], dS[node(*D)], dT[node(*D)]
        check(all(np.isfinite(v) for v in (sT, sD, tD)), 'start, target and dummy reachable on the collision')
        shared = (sT + sD - tD) / 2
        check(shared < 0.25 * min(sT, sD), 'start at the branch point (shared walk %.0f cells, start->target %.0f, start->dummy %.0f)' % (shared, sT, sD))
        for c in chests:
            v = node(c['x'], c['y'])
            check(dD[v] < dT[v] and dS[v] < sD, 'chest %s on path B before the dummy (to dummy %.0f, to target %.0f, from start %.0f/%.0f)'
                  % ((c['x'], c['y']), dD[v], dT[v], dS[v], sD))
        # a Shadow is on path A when the walk from it to the dummy goes back through the start (shares little with
        # the walk start -> dummy) and the walk to the target does not
        for e in ens:
            if e['enemyId'] not in (DUMMY, 10001):
                v = node(e['x'], e['y'])
                via_s = (dS[v] + sD - dD[v]) / 2
                check(via_s < 0.25 * min(dS[v], sD) and dT[v] < dS[v] + sT,
                      'Shadow %s on path A (shared with path B %.0f cells)' % ((e['x'], e['y']), via_s))
        air = ((S[0] - D[0]) ** 2 + (S[1] - D[1]) ** 2) ** 0.5
        check(air <= 520, 'dummy visible from the start (%.0f units)' % air)
    p = json.load(open(poi, encoding='utf-8'))
    pe = p.get(str(SID), {})
    check(len(pe.get('chests', [])) == 5 and all(c['reward'] == CP for c in pe['chests']), 'POI: the five CP chests')
    check(any(e['enemyId'] == DUMMY and e['reward'] == 1 for e in pe.get('enemies', [])), 'POI: the dummy')
    v = subprocess.run([sys.executable, '-I', os.path.join(HERE, 'validate_maps.py'), out, CLS, '--json', os.path.join(tmp, 'v.json')],
                       capture_output=True, text=True, encoding='utf-8', errors='replace')
    vr = json.load(open(os.path.join(tmp, 'v.json'), encoding='utf-8')) if os.path.exists(os.path.join(tmp, 'v.json')) else {}
    check(v.returncode == 0 and vr.get(str(SID), {}).get('errors') == [], 'validate_maps: no errors (%s)' % (vr.get(str(SID)) or v.stderr[-400:]))
finally:
    shutil.rmtree(tmp, ignore_errors=True)

if errors:
    print('ERRORS (%d)' % len(errors))
    for e in errors:
        print(' -', e)
    sys.exit(1)
print('OK: training map %d (two paths, dummy area, CP chests on path B, validate_maps)' % SID)
