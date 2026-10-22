"""Missioni da khuxwiki (wikitesto di wiki_dump.py InfoQuestKHUX) in JSON strutturato.

    python -I recon/tools/wiki_quests.py <quests_raw.json> <quests.json>

Per ogni pagina con InfoQuestKHUX: numero, nome, mondo, stanze, AP, livello, bersaglio,
obiettivi (versione NA) con premio e quantita', jewel del primo completamento, altri
premi di fine missione (campi come copperore=4), tesori ({{TC|codice|stanza}}) e nemici
({{EN|...}}). Stampa il catalogo dei nomi dei premi e dei codici dei tesori: e' la lista
degli oggetti da mappare sui tipi delle tabelle master (server.js, grantItem).
"""
import collections
import json
import re
import sys

sys.stdout.reconfigure(encoding='utf-8')
raw = json.load(open(sys.argv[1], encoding='utf-8'))

INFO = re.compile(r'\{\{InfoQuestKHUX(.*?)\n\}\}', re.S)
PARAM = re.compile(r'^\|\s*([^=|]+?)\s*=(.*)$', re.M)
TC = re.compile(r'\{\{TC\|([^|}]*)\|?([^}]*)\}\}')
EN = re.compile(r'\{\{EN\|([^|}]*)\|(.*?)\|([^|]*)\|([^\n]*)\}\}\s*$', re.M)
COUNT = re.compile(r'\{\{(e|tar)\|([^|}]+)\|(\d+)\}\}')
# campi del template che non sono premi di fine missione
NOT_REWARD = re.compile(r'^(number|nadesc|jpdesc|kana|romaji|world|room\d*|ap|lvl|raid|target\d*|att\d*|'
                        r'(na|jp)(obj|objbonus)\d+(qty)?|(na|jp)jewel|proud.*|archive|image.*|type|event.*|'
                        r'condition|con|key|note.*|notes|ex.*|special.*|boss.*|req.*)$')


def clean(v):
    v = re.sub(r'<br\s*/?>', ' ', v)
    v = re.sub(r'\[\[(?:[^|\]]*\|)?([^\]]*)\]\]', r'\1', v)
    return v.strip()


quests, bonus_names, treasure_codes, reward_fields = {}, collections.Counter(), collections.Counter(), collections.Counter()
for title, text in raw.items():
    if '/' in title:            # es. «Quest 2: Combat 101/Archive», versioni precedenti
        continue
    m = INFO.search(text)
    if not m:
        continue
    p = {k.strip(): clean(v) for k, v in PARAM.findall(m.group(1))}
    q = {
        'title': title, 'number': p.get('number'), 'name': p.get('nadesc'), 'world': p.get('world'),
        'rooms': [p[k] for k in sorted(p) if re.fullmatch(r'room\d+', k)],
        'ap': p.get('ap'), 'lvl': p.get('lvl'), 'target': p.get('target'), 'attribute': p.get('att'),
        'objectives': [], 'jewel': p.get('najewel'), 'rewards': {}, 'treasures': [], 'enemies': [],
    }
    for i in range(1, 4):
        if p.get('naobj%d' % i):
            name = p.get('naobjbonus%d' % i, '')
            q['objectives'].append({'text': p['naobj%d' % i], 'reward': name, 'qty': p.get('naobjbonus%dqty' % i, '1')})
            bonus_names[name] += 1
    for k, v in p.items():
        if not NOT_REWARD.match(k) and re.fullmatch(r'\d+', v or ''):
            q['rewards'][k] = int(v)
            reward_fields[k] += 1
    for code, room in TC.findall(text):
        q['treasures'].append({'code': code.strip(), 'room': room.strip()})
        treasure_codes[code.strip()] += 1
    for name, counts, room, note in EN.findall(text):
        q['enemies'].append({'room': room.strip(), 'note': clean(note),
                             'units': [{'enemy': e, 'count': int(n), 'target': kind == 'tar'} for kind, e, n in COUNT.findall(counts)]})
    quests[title] = q

json.dump(quests, open(sys.argv[2], 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
story = [q for q in quests.values() if re.fullmatch(r'\d+', q['number'] or '') and q['title'].startswith('Quest ')]
print('%d missioni, di cui %d della storia (numero 1..%s)' % (
    len(quests), len(story), max((int(q['number']) for q in story), default=0)))
print('\npremi degli obiettivi (%d nomi):' % len(bonus_names))
print(', '.join('%s %d' % kv for kv in bonus_names.most_common()))
print('\npremi di fine missione (campi, %d):' % len(reward_fields))
print(', '.join('%s %d' % kv for kv in reward_fields.most_common()))
print('\ncodici dei tesori:', ', '.join('%s %d' % kv for kv in treasure_codes.most_common()))
