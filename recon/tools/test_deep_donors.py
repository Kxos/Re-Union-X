"""Test of deep_donors.py (original copies found by content, rules content-anchor and bracket, I-194) and of the
versioned table extra_donors_deep.tsv.

    python recon/tools/test_deep_donors.py     -> "OK: ..." or "ERRORI (n)", exit 1   (numpy: without -I)

The rules run on synthetic images: diff() compares image labels ('A', 'A2' = same image as 'A' within SAME,
anything else = different), so donor acceptance, the coherence gate, content-anchor, bracket and the visual
rejects are checked without the game data. Then the versioned table: known rules, category 2, no overlap with the
other tables, sources inside the extra_donors containers and present on disk when the containers are.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import deep_donors as dd  # noqa: E402
import extra_donors as xd  # noqa: E402
import jp_dedup_donors  # noqa: E402
import jp_reconstructed  # noqa: E402

errori = []


def check(cond, msg):
    if not cond:
        errori.append(msg)


def diff(p, q):
    """synthetic images: 'X' and 'X2'... are the same picture, different base letters are not."""
    return 0.0 if p.rstrip('0123456789') == q.rstrip('0123456789') else 50.0


def donor(name, table):
    """table: [(texture name, w, h, image or None)] -> donor tuple (pool, path, table, files)."""
    return ('jp431', name, [(n, w, h) for n, w, h, img in table], {n: img for n, w, h, img in table if img})


# family: survivors S (10x10) and T (20x20); missing slot m (30x30) between them in the wait table
T = [('w_s', 10, 10), ('w_m', 30, 30), ('w_t', 20, 20)]
anims = {'wait': (T, {'w_s': ['S', 'jp', (10, 10)], 'w_t': ['T', 'jp', (20, 20)]}, {'w_m'})}
survs = [('S', (10, 10)), ('T', (20, 20))]
famdims = {(10, 10), (30, 30), (20, 20)}

# 1. content-anchor: two anchors (rule A), the only 30x30 texture of the donors is the same image -> picked
good = donor('drama/1', [('d_a', 10, 10, 'S2'), ('d_b', 31, 30, 'M'), ('d_c', 20, 20, 'T2')])
good2 = donor('raid/2', [('r_a', 10, 11, 'S3'), ('r_b', 30, 30, 'M2'), ('r_c', 20, 20, 'T')])
res = dd.solve(anims, survs, famdims, [good, good2], diff)
check(res['wait']['pick'][1] == ('M', 'content'), 'content-anchor: %r' % (res['wait']['pick'][1],))
check([d[2] for d in res['wait']['donors']] == ['A', 'A'], 'two anchors -> rule A: %r' % res['wait']['donors'])

# a donor with one anchor only and a small family (< 8 dims) is not accepted (rule B needs >= 8 dims)
one = donor('drama/3', [('x_a', 10, 10, 'S'), ('x_b', 30, 30, 'Z')])
res = dd.solve(anims, survs, famdims, [one], diff)
check(not res['wait']['donors'] and not res['wait']['pick'], 'one anchor, small family: donor refused')

# rule B: one anchor and the donor table covers >= 80% of the family's >= 8 declared dims
big = {(i, i) for i in range(40, 48)} | famdims
check(dd.accept([('n', w, h) for w, h in big], {'S'}, big) == 'B', 'rule B with full coverage')
check(dd.accept([('n', 40, 40)], {'S'}, big) is None, 'rule B refused with poor coverage')
check(dd.accept([], {'S', 'T'}, set()) == 'A', 'rule A with two anchors')

# 2. ambiguous: two accepted donors disagree on the 30x30 image -> no content pick
bad = donor('drama/4', [('y_a', 10, 10, 'S'), ('y_b', 30, 30, 'Q'), ('y_c', 20, 20, 'T')])
res = dd.solve(anims, survs, famdims, [good, bad], diff)
check(res['wait']['pick'][1][1] != 'content', 'disagreeing donors: no content-anchor (%r)' % (res['wait']['pick'][1],))

# 3. bracket: the donors disagree on 30x30 in general, but in one donor the slot between the images of the two
# known neighbours (S, T) is unique -> bracket
brk = donor('drama/5', [('b_a', 10, 10, 'S'), ('b_m', 30, 30, 'M'), ('b_c', 20, 20, 'T'),
                        ('b_x', 30, 30, 'Q')])
res = dd.solve(anims, survs, famdims, [brk], diff)
check(res['wait']['pick'][1] == ('M', 'bracket'), 'bracket: %r' % (res['wait']['pick'][1],))
# bracket refused when a neighbour image differs in the donor
brk2 = donor('drama/6', [('c_a', 10, 10, 'S'), ('c_m', 30, 30, 'M'), ('c_c', 20, 20, 'P'), ('c_x', 30, 30, 'Q'),
                         ('c_t', 20, 20, 'T')])
res = dd.solve(anims, survs, famdims, [brk2], diff)
check(res['wait']['pick'][1][1] not in ('content', 'bracket'), 'bracket with a wrong neighbour: %r' % (res['wait']['pick'][1],))

# 4. incoherent donor: anchors match, but on the family's survivors it picks wrong images (>= 2 errors, > 5%) ->
# rejected by the gate (a film with another character of the same sizes)
T4 = [('w_s', 10, 10), ('w_t', 20, 20), ('w_u', 40, 40), ('w_v', 50, 50), ('w_m', 30, 30)]
an4 = {'wait': (T4, {'w_s': ['S', 'jp', (10, 10)], 'w_t': ['T', 'jp', (20, 20)], 'w_u': ['U', 'jp', (40, 40)],
                     'w_v': ['V', 'jp', (50, 50)]}, {'w_m'})}
sv4 = [('S', (10, 10)), ('T', (20, 20)), ('U', (40, 40)), ('V', (50, 50))]
liar = donor('drama/7', [('l_s', 10, 10, 'S'), ('l_t', 20, 20, 'T'), ('l_u', 40, 40, 'X'), ('l_v', 50, 50, 'Y'),
                         ('l_m', 30, 30, 'W')])
check(not dd.gate(liar, 'A', an4, diff), 'gate: incoherent donor accepted')
res = dd.solve(an4, sv4, {(10, 10), (20, 20), (30, 30), (40, 40), (50, 50)}, [liar], diff)
check(not res['wait']['donors'] and res['wait']['pick'] == {}, 'incoherent donor used: %r' % res['wait']['donors'])
honest = donor('drama/8', [('h_s', 10, 10, 'S'), ('h_t', 20, 20, 'T'), ('h_u', 40, 40, 'U'), ('h_m', 30, 30, 'W')])
check(dd.gate(honest, 'A', an4, diff), 'gate: coherent donor refused')

# helpers
check(dd.close((10, 10), (11, 9)) and not dd.close((10, 10), (12, 10)), 'close: +-1 px')
check(dd.lcs_map([(1, 1), (2, 2), (3, 3)], [(2, 2), (9, 9), (3, 3)]) == {1: 0, 2: 2}, 'lcs_map')
check(dd.rejected(2011, 'lwf/character/enemy/7005/atkSp/x.png') and dd.rejected(1645, 'lwf/drama/2552701/a.png')
      and not dd.rejected(1645, 'lwf/drama/2551601/a.png') and not dd.rejected(1561, 'lwf/drama/2331101/a.png'),
      'visual rejects')
k, rel = dd.container_of(os.path.join(dd.X501, 'lwf', 'drama', '1', 'a.png'))
check((k, rel) == ('jp501', 'lwf/drama/1/a.png'), 'container_of jp501: %r' % ((k, rel),))
check(dd.container_of(os.path.join(dd.D, 'enemy_x', 'a.png')) == (None, None), 'container_of outside')
check(xd.category('content-anchor') == 2 and xd.category('bracket') == 2, 'category 2 in extra_donors.RULES')

# versioned table
deep = xd.load(xd.DEEP_TABLE, rules={'content-anchor', 'bracket'})
ex = xd.load(xd.TABLE, rules=set(xd.RULES) - {'recolour', 'recolour-whole'})
check(len(deep) > 1000, 'extra_donors_deep.tsv: %d rows' % len(deep))
check(not set(deep) & set(ex), 'deep and extra_donors overlap: %d' % len(set(deep) & set(ex)))
check(not set(deep) & set(jp_dedup_donors.load()), 'deep and dedup donors overlap')
check(not set(deep) & set(jp_reconstructed.load()), 'deep and reconstructed overlap')
check(all(v[0] in ('jp431', 'jp501', 'b2016') for v in deep.values()), 'container outside jp431/jp501/b2016')
check(all(k.startswith('lwf/character/enemy/') for k in deep), 'published path outside lwf/character/enemy/')
fams = {int(k.split('/')[3]) for k in deep}
check(not fams & {285, 1635, 2011, 2021}, 'visually rejected families in the table: %s' % sorted(fams & {285, 1635, 2011, 2021}))
check(not [k for k, v in deep.items() if k.split('/')[3] == '1645' and 'lwf/drama/2552701/' in v[1]], '1645 rows from 2552701')
if os.path.isdir(dd.JP431) and os.path.isdir(dd.X501):
    miss = [k for k in deep if not xd.lookup(deep, k)]
    check(not miss, 'missing sources in extra_donors_deep.tsv: %d (%s)' % (len(miss), miss[:3]))

if errori:
    print('ERRORI (%d)' % len(errori))
    for e in errori:
        print(' -', e)
    sys.exit(1)
print('OK: test_deep_donors (%d rows, %d families)' % (len(deep), len(fams)))
