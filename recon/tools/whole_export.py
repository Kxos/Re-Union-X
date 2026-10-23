"""User-approved WHOLE-animation copies -> recon/tools/extra_donors_whole.tsv (I-194, 23-10).

    python recon/tools/whole_export.py [--out <table>] [--dry]   (reads the same local folders as make_jp_enemies.py)

19 enemy families had no dead.lwf at all in the JP 4.3.1 dump (the whole folder was dropped by the extraction as a byte
copy of another file) and 4 Ralph allies no wait. The user approved (23-10) these whole copies, found by the
lwfhunt study (local, tmp\\dedup\\lwfhunt):
  * rule whole-ww-index (category 2): the 2018 WW container name index lists <family>/dead/dead.lwf and its 9 PNG
    names at the SAME record offsets as the donor folder (identical files share one record): the generic Shadow smoke
    of enemy/1/dead for 19 families, the twin's dead for 1511/1516/1518/1536/1540 (1540 = 1541, taken from the
    JP 5.0.1 copy 5083/dead that keeps its textures);
  * rule whole-same-pose (category 2): Ralph allies 2014/2015/2019/2020 wait = 2013 wait (every ally with a surviving
    wait has the same 1-frame wait.lwf, equal draw for draw to frame 1 of atk1_o in all 8 allies);
  * rule whole-same-rig (category 3, reconstruction: not a proven copy): 1576/1578 dead = 1577 dead (Gearbit rig with
    identical texture tables and placement), 1618 dead = 1624 dead (Cy-Bug rig, same footprint; 1624 and 1628 share it).
For each copy the donor animation is planned with make_jp_enemies.plan_anim (LWF + the source of every texture as the
generator serves it for the donor) and every file becomes a row `<published>\\t<container>:<path>\\t<rule>\\t<note>`.
make_jp_enemies.py reads the table with extra_donors.tsv (whole animations only: the LWF row and all its textures).
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
_argv, sys.argv = sys.argv, [sys.argv[0]]
import make_jp_enemies as m  # noqa: E402  (default local folders)
import extra_donors  # noqa: E402
sys.argv = _argv

SMOKE = (251, 255, 271, 285, 1500, 1502, 1504, 1505, 1506, 1510, 2500, 2501, 2502, 2504, 2506, 2507, 2508, 2509, 2510)
IDX = '2018 WW container name index: same record offsets as %s (I-194 23-10, user-approved)'
# (family, anim, donor: (family, anim) planned like the generator, or 'container:folder' copied as is, rule, note)
COPIES = ([(f, 'dead', (1, 'dead'), 'whole-ww-index', IDX % 'enemy/1/dead (generic Shadow smoke)') for f in SMOKE] +
          [(f, 'dead', (t, 'dead'), 'whole-ww-index', IDX % ('%d/dead (twin)' % t))
           for f, t in ((1511, 1512), (1516, 1517), (1518, 1519), (1536, 1535))] +
          [(1540, 'dead', 'jp501:lwf/character/enemy/5083/dead', 'whole-ww-index',
            IDX % '1541/dead (twin; JP 5.0.1 copy 5083/dead, same dead.lwf)')] +
          [(f, 'wait', (2013, 'wait'), 'whole-same-pose',
            'Ralph ally wait = 2013 wait (same 1-frame wait.lwf in every surviving ally, = atk1_o frame 1; '
            'I-194 23-10, user-approved)') for f in (2014, 2015, 2019, 2020)] +
          [(f, 'dead', (1577, 'dead'), 'whole-same-rig',
            'reconstruction: 1577 dead (same Gearbit rig and placement; I-194 23-10, user-approved, category 3)')
           for f in (1576, 1578)] +
          [(1618, 'dead', (1624, 'dead'), 'whole-same-rig',
            'reconstruction: 1624/1628 dead (same Cy-Bug footprint; I-194 23-10, user-approved, category 3)')])


def to_box(p):
    """absolute source path -> 'container:relative path' (longest matching root of make_jp_enemies.ROOTS)."""
    n = os.path.normcase(os.path.abspath(p))
    best = None
    for box, roots in m.ROOTS.items():
        for r in roots:
            rr = os.path.normcase(os.path.abspath(r)).rstrip('\\/') + os.sep
            if n.startswith(rr) and (best is None or len(rr) > len(best[1])):
                best = (box, rr)
    if not best:
        raise SystemExit('source outside every container: ' + p)
    return '%s:%s' % (best[0], os.path.abspath(p)[len(best[1]):].replace('\\', '/'))


def donor_files(src):
    """-> {file name inside the animation folder: 'container:path'}"""
    if isinstance(src, str):
        box, rel = src.split(':', 1)
        root = m.ROOTS[box][0]
        folder = os.path.join(root, *rel.split('/'))
        lw = [f for f in os.listdir(folder) if f.endswith('.lwf')][0]
        names = [lw] + m.refs_of(os.path.join(folder, lw))
        miss = [f for f in names if not os.path.isfile(os.path.join(folder, f))]
        if miss:
            raise SystemExit('%s: missing %s' % (src, miss))
        return {f: '%s:%s/%s' % (box, rel, f) for f in names}
    fam, an = src
    jd = os.path.join(m.a.jp, str(fam))
    jp_all = {x: m.listing(os.path.join(jd, x)) for x in os.listdir(jd) if os.path.isdir(os.path.join(jd, x))}
    st, files, note, cat = m.plan_anim(str(fam), an, jp_all)
    if not files:
        raise SystemExit('%d/%s not complete: %s %s' % (fam, an, st, note))
    pre = '%s/%d/%s/' % (m.ENEMY, fam, an)
    return {k[len(pre):]: to_box(v) for k, v in files.items()}


def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=extra_donors.WHOLE_TABLE)
    ap.add_argument('--dry', action='store_true')
    a = ap.parse_args()
    rows = []
    cache = {}
    for fam, an, src, rule, note in COPIES:
        key = src if isinstance(src, str) else tuple(src)
        if key not in cache:
            cache[key] = donor_files(src)
        files = cache[key]
        if (an + '.lwf') not in files:
            raise SystemExit('%d/%s: donor without %s.lwf' % (fam, an, an))
        for name in sorted(files, key=lambda f: (not f.endswith('.lwf'), f)):
            rows.append('%s/%d/%s/%s\t%s\t%s\t%s' % (m.ENEMY, fam, an, name, files[name], rule, note))
    head = ['# WHOLE-animation copies approved by the user (I-194, 23-10; whole_export.py, read by make_jp_enemies.py).',
            '# Columns: published path, source <container>:<path>, rule, note. Only names and paths.',
            '# Rules: whole-ww-index, whole-same-pose = original copies (category 2); whole-same-rig = reconstruction',
            '# (category 3). %d copies, %d rows.' % (len(COPIES), len(rows))]
    print('%d copies, %d rows' % (len(COPIES), len(rows)))
    if not a.dry:
        with open(a.out, 'w', encoding='utf-8', newline='\n') as fh:
            fh.write('\n'.join(head + rows) + '\n')
    return 0


if __name__ == '__main__':
    sys.exit(main())
