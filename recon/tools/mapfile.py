"""Parser esatto dei file di missione: intestazione `STG` (mappoi_stg<id>.bin) e parti `MAP`
(mappoi_stg<id>_NN.bin), tutte le versioni viste: 13..17 (formato letto dal client 4.3.1, identico
per tutte) e le vecchie 4, 6, 7, 8 (record piu' corti, vedi LAYOUT; `client_layout` False).

    python -I recon/tools/mapfile.py <file|cartella> [...] [--json out.json] [--quiet]

Senza --json stampa per ogni stage le somme delle parti contro i totali dell'STG.
Da codice: `parse_stg(bytes)`, `parse_map(bytes, part=0)`, `load_stage(files, sid)`, `iter_stage_files(dir)`.

Struttura (formato letto dal client WW 4.3.1: uscite, squadre/nemici, forzieri, materiali, npc). Il client NON legge la versione
(+0x04): gli offset delle sezioni sono nell'intestazione e i record hanno la stessa misura in 13..17.
Verifica: tutte le 9.173 parti JP (ogni revisione) e le 1.300 del 2016 hanno sezioni contigue, senza
buchi ne' coda; nei file < 13 le misure sotto non tornerebbero (sezioni sovrapposte).
  STG: 16 int32 (+0x00 'STG\\0', [1] versione, [2] parti | partenza << 16, [3],[4] partenza x,y,
       [5] verso | n partenze alternative << 16, [6] enemyId bersaglio, [7] ?, [8] squadre, [9] nemici,
       [10] enemyId della scheda, [11] bonus di livello, [12] ?, [13] nemici non contati,
       [14] forzieri, [15] materiali) + n record da 4 short (parte, verso, x, y) a +0x40.
  MAP: +0x00 'MAP\\0', +0x04 versione, +0x08 ?, +0x0c nome stanza (16 byte), +0x1c short meteo,
       +0x20/+0x24/+0x28/+0x2c/+0x30 = offset - 0x34 delle sezioni uscite / nemici / forzieri /
       materiali / npc (dati dopo l'intestazione da 0x34 byte).
       uscite: n, n x 9 int32 (x, y, angolo freccia, distanza, [4], arrivo x, y, parte, verso)
       nemici: n_squadre, n_nemici, n_squadre x 0x44 (17 int32: [0] primo nemico, [1] quanti,
                 [4] bit0 = squadra boss, [5] uid squadra, [8] verso, [9..16] poligono 4 punti),
                 n_nemici x 0x20 (x, y, enemyId, f3, f4, livello, rewardId, uid)
       forzieri: n, n x 0x14 (x, y, rewardId, aspetto, uid)
       materiali:n, n x 0x10 (x, y, materialId, quantita')
       npc: n, n x 0x20 (x, y, id, short tipo, short ?, short verso, short livello, int talk,
                 int talk2, int ordine). talk/talk2 = testi di dialogo: il client apre
                 text/drama/<talk % 200000000 + 200000000>.txt (tipo 3 talk; tipo 1 talk o talk2;
                 tipo 4 non parla, valori 1/2). Vedi import_npc_talk.py.
"""
import json
import os
import re
import struct
import sys

NAME_RE = re.compile(r'^mappoi_stg(\d+)(?:_(\d\d))?(?:\.(\d{8}))?\.bin$')
EXIT_FIELDS = ('x', 'y', 'arrow_deg', 'dist', 'field4', 'arrive_x', 'arrive_y', 'dest_part', 'arrive_facing')
SECTIONS = ('exits', 'enemies', 'chests', 'materials', 'npcs')
# byte per record (uscita, squadra, npc). 13..17: quelli letti dal client 4.3.1. Ricavati dagli offset
# delle sezioni dei file vecchi (pacchetto 2016 / revisioni JP superate): 6 e 7 squadre da 9 int
# senza poligono; 4 anche uscite da 7 int e npc da 28 byte; 8 solo file vuoti.
LAYOUT = {13: (36, 0x44, 32), 8: (36, 0x24, 32), 7: (36, 0x24, 32), 6: (36, 0x24, 32), 4: (28, 0x24, 28)}


class FormatError(ValueError):
    pass


def _lohi(v):
    return struct.unpack('<hh', struct.pack('<i', v))


def parse_stg(b):
    """STG -> dict. I vecchi STG v4 (28 byte, 7 int) e v6/v7 (40 byte, 10 int) si leggono con i campi
    mancanti a 0 e `client_layout` False: il client 4.3.1 legge sempre 64 byte."""
    if b[:4] != b'STG\0' or len(b) < 64 and not (len(b) >= 28 and len(b) % 4 == 0 and b[4] < 13):
        raise FormatError('non e\' un STG (%d byte, %r)' % (len(b), b[:4]))
    if len(b) < 64:
        v = struct.unpack_from('<%di' % (len(b) // 4), b) + (0,) * (16 - len(b) // 4)
        r = parse_stg(struct.pack('<16i', *v))
        r.update(size=len(b), trailing=0, client_layout=False)
        return r
    v = struct.unpack_from('<16i', b, 0)
    parts, start_part = _lohi(v[2])
    fac, n_alt = _lohi(v[5])
    if 64 + 8 * max(n_alt, 0) > len(b):
        raise FormatError('STG: %d partenze alternative oltre la fine' % n_alt)
    alts = [dict(zip(('part', 'facing', 'x', 'y'), struct.unpack_from('<4h', b, 64 + 8 * i)))
            for i in range(max(n_alt, 0))]
    return {'version': v[1], 'parts': parts, 'start_part': start_part, 'start': (v[3], v[4]),
            'start_facing': fac, 'alt_starts': alts, 'target_enemy': v[6], 'field7': v[7],
            'teams_total': v[8], 'enemies_total': v[9], 'card_enemy': v[10], 'card_level_bonus': v[11],
            'field12': v[12], 'enemies_not_counted': v[13], 'chests_total': v[14],
            'materials_total': v[15], 'size': len(b), 'trailing': len(b) - 64 - 8 * max(n_alt, 0),
            'client_layout': v[1] >= 13}


def parse_map(b, part=0):
    """Parte MAP -> dict; FormatError se una sezione esce dal file (il client leggerebbe fuori)."""
    if len(b) < 0x34 or b[:4] != b'MAP\0':
        raise FormatError('non e\' una MAP (%d byte, %r)' % (len(b), b[:4]))
    i = lambda o: struct.unpack_from('<i', b, o)[0]
    offs = dict(zip(SECTIONS, (i(o) + 0x34 for o in (0x20, 0x24, 0x28, 0x2c, 0x30))))
    ver = i(4)
    # layout per versione: (uscita, squadra, npc) in byte; < 13 = formati vecchi (solo stage scartati
    # o eventi del 2016), che il client 4.3.1 leggerebbe male (usa sempre 36 / 0x44 / 32)
    rec_exit, rec_team, rec_npc = LAYOUT.get(ver, LAYOUT[13]) if ver < 13 else LAYOUT[13]
    out = {'version': ver, 'client_layout': ver >= 13, 'field8': i(8), 'room': b[0x0c:0x1c].split(b'\0')[0].decode('ascii', 'replace'),
           'weather': struct.unpack_from('<h', b, 0x1c)[0], 'offsets': offs, 'size': len(b)}
    ends = {}

    def table(name, rec, fmt, head=1):  # noqa: ARG001
        o = offs[name]
        if o < 0x34 or o + 4 * head > len(b):
            raise FormatError('sezione %s a 0x%x fuori dal file (%d byte)' % (name, o, len(b)))
        ns = struct.unpack_from('<%di' % head, b, o)
        return o, ns

    o, (n,) = table('exits', rec_exit, None)
    if n < 0 or o + 4 + rec_exit * n > len(b):
        raise FormatError('uscite: %d record escono dal file' % n)
    if rec_exit == 36:
        out['exits'] = [dict(zip(EXIT_FIELDS, struct.unpack_from('<9i', b, o + 4 + 36 * k))) for k in range(n)]
    else:                                       # versione 4: 7 int di significato non verificato
        out['exits'] = [{'raw': struct.unpack_from('<7i', b, o + 4 + 28 * k)} for k in range(n)]
    ends['exits'] = o + 4 + rec_exit * n

    o, (nt, ne) = table('enemies', None, None, 2)
    if nt < 0 or ne < 0 or o + 8 + rec_team * nt + 0x20 * ne > len(b):
        raise FormatError('nemici: %d squadre / %d nemici escono dal file' % (nt, ne))
    teams = []
    for k in range(nt):
        r = struct.unpack_from('<%di' % (rec_team // 4), b, o + 8 + rec_team * k)
        teams.append({'first': r[0], 'count': r[1], 'f2': r[2], 'f3': r[3], 'flags': r[4], 'boss': bool(r[4] & 1),
                      'uid': r[5], 'f6': r[6], 'f7': r[7], 'facing': r[8],
                      'polygon': [tuple(r[9 + 2 * j:11 + 2 * j]) for j in range(4)] if len(r) == 17 else []})
    base = o + 8 + rec_team * nt
    enemies = [dict(zip(('x', 'y', 'enemyId', 'f3', 'f4', 'level', 'reward', 'uid'),
                        struct.unpack_from('<8i', b, base + 0x20 * k))) for k in range(ne)]
    for t_i, t in enumerate(teams):
        for k in range(t['first'], t['first'] + t['count']):
            if 0 <= k < ne:
                enemies[k]['team'] = t_i
    out['teams'], out['enemies'] = teams, enemies
    ends['enemies'] = base + 0x20 * ne

    o, (n,) = table('chests', 20, None)
    if n < 0 or o + 4 + 20 * n > len(b):
        raise FormatError('forzieri: %d record escono dal file' % n)
    out['chests'] = [dict(zip(('x', 'y', 'reward', 'kind', 'uid'), struct.unpack_from('<5i', b, o + 4 + 20 * k)))
                     for k in range(n)]
    ends['chests'] = o + 4 + 20 * n

    o, (n,) = table('materials', 16, None)
    if n < 0 or o + 4 + 16 * n > len(b):
        raise FormatError('materiali: %d record escono dal file' % n)
    out['materials'] = [dict(zip(('x', 'y', 'materialId', 'quantity'), struct.unpack_from('<4i', b, o + 4 + 16 * k)))
                        for k in range(n)]
    ends['materials'] = o + 4 + 16 * n

    o, (n,) = table('npcs', rec_npc, None)
    if n < 0 or o + 4 + rec_npc * n > len(b):
        raise FormatError('npc: %d record escono dal file' % n)
    npcs = []
    for k in range(n):
        if rec_npc == 32:
            r = struct.unpack_from('<3i4h3i', b, o + 4 + 32 * k)
            npcs.append(dict(zip(('x', 'y', 'id', 'type', 's14', 'facing', 'layer', 'talk', 'talk2', 'z'), r)))
        else:
            npcs.append({'raw': struct.unpack_from('<7i', b, o + 4 + rec_npc * k)})
    out['npcs'] = npcs
    ends['npcs'] = o + 4 + rec_npc * n
    out['ends'] = ends
    # sezioni contigue? (solo informativo: il client usa solo gli offset)
    order = sorted(SECTIONS, key=lambda s: offs[s])
    out['gaps'] = {s: offs[t] - ends[s] for s, t in zip(order, order[1:]) if offs[t] != ends[s]}
    out['tail'] = len(b) - ends[order[-1]]
    out['counts'] = {'exits': len(out['exits']), 'teams': nt, 'enemies': ne, 'chests': len(out['chests']),
                     'materials': len(out['materials']), 'npcs': n}
    return out


def iter_stage_files(root):
    """{(stageId, parte|None): percorso} di una cartella; con suffissi di revisione vale la piu' alta."""
    best = {}
    for f in os.listdir(root):
        m = NAME_RE.match(f)
        if not m:
            continue
        key = (int(m.group(1)), int(m.group(2)) if m.group(2) else None)
        rev = int(m.group(3)) if m.group(3) else -1
        if key not in best or best[key][0] < rev:
            best[key] = (rev, os.path.join(root, f))
    return {k: v[1] for k, v in best.items()}


def check_stage(stg, parts):
    """Confronta le parti con l'STG -> (problemi, avvisi).

    Problemi: parti mancanti, uscite verso parti assenti, squadre fuori dai nemici, squadre/nemici
    diversi da [8]/[9]. Le squadre con il bit 0x20 di [4] (seconda lista: alleati/comparse) NON sono
    contate in [8]/[9] (91 stage JP su 91 con squadre 0x20). Avvisi: forzieri/materiali diversi da
    [14]/[15]: totali non mantenuti dagli sviluppatori (anche nel 2016), usati solo dalle missioni
    secondarie «apri tutti i forzieri» / «raccogli tutti i materiali».
    """
    bad, warn = [], []
    if stg['parts'] != len(parts):
        bad.append('parti: STG %d, file %d' % (stg['parts'], len(parts)))
    teams = [t for p in parts for t in p['teams'] if not t['flags'] & 0x20]
    if len(teams) != stg['teams_total']:
        bad.append('squadre: STG %d, parti %d' % (stg['teams_total'], len(teams)))
    ne = sum(t['count'] for t in teams)
    if ne != stg['enemies_total']:
        bad.append('nemici: STG %d, parti %d' % (stg['enemies_total'], ne))
    for k, sk in (('chests', 'chests_total'), ('materials', 'materials_total')):
        n = sum(p['counts'][k] for p in parts)
        if n != stg[sk]:
            warn.append('%s: STG %d, parti %d' % (k, stg[sk], n))
    for p_i, p in enumerate(parts):
        for e in p['exits']:
            if 'dest_part' in e and not 0 <= e['dest_part'] < len(parts):
                bad.append('parte %d: uscita verso la parte %d' % (p_i, e['dest_part']))
        for t in p['teams']:
            if t['first'] < 0 or t['first'] + t['count'] > p['counts']['enemies']:
                bad.append('parte %d: squadra uid %d nemici %d+%d' % (p_i, t['uid'], t['first'], t['count']))
    if not 0 <= stg['start_part'] < max(len(parts), 1):
        bad.append('parte di partenza %d' % stg['start_part'])
    return bad, warn


def load_stage(files, sid):
    """files: {(sid, parte|None): percorso o bytes}. -> (stg, [parti]); FormatError se manca qualcosa."""
    rd = lambda x: x if isinstance(x, (bytes, bytearray)) else open(x, 'rb').read()
    if (sid, None) not in files:
        raise FormatError('STG assente')
    stg = parse_stg(rd(files[(sid, None)]))
    parts = []
    for k in range(stg['parts']):
        if (sid, k) not in files:
            raise FormatError('parte %d assente' % k)
        parts.append(parse_map(rd(files[(sid, k)]), k))
    return stg, parts


def main(argv):
    out_json = None
    quiet = '--quiet' in argv
    srcs = [a for a in argv if a != '--quiet']
    if '--json' in srcs:
        k = srcs.index('--json')
        out_json = srcs[k + 1]
        del srcs[k:k + 2]
    if not srcs:
        sys.exit(__doc__)
    files = {}
    for s in srcs:
        if os.path.isdir(s):
            files.update(iter_stage_files(s))
        else:
            m = NAME_RE.match(os.path.basename(s))
            if m:
                files[(int(m.group(1)), int(m.group(2)) if m.group(2) else None)] = s
    from collections import Counter
    ver_parts, ver_bad, ok, n_warn, res = Counter(), Counter(), 0, 0, {}
    for sid in sorted({k[0] for k in files}):
        try:
            stg, parts = load_stage(files, sid)
            bad, warn = check_stage(stg, parts)
        except FormatError as e:
            stg, parts, bad, warn = None, [], [str(e)], []
        n_warn += bool(warn)
        for p in parts:
            ver_parts[p['version']] += 1
            if bad:
                ver_bad[p['version']] += 1
        ok += not bad
        res[sid] = {'stg': stg, 'parts': parts, 'problems': bad, 'warnings': warn}
        if bad or not quiet:
            print(sid, 'v%s' % (stg or {}).get('version'), [p['version'] for p in parts],
                  [p['room'] for p in parts], '; '.join(bad) or 'OK', ('(avvisi: %s)' % '; '.join(warn)) if warn else '')
    print('stage %d, coerenti %d (con avvisi forzieri/materiali %d); parti per versione %s; parti di stage incoerenti %s'
          % (len(res), ok, n_warn, dict(sorted(ver_parts.items())), dict(sorted(ver_bad.items()))))
    if out_json:
        json.dump({str(k): v for k, v in res.items()}, open(out_json, 'w', encoding='utf-8'), separators=(',', ':'))


if __name__ == '__main__':
    main(sys.argv[1:])
