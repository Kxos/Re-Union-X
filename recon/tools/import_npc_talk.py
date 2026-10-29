"""NPC dialogue texts (text/drama/2xxxxxxxx.txt) referenced by the served maps and missing from
the served resources: from the 2016 global package (English), otherwise from a local English table,
otherwise from the JP 4.3.1 data (Japanese, reported).

    python -I recon/tools/import_npc_talk.py <served names.tsv> <bundle2016> <jp text/drama> <stage folder> <output>
        [--report r.json] [--en <english table.tsv>] [--kinds ww[,wiki][,reconstructed]]

Format (client 4.3.1): the two ints at +0x14 and +0x18 of the npc record of the MAP are the texts;
type 3 uses the first, type 1 the first or the second (the NPCTalkIcon bubble shows for types 1 and
3). The text is (category 1 = drama, id % 200000000 + 200000000) = text/drama/<n>.txt; without the
file the window does not open and the tap does nothing (quest 132, stage 5020: 204050201). Pages are
separated by 0x0C.

<bundle2016> = extraction of the 2016 package (files\\ with the stubs resolved and the latest
revision, files.tsv with the sha1 of each record: files\\ must be the current row, dup 0).
<jp text/drama> = files with a revision suffix <id>.<8 digits>.txt: the highest wins.

--en: local table (kept outside the public repository: it holds game text) with the English text of
ids that have no English original in the packages (I-154 follow-up, 29-10: the 2040xxxxx texts of
Quests 526-979 were downloaded from the CDN in the original and only the JP ones survive). Lines
`id<TAB>kind<TAB>source<TAB>text`, '#' = comment; in the text \\n = new line, \\f = new page,
\\\\ = backslash. kind: ww (original WW text found under another id), wiki (original WW text
transcribed by the community wiki), reconstructed (our translation of the JP original, to be
declared in the Notices). Only the kinds in --kinds (default ww) are used. An entry replaces the
JP text and a 2016 text that is itself Japanese (204052101), never an English 2016 original.
Texts already in the served resources are skipped (e.g. 204010301 of the tutorial).
"""
import hashlib
import json
import os
import re
import sys

here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, here)
from mapfile import FormatError, parse_map  # noqa: E402

KINDS = ('ww', 'wiki', 'reconstructed')
# kana (without the long-vowel mark and the middle dot, used as dashes in English texts) or kanji
JAPANESE = re.compile('[ぁ-ゖァ-ヺ一-鿿]')


def is_japanese(data):
    return bool(JAPANESE.search(data.decode('utf-8', 'replace')))


def unescape(s):
    return re.sub(r'\\(.)', lambda m: {'n': '\n', 'f': '\f', '\\': '\\'}.get(m.group(1), m.group(0)), s)


def load_en(path):
    """{id: (kind, source, bytes)}; error on bad lines, unknown kinds, duplicates, Japanese text."""
    table = {}
    with open(path, encoding='utf-8') as fh:
        for no, line in enumerate(fh, 1):
            line = line.rstrip('\r\n')
            if not line.strip() or line.startswith('#'):
                continue
            c = line.split('\t')
            if len(c) != 4 or not c[0].isdigit() or c[1] not in KINDS or not c[3].strip():
                raise ValueError('%s:%d: expected id<TAB>kind<TAB>source<TAB>text, kind in %s'
                                 % (path, no, '/'.join(KINDS)))
            n = int(c[0])
            if n in table:
                raise ValueError('%s:%d: id %d repeated' % (path, no, n))
            data = unescape(c[3]).encode('utf-8')
            if is_japanese(data):
                raise ValueError('%s:%d: id %d: the text is Japanese' % (path, no, n))
            table[n] = (c[1], c[2], data)
    return table


def wanted(stagedir):
    """{text id: [maps]} of the npcs that talk (types 1 and 3) in the client-format maps; bad maps."""
    want = {}
    bad = []
    for f in sorted(os.listdir(stagedir)):
        if not re.match(r'^mappoi_stg\d+_\d\d\.bin$', f):
            continue
        try:
            with open(os.path.join(stagedir, f), 'rb') as fh:
                m = parse_map(fh.read())
        except FormatError as e:
            bad.append('%s: %s' % (f, e))
            continue
        if not m['client_layout']:
            continue
        for npc in m['npcs']:
            if npc['type'] not in (1, 3):
                continue
            for t in (npc['talk'], npc['talk2']):
                if t:
                    want.setdefault(t % 200000000 + 200000000, []).append(f)
    return want, bad


def run(served_tsv, b16, jpdir, stagedir, out, en_tsv=None, kinds=('ww',)):
    served = set()
    with open(served_tsv, encoding='utf-8', errors='replace') as fh:
        for line in fh:
            m = re.match(r'(text/drama/\d+\.txt)\t', line)
            if m:
                served.add(m.group(1))
    want, bad = wanted(stagedir)
    current = {}
    with open(os.path.join(b16, 'files.tsv'), encoding='utf-8') as fh:
        for line in fh:
            c = line.rstrip('\n').split('\t')
            if c[0].startswith('text/drama/') and c[-1] == '0':
                current[c[0]] = c[5]
    jp = {}
    for f in os.listdir(jpdir):
        m = re.match(r'^(\d+)(?:\.(\d{8}))?\.txt$', f)
        if m:
            n, r = int(m.group(1)), int(m.group(2) or 0)
            if n not in jp or r > jp[n][0]:
                jp[n] = (r, f)
    en = load_en(en_tsv) if en_tsv else {}

    dst = os.path.join(out, 'text', 'drama')
    os.makedirs(dst, exist_ok=True)
    res = {'maps_bad': bad, 'already_served': [], 'from_2016': [], 'from_en': [], 'from_jp': [],
           'missing': [], 'en_unused': []}
    for n in sorted(want):
        maps = sorted(set(want[n]))
        name = 'text/drama/%d.txt' % n
        if name in served:
            res['already_served'].append(n)
            continue
        src = os.path.join(b16, 'files', 'text', 'drama', '%d.txt' % n)
        data = None
        if os.path.isfile(src):
            with open(src, 'rb') as fh:
                data = fh.read()
            if name in current and hashlib.sha1(data).hexdigest() != current[name]:
                raise SystemExit('%s: files\\ is not the current revision of files.tsv' % name)
            entry = {'id': n, 'file': '2016', 'maps': maps}
        elif n in jp:
            with open(os.path.join(jpdir, jp[n][1]), 'rb') as fh:
                data = fh.read()
            entry = {'id': n, 'file': jp[n][1], 'maps': maps}
        if (data is None or is_japanese(data)) and n in en and en[n][0] in kinds:
            kind, source, data = en[n]
            res['from_en'].append({'id': n, 'kind': kind, 'source': source, 'maps': maps})
        elif data is None:
            res['missing'].append({'id': n, 'maps': maps})
            continue
        elif is_japanese(data):
            res['from_jp'].append(entry)
        else:
            res['from_2016'].append(n)
        with open(os.path.join(dst, '%d.txt' % n), 'wb') as fh:
            fh.write(data)
    used = {r['id'] for r in res['from_en']}
    res['en_unused'] = sorted(n for n in en if n not in used)
    return res


def main(argv):
    args = list(argv)
    opts = {}
    for k in ('--report', '--en', '--kinds'):
        if k in args:
            i = args.index(k)
            opts[k] = args[i + 1]
            del args[i:i + 2]
    kinds = tuple((opts.get('--kinds') or 'ww').split(','))
    if not set(kinds) <= set(KINDS):
        raise SystemExit('--kinds: use %s' % ','.join(KINDS))
    if len(args) != 5:
        raise SystemExit(__doc__)
    res = run(*args, en_tsv=opts.get('--en'), kinds=kinds)
    print('npc texts: %d referenced, %d already served, %d from 2016, %d English from the table (%s), '
          '%d JAPANESE, %d missing, %d unreadable maps'
          % (sum(len(res[k]) for k in ('already_served', 'from_2016', 'from_en', 'from_jp', 'missing')),
             len(res['already_served']), len(res['from_2016']), len(res['from_en']), ','.join(kinds),
             len(res['from_jp']), len(res['missing']), len(res['maps_bad'])))
    for r in res['from_jp']:
        print('  Japanese: %d (%s, %s)' % (r['id'], r['file'], ', '.join(r['maps'])))
    for r in res['missing']:
        print('  missing: %d (%s)' % (r['id'], ', '.join(r['maps'])))
    if '--report' in opts:
        report = opts['--report']
        os.makedirs(os.path.dirname(os.path.abspath(report)), exist_ok=True)
        with open(report, 'w', encoding='utf-8') as fh:
            json.dump(res, fh, indent=1)


if __name__ == '__main__':
    main(sys.argv[1:])
