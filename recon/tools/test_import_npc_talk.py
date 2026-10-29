"""Offline test of import_npc_talk.py with a fake stage folder (parse_map replaced).

    python -I recon/tools/test_import_npc_talk.py        -> «OK: ...» or «ERRORS (n)», exit 1
"""
import json
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import import_npc_talk as m  # noqa: E402

errors = []


def check(cond, msg):
    if not cond:
        errors.append(str(msg))


def npc(talk, talk2=0, typ=3):
    return {'type': typ, 'talk': talk, 'talk2': talk2}


# map content = json of its npc list (the fake parser reads it back)
MAPS = {'mappoi_stg05010_00.bin': [npc(204050101)],              # 2016 English
        'mappoi_stg05210_00.bin': [npc(204052101)],              # 2016 but Japanese
        'mappoi_stg22060_00.bin': [npc(4220101, typ=1)],          # JP only, ww entry (id % 2e8)
        'mappoi_stg26150_00.bin': [npc(204270101), npc(204270201, typ=4)],  # reconstructed; type 4 mute
        'mappoi_stg31020_00.bin': [npc(204310101)],              # JP only, no entry
        'mappoi_stg21090_03.bin': [npc(204210303)],              # nowhere
        'mappoi_stg01010_00.bin': [npc(204010301)],              # already served
        'mappoi_stg01010.bin': [npc(204999998)]}                 # STG header: not a part, ignored
m.parse_map = lambda b: {'client_layout': True, 'npcs': json.loads(b.decode())}
EN = ('# test table\n'
      '204220101\tww\tWW text under other ids\tPage one!\\fPage two,\\nline two.\n'
      '204270101\treconstructed\ttranslation of JP\tTest text one.\n'
      '204052101\treconstructed\ttranslation of JP\tTest text two.\n'
      '204050101\twiki\tshould never replace a 2016 English original\tWRONG\n')
JPTEXT = 'あいうえお'.encode('utf-8')

with tempfile.TemporaryDirectory() as t:
    st, b16, jp, out = (os.path.join(t, d) for d in ('stage', 'b16', 'jp', 'out'))
    for d in (st, os.path.join(b16, 'files', 'text', 'drama'), jp):
        os.makedirs(d)
    for f, npcs in MAPS.items():
        open(os.path.join(st, f), 'w').write(json.dumps(npcs))
    b16t = {204050101: "Test page one.\fA dashーlike this?".encode('utf-8'),
            204052101: 'てすとです……'.encode('utf-8')}
    rows = []
    for n, data in b16t.items():
        open(os.path.join(b16, 'files', 'text', 'drama', '%d.txt' % n), 'wb').write(data)
        rows.append('text/drama/%d.txt\t1\t2\t\t%d\t%s\t0' % (n, len(data), m.hashlib.sha1(data).hexdigest()))
    open(os.path.join(b16, 'files.tsv'), 'w', encoding='utf-8').write('\n'.join(rows) + '\n')
    for f in ('204220101.txt', '204270101.00000001.txt', '204270101.00000002.txt', '204310101.txt',
              '204052101.txt'):
        open(os.path.join(jp, f), 'wb').write(JPTEXT if f != '204270101.00000002.txt' else 'かきく'.encode())
    served = os.path.join(t, 'names.tsv')
    open(served, 'w', encoding='utf-8').write('name\toffset\ntext/drama/204010301.txt\t5\n')
    en = os.path.join(t, 'en.tsv')
    open(en, 'w', encoding='utf-8').write(EN)
    rd = lambda n: open(os.path.join(out, 'text', 'drama', '%d.txt' % n), 'rb').read()

    # without the table: as before (2016 English, JP flagged, 2016-Japanese flagged)
    r = m.run(served, b16, jp, st, out)
    check(r['already_served'] == [204010301] and r['from_2016'] == [204050101], r)
    check([x['id'] for x in r['from_jp']] == [204052101, 204220101, 204270101, 204310101], r['from_jp'])
    check(r['from_jp'][2]['file'] == '204270101.00000002.txt' and rd(204270101) == 'かきく'.encode(), 'JP latest rev')
    check([x['id'] for x in r['missing']] == [204210303] and r['from_en'] == [], r['missing'])
    check(rd(204050101) == b16t[204050101], '2016 English kept (katakana dash is not Japanese)')

    # default kinds = ww: only the ww entry is used
    r = m.run(served, b16, jp, st, out, en_tsv=en)
    check([(x['id'], x['kind']) for x in r['from_en']] == [(204220101, 'ww')], r['from_en'])
    check(rd(204220101) == b'Page one!\fPage two,\nline two.', rd(204220101))
    check(rd(204270101) == 'かきく'.encode(), 'reconstructed not used by default')

    # all kinds: reconstructed replaces JP and the Japanese 2016 text, never the English 2016 one
    r = m.run(served, b16, jp, st, out, en_tsv=en, kinds=m.KINDS)
    check([x['id'] for x in r['from_en']] == [204052101, 204220101, 204270101], r['from_en'])
    check([x['id'] for x in r['from_jp']] == [204310101] and r['from_2016'] == [204050101], r)
    check(rd(204052101) == b"Test text two." and rd(204050101) == b16t[204050101], 'precedence')
    check(r['en_unused'] == [204050101], r['en_unused'])
    check(not os.path.exists(os.path.join(out, 'text', 'drama', '204999998.txt')), 'STG ignored')
    check(not os.path.exists(os.path.join(out, 'text', 'drama', '204270201.txt')), 'type 4 ignored')

    # bad tables
    for bad, why in (('1\tww\tx\tあ\n', 'Japanese'), ('1\tguess\tx\tHi\n', 'kind'), ('1\tww\tx\n', 'columns'),
                     ('1\tww\tx\tHi\n1\tww\tx\tHo\n', 'repeated')):
        open(en, 'w', encoding='utf-8').write(bad)
        try:
            m.load_en(en)
            check(False, 'bad table accepted: ' + why)
        except ValueError as e:
            check(why in str(e) or why in ('columns', 'kind'), (why, e))
    check(m.unescape(r'a\nb\fc\\n') == 'a\nb\fc\\n', m.unescape(r'a\nb\fc\\n'))

if errors:
    print('ERRORS (%d)' % len(errors))
    for e in errors:
        print(' ', e)
    sys.exit(1)
print('OK: import_npc_talk (2016 / English table by kind / JP flagged / missing, table checks)')
