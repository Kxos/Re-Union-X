"""User-approved event enemy models (Events Part 2, 07-11-2026) -> recon/tools/extra_donors_events2.tsv.

    python recon/tools/events2_export.py [--manifest <tmp\\events_enemies\\manifest.json>] [--out <table>]
        [--files <enemy_gen_src\\events2>] [--dry]           (Pillow: without -I)

The private reconstruction of the missing event enemies (tmp\\events_enemies: assemble.py + config*.json, bracket.json,
cand3c.json; review rounds 1-5 and Circus Clown 96, all approved by the user on the rendered animations 07-11) writes a
manifest with the source of every texture slot of every animation. This script turns it into table rows
`<published>\\t<container>:<path>\\t<rule>\\t<WxH>\\t<label>` (only names, paths and rule labels) and writes, outside the
repo, the files the table needs in the container `events2` (extra_donors.ROOTS):
  * rescale/<family>/<anim>/<texture>: the off-size copies (a copy or reconstruction more than 2 px away from the declared
    size; 212 of them) rescaled to EXACTLY the declared size (LANCZOS on premultiplied alpha, as dedup-rescale; the review
    renders drew them at the declared size), rule events2-rescale;
  * blank/<W>x<H>.png: a fully transparent piece for a slot still missing in a mandatory animation of an accepted partial
    model (PARTIAL: user decisions of the review rounds), rule events2-blank, declared in the Notices;
  * copy/<...>: frozen copies of generated files used as sources (raid_gen 1531, enemy_x 5075), so a later regeneration
    of those packages cannot change an approved model.
Not exported: 65 Cloudy Sunrise (complete with the standard rules, family list only), 185 Enraged Elk (no own model: the
event rows show the served story model 184, server/make-event-enemies.js DISPLAY_AS), and the whole standard dead of
1568/1570/1572/1573/96 (rule std-dead of extra_donors_whole.tsv, whole_export.py). A hole of an optional animation
(atkSp) gets no row: that animation stays incomplete and is not served (the client falls back to wait).
make_jp_enemies.py takes each animation of the table whole, before every other source (override priority).
"""
import argparse
import json
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import extra_donors  # noqa: E402
import private_tools  # noqa: E402

D = r'D:\Progetto_Restauro_KH_UX'
MANIFEST = os.path.join(D, 'tmp', 'events_enemies', 'manifest.json')
ENEMY = 'lwf/character/enemy'
SKIP = {65: 'complete with the standard rules', 185: 'no own model: event rows show 184'}
# accepted partial models (user review rounds 07-11: 1033 and 1034 OK in round 1, 1032 and 282 in round 2, 1607 in round 4)
PARTIAL = {282, 1032, 1033, 1034, 1607}
MANDATORY = ('wait', 'move', 'atk1_o', 'knockback', 'dead')
CAT_RULE = {1: 'events2-jp', 2: 'events2-copy', 3: 'events2-recon', '3c': 'events2-cand'}
ROOTS = dict(extra_donors.ROOTS, jp431=[private_tools.local_path('jp_data')],
             b2016=[private_tools.local_path('ref_work', 'bundle2016', 'files')])
FROZEN = {'raid_gen': os.path.join(D, 'raid_gen', 'files'), 'enemy_x': os.path.join(D, 'enemy_x')}


def label(rule):
    """manifest rule -> short label: its keyword (ALIGN, ORG-RIG, SELF-XANIM, stesso...), never the free text."""
    return (rule or '').split(' (')[0].split(' ')[0] or '-'


def to_box(p):
    """absolute source -> (container, relative path) or (None, frozen key, relative path) for a generated file."""
    n = os.path.normcase(os.path.abspath(p))
    best = None
    for box, roots in ROOTS.items():
        if box == 'events2':
            continue
        for r in roots:
            rr = os.path.normcase(os.path.abspath(r)).rstrip('\\/') + os.sep
            if n.startswith(rr) and (best is None or len(rr) > len(best[1])):
                best = (box, rr)
    if best:
        return best[0], os.path.abspath(p)[len(best[1]):].replace('\\', '/')
    for k, r in FROZEN.items():
        rr = os.path.normcase(os.path.abspath(r)).rstrip('\\/') + os.sep
        if n.startswith(rr):
            return 'events2', 'copy/%s/%s' % (k, os.path.abspath(p)[len(rr):].replace('\\', '/'))
    raise SystemExit('source outside every container: ' + p)


def load_img(p):
    from PIL import Image
    b = open(p, 'rb').read()
    if b[:4] == b'\x89BTF':
        import btf
        return btf.decode(b).convert('RGBA')
    return Image.open(p).convert('RGBA')


def resize_premult(im, size):
    """RGBA -> RGBA of `size`, LANCZOS on premultiplied alpha (dedup_rescale.downscale, both directions)."""
    import numpy as np
    from PIL import Image
    a = np.asarray(im.convert('RGBA'), dtype=np.float32) / 255.0
    al = a[..., 3]
    ch = [a[..., k] * al for k in range(3)] + [al]
    out = [np.asarray(Image.fromarray(c, 'F').resize(tuple(size), Image.LANCZOS), dtype=np.float32) for c in ch]
    A = np.clip(out[3], 0, 1)
    rgb = [np.where(A > 1e-4, np.clip(c, 0, None) / np.maximum(A, 1e-4), 0) for c in out[:3]]
    res = np.dstack([np.clip(c, 0, 1) for c in rgb] + [A])
    return Image.fromarray((res * 255 + 0.5).astype('uint8'), 'RGBA')


def off_size(r):
    return bool(r.get('real')) and (abs(r['real'][0] - r['wh'][0]) > 2 or abs(r['real'][1] - r['wh'][1]) > 2)


def plan(man):
    """manifest -> (rows [(published, box, rel, rule, WxH, label)], jobs [(kind, src, dst rel, size)], stats)"""
    rows, jobs, stats = [], [], {}
    for fam in sorted(man, key=int):
        f = int(fam)
        if f in SKIP:
            continue
        st = stats[f] = {'slots': 0, 'blank': 0, 'rescale': 0, 'frozen': 0, 'holes_optional': {}, 'anims': [], 'whole': []}
        for an, av in sorted(man[fam].items()):
            rs = av['rows']
            if rs and all(r.get('cat') == 'std' or (r.get('rule') or '').startswith('WHOLE') for r in rs.values()):
                st['whole'].append(an)          # standard dead: rule std-dead of extra_donors_whole.tsv
                continue
            holes = [t for t, r in rs.items() if not r.get('src')]
            if holes and an in MANDATORY and f not in PARTIAL:
                raise SystemExit('%d/%s: %d holes in a mandatory animation of a model not accepted as partial'
                                 % (f, an, len(holes)))
            pre = '%s/%d/%s/' % (ENEMY, f, an)
            box, rel = to_box(av['lwf'])
            rows.append((pre + an + '.lwf', box, rel, 'events2-jp' if box == 'jp431' else 'events2-copy', '0x0', 'lwf'))
            st['anims'].append(an)
            for t, r in sorted(rs.items()):
                wh = '%dx%d' % tuple(r['wh'])
                st['slots'] += 1
                if not r.get('src'):
                    if an not in MANDATORY:
                        st['holes_optional'][an] = st['holes_optional'].get(an, 0) + 1
                        continue
                    rel = 'blank/%s.png' % wh
                    jobs.append(('blank', None, rel, tuple(r['wh'])))
                    rows.append((pre + t, 'events2', rel, 'events2-blank', wh, 'hole (accepted partial model)'))
                    st['blank'] += 1
                    continue
                lab = label(r['rule']) + ('; replaces the standard pick' if r.get('replaced') else '')
                if r.get('rule') != 'jp' and off_size(r):
                    rel = 'rescale/%d/%s/%s' % (f, an, t)
                    jobs.append(('rescale', os.path.abspath(r['src']), rel, tuple(r['wh'])))
                    rows.append((pre + t, 'events2', rel, 'events2-rescale', wh,
                                 '%s; %dx%d rescaled' % (lab, r['real'][0], r['real'][1])))
                    st['rescale'] += 1
                    continue
                box, rel = to_box(r['src'])
                if box == 'events2':
                    jobs.append(('copy', os.path.abspath(r['src']), rel, None))
                    st['frozen'] += 1
                rows.append((pre + t, box, rel, CAT_RULE[r['cat']], wh, lab))
    return rows, jobs, stats


def write_files(jobs, root):
    from PIL import Image
    done = set()
    for kind, src, rel, size in jobs:
        if rel in done:
            continue
        done.add(rel)
        dst = os.path.join(root, *rel.split('/'))
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        if kind == 'blank':
            Image.new('RGBA', size, (0, 0, 0, 0)).save(dst)
        elif kind == 'rescale':
            resize_premult(load_img(src), size).save(dst)
        else:
            shutil.copyfile(src, dst)
    return len(done)


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--manifest', default=MANIFEST)
    ap.add_argument('--out', default=extra_donors.EVENTS2_TABLE)
    ap.add_argument('--files', default=ROOTS['events2'][0])
    ap.add_argument('--dry', action='store_true')
    a = ap.parse_args(argv)
    man = json.load(open(a.manifest, encoding='utf-8'))
    rows, jobs, stats = plan(man)
    miss = [r for r in rows if r[1] != 'events2' and not os.path.isfile(os.path.join(ROOTS[r[1]][0], *r[2].split('/')))]
    if miss:
        raise SystemExit('%d sources missing, e.g. %s' % (len(miss), miss[:2]))
    head = ['# Event enemy models approved by the user on the rendered review (Events Part 2, 07-11-2026; events2_export.py',
            '# from the private reconstruction manifest; read by make_jp_enemies.py --events2, whole animations, override',
            '# priority). Columns: published path, source <container>:<path>, rule, declared WxH, label of the reconstruction',
            '# rule. Only names and paths. %d families, %d rows.' % (len(stats), len(rows))]
    print('%d families, %d rows, %d files for events2 (%s)' % (
        len(stats), len(rows), len({j[2] for j in jobs}),
        ', '.join('%s %d' % (k, sum(s[k] for s in stats.values())) for k in ('rescale', 'blank', 'frozen'))))
    for f, s in sorted(stats.items()):
        print('  %d: %d slots, %d rescaled, %d blank, %d frozen; optional holes %s; whole %s' % (
            f, s['slots'], s['rescale'], s['blank'], s['frozen'], s['holes_optional'] or '-', s['whole'] or '-'))
    if not a.dry:
        n = write_files(jobs, a.files)
        with open(a.out, 'w', encoding='utf-8', newline='\n') as fh:
            fh.write('\n'.join(head + ['%s\t%s:%s\t%s\t%s\t%s' % r for r in rows]) + '\n')
        print('written %s and %d files in %s' % (a.out, n, a.files))
    return 0


if __name__ == '__main__':
    sys.exit(main())
