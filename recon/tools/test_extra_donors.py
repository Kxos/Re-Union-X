"""Prova delle tabelle extra_donors.tsv (copie originali da altri contenitori) e jp_recoloured.tsv (ricolorate), I-194.

    python -I recon/tools/test_extra_donors.py     -> «OK: ...» oppure «ERRORI (n)», uscita 1

Formato e regole (load, lookup, category) su tabelle finte; poi le tabelle versionate: regole note, nessuna riga anche
nella tabella dei doppioni o delle ricostruite (le fonti non si sovrappongono), ricolorate mai nella tabella delle copie
originali; se i contenitori ci sono (D:\\Progetto_Restauro_KH_UX\\tmp), ogni sorgente esiste.
"""
import os
import shutil
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import extra_donors as xd  # noqa: E402
import jp_dedup_donors  # noqa: E402
import jp_reconstructed  # noqa: E402

errori = []


def check(cond, msg):
    if not cond:
        errori.append(msg)


TMP = tempfile.mkdtemp(prefix='xdon-')
try:
    tsv = os.path.join(TMP, 't.tsv')
    with open(tsv, 'w', encoding='utf-8') as fh:
        fh.write('# commento\n'
                 'lwf/character/enemy/1/wait/wait_a.png\tjp501:lwf/character/enemy/5001/wait/wait_a.png\texact501\tnota\n'
                 'lwf/character/enemy/1/wait/wait_b.png\tww501:lwf/character/enemy/5001/wait/wait_b.png\ttwinfam\n'
                 'lwf/character/enemy/1/wait/wait_c.png\tb2016:lwf/character/enemy/9/wait/wait_c.png\ttwinfam\tn\n')
    t = xd.load(tsv)
    check(len(t) == 3 and t['lwf/character/enemy/1/wait/wait_a.png'] ==
          ('jp501', 'lwf/character/enemy/5001/wait/wait_a.png', 'exact501', 'nota'), 'load: %r' % t)
    check(t['lwf/character/enemy/1/wait/wait_b.png'][3] == '', 'nota facoltativa')
    check(xd.category('exact501') == 1 and xd.category('twinfam') == 2 and xd.category('whole-dr-twin') == 2
          and xd.category('recolour') == 4 and xd.category('recolour-whole') == 4, 'categorie')
    roots = {'jp501': [os.path.join(TMP, 'a'), os.path.join(TMP, 'b')], 'ww501': [os.path.join(TMP, 'w')]}
    q = os.path.join(TMP, 'b', 'lwf', 'character', 'enemy', '5001', 'wait', 'wait_a.png')
    os.makedirs(os.path.dirname(q))
    open(q, 'wb').write(b'x')
    check(xd.lookup(t, 'lwf/character/enemy/1/wait/wait_a.png', roots) == q, 'lookup: seconda radice del contenitore')
    check(xd.lookup(t, 'lwf/character/enemy/1/wait/wait_b.png', roots) is None, 'lookup: file assente -> None')
    check(xd.lookup(t, 'lwf/character/enemy/1/wait/wait_c.png', roots) is None, 'lookup: contenitore senza radice -> None')
    check(xd.lookup(t, 'lwf/character/enemy/1/wait/nessuno.png', roots) is None, 'lookup: riga assente -> None')
    check(xd.load('') == {} and xd.load(os.path.join(TMP, 'manca.tsv')) == {}, 'tabella assente -> {}')
    for bad, why in (('x\tjp501:a/b.png\tregola_strana\n', 'regola sconosciuta'),
                     ('x\tzzz:a/b.png\ttwinfam\n', 'contenitore sconosciuto'),
                     ('x\tjp501:../a.png\ttwinfam\n', 'percorso con ..'),
                     ('x\tjp501:/a.png\ttwinfam\n', 'percorso assoluto'),
                     ('x\ta/b.png\ttwinfam\n', 'senza contenitore'),
                     ('x\tjp501:a/b.png\n', 'senza regola')):
        open(tsv, 'w', encoding='utf-8').write(bad)
        try:
            xd.load(tsv)
            errori.append('riga cattiva accettata: ' + why)
        except ValueError:
            pass
    open(tsv, 'w', encoding='utf-8').write('x\trecolour:a/b.png\trecolour\n')
    try:
        xd.load(tsv, rules=set(xd.RULES) - {'recolour', 'recolour-whole'})
        errori.append('ricolorata accettata nella tabella delle copie originali')
    except ValueError:
        pass
finally:
    shutil.rmtree(TMP, ignore_errors=True)

# tabelle versionate
ex = xd.load(xd.TABLE, rules=set(xd.RULES) - {'recolour', 'recolour-whole', 'std-dead'} - set(xd.EVENTS2_RULES))
rc = xd.load(xd.RECOLOUR_TABLE, rules={'recolour', 'recolour-whole'})
dd = jp_dedup_donors.load()
rr = jp_reconstructed.load()
check(len(ex) > 1000, 'extra_donors.tsv: %d righe' % len(ex))
check(not set(ex) & set(dd), 'extra e doppioni si sovrappongono: %d' % len(set(ex) & set(dd)))
check(not set(ex) & set(rr), 'extra e ricostruite si sovrappongono')
check(not set(rc) & (set(ex) | set(dd) | set(rr)), 'ricolorate anche in una tabella di originali o ricostruite')
check(all(v[0] != 'recolour' for v in ex.values()), 'contenitore recolour nella tabella delle copie originali')
check(all(k.startswith('lwf/character/') for k in list(ex) + list(rc)), 'percorsi pubblicati fuori da lwf/character/')
whole = {k.rsplit('/', 1)[0] for k, v in ex.items() if v[2] == 'whole-dr-twin'}
check(all(any(k == d + '/' + d.rsplit('/', 1)[1] + '.lwf' for k in ex) for d in whole),
      'animazione intera senza la sua LWF: %s' % sorted(whole))
if os.path.isdir(xd.ROOTS['jp501'][0]) and os.path.isdir(xd.ROOTS['ww501'][1]):
    miss = [k for k in ex if not xd.lookup(ex, k)]
    check(not miss, 'sorgenti assenti in extra_donors.tsv: %d (%s)' % (len(miss), miss[:3]))
# generic smoke dead (recolour-whole, user's decisions: 1524 on 22-10, 1590/1592/2503 on 23-10): for each family the
# whole dead (LWF + every texture) comes from ONE source folder; the expected donors
WHOLE_DEAD = {1501: '5038', 1524: '5045', 1590: '1591', 1592: '1591', 2503: '1'}
for fam, src in WHOLE_DEAD.items():
    rows = {k: v for k, v in rc.items() if k.startswith('lwf/character/enemy/%d/dead/' % fam)}
    lw = rows.get('lwf/character/enemy/%d/dead/dead.lwf' % fam)
    check(lw and all(v[2] == 'recolour-whole' for v in rows.values()) and len(rows) >= 2,
          'dead generica %d: righe %d' % (fam, len(rows)))
    check(len({v[0] + ':' + v[1].rsplit('/', 1)[0] for v in rows.values()}) == 1
          and all(v[1].startswith('lwf/character/enemy/%s/dead/' % src) for v in rows.values()),
          'dead generica %d: una sola cartella sorgente (%s)' % (fam, src))
    src_lwf = xd.lookup(rc, 'lwf/character/enemy/%d/dead/dead.lwf' % fam) if lw else None
    if src_lwf:
        import re
        refs = {m.decode() for m in re.findall(rb'[\w\-.]+\.png', open(src_lwf, 'rb').read())}
        have = {k.rsplit('/', 1)[1] for k in rows}
        check(refs and refs <= have, 'dead generica %d: texture senza riga %s' % (fam, sorted(refs - have)[:3]))
# user-approved whole-animation copies (extra_donors_whole.tsv, whole_export.py, I-194 23-10): known rules only, every
# animation has its LWF row and a row for every texture its LWF cites, one source folder per animation, no overlap
wh = xd.load(xd.WHOLE_TABLE, rules={'whole-ww-index', 'whole-same-pose', 'whole-same-rig', 'std-dead'})
check(len(wh) > 300, 'extra_donors_whole.tsv: %d rows' % len(wh))
check(not set(wh) & (set(ex) | set(dd) | set(rr) | set(rc)), 'whole copies overlap another table')
anims = {}
for k, v in wh.items():
    anims.setdefault(k.rsplit('/', 1)[0], []).append((k, v))
# 31 approved 23-10 + 4 dead.lwf of event quest families (Events Part 1 Task 2b: 226, 1522, 1530, 1566), approved by the
# user on the rendered sheets 06-11 (label «Events Task 2b, user-approved 06-11»); a pending one would say «pending user review»
# + 5 std-dead (Events Part 2, user-approved 07-11: 1568, 1570, 1572, 1573 and 96 Circus Clown)
check(len(anims) == 41, 'whole copies: %d animations (41)' % len(anims))
std = {d for d, rows in anims.items() if rows[0][1][2] == 'std-dead'}
check(std == {'lwf/character/enemy/%d/dead' % f for f in (96, 1568, 1570, 1572, 1573)}, 'std-dead copies: %s' % sorted(std))
check(all(v[1].startswith('lwf/character/enemy/1/dead/') and v[3].startswith('std-dead (user-approved 07-11)')
          for d in std for _, v in anims[d]), 'std-dead: enemy/1/dead with the user-approved label')
check(xd.category('std-dead') == 3 and 'std-dead' in xd.WHOLE_RULES, 'std-dead: whole rule, category 3')
ev = {d for d, rows in anims.items() if any('Events Task 2b, user-approved 06-11' in v[3] for _, v in rows)}
check(ev == {'lwf/character/enemy/%d/dead' % f for f in (226, 1522, 1530, 1566)}, 'Task 2b whole copies: %s' % sorted(ev))
check(not any('pending user review' in v[3] for rows in anims.values() for _, v in rows), 'pending whole copies left')
for d, rows in anims.items():
    an = d.rsplit('/', 1)[1]
    check(any(k == d + '/' + an + '.lwf' for k, _ in rows), 'whole copy without its LWF: ' + d)
    check(len({v[2] for _, v in rows}) == 1, 'whole copy with mixed rules: ' + d)
    lw = xd.lookup(wh, d + '/' + an + '.lwf')
    if lw:
        import re
        refs = {m.decode() for m in re.findall(rb'[\w\-.]+\.png', open(lw, 'rb').read())}
        check(refs <= {k.rsplit('/', 1)[1] for k, _ in rows}, 'whole copy %s: texture without a row' % d)
check({int(d.split('/')[3]) for d, rows in anims.items() if rows[0][1][2] == 'whole-same-rig'} == {1576, 1578, 1618},
      'whole-same-rig (category 3) only for 1576, 1578, 1618')
if os.path.isdir(xd.ROOTS['jp501'][0]):
    miss = [k for k in wh if not xd.lookup(wh, k)]
    check(not miss, 'sources missing in extra_donors_whole.tsv: %d (%s)' % (len(miss), miss[:3]))
# approved event models (extra_donors_events2.tsv, events2_export.py, Events Part 2 07-11): EVENTS2_RULES only, never in
# another table; every animation has its LWF row; blank pieces only in the mandatory animations of the accepted partial
# models; no row for the families left out (65 standard rules, 185 shown as 184) nor for the std-dead animations
ev2 = xd.load(xd.EVENTS2_TABLE, rules=set(xd.EVENTS2_RULES))
check(len(ev2) > 7000, 'extra_donors_events2.tsv: %d rows' % len(ev2))
check(not set(ev2) & set(wh), 'events2 rows overlap the whole copies')
check(not {v[2] for v in list(ex.values()) + list(wh.values()) + list(rc.values())} & set(xd.EVENTS2_RULES),
      'events2 rules in another table')
ev_anims = {k.rsplit('/', 1)[0] for k in ev2}
check(all(d + '/' + d.rsplit('/', 1)[1] + '.lwf' in ev2 for d in ev_anims), 'events2 animation without its LWF row')
ev_fams = {int(k.split('/')[3]) for k in ev2}
check(len(ev_fams) == 48 and not ev_fams & {65, 185}, 'events2 families: %d %s' % (len(ev_fams), sorted(ev_fams & {65, 185})))
# declared transparent pieces (user decisions; label column BLANK-DECLARED, events2_export.py): only these slots
with open(xd.EVENTS2_TABLE, encoding='utf-8') as fh:
    declared = {ln.split('\t')[0] for ln in fh if not ln.startswith('#') and ln.count('\t') >= 4
                and ln.split('\t')[2] == 'events2-blank' and ln.rstrip('\n').split('\t')[4].startswith('BLANK-DECLARED')}
blank = {(int(k.split('/')[3]), k.split('/')[4]) for k, v in ev2.items() if v[2] == 'events2-blank' and k not in declared}
check(declared <= {'lwf/character/enemy/1613/atkSp/atkSp_e38393e38383e38388e3839ee38383e383972038312e706e67.png'},
      'declared blank pieces outside the user decisions: %s' % sorted(declared))
check({f for f, _ in blank} <= {282, 1032, 1033, 1034, 1607}
      and {an for _, an in blank} <= {'wait', 'move', 'atk1_o', 'knockback', 'dead'},
      'blank pieces outside the accepted partial models: %s' % sorted(blank))
check(all(v[0] == 'events2' for v in ev2.values() if v[2] in ('events2-rescale', 'events2-blank')),
      'rescaled and blank pieces come from the events2 container')
if os.path.isdir(xd.ROOTS['events2'][0]) and os.path.isdir(xd.ROOTS['jp501'][0]):
    miss = [k for k in ev2 if not xd.lookup(ev2, k)]
    check(not miss, 'sources missing in extra_donors_events2.tsv: %d (%s)' % (len(miss), miss[:3]))
    import struct
    bad = []
    for k, v in ev2.items():
        if v[2] in ('events2-rescale', 'events2-blank'):
            with open(xd.lookup(ev2, k), 'rb') as fh:
                sz = struct.unpack('>II', fh.read(24)[16:24])
            if '%dx%d' % sz != v[3]:
                bad.append(k)
    check(not bad, 'rescaled/blank pieces not at the declared size: %d (%s)' % (len(bad), bad[:2]))
if rc and os.path.isdir(xd.ROOTS['recolour'][0]):
    miss = [k for k in rc if not xd.lookup(rc, k)]
    check(not miss, 'sorgenti assenti in jp_recoloured.tsv: %d (%s)' % (len(miss), miss[:3]))

if errori:
    print('ERRORI (%d)' % len(errori))
    for e in errori:
        print(' -', e)
    sys.exit(1)
print('OK: test_extra_donors (%d copie, %d ricolorate)' % (len(ex), len(rc)))
