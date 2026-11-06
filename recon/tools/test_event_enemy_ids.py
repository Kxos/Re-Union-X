"""Test of event_enemy_ids.py (Events Part 1, Task 2b): event rows never answer the name lookups of gen_story_maps.py
and gen_tours_v2.py.   python -I recon/tools/test_event_enemy_ids.py"""
import collections
import json
import os
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import event_enemy_ids as ee  # noqa: E402

errors = []


def check(ok, msg):
    if not ok:
        errors.append(msg)


def enemy_id(enemies, name, target=False):
    """same rule as gen_story_maps.enemy_id (target 1xxxx, others 8xxxx, else the smallest id)."""
    by_name = collections.defaultdict(list)
    for e in enemies:
        by_name[e['name'].lower()].append(e['enemyId'])
    ids = by_name.get(name.lower().strip())
    if not ids:
        return None
    pref = [i for i in ids if (10000 <= i < 20000 if target else 80000 <= i < 90000)]
    return (pref or sorted(ids))[0]


row = lambda i, n: {'enemyId': i, 'name': n}  # noqa: E731
base = [row(11511, 'Ferocious Fins'), row(11512, 'Ferocious Fins'), row(1612011505, 'Werewolf'), row(1541, 'Blizzard Lord'),
        row(10001, 'Shadow'), row(80001, 'Shadow')]
ev = [row(1512, 'Ferocious Fins'), row(11505, 'Werewolf'), row(11541, 'Blizzard Lord'), row(1904010001, 'Shadow')]
with tempfile.TemporaryDirectory() as tmp:
    priv = os.path.join(tmp, 'event_enemies.json')
    lst = os.path.join(tmp, 'ids.json')
    json.dump({'enemies': {str(e['enemyId']): {'row': e} for e in ev}}, open(priv, 'w', encoding='utf-8'))
    json.dump({'ids': [e['enemyId'] for e in ev]}, open(lst, 'w', encoding='utf-8'))
    ids = ee.event_ids(priv, lst)
    check(ids == {1512, 11505, 11541, 1904010001}, 'ids from the private file: %s' % ids)
    check(ee.event_ids(os.path.join(tmp, 'none'), lst) == ids, 'ids from the list without the private file')
    check(ee.event_ids(os.path.join(tmp, 'none'), os.path.join(tmp, 'none')) == set(), 'no source -> empty')
    mixed = ee.without_event_rows(base + ev, ids)
    check(mixed == base, 'without_event_rows keeps exactly the non-event rows')
    for n in ('Ferocious Fins', 'Werewolf', 'Blizzard Lord', 'Shadow'):
        for t in (True, False):
            check(enemy_id(mixed, n, t) == enemy_id(base, n, t), 'gen_story_maps rule %s %s' % (n, t))
    check(enemy_id(base + ev, 'Werewolf', True) != enemy_id(base, 'Werewolf', True), 'fixture meaningful (Werewolf target)')
# the two map generators filter the rows before building their name tables
for f, before in (('gen_story_maps.py', 'by_name = collections.defaultdict(list)'), ('gen_tours_v2.py', 'SHADOW = min(')):
    s = open(os.path.join(HERE, f), encoding='utf-8').read()
    i = s.find('event_enemy_ids.without_event_rows(enemies)')
    check(0 <= i < s.find(before), '%s: event rows not filtered before the name lookup' % f)
if errors:
    print('ERRORS (%d)' % len(errors))
    for e in errors:
        print(' -', e)
    sys.exit(1)
print('OK: test_event_enemy_ids')
