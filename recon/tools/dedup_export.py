"""Approved rows of the dedup_match.py proposal -> recon/tools/extra_donors_dedup.tsv (I-194, 23-10, category 2).

    python -I recon/tools/dedup_export.py [--proposal <tmp\\dedup\\proposal.tsv>] [--approved <allow-list>]
                                          [--overrides <file.tsv> ...] [--out <table>] [--rebuild] [--dry]

dedup_match.py writes a PROPOSAL (missing enemy textures matched by texture-table order to identical copies stored
in other folders of the dump); the user reviews its sheets and approves families or single animations. The approved
ones are listed in the allow-list recon/tools/extra_donors_dedup_approved.txt, one entry per line (`#` comment):
    1502            every animation of family 1502
    1502:wait       only wait of family 1502
    1550:-dead      every animation of family 1550 except dead
    1609:!marker    rows of family 1609 whose method or note contains `marker` are left out (case-insensitive)
    1636:+marker    rows of family 1636 whose method or note contains `marker` get the rule dedup-override (below)
This script turns the approved proposal rows (any confidence A/B/C, rows with a source only) into table rows
`<published path>\\t<container>:<source>\\tdedup-order\\t<declared size>\\t<confidence>`, read by make_jp_enemies.py
(`--dedup`) with the lowest priority among the original copies (category 2): an existing original file or a row of
the other tables always wins.

Review overrides (I-194, 23-10, second review): files with the proposal columns plus `note` (default every
tmp\\dedup\\review\\overrides_*.tsv in name order, so a new overrides_C.tsv is picked up as it appears; a later file
wins). An override row replaces the proposal row of the same (family, anim, texname); source `DROP` removes the pick;
the proposal rows it does not name stay. Every family named in an override file is a REVIEWED family.

Rule dedup-override (23-10, user's decision for 1636 wait only): a reviewed row that replaces a piece another source
already supplies (the 1636 wait "survivors" were content-anchor copies of extra_donors_deep.tsv taken from the
candy/kart decorations of drama 2470501: a dedup mix-up). Exported only for families listed with `+<marker>`;
make_jp_enemies.py lets such a row win over every other source for that exact path.

Append by default: rows already in the table are kept as they are (the user approved those exact files), only new
published paths are added, EXCEPT the rows of reviewed families: those are always recomputed from proposal +
overrides + allow-list (old wrong picks go away, keys the allow-list now leaves out leave the table);
`--rebuild` writes the table from the proposal and overrides alone. Skipped and reported: rows without
a proposed source, sources outside the extra_donors.py containers, and sources whose pixel size differs from the
declared size by more than 2 px (the same art at another scale: the generator's fits() would refuse them anyway).
Names and paths only (no image data).
"""
import argparse
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import extra_donors  # noqa: E402

D = r'D:\Progetto_Restauro_KH_UX'
RULE = 'dedup-order'
RULE_OVERRIDE = 'dedup-override'
APPROVED = os.path.join(HERE, 'extra_donors_dedup_approved.txt')
PROPOSAL = os.path.join(D, 'tmp', 'dedup', 'proposal.tsv')
HEADER = ('# Original copies matched by texture-table ORDER (I-194, 23-10-2026; recon/tools/dedup_match.py, category 2):\n'
          '# the dump stores identical files once (4-byte stubs), so the missing enemy bitmaps sit in another folder\n'
          '# (films, raids, effects, other enemies) at the same index of the aligned texture table of the same Flash source.\n'
          '# Only the families/animations approved by the user on the review sheets (allow-list\n'
          '# extra_donors_dedup_approved.txt; first approval 23-10-2026; reviewed overrides 23-10-2026), exported by\n'
          '# dedup_export.py. Rule dedup-override (1636 wait only, user 23-10): wins over every other source.\n'
          '# Columns: published path, <container>:<source>, rule, declared size, confidence of the proposal. Names and paths only.\n'
          '# Read by make_jp_enemies.py (--dedup) after every other original source; %d rows.\n')


def parse_allow(lines):
    """allow-list lines -> {family: (included anims or None = all, excluded anims, excluded markers,
    override markers)}."""
    out = {}
    for n, line in enumerate(lines, 1):
        line = line.split('#', 1)[0].strip()
        if not line:
            continue
        fam, _, an = line.partition(':')
        if not fam.isdigit() or an in ('-', '!', '+'):
            raise ValueError('allow-list line %d: bad entry %r' % (n, line))
        inc, exc, drop, over = out.get(fam, (set(), set(), set(), set()))
        if not an:
            inc = None
        elif an[0] == '-':
            exc = exc | {an[1:]}
        elif an[0] == '!':
            drop = drop | {an[1:].lower()}
        elif an[0] == '+':
            over = over | {an[1:].lower()}
        elif inc is not None:
            inc = inc | {an}
        out[fam] = (inc, exc, drop, over)
    # a family with only exclusions / markers means every other animation
    return {f: (None if (v[0] is not None and not v[0]) else v[0],) + v[1:] for f, v in out.items()}


def _marked(row, markers):
    text = ('%s %s' % (row.get('method', ''), row.get('note', ''))).lower()
    return any(m in text for m in markers)


def allowed(allow, fam, anim, row=None):
    """approved family/animation; with a row, also none of the family's `!` markers in its method or note."""
    if fam not in allow:
        return False
    inc, exc, drop, _ = allow[fam]
    if anim in exc or not (inc is None or anim in inc):
        return False
    return row is None or not drop or not _marked(row, drop)


def overrides_default():
    import glob
    return sorted(glob.glob(os.path.join(D, 'tmp', 'dedup', 'review', 'overrides_*.tsv')))


def merge(proposal_rows, override_files):
    """proposal rows + override files (paths or row lists, in order) -> (rows, reviewed families). An override row
    replaces the proposal row of the same (family, anim, texname); a later file wins; source 'DROP' -> no source."""
    rows = {}
    for r in proposal_rows:
        rows[(r['family'], r['anim'], r['texname'])] = r
    reviewed = set()
    for f in override_files:
        for r in (read_proposal(f) if isinstance(f, str) else f):
            r = dict(r)
            if r.get('source') == 'DROP':
                r['source'] = ''
            rows[(r['family'], r['anim'], r['texname'])] = r
            reviewed.add(r['family'])
    return list(rows.values()), reviewed


def read_proposal(path):
    with open(path, encoding='utf-8') as fh:
        head = fh.readline().rstrip('\n').split('\t')
        for line in fh:
            yield dict(zip(head, line.rstrip('\r\n').split('\t')))


def file_size(p):
    """(w, h) of a PNG (IHDR) or of a BTF (canvas, as make_jp_enemies.img_size), None if unreadable."""
    import struct
    try:
        d = open(p, 'rb').read(0x26)
    except OSError:
        return None
    if d[:8] == b'\x89PNG\r\n\x1a\n':
        return struct.unpack('>II', d[16:24])
    if d[:4] == b'\x89BTF' and len(d) >= 0x22:
        cw, ch, _, _, w, h = struct.unpack_from('<6H', d, 0x16)
        return (cw, ch) if cw and ch else (max(w, 1), max(h, 1))
    return None


def fits(src, size):
    """the source has the declared size 'WxH' (+-2 px, the generator's fits())? Many order-aligned donors are the
    same art at another scale (other LWF scale): the generator refuses those, so they never enter the table."""
    s = file_size(src)
    w, h = (int(x) for x in size.split('x'))
    return s is not None and abs(s[0] - w) <= 2 and abs(s[1] - h) <= 2


def export(rows, allow, container_of, size_ok=None):
    """proposal rows -> ({published: (pub, src, rule, size, conf)}, [skipped (pub, source, why)])."""
    out, skipped = {}, []
    for r in rows:
        if not allowed(allow, r['family'], r['anim'], r):
            continue
        pub = 'lwf/character/enemy/%s/%s/%s' % (r['family'], r['anim'], r['texname'])
        if not r.get('source'):
            skipped.append((pub, '', 'no source proposed'))
            continue
        k, rel = container_of(r['source'])
        if not k:
            skipped.append((pub, r['source'], 'outside the extra_donors.py containers'))
            continue
        if not (size_ok or fits)(r['source'], r['size']):
            skipped.append((pub, r['source'], 'rescaled copy: size differs from the declared one'))
            continue
        over = allow[r['family']][3]
        out[pub] = (pub, '%s:%s' % (k, rel), RULE_OVERRIDE if over and _marked(r, over) else RULE, r['size'],
                    r['confidence'])
    return out, skipped


def container_of(p):
    """absolute source -> (container, relative path with /) over extra_donors.ROOTS (first root of each container)."""
    pn = os.path.normcase(os.path.normpath(p))
    for k, roots in extra_donors.ROOTS.items():
        for root in roots:
            r = os.path.normcase(os.path.normpath(root)) + os.sep
            if pn.startswith(r):
                return k, os.path.normpath(p)[len(r):].replace('\\', '/')
    return None, None


def read_table(path):
    rows = {}
    if os.path.exists(path):
        for line in open(path, encoding='utf-8'):
            line = line.rstrip('\r\n')
            if line and not line.startswith('#'):
                x = line.split('\t')
                rows[x[0]] = tuple(x)
    return rows


def write_table(path, rows):
    with open(path, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write(HEADER % len(rows))
        for k in sorted(rows):
            fh.write('\t'.join(rows[k]) + '\n')


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--proposal', default=PROPOSAL)
    ap.add_argument('--approved', default=APPROVED)
    ap.add_argument('--out', default=extra_donors.DEDUP_TABLE)
    ap.add_argument('--overrides', action='append', default=None,
                    help='review override file (repeatable, later wins; default every tmp\\dedup\\review\\overrides_*.tsv)')
    ap.add_argument('--rebuild', action='store_true', help='ignore the rows already in the table')
    ap.add_argument('--dry', action='store_true')
    a = ap.parse_args(argv)
    allow = parse_allow(open(a.approved, encoding='utf-8'))
    ovf = overrides_default() if a.overrides is None else a.overrides
    merged, reviewed = merge(read_proposal(a.proposal), ovf)
    new, skipped = export(merged, allow, container_of)
    old = {} if a.rebuild else read_table(a.out)
    fam = lambda k: k.split('/')[3]  # noqa: E731
    gone = [k for k in old if fam(k) in reviewed and k not in new]
    changed = [k for k in old if fam(k) in reviewed and k in new and old[k][1:3] != new[k][1:3]]
    old = {k: v for k, v in old.items() if fam(k) not in reviewed}
    rows = dict(new, **old)
    added = [k for k in new if k not in old]
    print('override files %d (reviewed families %d); approved families %d; rows approved %d (new %d, kept %d), '
          'skipped %d; old rows of reviewed families: changed %d, removed %d; dedup-override %d; table %d rows'
          % (len(ovf), len(reviewed), len(allow), len(new), len(added), len(old), len(skipped), len(changed),
             len(gone), sum(v[2] == RULE_OVERRIDE for v in rows.values()), len(rows)))
    why = {}
    for s in skipped:
        k = s[2].split(':')[0]
        why[k] = why.get(k, 0) + 1
    print('  skipped by reason:', why)
    if not a.dry:
        write_table(a.out, rows)
        extra_donors.load(a.out)            # the generator must be able to read it
    return 0


if __name__ == '__main__':
    sys.exit(main())
