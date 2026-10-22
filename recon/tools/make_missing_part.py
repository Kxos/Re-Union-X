"""Parte 1 ricostruita delle missioni 617 (stage 20320) e 661 (stage 23010) (I-009, decisione dell'utente 20-10).

    python -I recon/tools/make_missing_part.py [--out <cartella>]     (default: stampa soltanto)

Nei dati JP 4.3.1 l'STG di 20320 e 23010 dichiara 2 parti, ma il file della parte 1 non c'e' (in nessuna
revisione; il pacchetto 2016 si ferma alla 555 e il 1.1.3 non ha file di stage). Decisione dell'utente: si
ricostruisce SOLO la parte 1, nella stanza della porta originale (617: CD_0003_00_00 «The Chateau: Stairs B»;
661: DB_0004_01_00 «2nd District», porta usata da 1-525); STG e parte 0 restano i file JP byte per byte.
I totali dell'STG (squadre [8], nemici [9], forzieri [14], materiali [15]) meno la parte 0 danno esattamente cosa
manca, e coincidono con la pagina wiki della missione (stanza della parte 1): 617 = 3 squadre / 14 nemici /
1 forziere / 10 materiali, 661 = 6 / 21 / 2 / 8. Quindi la parte si costruisce senza toccare l'STG:
  * nemici: le squadre della wiki per quella stanza (wiki\\quests.json, una voce = una squadra, nell'ordine della
    pagina); enemyId per nome (master enemy + enemy_dec + nomi imparati di oltre525.json; attributo |p |s |m della
    wiki se c'e') = quello usato dallo stage piu' vicino (per stageId) dello stesso mondo; il capo della squadra
    «Target enemy» e' il bersaglio dell'STG [6] (617: 11504 Poison Pot, 661: 10126 Gummi Hammer), squadra con il bit 0
    di [4] (capo) come nelle parti originali; livello e campi f3/f4 dei nemici della parte 0;
  * geometria della stanza (posizioni di squadre, nemici, forzieri, materiali): dalle parti JP nella stessa stanza,
    a partire dallo stage piu' vicino (per stageId) che la usa; ogni squadra prende una squadra originale con
    almeno altrettanti nemici (verso, poligono, campi f2/f3/f6/f7 e premio del capo compresi), lontana dalle
    squadre gia' prese e dal punto di arrivo; i premi degli altri nemici sono 1 come negli originali;
  * partenza = arrivo dell'uscita originale della parte 0 (gia' nel file JP); uscita verso la parte 0 = record
    dell'uscita originale dello stage piu' vicino che va da questa stanza alla stanza della parte 0 (617: 20170
    parte 1 = porta CD_0003_00_00>CD_0003_01_00 di oltre525.json; 661: 8110 parte 1, la porta 1-525
    DB_0004_01_00 -> DB_0000_00_00), con dest_part 0;
  * forzieri: codice della wiki (a<n> = premio 79+n, CP; h<n> = 89+n, HP; i<n> = 20x(n-1), oggetto) -> premio e
    aspetto del forziere piu' vicino (per stageId) dello stesso mondo con quel premio;
  * materiali: posizioni dalle stesse parti originali, materialId quelli della parte 0 a giro, quantita' 1;
  * uid: dopo la piu' alta della parte 0 (squadra, poi i suoi nemici; poi i forzieri), come gli originali.
Intestazione MAP = quella della parte 0 dello stesso stage (versione, [8], meteo) con stanza e offset nuovi.
Deviazione dall'originale: va nelle Notices (Task 5).
"""
import argparse
import json
import os
import re
import struct
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mapfile  # noqa: E402

D = r'D:\Progetto_Restauro_KH_UX'
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import private_tools  # noqa: E402  (local reference data folders, see private_tools.py)
JP_STAGE = private_tools.local_path('jp_data', 'stage')
OLTRE = os.path.join(D, 'reference', 'world_schema', 'oltre525', 'oltre525.json')
WIKI = os.path.join(D, 'wiki', 'quests.json')
STORY_MAX = 40000           # stage di storia (< 40000; eventi 6xxxx-7xxxxx solo se nella storia non basta)

# stanza della parte 1 (decisione dell'utente) e nome della stanza nella pagina wiki
SPEC = {
    20320: {'q': 617, 'room': 'CD_0003_00_00', 'wiki_room': 'The Chateau: Stairs B'},
    23010: {'q': 661, 'room': 'DB_0004_01_00', 'wiki_room': '2nd District'},
}
ATTR = {'p': 1, 's': 2, 'm': 3}
MIN_TEAM_GAP, MIN_ARRIVE_GAP, MIN_CHEST_GAP, MIN_MAT_GAP = 350, 400, 200, 60


def jload(p, dflt=None):
    try:
        return json.load(open(p, encoding='utf-8'))
    except FileNotFoundError:
        return dflt


class Index:
    """Tutte le parti JP (revisione piu' alta) lette una volta: {(sid, k): parte}."""

    def __init__(self, stage_dir=JP_STAGE):
        self.files = mapfile.iter_stage_files(stage_dir)
        self.parts = {}
        for key, p in self.files.items():
            if key[1] is None:
                continue
            try:
                self.parts[key] = mapfile.parse_map(open(p, 'rb').read(), key[1])
            except mapfile.FormatError:
                pass

    def near(self, sid, pred):
        """parti che soddisfano pred, prima quelle di storia, per distanza di stageId."""
        keys = [k for k, p in self.parts.items() if pred(k, p)]
        return sorted(keys, key=lambda k: (k[0] >= STORY_MAX, abs(k[0] - sid), k))


def enemy_names():
    """{enemyId: (nome, attributo|None)}: master del repo, poi enemy_dec, poi nomi imparati di oltre525.json."""
    names = {}
    for r in jload(os.path.join(D, 'external', 'thethiny', 'enemy_dec.json'), []):
        names[r['enemyId']] = (r.get('name') or '', r.get('attribute'))
    for r in jload(os.path.join(REPO, 'server', 'master_data', 'enemy.json'), []):
        names[r['enemyId']] = (r.get('name') or '', r.get('attribute'))
    for k, v in (jload(OLTRE, {}).get('learned_enemy_names') or {}).items():
        names.setdefault(int(k), (v, None))
    return names


def wiki_teams(quest, room):
    """voci «enemies» della pagina wiki per una stanza -> [{members: [(nome, n, attr)], target, notes}].
    Forma (wiki_quests.py): room = primo nome, note = «n[|attr]}} {{e|Nome|n[|attr]}} ...|stanza|note»."""
    out = []
    for e in quest.get('enemies', []):
        if '}}' not in e['note']:
            continue
        head, rest = e['note'].split('}}', 1)
        tail = re.sub(r'\s*\{\{e\|[^}]*\}\}', '', rest).lstrip('|').split('|')
        if tail[0] != room:
            continue
        first = head.split('|')
        members = [(e['room'], int(first[0]), ATTR.get(first[1]) if len(first) > 1 else None)]
        for m in re.finditer(r'\{\{e\|([^|}]+)\|(\d+)(?:\|([psm]))?', rest):
            members.append((m.group(1), int(m.group(2)), ATTR.get(m.group(3))))
        notes = '|'.join(tail[1:])
        out.append({'members': members, 'target': 'Target enemy' in notes, 'notes': notes})
    return out


def chest_pred(code):
    letter, n = code[0], int(code[1:])
    if letter == 'a':
        return lambda r: r == 79 + n
    if letter == 'h':
        return lambda r: r == 89 + n
    if letter == 'i':
        return lambda r: 2000 <= r < 2100 and r % 10 == n - 1
    raise ValueError('codice di forziere sconosciuto %r' % code)


def dist(a, b):
    return ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2) ** 0.5


def pack_map(header, room, exits, teams, enemies, chests, materials):
    """intestazione 0x34 (dalla parte 0) + sezioni contigue nell'ordine del client 4.3.1 (vedi mapfile.py)."""
    secs = [struct.pack('<i', len(exits)) + b''.join(struct.pack('<9i', *[e[f] for f in mapfile.EXIT_FIELDS]) for e in exits)]
    tb = b''.join(struct.pack('<17i', t['first'], t['count'], t['f2'], t['f3'], t['flags'], t['uid'], t['f6'], t['f7'],
                              t['facing'], *[c for pt in t['polygon'] for c in pt]) for t in teams)
    eb = b''.join(struct.pack('<8i', e['x'], e['y'], e['enemyId'], e['f3'], e['f4'], e['level'], e['reward'], e['uid'])
                  for e in enemies)
    secs.append(struct.pack('<2i', len(teams), len(enemies)) + tb + eb)
    secs.append(struct.pack('<i', len(chests)) + b''.join(
        struct.pack('<5i', c['x'], c['y'], c['reward'], c['kind'], c['uid']) for c in chests))
    secs.append(struct.pack('<i', len(materials)) + b''.join(
        struct.pack('<4i', m['x'], m['y'], m['materialId'], m['quantity']) for m in materials))
    secs.append(struct.pack('<i', 0))                                          # npc
    h = bytearray(header[:0x34])
    h[0x0c:0x1c] = room.encode('ascii').ljust(16, b'\0')
    off = 0
    for i, s in enumerate(secs):
        struct.pack_into('<i', h, 0x20 + 4 * i, off)
        off += len(s)
    return bytes(h) + b''.join(secs)


def build(sid, idx=None, names=None, oltre=None, wiki=None):
    """-> (bytes della parte 1, info) per uno stage di SPEC."""
    spec = SPEC[sid]
    idx = idx or Index()
    names = names if names is not None else enemy_names()
    oltre = oltre or jload(OLTRE)
    wiki = wiki or jload(WIKI)
    quest = next(v for v in wiki.values() if str(v.get('number')) == str(spec['q']))
    room, world = spec['room'], spec['room'][:2]
    stg_raw = open(idx.files[(sid, None)], 'rb').read()
    stg = mapfile.parse_stg(stg_raw)
    p0_raw = open(idx.files[(sid, 0)], 'rb').read()
    p0 = mapfile.parse_map(p0_raw, 0)
    if stg['parts'] != 2 or (sid, 1) in idx.files:
        raise ValueError('%d: non e\' uno stage con la parte 1 mancante' % sid)
    need = {'teams': stg['teams_total'] - len(p0['teams']),
            'enemies': stg['enemies_total'] - sum(t['count'] for t in p0['teams']),
            'chests': stg['chests_total'] - len(p0['chests']),
            'materials': stg['materials_total'] - len(p0['materials'])}
    teams_w = wiki_teams(quest, spec['wiki_room'])
    chests_w = [t['code'] for t in quest.get('treasures', []) if t['room'] == spec['wiki_room']]
    if (len(teams_w), sum(n for t in teams_w for _, n, _ in t['members']), len(chests_w)) != (
            need['teams'], need['enemies'], need['chests']):
        raise ValueError('%d: wiki (%d squadre, %d nemici, %d forzieri) diversa dai totali STG - parte 0 %s' % (
            sid, len(teams_w), sum(n for t in teams_w for _, n, _ in t['members']), len(chests_w), need))
    exit0 = [e for e in p0['exits'] if e['dest_part'] == 1]
    arrive = (exit0[0]['arrive_x'], exit0[0]['arrive_y'])
    notes = []

    # uscita di ritorno: record originale dello stage piu' vicino da `room` alla stanza della parte 0
    def back_exit(k, p):
        return p['room'] == room and any(
            idx.parts.get((k[0], e.get('dest_part')), {}).get('room') == p0['room'] for e in p['exits'])
    src = idx.near(sid, back_exit)[0]
    ex = dict(next(e for e in idx.parts[src]['exits'] if idx.parts[(src[0], e['dest_part'])]['room'] == p0['room']))
    ex['dest_part'] = 0
    notes.append('uscita da %d parte %d' % src)

    # enemyId per nome: lo stage piu' vicino dello stesso mondo che lo usa
    def pick(name, attr):
        cands = {i for i, (n, a) in names.items() if n.lower() == name.lower() and (attr is None or a in (None, attr))}
        if not cands:
            raise ValueError('%d: nemico «%s» senza enemyId' % (sid, name))
        for w in (world, None):
            for k in idx.near(sid, lambda k, p: (w is None or p['room'][:2] == w)
                              and any(e['enemyId'] in cands for e in p['enemies'])):
                used = [e['enemyId'] for e in idx.parts[k]['enemies'] if e['enemyId'] in cands]
                return used[0], 'stage %d' % k[0]
        return min(cands), 'nessuno stage: id piu\' piccolo'

    tpl_parts = idx.near(sid, lambda k, p: p['room'] == room)
    base = p0['enemies'][0]
    uid = max([e['uid'] for e in p0['enemies']] + [c['uid'] for c in p0['chests']] + [t['uid'] for t in p0['teams']])
    teams, enemies, taken = [], [], []
    # il capo bersaglio sceglie per primo il posto, le altre nell'ordine della wiki
    order = sorted(range(len(teams_w)), key=lambda i: not teams_w[i]['target'])
    built = {}
    for i in order:
        tw = teams_w[i]
        ids = []
        for name, n, attr in tw['members']:
            eid, why = (stg['target_enemy'], 'bersaglio STG [6]') if tw['target'] and not ids else pick(name, attr)
            notes.append('%s -> %d (%s)' % (name, eid, why))
            ids += [eid] * n
        tpl = None
        for k in tpl_parts:
            p = idx.parts[k]
            for t in p['teams']:
                if t['count'] < len(ids) or t['flags'] & 0x20:
                    continue
                lead = p['enemies'][t['first']]
                pos = (lead['x'], lead['y'])
                if dist(pos, arrive) < MIN_ARRIVE_GAP or any(dist(pos, q) < MIN_TEAM_GAP for q in taken):
                    continue
                tpl = (k, t, p['enemies'][t['first']:t['first'] + len(ids)])
                break
            if tpl:
                break
        if not tpl:
            raise ValueError('%d: nessuna squadra originale in %s per %d nemici' % (sid, room, len(ids)))
        k, t, ens = tpl
        taken.append((ens[0]['x'], ens[0]['y']))
        lead_reward = ens[0]['reward'] if 12000 <= ens[0]['reward'] < 12077 else 12010
        built[i] = (t, ens, ids, lead_reward, k)
        notes.append('squadra %d (%s): posizioni dalla squadra uid %d di %d parte %d' % (
            i, '+'.join('%s x%d' % (m[0], m[1]) for m in tw['members']), t['uid'], k[0], k[1]))
    for i in range(len(teams_w)):                       # file nell'ordine della wiki
        t, ens, ids, lead_reward, _ = built[i]
        uid += 1
        teams.append(dict(t, first=len(enemies), count=len(ids), uid=uid, flags=1 if teams_w[i]['target'] else 0))
        for j, (e, eid) in enumerate(zip(ens, ids)):
            uid += 1
            enemies.append({'x': e['x'], 'y': e['y'], 'enemyId': eid, 'f3': base['f3'], 'f4': base['f4'],
                            'level': base['level'], 'reward': lead_reward if j == 0 else 1, 'uid': uid})

    chests, cpos = [], []
    for code in chests_w:
        pred = chest_pred(code)
        k = idx.near(sid, lambda k, p: p['room'][:2] == world and any(pred(c['reward']) for c in p['chests']))[0]
        c0 = next(c for c in idx.parts[k]['chests'] if pred(c['reward']))
        pos = next(((c['x'], c['y']) for kk in tpl_parts for c in idx.parts[kk]['chests']
                    if all(dist((c['x'], c['y']), q) >= MIN_CHEST_GAP for q in cpos)), None)
        if pos is None:
            raise ValueError('%d: posti per i forzieri finiti' % sid)
        cpos.append(pos)
        uid += 1
        chests.append({'x': pos[0], 'y': pos[1], 'reward': c0['reward'], 'kind': c0['kind'], 'uid': uid})
        notes.append('forziere %s -> premio %d aspetto %d (stage %d)' % (code, c0['reward'], c0['kind'], k[0]))

    mat_ids = [m['materialId'] for m in p0['materials']] or [1]
    mats, mpos = [], []
    for kk in tpl_parts:
        for m in idx.parts[kk]['materials']:
            if len(mats) == need['materials']:
                break
            pos = (m['x'], m['y'])
            if any(dist(pos, q) < MIN_MAT_GAP for q in mpos):
                continue
            mpos.append(pos)
            mats.append({'x': pos[0], 'y': pos[1], 'materialId': mat_ids[len(mats) % len(mat_ids)], 'quantity': 1})
    if len(mats) != need['materials']:
        raise ValueError('%d: posti per i materiali %d su %d' % (sid, len(mats), need['materials']))

    raw = pack_map(p0_raw, room, [ex], teams, enemies, chests, mats)
    info = {'stageId': sid, 'q': spec['q'], 'room': room, 'wiki_room': spec['wiki_room'], 'need': need,
            'arrive': list(arrive), 'exit': {f: ex[f] for f in mapfile.EXIT_FIELDS}, 'exit_from': list(src),
            'template_parts': [list(k) for k in tpl_parts[:6]], 'notes': notes,
            'teams': [{'uid': t['uid'], 'boss': bool(t['flags'] & 1),
                       'enemies': [e['enemyId'] for e in enemies[t['first']:t['first'] + t['count']]],
                       'leader_xy': [enemies[t['first']]['x'], enemies[t['first']]['y']]} for t in teams],
            'chests': chests, 'materials': len(mats)}
    return raw, info


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', help='cartella dove scrivere mappoi_stg<id>_01.bin')
    a = ap.parse_args()
    idx, names = Index(), enemy_names()
    for sid in SPEC:
        raw, info = build(sid, idx, names)
        print(json.dumps(info, ensure_ascii=False))
        if a.out:
            os.makedirs(a.out, exist_ok=True)
            open(os.path.join(a.out, 'mappoi_stg%05d_01.bin' % sid), 'wb').write(raw)


if __name__ == '__main__':
    main()
