"""Ids of the event quest enemy rows (Events Part 1, Task 2b; server/make-event-enemies.js), for the name lookups.

Event rows (KHUX_EVENT_ENEMIES switch, default off) must never answer a name -> id lookup of another generator
(«Werewolf» must stay 1612011505's family choice, not the event 11505). Source, as eventIds() of make-event-enemies.js:
the private file (KHUX_EVENT_ENEMIES_FILE, default D:\Progetto_Restauro_KH_UX\private\events\enemies\event_enemies.json),
else server/game_data/event_enemy_ids.json (written by make-enemy-oltre.js; KHUX_EVENT_ENEMY_IDS overrides it).
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
PRIVATE = os.environ.get('KHUX_EVENT_ENEMIES_FILE',
                         r'D:\Progetto_Restauro_KH_UX\private\events\enemies\event_enemies.json')
ID_LIST = os.environ.get('KHUX_EVENT_ENEMY_IDS',
                         os.path.join(os.path.dirname(os.path.dirname(HERE)), 'server', 'game_data', 'event_enemy_ids.json'))


def event_ids(private=PRIVATE, id_list=ID_LIST):
    if private and os.path.exists(private):
        return {int(k) for k in json.load(open(private, encoding='utf-8'))['enemies']}
    if id_list and os.path.exists(id_list):
        return {int(i) for i in json.load(open(id_list, encoding='utf-8')).get('ids', [])}
    return set()


def without_event_rows(rows, ids=None):
    ids = event_ids() if ids is None else ids
    return [e for e in rows if e['enemyId'] not in ids]
