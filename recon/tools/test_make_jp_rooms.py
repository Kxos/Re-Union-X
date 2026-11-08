"""Test of make_jp_rooms.py (Events Part 4, Task 2): the event rooms come from the list written by import_event_stages.py
(event_rooms.json); the rooms of the list are built with --story-only, a room not in the list is not.
    python recon/tools/test_make_jp_rooms.py"""
import json
import os
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.argv = sys.argv[:1]
import make_jp_rooms as mjr  # noqa: E402

errors = []


def check(ok, msg):
    if not ok:
        errors.append(msg)


def room_result(room):
    return {'room': room, 'status': 'completa', 'files_new': 1, 'warnings': []}, {'map/%s/%s_info.bin' % (room, room): 'src'}


with tempfile.TemporaryDirectory() as t:
    p = os.path.join(t, 'event_rooms.json')
    json.dump({'_doc': 'test', 'rooms': ['DB_0025_00_00', 'BC_0004_00_00'], 'by_room': {}}, open(p, 'w'))
    ev = mjr.event_rooms_from_list(p)
    check(set(ev) == {'DB_0025_00_00', 'BC_0004_00_00'}, 'event rooms of the list: %s' % (ev,))
    story = {'TT_0001_00_00'} | set(ev)
    # a room of the list: built with --story-only
    r, todo = mjr.story_only_filter(*room_result('DB_0025_00_00'), story=story, story_only=True, info_served=False)
    check(r['status'] == 'completa' and todo, 'listed room built with --story-only: %s' % r)
    check(r['story'] is True, 'listed room counts as a room to cover')
    # a room not in the list (and no story door): excluded
    r, todo = mjr.story_only_filter(*room_result('OC_0001_02_00'), story=story, story_only=True, info_served=False)
    check(r['status'] == 'esclusa' and not todo, 'unlisted room left out with --story-only: %s' % r)
    # without --story-only every complete room is built
    r, todo = mjr.story_only_filter(*room_result('OC_0001_02_00'), story=story, story_only=False, info_served=False)
    check(r['status'] == 'completa' and todo, 'no --story-only: built')
    # a plain list is accepted too; a bad room name stops the run; a missing list stops the run (never a silent empty list:
    # rooms_gen removes the files of the rooms it does not plan)
    json.dump(['DB_0026_09_00'], open(p, 'w'))
    check(mjr.event_rooms_from_list(p) == ('DB_0026_09_00',), 'plain list')
    json.dump(['../x'], open(p, 'w'))
    try:
        mjr.event_rooms_from_list(p)
        check(False, 'bad room name accepted')
    except SystemExit:
        pass
    try:
        mjr.event_rooms_from_list(os.path.join(t, 'none.json'))
        check(False, 'missing list accepted')
    except SystemExit:
        pass

if errors:
    print('FAIL')
    for e in errors:
        print(' -', e)
    sys.exit(1)
print('OK test_make_jp_rooms')
