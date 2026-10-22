"""Prova della tabella dei doppioni JP (jp_dedup_donors.py) e della tabella versionata jp_dedup_donors.tsv.

    python -I recon/tools/test_jp_dedup_donors.py      -> «OK: ...» oppure «ERRORI (n)», uscita 1
"""
import os
import shutil
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import jp_dedup_donors as d  # noqa: E402

errori = []


def check(cond, msg):
    if not cond:
        errori.append(msg)


TMP = tempfile.mkdtemp(prefix='jpdon-')
try:
    tsv = os.path.join(TMP, 't.tsv')
    with open(tsv, 'w', encoding='utf-8') as fh:
        fh.write('# commento\n\nlwf/character/enemy/1/wait/wait_a.png\tlwf/drama/2/2_b.00123456.png\tunique\n'
                 'lwf/character/npc/5/wait/wait_c.png\tlwf/drama/3/3_c.png\n')
    t = d.load(tsv)
    check(t == {'lwf/character/enemy/1/wait/wait_a.png': ('lwf/drama/2/2_b.00123456.png', 'unique'),
                'lwf/character/npc/5/wait/wait_c.png': ('lwf/drama/3/3_c.png', '')}, 'lettura: %r' % t)
    check(d.load(os.path.join(TMP, 'nessuno.tsv')) == {}, 'tabella assente -> vuota')
    check(d.load('') == {}, "percorso '' -> vuota")
    os.makedirs(os.path.join(TMP, 'lwf', 'drama', '2'))
    open(os.path.join(TMP, 'lwf', 'drama', '2', '2_b.00123456.png'), 'wb').close()
    check(d.lookup(t, 'lwf/character/enemy/1/wait/wait_a.png', TMP) ==
          os.path.join(TMP, 'lwf', 'drama', '2', '2_b.00123456.png'), 'lookup: sorgente con revisione')
    check(d.lookup(t, 'lwf/character/npc/5/wait/wait_c.png', TMP) is None, 'lookup: sorgente assente -> None')
    check(d.lookup(t, 'lwf/character/enemy/9/wait/x.png', TMP) is None, 'lookup: nome sconosciuto -> None')
    for bad in ('lwf/a.png\t/abs/x.png\n', 'lwf/a.png\tlwf/../x.png\n', 'lwf/a.png\n'):
        with open(tsv, 'w', encoding='utf-8') as fh:
            fh.write(bad)
        try:
            d.load(tsv)
            check(False, 'riga non valida accettata: %r' % bad)
        except ValueError:
            pass
finally:
    shutil.rmtree(TMP, ignore_errors=True)

# tabella versionata: solo nomi e percorsi relativi lwf/..., chiavi uniche, regole note, nessun dato
if os.path.exists(d.TABLE):
    t = d.load()
    check(len(t) > 0, 'tabella versionata vuota')
    rules = {'unique', 'align&donor', 'align&order', 'donor&order', 'samevis'}
    for k, (src, rule) in t.items():
        if not (k.startswith(('lwf/character/enemy/', 'lwf/character/npc/')) and k.endswith('.png')):
            check(False, 'chiave fuori ambito: %s' % k)
            break
        if not (src.startswith('lwf/') and src.endswith('.png')) or rule not in rules:
            check(False, 'riga non valida: %s %s %s' % (k, src, rule))
            break
    check(os.path.getsize(d.TABLE) < 4 * 1024 * 1024, 'tabella troppo grande: %d' % os.path.getsize(d.TABLE))
else:
    check(False, 'manca %s' % d.TABLE)

if errori:
    print('ERRORI (%d)' % len(errori))
    for e in errori:
        print(' -', e)
    sys.exit(1)
print('OK: test_jp_dedup_donors')
