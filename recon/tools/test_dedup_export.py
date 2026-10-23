"""Offline test of dedup_export.py and of the extra_donors_dedup.tsv loader (I-194, 23-10; no real image data).

    python -I recon/tools/test_dedup_export.py        -> "OK: ..." or "ERRORS (n)", exit 1
"""
import os
import shutil
import struct
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import dedup_export as de  # noqa: E402
import extra_donors as xd  # noqa: E402

errors = []


def check(cond, msg):
    if not cond:
        errors.append(msg)


# allow-list: whole family, single animation, every animation but one
allow = de.parse_allow(['# c', '1502', '1504:wait', '1504:dead  # two anims', '1550:-dead', '', '2004:-wait'])
check(de.allowed(allow, '1502', 'dead') and de.allowed(allow, '1502', 'wait'), 'whole family')
check(de.allowed(allow, '1504', 'wait') and de.allowed(allow, '1504', 'dead') and not de.allowed(allow, '1504', 'atk1_o'),
      'single animations: %s' % (allow.get('1504'),))
check(de.allowed(allow, '1550', 'wait') and not de.allowed(allow, '1550', 'dead'), 'exclusion: %s' % (allow.get('1550'),))
check(not de.allowed(allow, '2004', 'wait') and de.allowed(allow, '2004', 'atk1_o'), 'exclusion 2004')
check(not de.allowed(allow, '1520', 'wait'), 'family not in the list')
for bad in ('15x0', '1502:!', '1502:+', '1502:-'):
    try:
        de.parse_allow([bad])
        errors.append('bad entry accepted: %r' % bad)
    except ValueError:
        pass
# note markers: `!m` leaves the rows out, `+m` exports them as dedup-override; a family with markers only is whole
mk = de.parse_allow(['1609:!Piece-Missing', '1636', '1636:+replace-survivor'])
check(de.allowed(mk, '1609', 'wait') and not de.allowed(mk, '1609', 'wait', {'method': 'review_B', 'note': 'a piece-missing x'})
      and de.allowed(mk, '1609', 'wait', {'method': 'rerun', 'note': 'ok'}), 'marker exclusion: %s' % (mk.get('1609'),))
check(de.allowed(mk, '1636', 'wait', {'method': 'review:replace-survivor'}), '+marker rows stay allowed')

# merge: an override row replaces the proposal row of the same key, DROP removes the pick, a later file wins,
# proposal rows not named stay; the families of the override files are the reviewed ones
P = [{'family': '1611', 'anim': 'wait', 'texname': 'a', 'source': 'old_a'},
     {'family': '1611', 'anim': 'wait', 'texname': 'b', 'source': 'old_b'},
     {'family': '1611', 'anim': 'dead', 'texname': 'c', 'source': 'old_c'},
     {'family': '1502', 'anim': 'wait', 'texname': 'a', 'source': 'p'}]
OA = [{'family': '1611', 'anim': 'wait', 'texname': 'a', 'source': 'new_a'},
      {'family': '1611', 'anim': 'dead', 'texname': 'c', 'source': 'DROP'}]
OC = [{'family': '1611', 'anim': 'wait', 'texname': 'a', 'source': 'newer_a'}]
mg, rv = de.merge(P, [OA, OC])
mm = {(r['family'], r['anim'], r['texname']): r['source'] for r in mg}
check(mm == {('1611', 'wait', 'a'): 'newer_a', ('1611', 'wait', 'b'): 'old_b', ('1611', 'dead', 'c'): '',
             ('1502', 'wait', 'a'): 'p'} and rv == {'1611'}, 'merge: %s %s' % (mm, rv))

TMP = tempfile.mkdtemp(prefix='dedupx-', dir=r'D:\Progetto_Restauro_KH_UX\tmp' if os.path.isdir(r'D:\Progetto_Restauro_KH_UX\tmp') else None)
try:
    # file_size / fits: PNG IHDR and BTF canvas
    png = os.path.join(TMP, 'a.png')
    with open(png, 'wb') as fh:
        fh.write(b'\x89PNG\r\n\x1a\n' + struct.pack('>I', 13) + b'IHDR' + struct.pack('>II', 97, 24) + b'\x08\x06\x00\x00\x00')
    btf = os.path.join(TMP, 'b.png')
    b = bytearray(0x30)
    b[:4] = b'\x89BTF'
    struct.pack_into('<6H', b, 0x16, 855, 214, 0, 0, 800, 200)
    with open(btf, 'wb') as fh:
        fh.write(bytes(b))
    check(de.file_size(png) == (97, 24) and de.file_size(btf) == (855, 214), 'file_size %s %s' % (de.file_size(png), de.file_size(btf)))
    check(de.fits(png, '96x25') and not de.fits(btf, '97x24'), 'fits +-2 px; rescaled copy refused')

    rows = [
        {'family': '1502', 'anim': 'wait', 'texname': 'wait_1.png', 'size': '97x24', 'source': 'R/jp/x/a.png', 'confidence': 'A'},
        {'family': '1502', 'anim': 'dead', 'texname': 'dead_1.png', 'size': '97x24', 'source': '', 'confidence': '-'},
        {'family': '1502', 'anim': 'dead', 'texname': 'dead_2.png', 'size': '97x24', 'source': 'Z/out/a.png', 'confidence': 'B'},
        {'family': '1502', 'anim': 'atk1_o', 'texname': 'atk1_o_1.png', 'size': '97x24', 'source': 'R/jp/big.png', 'confidence': 'C'},
        {'family': '1550', 'anim': 'dead', 'texname': 'dead_1.png', 'size': '97x24', 'source': 'R/jp/x/a.png', 'confidence': 'A'},
        {'family': '1520', 'anim': 'wait', 'texname': 'wait_1.png', 'size': '97x24', 'source': 'R/jp/x/a.png', 'confidence': 'A'},
    ]

    def cont(p):
        return ('jp431', p[len('R/jp/'):]) if p.startswith('R/jp/') else (None, None)
    out, sk = de.export(rows, allow, cont, size_ok=lambda p, s: 'big' not in p)
    # +marker -> rule dedup-override, only for the marked rows of that family
    ov_rows = [dict(rows[0], family='1636', method='review:replace-survivor'), dict(rows[0], family='1636', texname='w2.png')]
    ovo, _ = de.export(ov_rows, mk, cont, size_ok=lambda p, s: True)
    check(sorted(v[2] for v in ovo.values()) == ['dedup-order', 'dedup-override'], 'override rule: %s' % ovo)
    pub = 'lwf/character/enemy/1502/wait/wait_1.png'
    check(list(out) == [pub] and out[pub] == (pub, 'jp431:x/a.png', 'dedup-order', '97x24', 'A'), 'export: %s' % out)
    check(sorted(s[2].split(':')[0] for s in sk) == ['no source proposed', 'outside the extra_donors.py containers',
                                                     'rescaled copy'], 'skipped: %s' % sk)

    # table written, appended (old rows kept) and read by the generator's loader (rule dedup-order, category 2)
    tab = os.path.join(TMP, 'dedup.tsv')
    de.write_table(tab, out)
    t = xd.load(tab)
    check(t == {pub: ('jp431', 'x/a.png', 'dedup-order', '97x24')}, 'loader: %s' % t)
    check(xd.category(t[pub][2]) == 2, 'dedup-order is category 2')
    try:
        xd.load(tab, rules={'content-anchor', 'bracket'})
        errors.append('dedup-order accepted where the caller does not allow it')
    except ValueError:
        pass
    # append mode through main(): a later proposal with another source for the same path keeps the approved row
    prop = os.path.join(TMP, 'proposal.tsv')
    with open(prop, 'w', encoding='utf-8') as fh:
        fh.write('family\tanim\ttexname\tsize\tsource\tdonor_lwf\tmethod\tconfidence\tscore\n'
                 '1502\twait\twait_1.png\t97x24\t%s\t\tm\tA\t1\n' % os.path.join(xd.ROOTS['jp431'][0], 'y', 'other.png'))
    al = os.path.join(TMP, 'allow.txt')
    with open(al, 'w', encoding='utf-8') as fh:
        fh.write('1502\n')
    real_fits = de.fits
    de.fits = lambda p, s: True
    try:
        de.main(['--proposal', prop, '--approved', al, '--out', tab, '--overrides', os.devnull])
        check(de.read_table(tab)[pub][1] == 'jp431:x/a.png', 'append: the approved row already in the table is kept')
        # a reviewed family (named in an override file): its old rows are recomputed in append mode too
        ovp = os.path.join(TMP, 'overrides_A.tsv')
        with open(ovp, 'w', encoding='utf-8') as fh:
            fh.write('family\tanim\ttexname\tsize\tsource\tdonor_lwf\tmethod\tconfidence\tscore\tnote\n'
                     '1502\twait\twait_1.png\t97x24\t%s\t\treview\tA\t\tfix\n' % os.path.join(xd.ROOTS['jp431'][0], 'z', 'fix.png'))
        de.main(['--proposal', prop, '--approved', al, '--out', tab, '--overrides', ovp])
        check(de.read_table(tab)[pub][1] == 'jp431:z/fix.png', 'reviewed row replaces the old one: %s' % (de.read_table(tab)[pub],))
        with open(al, 'w', encoding='utf-8') as fh:
            fh.write('1502:-wait\n')
        de.main(['--proposal', prop, '--approved', al, '--out', tab, '--overrides', ovp])
        check(pub not in de.read_table(tab), 'reviewed key now excluded leaves the table')
        with open(al, 'w', encoding='utf-8') as fh:
            fh.write('1502\n')
        de.main(['--proposal', prop, '--approved', al, '--out', tab, '--rebuild', '--overrides', os.devnull])
        check(de.read_table(tab)[pub][1] == 'jp431:y/other.png', '--rebuild: %s' % (de.read_table(tab)[pub],))
    finally:
        de.fits = real_fits
    check(xd.load('') == {} and xd.load(os.path.join(TMP, 'none.tsv')) == {}, "'' or missing table -> {}")
finally:
    shutil.rmtree(TMP, ignore_errors=True)

# the versioned table: loads, every row approved by the allow-list and never a family under review
real_allow = de.parse_allow(open(de.APPROVED, encoding='utf-8'))
t = xd.load(xd.DEDUP_TABLE, rules={'dedup-order', 'dedup-override'})
check(len(t) > 3500, 'versioned table rows: %d' % len(t))
bad = [k for k in t if not de.allowed(real_allow, k.split('/')[3], k.split('/')[4])]
check(not bad, 'rows outside the allow-list: %s' % bad[:3])
under_review = {'1643'}       # not reviewed yet (1609 approved by the third review, 23-10)
check(not (under_review & set(real_allow)), 'families under review in the allow-list: %s' % (under_review & set(real_allow)))
# third review (overrides_C.tsv, 23-10): the animations held after the second review are now in the table
released = ['1609/wait/', '1609/atk1_o/', '1612/wait/', '1651/dead/'] + \
    ['%s/atk1_o/' % f for f in ('2004', '2014', '2015', '2017', '2019', '2020', '2021')]
missing = [h for h in released if not any(k.startswith('lwf/character/enemy/' + h) for k in t)]
check(not missing, 'animations released by the third review not in the table: %s' % missing)
check(any(k.startswith('lwf/character/enemy/1550/dead/') for k in t), '1550 dead approved by the second review')
ovr = sorted(k for k, v in t.items() if v[2] == 'dedup-override')
check(len(ovr) == 6 and all(k.startswith('lwf/character/enemy/1636/wait/') for k in ovr), 'dedup-override rows: %s' % ovr)
check(all(v[0] in ('jp431', 'jp501', 'ww501', 'b2016') for v in t.values()), 'containers')

if errors:
    print('ERRORS (%d)' % len(errors))
    for e in errors:
        print(' -', e)
    sys.exit(1)
print('OK: test_dedup_export (%d rows in the versioned table)' % len(t))
