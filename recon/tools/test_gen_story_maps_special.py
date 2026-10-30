"""Test of the "special" config key of gen_story_maps.py (maps of the Special quests, 970000-979999).

    python -I recon/tools/test_gen_story_maps_special.py      -> «OK: ...» or «ERRORS (n)», exit 1

Needs the local map data (maps_x, a real MAP template, server/master_data/enemy.json); skipped when missing.
One special entry in Fountain Square: checks the STG and the part exist, the target is the first enemy of the
only target area and the farthest enemy from the start (walking distance on the collision), the drop carrier keeps
its reward row and the level (STG [11] and every enemy record), every member keeps its own reward and the target takes targetReward, the POI file is merged (old entries kept), validate_maps.py reports no errors.
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


SID, ROOM_NAME = 970999, 'Fountain Square'
G = lambda carrier=None: ([{'name': 'Shadow', 'enemyId': 80001, 'n': 1, 'reward': 970123}, {'name': 'Shadow', 'enemyId': 80001, 'n': 1, 'reward': 1}]  # noqa: E731
                          + ([carrier] if carrier else []))
entry = {'stageId': SID, 'world': 1, 'name': 'Test Special', 'room': ROOM_NAME, 'target': 'Shadow', 'targetId': 10001,
         'level': 30, 'enemies': [G({'name': 'Prize Egg', 'enemyId': 1006, 'n': 1, 'reward': 970123}), G(), G()],
         'treasures': [], 'rooms': 1, 'targetReward': 970124}
os.makedirs(TMP, exist_ok=True)
tmp = tempfile.mkdtemp(prefix='khux_special_maps_', dir=TMP)
try:
    out = os.path.join(tmp, 'stage')
    poi = os.path.join(tmp, 'stage_poi.json')
    json.dump({'1010': {'chests': [], 'enemies': [{'uid': 2, 'enemyId': 1, 'reward': 80001, 'map': 0}]}}, open(poi, 'w'))
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
    check(not os.path.exists(os.path.join(out, 'mappoi_stg%d_01.bin' % SID)), 'one part only')
    if os.path.exists(stg_p) and os.path.exists(part_p):
        h = struct.unpack('<16i', open(stg_p, 'rb').read()[:64])
        check(h[2] == 1 and h[6] == 10001, 'STG: 1 part, target 10001 (got %d, %d)' % (h[2], h[6]))
        # the quest level the client shows (quest card «LV») and applies to the enemies is STG [11] (+0x2c), as in every
        # story stage (import_orig_stages.py: [11] = wiki Lv = enemy record level); [11] 1 showed LV 1 (MOG bench 30-10)
        check(h[11] == 30 and mapfile.parse_stg(open(stg_p, 'rb').read())['card_level_bonus'] == 30,
              'STG [11] = quest level 30 (got %d)' % h[11])
        m = mapfile.parse_map(open(part_p, 'rb').read())
        ens = m['enemies']
        check(len(ens) == 3 * 2 + 1 + 1, '8 enemies (got %d)' % len(ens))
        check(sum(e['enemyId'] == 10001 for e in ens) == 1, 'the target once')
        check(all(e['level'] == 30 for e in ens), 'level 30 on every enemy record')
        car = [e for e in ens if e['reward'] == 970123]
        check(len(car) == 4 and sum(e['enemyId'] == 1006 for e in car) == 1, 'drop carrier Prize Egg + 3 Shadows with reward 970123')
        check(sum(e['reward'] == 1 for e in ens) == 3, 'members keep their own reward (row 1 = no-drop entry)')
        check([e['reward'] for e in ens if e['enemyId'] == 10001] == [970124], 'target carries targetReward 970124')
        check(not any(e['reward'] == 0 for e in ens), 'no enemy record with reward 0')
        # target in the farthest area: walking distance (free pixels with > 16 of room, 8-px cells) start -> enemy
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
            ys, xs = np.nonzero(idx[max(0, y // F - 6):y // F + 7, max(0, x // F - 6):x // F + 7] >= 0)
            k = int(np.argmin((xs + max(0, x // F - 6) - x // F) ** 2 + (ys + max(0, y // F - 6) - y // F) ** 2))
            return int(idx[ys[k] + max(0, y // F - 6), xs[k] + max(0, x // F - 6)])
        dist = csgraph.shortest_path(g, directed=False, unweighted=True, indices=node(h[3], h[4]))
        dt = dist[node(*[(e['x'], e['y']) for e in ens if e['enemyId'] == 10001][0])]
        others = [dist[node(e['x'], e['y'])] for e in ens if e['enemyId'] != 10001]
        check(np.isfinite(dt) and all(dt >= d for d in others), 'target farthest from the start (%s vs %s)' % (dt, max(others)))
        tg = [t for t in m['teams'] if t['flags'] & 1]
        check(len(m['teams']) == 4 and len(tg) == 1 and tg[0]['count'] == 1 and ens[tg[0]['first']]['enemyId'] == 10001,
              '3 groups + one target area, its only enemy = the target')
    p = json.load(open(poi, encoding='utf-8'))
    check('1010' in p, 'POI: old entries kept')
    pe = p.get(str(SID), {}).get('enemies', [])
    check(len(pe) == 8 and any(e['reward'] == 970123 and e['enemyId'] == 1006 for e in pe) and any(e['reward'] == 970124 for e in pe), 'POI: special entry with the drop rows')
    v = subprocess.run([sys.executable, '-I', os.path.join(HERE, 'validate_maps.py'), out, CLS, '--json', os.path.join(tmp, 'v.json')],
                       capture_output=True, text=True, encoding='utf-8', errors='replace')
    vr = json.load(open(os.path.join(tmp, 'v.json'), encoding='utf-8')) if os.path.exists(os.path.join(tmp, 'v.json')) else {}
    check(v.returncode == 0 and vr.get(str(SID), {}).get('errors') == [], 'validate_maps: no errors (%s)' % (vr.get(str(SID)) or v.stderr[-400:]))
finally:
    shutil.rmtree(tmp, ignore_errors=True)

# final review: a member or target with reward row 0 (no row: the client crashes after /stage/start) stops the generator
for bad, what in (({**entry, 'enemies': [[{'name': 'Shadow', 'enemyId': 80001, 'n': 1, 'reward': 0}]]}, 'member'),
                  ({**entry, 'targetReward': 0}, 'target')):
    tmp = tempfile.mkdtemp(prefix='khux_special_maps_', dir=TMP)
    try:
        json.dump({}, open(os.path.join(tmp, 'stage_poi.json'), 'w'))
        json.dump([bad], open(os.path.join(tmp, 'special.json'), 'w'))
        cfg = {'rooms': os.path.join(HERE, 'story_rooms.json'), 'template': TEMPLATE, 'cls_dir': CLS, 'enemies': ENEMIES,
               'out': os.path.join(tmp, 'stage'), 'report': os.path.join(tmp, 'report.json'),
               'poi': os.path.join(tmp, 'stage_poi.json'), 'special': os.path.join(tmp, 'special.json')}
        json.dump(cfg, open(os.path.join(tmp, 'cfg.json'), 'w'))
        r = subprocess.run([sys.executable, '-I', os.path.join(HERE, 'gen_story_maps.py'), os.path.join(tmp, 'cfg.json')],
                           capture_output=True, text=True, encoding='utf-8', errors='replace')
        check(r.returncode != 0 and 'AssertionError' in r.stderr and 'reward' in r.stderr,
              '%s with reward 0: generator exit %d (%s)' % (what, r.returncode, r.stderr[-300:]))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

# real entries of make-special.js (server/game_data/special_maps.json): the MOG quest 970100 (catalogue Lv 160) resolves
# to Lv 160 on the card (STG [11]) and on every enemy record; the training quest stays at Lv 1 (Shadow target, dummy)
REAL = os.path.join(ROOT, 'server', 'game_data', 'special_maps.json')
if os.path.exists(REAL):
    real = {e['stageId']: e for e in json.load(open(REAL, encoding='utf-8'))}
    tmp = tempfile.mkdtemp(prefix='khux_special_maps_', dir=TMP)
    try:
        json.dump({}, open(os.path.join(tmp, 'stage_poi.json'), 'w'))
        json.dump([real[970100], real[970000]], open(os.path.join(tmp, 'special.json'), 'w'))
        cfg = {'rooms': os.path.join(HERE, 'story_rooms.json'), 'template': TEMPLATE, 'cls_dir': CLS, 'enemies': ENEMIES,
               'out': os.path.join(tmp, 'stage'), 'report': os.path.join(tmp, 'report.json'),
               'poi': os.path.join(tmp, 'stage_poi.json'), 'special': os.path.join(tmp, 'special.json')}
        json.dump(cfg, open(os.path.join(tmp, 'cfg.json'), 'w'))
        r = subprocess.run([sys.executable, '-I', os.path.join(HERE, 'gen_story_maps.py'), os.path.join(tmp, 'cfg.json')],
                           capture_output=True, text=True, encoding='utf-8', errors='replace')
        check(r.returncode == 0, 'real entries: generator exit %d: %s' % (r.returncode, r.stderr[-500:]))
        for sid, lv in ((970100, 160), (970000, 1)):
            d = os.path.join(tmp, 'stage', 'mappoi_stg%d' % sid)
            if not os.path.exists(d + '.bin'):
                continue
            card = mapfile.parse_stg(open(d + '.bin', 'rb').read())['card_level_bonus']
            lvs = {e['level'] for e in mapfile.parse_map(open(d + '_00.bin', 'rb').read())['enemies']}
            check(real[sid]['level'] == lv and card == lv and lvs == {lv},
                  '%d: catalogue Lv %d -> STG [11] %d, enemy records %s' % (sid, real[sid]['level'], card, sorted(lvs)))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

if errors:
    print('ERRORS (%d)' % len(errors))
    for e in errors:
        print(' -', e)
    sys.exit(1)
print('OK: special map %d (STG [11] level, MOG 970100 Lv 160, training Lv 1, part, farthest target, drop carrier, POI merge, validate_maps, reward 0 rejected)' % SID)
