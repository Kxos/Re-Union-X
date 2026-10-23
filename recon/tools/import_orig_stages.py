"""Stage originali delle missioni di storia (I-116) al posto di quelli generati.

    python -I recon/tools/import_orig_stages.py [--out D:\\Progetto_Restauro_KH_UX\\stage_gen\\orig_stages] [--check]

Fonti (sola lettura): stage JP 4.3.1 (cartella di riferimento locale) (`stage/`, nomi `<nome>.<entry id 8 cifre>.bin`:
vale la revisione piu' alta) e pacchetto 2016 (`<ref_work>\\bundle2016\\files\\stage`). Per ogni
missione della master con stageKind 1 (le 525 di storia):
  * fonte 2016 per 2060, 3310, 5300, 7170, 11220 (stanze JP diverse da mapName/miniatura della master,
    reference\\world_schema\\jp431.md §3.2) e 2320 (JP dichiara 2 parti, la `_01` e' stata scartata);
  * altrimenti JP; se manca una parte dichiarata dall'STG o una stanza non e' disponibile, 2016;
  * 1010-1040 restano quelle delle risorse WW (originali, identiche salvo il campo [7]).
Stanze disponibili = servite (names_v4.tsv, names_addnl.tsv) + rooms_gen\\files\\map + stage_gen\\files\\map.
Lettura con il parser esatto `mapfile.py` (formato del client; si scartano i file < 13 e quelli con
squadre/uscite incoerenti). Controlli, tutti in <out>\\report.json:
  * nemici: enemyId (record dei nemici, bersaglio STG [6], scheda [10], obiettivi «Defeat X» della
    master) contro il master enemy e contro la tabella vera (external\\thethiny\\enemy_dec.json, che
    make-game-tables.js aggiunge al master);
  * premi: rewardId di nemici e forzieri contro il master reward e contro reward_dec.json. NB: le
    righe del master reward le crea make-game-tables.js da server/game_data/stage_poi.json: un id
    «assente dal master» si genera da solo quando il POI degli stage importati entra in quel file;
  * bersaglio [6] = primo nemico di una squadra capo (bit 0 di [4]); obiettivi della master
    (3 «Defeat N enemies» <= nemici contabili, 4/12 «Defeat X» con X nello stage, 17/18
    forzieri/materiali contro i totali STG).
Se la fonte preferita ha enemyId assenti da entrambe le tabelle o obiettivi della master non
soddisfatti e l'altra fonte ne ha meno, si usa l'altra (JP ha ridisegnato alcune missioni con capi
solo JP, es. 1210 con 10240 invece di 10011: il 2016 corrisponde alla master WW).
I file vanno in <out>\\stage\\ (da copiare in stage_gen\\files\\stage).
Il campo [7] dell'STG (WW 1, JP 40/41/43...: significato ignoto) resta quello della fonte.

Missioni 526-979 (I-009, docs/notes/mappe_storia.md#oltre525):

    python -I recon/tools/import_orig_stages.py --oltre <oltre525.json> [--only 526,555,617] [--rows stage.json]
           [--out D:\\Progetto_Restauro_KH_UX\\stage_gen\\orig_stages_oltre]

  * stage = missions[].stage.stageId di oltre525.json (453, 18302 per la Q555) + le altre 4 varianti della Q555
    (unmatched_stages con parti: 18300, 18301, 18303, 18304; la riga master 18300 ha branchType 1 e il client carica
    18300 + unionId - 1); 20101/30101 (parti residue senza STG, 0 parti) saltati; --only = numeri di missione
    (555 = 5 stage);
  * --out di default stage_gen\\orig_stages_oltre (MAI orig_stages: <out>\\stage si cancella a ogni lancio);
  * fonte JP, poi 2016 (526-555 identiche); FORCE_2016/KEEP_WW valgono solo per 1-525;
  * stanze: anche quelle di oltre525.json `rooms` (28 non ancora servite, SR_0009_01_00 compresa: le aggiunge il
    Task 4, make_jp_rooms.py),
    elencate per stage in `pending_rooms`;
  * 20320 (Q617) e 23010 (Q661): parte 1 assente nei dati JP, ricostruita da make_missing_part.py (copia con le
    scelte in <out>\\rebuilt\\), STG e parte 0 originali; nel rapporto `rebuilt_parts`;
  * obiettivi: righe del master (server/master_data/stage.json, o --rows con le righe 526-979 del Task 1, da
    server/make-story-oltre.js su una copia del master); senza riga solo i controlli del file (bersaglio, uid);
  * nemici per categoria (summary.enemy_categories): master, enemy_dec, clone (id di 9-10 cifre con la base
    id % 10000 nel master: li aggiunge server/make-enemy-oltre.js), uncovered (gli altri id di enemies_oltre525.json
    `missing`, senza statistiche: decisione dell'utente in sospeso), other (fuori da tutto: deve essere 0);
  * POI: <out>\\stage_poi_oltre.json (recon/tools/stage_poi.py --dir <out>\\stage), per KHUX_STAGE_POI_EXTRA. Q555:
    sotto ognuno di 18300-18304 l'unione delle uid (e premi) delle 5 varianti, perche' il server puo' ricevere lo
    stageId della riga (18300) o quello della variante caricata (Review Focus 3); oggi le 5 varianti hanno le stesse
    uid (squadra 1, nemico 2, premio 11893) e cambia solo l'enemyId del maestro. Uid uguali con premi diversi:
    errore.
  * Lv (correzione deterministica, nel rapporto `level_fix` per stage e summary.level_fixed con prima/dopo): 87 stage JP
    (mondi di Ralph 876-965 e finale 966-979: 39056-39159) hanno la scheda [11] = 1 e TUTTI i nemici a Lv 1 in ogni
    revisione JP (anche le .<entry id> piu' vecchie), salvo un nemico a 251 nelle 931/932 (squadra 0x20 non contata,
    premio 1: non e' il segnaposto, resta). Lv 1 + nemici a 1 e' lo schema degli stage evento JP (1.438 STG su 1.462 con
    [11] = 1: il Lv arrivava dal server), non quello della storia: la wiki da' 1200-5500 (oltre525.json missions[].lvl).
    Relazione misurata sui 370 stage importati con Lv vero: [11] = Lv della wiki in 364 dei 366 con Lv in wiki
    (31540/31550: 300 contro 400/500), [11] = Lv piu' alto dello stage in 365, tutti i nemici = [11] in 351, e 4.343
    record nemici su 4.413 (98,4%) hanno livello = [11] (capi: 1.042 su 1.045); gli altri sono gregari piu' bassi
    (-10..-500, in 17 stage) o, sopra [11], solo nemici di squadre 0x20 non contate (2011 a 5000 in 38050/39055,
    1908002011 a 1700 in 39081-39083). Gli id a 10 cifre non portano il Lv: lo stesso id ha Lv diversi (1912100017: 1550 come capo nella
    950 a [11] 1850) e manca qualunque tabella JP con Lv per stage. Negli 87 stage non c'e' nessuna traccia di quali
    nemici fossero gregari, quindi la regola e' quella del 98,4%: se [11] = 1 e la wiki ha Lv > 1, [11] = Lv della
    wiki e ogni nemico a Lv 1 -> Lv della wiki; gli altri valori (il 251) restano. Cambiano solo quei 4 byte (STG
    +0x2c, record nemico +0x14): il resto dei file e' JP byte per byte (test_import_oltre.py lo verifica).
"""
import argparse
import json
import os
import re
import shutil
import struct
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mapfile  # noqa: E402

D = r'D:\Progetto_Restauro_KH_UX'
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import private_tools  # noqa: E402  (local reference data folders, see private_tools.py)
JP_STAGE = private_tools.local_path('jp_data', 'stage')
B16_STAGE = private_tools.local_path('ref_work', 'bundle2016', 'files', 'stage')
REAL = os.path.join(D, 'external', 'thethiny')
FORCE_2016 = {2060, 3310, 5300, 7170, 11220, 2320}
KEEP_WW = {1010, 1013, 1016, 1019, 1020, 1030, 1040}

ap = argparse.ArgumentParser()
ap.add_argument('--out')
ap.add_argument('--check', action='store_true', help='solo rapporto, nessun file di stage scritto')
ap.add_argument('--oltre', help='oltre525.json: missioni 526-979 invece di 1-525')
ap.add_argument('--only', help='con --oltre: numeri di missione separati da virgole')
ap.add_argument('--rows', help='stage.json con altre righe per gli obiettivi (es. le 526-979 del Task 1)')
args = ap.parse_args()
args.out = args.out or os.path.join(D, 'stage_gen', 'orig_stages_oltre' if args.oltre else 'orig_stages')
if args.oltre and os.path.normcase(os.path.abspath(args.out)) == os.path.normcase(os.path.join(D, 'stage_gen', 'orig_stages')):
    sys.exit("--oltre: --out non puo' essere stage_gen\\orig_stages (cancellerebbe gli stage 1-525)")
if args.oltre:
    FORCE_2016, KEEP_WW = set(), set()
Q555 = (18300, 18301, 18302, 18303, 18304)
# Lv where original gameplay footage contradicts the wiki (I-206, 23-10): Q960 Crabby Cake shown at LV 1900 (wiki 1850)
LEVEL_FOOTAGE = {960: 1900}


def served_rooms():
    rooms = set()
    for tsv in (os.path.join(D, 'resource_data', 'names_v4.tsv'), os.path.join(D, 'ipa431', 'names_addnl.tsv')):
        for line in open(tsv, encoding='utf-8'):
            m = re.match(r'map/([A-Z]{2}_\d{4}_\d\d_\d\d)/\1_info\.bin\t', line)
            if m:
                rooms.add(m.group(1))
    for base in (os.path.join(D, 'rooms_gen', 'files', 'map'), os.path.join(D, 'stage_gen', 'files', 'map')):
        if os.path.isdir(base):
            rooms |= {r for r in os.listdir(base) if os.path.exists(os.path.join(base, r, r + '_info.bin'))}
    return rooms


def jload(p):
    try:
        return json.load(open(p, encoding='utf-8'))
    except FileNotFoundError:
        return []


master = lambda n: jload(os.path.join(REPO, 'server', 'master_data', n + '.json'))
stage_rows = {r['stageId']: r for r in master('stage')}
story = sorted(s for s, r in stage_rows.items() if r['stageKind'] == 1 and s < 990000)
if args.rows:
    stage_rows.update({r['stageId']: r for r in jload(args.rows) if r.get('stageKind') == 1})
enemy_ids = {r['enemyId'] for r in master('enemy')}
reward_ids = {r['rewardId'] for r in master('reward')}
real_enemy = {r['enemyId'] for r in jload(os.path.join(REAL, 'enemy_dec.json'))}
real_reward = {r['rewardId']: r for r in jload(os.path.join(REAL, 'reward_dec.json'))}
rooms_ok = served_rooms()
files = {'jp': mapfile.iter_stage_files(JP_STAGE), '2016': mapfile.iter_stage_files(B16_STAGE)}
oltre, pending, rebuilt, q_of, lvl_of = None, set(), {}, {}, {}
if args.oltre:
    oltre = json.load(open(args.oltre, encoding='utf-8'))
    only = {int(x) for x in args.only.split(',')} if args.only else None
    for m in oltre['missions']:
        if only is None or m['q'] in only:
            q_of[m['stage']['stageId']] = m['q']
            lvl_of[m['stage']['stageId']] = LEVEL_FOOTAGE.get(m['q'], m['lvl'])
    if only is None or 555 in only:
        for u in oltre['unmatched_stages']:
            if u['stageId'] in Q555 and u['parts']:
                q_of[u['stageId']] = 555
    story = sorted(q_of)
    pending = {r['room'] for r in oltre['rooms']} - rooms_ok
    rooms_ok |= pending
    # parte 1 assente (Q617, Q661): ricostruita, il resto dello stage resta JP
    import make_missing_part  # noqa: E402
    miss = [x['stageId'] for x in oltre['missing_parts'] if x['stageId'] in q_of]
    if miss:
        idx, names = make_missing_part.Index(JP_STAGE), make_missing_part.enemy_names()
        reb_dir = os.path.join(args.out, 'rebuilt')
        shutil.rmtree(reb_dir, ignore_errors=True)
        os.makedirs(reb_dir)
        for sid in miss:
            raw, info = make_missing_part.build(sid, idx, names, oltre)
            p = os.path.join(reb_dir, 'mappoi_stg%05d_01.bin' % sid)
            open(p, 'wb').write(raw)
            json.dump(info, open(p[:-4] + '.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
            files['jp'][(sid, 1)] = p
            rebuilt[sid] = [1]
# categorie degli enemyId (Task 2: server/make-enemy-oltre.js)
missing_oltre = {int(k) for k in (jload(os.path.join(D, 'reference', 'world_schema', 'oltre525', 'enemies_oltre525.json'))
                                  or {}).get('missing', {})}


def category(e):
    if e in enemy_ids:
        return 'master'
    if e in real_enemy:
        return 'enemy_dec'
    if 1e8 <= e < 1e10 and e % 10000 in enemy_ids:
        return 'clone'
    return 'uncovered' if e in missing_oltre else 'other'


def load(src, sid):
    f = files[src]
    try:
        stg, parts = mapfile.load_stage(f, sid)
    except mapfile.FormatError as e:
        return None, str(e)
    if not stg['client_layout'] or not all(p['client_layout'] for p in parts):
        return None, 'formato vecchio (versione < 13)'
    bad, warn = mapfile.check_stage(stg, parts)
    if bad:
        return None, 'incoerente: ' + '; '.join(bad)
    miss = [p['room'] for p in parts if p['room'] not in rooms_ok]
    if miss:
        return None, 'stanze non disponibili: ' + ', '.join(miss)
    raw = [open(f[(sid, None)], 'rb').read()] + [open(f[(sid, k)], 'rb').read() for k in range(len(parts))]
    return (stg, parts, warn, raw), None


def checks(sid, stg, parts):
    ens = [dict(e, part=k) for k, p in enumerate(parts) for e in p['enemies']]
    chs = [dict(c, part=k) for k, p in enumerate(parts) for c in p['chests']]
    teams = [t for p in parts for t in p['teams']]
    eids = {e['enemyId'] for e in ens}
    bosses = [p['enemies'][t['first']]['enemyId'] for p in parts for t in p['teams']
              if t['boss'] and t['count'] and 0 <= t['first'] < len(p['enemies'])]
    refs = {e['enemyId']: 'nemico' for e in ens}
    if stg['target_enemy']:
        refs.setdefault(stg['target_enemy'], 'bersaglio [6]')
    if stg['card_enemy']:
        refs.setdefault(stg['card_enemy'], 'scheda [10]')
    row, notes = stage_rows.get(sid) or {}, []
    for i in range(row.get('validSubmission', 0)):
        req, idt, sid_ = row['submissionRequire'][i], row['submissionIdType'][i], row['submissionId'][i]
        num = row['submissionNum'][i]
        if idt == 1 and sid_:
            refs.setdefault(sid_, 'obiettivo')
            if sid_ not in eids:
                notes.append('obiettivo %d: enemyId %d non e\' nello stage' % (i, sid_))
        if req == 3 and num > stg['enemies_total'] - stg['enemies_not_counted']:
            notes.append('obiettivo %d «sconfiggi %d nemici»: contabili %d' % (
                i, num, stg['enemies_total'] - stg['enemies_not_counted']))
        if req == 17 and stg['chests_total'] != len(chs):
            notes.append('obiettivo %d «apri tutti i forzieri»: STG %d, forzieri %d' % (i, stg['chests_total'], len(chs)))
        if req == 18 and stg['materials_total'] != sum(p['counts']['materials'] for p in parts):
            notes.append('obiettivo %d «raccogli tutti i materiali»: STG %d, materiali %d' % (
                i, stg['materials_total'], sum(p['counts']['materials'] for p in parts)))
    if stg['target_enemy'] and stg['target_enemy'] not in bosses:
        notes.append('bersaglio [6] %d non e\' il primo nemico di una squadra capo (%s)' % (stg['target_enemy'], bosses))
    uids = [x['uid'] for x in ens + chs] + [t['uid'] for t in teams]
    if len(uids) != len(set(uids)):
        notes.append('uid ripetuti')
    return ens, chs, refs, notes


def fix_levels(sid, stg, raw):
    """Stage con scheda [11] = 1 e Lv della wiki > 1 (gli 87 JP 39056-39159, vedi in cima): [11] e i nemici a Lv 1
    al Lv della wiki, solo quei 4 byte. Ritorna (raw nuovi, rapporto) o (raw, None) se non c'e' niente da fare."""
    lv = lvl_of.get(sid)
    if stg['card_level_bonus'] != 1 or not lv or lv <= 1:
        return raw, None
    out = [bytearray(raw[0])]
    struct.pack_into('<i', out[0], 0x2c, lv)
    n, kept = 0, set()
    for b in raw[1:]:
        p, nb = mapfile.parse_map(b), bytearray(b)
        base = p['offsets']['enemies'] + 8 + 0x44 * p['counts']['teams']
        for k, e in enumerate(p['enemies']):
            if e['level'] == 1:
                struct.pack_into('<i', nb, base + 0x20 * k + 0x14, lv)
                n += 1
            else:
                kept.add(e['level'])
        out.append(nb)
    return [bytes(x) for x in out], {'q': q_of.get(sid), 'wiki_lvl': lv, 'card': [1, lv], 'enemies': n,
                                     'enemy_levels': [1, lv], 'kept': sorted(kept)}


report, miss_e, miss_e_real, miss_r, miss_r_real, enemy_cat = [], {}, {}, {}, {}, {}
level_fixed, level_unfixed = {}, []
reward_use = {}
out_stage = os.path.join(args.out, 'stage')
if not args.check:
    shutil.rmtree(out_stage, ignore_errors=True)
    os.makedirs(out_stage)
for sid in story:
    if sid in KEEP_WW:
        report.append({'stageId': sid, 'source': 'ww', 'note': 'originale delle risorse WW'})
        continue
    order = ['2016', 'jp'] if sid in FORCE_2016 else ['jp', '2016']
    cands, why = [], []
    for src in order:
        got, err = load(src, sid)
        if not got:
            why.append('%s: %s' % (src, err))
            continue
        ens, chs, refs, notes = checks(sid, got[0], got[1])
        # 526-979: un id di Task 2 (clone o non coperto) non fa scartare la fonte
        unknown = [e for e in refs if (category(e) == 'other' if oltre else e not in enemy_ids and e not in real_enemy)]
        cands.append(((len(unknown), len(notes)), src, got, (ens, chs, refs, notes)))
    if not cands:
        report.append({'stageId': sid, 'source': None, 'note': '; '.join(why)})
        continue
    # la fonte preferita, salvo che un'altra abbia meno nemici sconosciuti / obiettivi della master
    # non soddisfatti (JP ha ridisegnato alcune missioni con capi solo JP: es. 1210, 2440, 6400)
    best = min(cands, key=lambda c: c[0])
    if best[0] < cands[0][0]:
        why.append('%s scartata: %s' % (cands[0][1], '; '.join(
            cands[0][3][3] + ['enemyId sconosciuti %s' % [e for e in cands[0][3][2] if e not in enemy_ids
                                                           and e not in real_enemy]])))
    else:
        best = cands[0]
    _, src, (stg, parts, warn, raw), (ens, chs, refs, notes) = best
    bad_e = sorted(e for e in refs if e not in enemy_ids)
    bad_r = sorted({x['reward'] for x in ens + chs if x['reward'] not in reward_ids})
    for e in refs:
        enemy_cat.setdefault(category(e), {}).setdefault(e, []).append(sid)
    for e in bad_e:
        miss_e.setdefault(e, {'uses': refs[e], 'stages': []})['stages'].append(sid)
        if e not in real_enemy:
            miss_e_real.setdefault(e, []).append(sid)
    for x in ens + chs:
        u = reward_use.setdefault(x['reward'], {'enemy': 0, 'chest': 0, 'stages': set()})
        u['enemy' if 'enemyId' in x else 'chest'] += 1
        u['stages'].add(sid)
    for r in bad_r:
        miss_r.setdefault(r, []).append(sid)
        if r not in real_reward:
            miss_r_real.setdefault(r, []).append(sid)
    report.append({'stageId': sid, 'source': src, 'version': stg['version'],
                   'part_versions': [p['version'] for p in parts], 'parts': len(parts),
                   'rooms': [p['room'] for p in parts], 'target': stg['target_enemy'], 'card': stg['card_enemy'],
                   'teams': stg['teams_total'], 'enemies': len(ens), 'chests': len(chs),
                   'materials': sum(p['counts']['materials'] for p in parts),
                   'missing_enemies': bad_e, 'missing_rewards': bad_r, 'checks': notes, 'stg_warnings': warn,
                   'note': '; '.join(why)})
    if oltre:
        raw, fix = fix_levels(sid, stg, raw)
        if fix:
            level_fixed[sid] = fix
            report[-1]['level_fix'] = fix
        elif stg['card_level_bonus'] == 1:
            level_unfixed.append(sid)
        report[-1].update(q=q_of[sid], rebuilt_parts=rebuilt.get(sid, []),
                          pending_rooms=sorted({p['room'] for p in parts} & pending),
                          enemy_categories={c: sorted(e for e in refs if category(e) == c)
                                            for c in ('clone', 'uncovered', 'other') if any(category(e) == c for e in refs)})
    if not args.check:
        open(os.path.join(out_stage, 'mappoi_stg%05d.bin' % sid), 'wb').write(raw[0])
        for k, p in enumerate(raw[1:]):
            open(os.path.join(out_stage, 'mappoi_stg%05d_%02d.bin' % (sid, k)), 'wb').write(p)


def use(r):
    u = reward_use[r]
    return {'enemy': u['enemy'], 'chest': u['chest'], 'stages': sorted(u['stages'])[:12],
            'real_row': r in real_reward}


os.makedirs(args.out, exist_ok=True)
summary = {
    'missions': len(story),
    'by_source': {str(s): sum(1 for r in report if r['source'] == s) for s in ('jp', '2016', 'ww', None)},
    'missing_enemies': {str(k): v for k, v in sorted(miss_e.items())},
    'missing_enemies_also_from_real_table': {str(k): v for k, v in sorted(miss_e_real.items())},
    'missing_rewards': {str(k): use(k) for k in sorted(miss_r)},
    'missing_rewards_also_from_real_table': {str(k): v for k, v in sorted(miss_r_real.items())},
    'checks': {str(r['stageId']): r['checks'] for r in report if r.get('checks')},
}
if oltre:
    summary['parts_missing'] = sum(1 for r in report if not r['source'])
    summary['rebuilt'] = {str(k): v for k, v in rebuilt.items()}
    summary['level_fixed'] = {str(k): v for k, v in sorted(level_fixed.items())}
    summary['level_unfixed'] = sorted(level_unfixed)
    summary['pending_rooms'] = sorted({x for r in report for x in r.get('pending_rooms', [])})
    summary['enemy_categories'] = {
        c: {'count': len(enemy_cat.get(c, {})), 'stages': len({s for v in enemy_cat.get(c, {}).values() for s in v}),
            'ids': sorted(enemy_cat.get(c, {}))} for c in ('master', 'enemy_dec', 'clone', 'uncovered', 'other')}
json.dump({'summary': summary, 'stages': report}, open(os.path.join(args.out, 'report.json'), 'w', encoding='utf-8'),
          ensure_ascii=False, indent=1)
lines = ['# Stage originali importati', '', '```', json.dumps(summary['by_source']), '```', '',
         'Senza fonte: ' + (', '.join('%d (%s)' % (r['stageId'], r['note']) for r in report if not r['source']) or 'nessuna'),
         '', 'Nemici assenti dal master: %d id (%s); anche dalla tabella vera: %s' % (
             len(miss_e), ', '.join(map(str, sorted(miss_e))), ', '.join(map(str, sorted(miss_e_real))) or 'nessuno'),
         'Premi assenti dal master: %d id; anche dalla tabella vera: %d' % (len(miss_r), len(miss_r_real)),
         'Stage con avvisi di controllo: %d' % len(summary['checks'])]
if oltre:
    lines += ['', 'Lv corretti (scheda [11] e nemici a Lv 1 -> Lv della wiki): %d stage; [11] = 1 senza Lv della wiki: %s' % (
        len(level_fixed), ', '.join(map(str, level_unfixed)) or 'nessuno'), '',
        '| stage | Q | [11] prima -> dopo | nemici 1 -> Lv | altri Lv tenuti |', '|---:|---:|---|---:|---|']
    lines += ['| %d | %s | 1 -> %d | %d | %s |' % (k, v['q'], v['wiki_lvl'], v['enemies'], v['kept'] or '')
              for k, v in sorted(level_fixed.items())]
open(os.path.join(args.out, 'report.md'), 'w', encoding='utf-8').write('\n'.join(lines) + '\n')


def poi_oltre():
    """POI degli stage scritti; Q555: sotto ogni variante l'unione delle uid delle 5 (Review Focus 3)."""
    out = os.path.join(args.out, 'stage_poi_oltre.json')
    r = subprocess.run([sys.executable, '-I', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'stage_poi.py'),
                        '--dir', out_stage, out], capture_output=True, text=True)
    print(r.stdout.strip(), r.stderr.strip())
    if r.returncode:
        sys.exit('stage_poi.py: uscita %d' % r.returncode)
    poi = json.load(open(out, encoding='utf-8'))
    group = [str(s) for s in Q555 if str(s) in poi]
    for kind in ('enemies', 'chests'):
        merged = {}
        for s in group:
            for x in poi[s][kind]:
                if merged.setdefault(x['uid'], x)['reward'] != x['reward']:
                    sys.exit('Q555: uid %d con premi diversi nelle varianti' % x['uid'])
        for s in group:
            have = {x['uid'] for x in poi[s][kind]}
            poi[s][kind] = sorted(poi[s][kind] + [dict(x) for u, x in merged.items() if u not in have],
                                  key=lambda x: x['uid'])
    with open(out, 'w', encoding='utf-8') as fo:
        json.dump(poi, fo, separators=(',', ':'))
    return group


if oltre and not args.check:
    print('POI: Q555 unita sotto', poi_oltre())
if oltre:
    print('categorie dei nemici:', {c: v['count'] for c, v in summary['enemy_categories'].items()},
          '| stage senza fonte:', summary['parts_missing'], '| ricostruiti:', summary['rebuilt'],
          '| stanze da servire (Task 4):', len(summary['pending_rooms']),
          '| Lv corretti:', len(level_fixed), '(senza Lv della wiki: %s)' % level_unfixed)
print(json.dumps(summary['by_source']), '| nemici assenti:', len(miss_e), '(dalla tabella vera: %d)' % len(miss_e_real),
      '| premi assenti:', len(miss_r), '(dalla tabella vera: %d)' % len(miss_r_real),
      '| stage con avvisi:', len(summary['checks']))
for r in report:
    if not r['source']:
        print('  ! %d: %s' % (r['stageId'], r['note']))
