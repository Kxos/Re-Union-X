"""Prova della tabella delle texture ricostruite (jp_reconstructed.py) e della tabella versionata jp_reconstructed.tsv.

    python -I recon/tools/test_jp_reconstructed.py     -> «OK: ...» oppure «ERRORI (n)», uscita 1
"""
import os
import shutil
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import jp_dedup_donors  # noqa: E402
import jp_reconstructed as r  # noqa: E402

errori = []


def check(cond, msg):
    if not cond:
        errori.append(msg)


import private_tools  # noqa: E402  (local reference data folders, see private_tools.py)
JP_ROOT = private_tools.local_path('jp_data')
TMP = tempfile.mkdtemp(prefix='jprec-')
try:
    tsv = os.path.join(TMP, 't.tsv')
    with open(tsv, 'w', encoding='utf-8') as fh:
        fh.write('# commento\n'
                 'lwf/character/enemy/1/wait/wait_a.png\tlwf/character/enemy/1/atk1_o/atk1_o_a.png\tshadow-family\tnota\n'
                 'lwf/character/npc/5/wait/wait_c.png\tlwf/character/enemy/2/dead/dead_c.png\tshadow-common\tnota\n')
    t = r.load(tsv)
    check(t == {'lwf/character/enemy/1/wait/wait_a.png': ('lwf/character/enemy/1/atk1_o/atk1_o_a.png', 'shadow-family'),
                'lwf/character/npc/5/wait/wait_c.png': ('lwf/character/enemy/2/dead/dead_c.png', 'shadow-common')},
          'lettura: %r' % t)
    check(r.load(os.path.join(TMP, 'assente.tsv')) == {} and r.load('') == {}, 'tabella assente -> {}')
    src = os.path.join(TMP, 'lwf', 'character', 'enemy', '1', 'atk1_o', 'atk1_o_a.png')
    os.makedirs(os.path.dirname(src))
    open(src, 'wb').write(b'x')
    check(r.lookup(t, 'lwf/character/enemy/1/wait/wait_a.png', TMP) == src, 'lookup: sorgente esistente')
    check(r.lookup(t, 'lwf/character/npc/5/wait/wait_c.png', TMP) is None, 'lookup: sorgente assente -> None')
    check(r.lookup(t, 'lwf/character/enemy/9/wait/x.png', TMP) is None, 'lookup: riga assente -> None')
    bad = os.path.join(TMP, 'bad.tsv')
    open(bad, 'w', encoding='utf-8').write('lwf/character/enemy/1/wait/a.png\tlwf/x.png\tinventata\n')
    try:
        r.load(bad)
        check(False, 'metodo sconosciuto accettato')
    except ValueError:
        pass
    open(bad, 'w', encoding='utf-8').write('lwf/character/enemy/1/wait/a.png\t../x.png\tfamily\n')
    try:
        r.load(bad)
        check(False, 'sorgente fuori dalla radice JP accettata')
    except ValueError:
        pass

    # tabella versionata: righe valide, distinta dai doppioni, famiglie complete per intero
    real = r.load()
    check(len(real) >= 1, 'tabella versionata vuota')
    don = jp_dedup_donors.load()
    check(not (set(real) & set(don)), 'righe anche nella tabella dei doppioni: %s' % sorted(set(real) & set(don))[:3])
    for k, (s, how) in real.items():
        check(k.startswith(('lwf/character/enemy/', 'lwf/character/npc/')) and k.endswith('.png'), 'percorso: %s' % k)
        check(s.startswith('lwf/') and s.endswith('.png'), 'sorgente: %s' % s)
        if os.path.isdir(JP_ROOT):
            check(r.lookup(real, k, JP_ROOT) is not None, 'sorgente assente nel JP: %s' % s)
    fams = sorted({'/'.join(k.split('/')[2:4]) for k in real})
    check('enemy/1637' in fams and 'npc/9002' in fams, 'famiglie attese (1637, NPC 9002): %s' % fams)
finally:
    shutil.rmtree(TMP, ignore_errors=True)

if errori:
    print('ERRORI (%d)' % len(errori))
    for e in errori:
        print(' -', e)
    sys.exit(1)
print('OK: test_jp_reconstructed')
