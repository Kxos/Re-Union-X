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
ex = xd.load(xd.TABLE, rules=set(xd.RULES) - {'recolour', 'recolour-whole'})
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
if rc and os.path.isdir(xd.ROOTS['recolour'][0]):
    miss = [k for k in rc if not xd.lookup(rc, k)]
    check(not miss, 'sorgenti assenti in jp_recoloured.tsv: %d (%s)' % (len(miss), miss[:3]))

if errori:
    print('ERRORI (%d)' % len(errori))
    for e in errori:
        print(' -', e)
    sys.exit(1)
print('OK: test_extra_donors (%d copie, %d ricolorate)' % (len(ex), len(rc)))
