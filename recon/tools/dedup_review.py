"""Second opinion on dedup_match.py proposals: the family's OWN other animations as donors (I-194, 23-10).

    python recon/tools/dedup_review.py --fams 1651,1645 [--proposal <proposal.json>] [--need <need_now.json>]
                                       [--out <overrides.tsv>]                     (numpy + Pillow: without -I)

Proposal only (rows in the proposal.tsv format + `note`); nothing is read by the generator.

Why: dedup_match.py skips every LWF in the family's own folder, but the animations of one creature are exports of
one Flash rig, so a piece missing in `dead` is very often the very bitmap that survives (or was matched) in `wait`,
e.g. 1651 dead: Skuld's hair, hat and boots block is reordered at the end of the table, so the cross-LWF alignment
never reached it, while wait holds the same sizes with confidence A.

Rule (measured on the survivors of every family in need_now.json, 23-10): two original pieces of different
animations of one family with the same exact size, unique in both tables and >= MIN_AREA px, are the same image in
6347/6420 pairs (98.9%); with any size, 9545/11594 (82%). Hence:
  * own-unique: the missing size is unique in this table and in the donor animation's table, area >= MIN_AREA;
    every such donor piece (original survivor, or an A/B proposal) must agree by content -> confidence A when the
    donor piece is an original survivor, else the donor proposal's grade;
  * own-aligned: otherwise the iterated LCS of the two tables (lcs2: blocks reordered between exports) aligns the
    piece inside a contiguous run >= RUN_MIN whose other pieces, where both sides are known, agree by content;
    grade B (original donor) / C.
Every row says where it came from; the reviewer accepts or rejects it against the renders.

render() draws a frame of an enemy rig for review sheets: blend modes from place.object (add, multiply) and Flash
mask layers (place.depth clip depth, see lwf_rig.py) applied as clips, never drawn as colour (review B's sheets read
the clip depth as a blend mode, so 1615's mask, a 187x198 solid red square with clip depth 6, covered the creature).
"""
import argparse
import collections
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import deep_donors as dd  # noqa: E402
import dedup_match as dm  # noqa: E402

D = dd.D
MIN_AREA = 200
RUN_MIN = 3


def lcs2(A, B, passes=3):
    """iterated LCS of two (w, h) sequences: align, then re-align the leftovers -> {i: j}."""
    mp = {}
    for _ in range(passes):
        ia = [i for i in range(len(A)) if i not in mp]
        used = set(mp.values())
        jb = [j for j in range(len(B)) if j not in used]
        m = dd.lcs_map([A[i] for i in ia], [B[j] for j in jb])
        if not m:
            break
        for a, b in m.items():
            mp[ia[a]] = jb[b]
    return mp


def anim_pieces(fam, an, v, prop):
    """[(name, w, h, file or None, kind)] kind: 'orig' survivor | proposal grade | None."""
    T = dd.lwf_textures(open(v['lwf'], 'rb').read())
    pr = {r['tex']: r for r in prop if r['fam'] == fam and r['anim'] == an}
    out = []
    for n, w, h in T:
        if n in v.get('have', {}):
            out.append((n, w, h, v['have'][n][0], 'orig'))
        elif n in pr and pr[n].get('src'):
            out.append((n, w, h, pr[n]['src'], pr[n]['conf']))
        else:
            out.append((n, w, h, None, None))
    return out


def own_candidates(fam, an, need_f, prop, diff, grades='AB'):
    """missing pieces of `an` -> list of rows {tex, w, h, src, conf, rule, from}."""
    me = anim_pieces(fam, an, need_f[an], prop)
    miss = {m[0] for m in need_f[an].get('miss', [])}
    cnt = collections.Counter((w, h) for n, w, h, f, k in me)
    out = {}
    for other, v in need_f.items():
        if other == an or 'lwf' not in v:
            continue
        ot = anim_pieces(fam, other, v, prop)
        oc = collections.Counter((w, h) for n, w, h, f, k in ot)
        mp = lcs2([(w, h) for n, w, h, f, k in me], [(w, h) for n, w, h, f, k in ot])
        rn = dm.runs(mp)
        # content check of the alignment on pieces known on both sides (originals only on our side)
        chk = {}
        for i, j in mp.items():
            a, b = me[i][3], ot[j][3]
            if a and b and me[i][4] == 'orig':
                chk[i] = diff(a, b) < dd.SAME
        for i, (n, w, h, f, k) in enumerate(me):
            if n not in miss:
                continue
            cands = []
            if cnt[(w, h)] == 1 and oc[(w, h)] == 1 and w * h >= MIN_AREA:
                j = next(j for j, x in enumerate(ot) if (x[1], x[2]) == (w, h))
                if ot[j][3] and (ot[j][4] == 'orig' or ot[j][4] in grades):
                    cands.append(('own-unique', j))
            j = mp.get(i)
            if j is not None and rn.get(i, 0) >= RUN_MIN and ot[j][3] and (ot[j][4] == 'orig' or ot[j][4] in grades):
                lo, hi = i, i
                while lo - 1 in mp and mp[lo - 1] == mp[lo] - 1:
                    lo -= 1
                while hi + 1 in mp and mp[hi + 1] == mp[hi] + 1:
                    hi += 1
                ok = sum(1 for x in range(lo, hi + 1) if chk.get(x) is True)
                bad = sum(1 for x in range(lo, hi + 1) if chk.get(x) is False)
                if bad == 0 or ok >= 3 * bad:
                    cands.append(('own-aligned(run=%d,ok=%d,bad=%d)' % (rn[i], ok, bad), j))
            for rule, j in cands:
                src, kind = ot[j][3], ot[j][4]
                conf = ('A' if rule == 'own-unique' else 'B') if kind == 'orig' else (
                    kind if rule == 'own-unique' else 'C')
                out.setdefault(n, []).append({'tex': n, 'w': w, 'h': h, 'src': src, 'conf': conf, 'rule': rule,
                                              'from': '%s/%s#%d(%s)' % (fam, other, j, kind)})
    rows = []
    for n, cs in out.items():
        # agreement: every candidate the same image, else keep the best grade and flag the conflict
        cs.sort(key=lambda c: ('ABC'.index(c['conf']), not c['rule'].startswith('own-unique')))
        best = cs[0]
        conflict = [c for c in cs[1:] if diff(c['src'], best['src']) >= dd.SAME]
        if conflict and best['conf'] != 'A':
            best = dict(best, conf='C')
        best['note'] = '%s from %s%s' % (best['rule'], best['from'],
                                         '; conflict with %s' % ','.join(c['from'] for c in conflict) if conflict else '')
        rows.append(best)
    return rows


TINT = {'A': (0, 255, 0), 'B': (255, 220, 0), 'C': (255, 0, 0), 'X': (255, 0, 255)}


def _warp(im, M, S, W, H):
    import numpy as np
    from PIL import Image
    Mi = np.linalg.inv(M) @ S
    return np.asarray(im.transform((W, H), Image.AFFINE, tuple(Mi[:2].ravel()), resample=Image.BILINEAR),
                      np.float32) / 255.


def render(L, frame, texmap, tint=None, s=1.0, box=None, movie=None, bg=(0.32, 0.36, 0.42)):
    """L: lwf_rig.LWF; texmap {texture index: RGBA image of the declared size}; tint {texture index: TINT key}
    -> (RGB image, box). Missing textures leave holes; a mask whose texture is missing clips with its rectangle."""
    import numpy as np
    from PIL import Image
    dr = L.draws(movie_id=movie, frame_idx=frame)
    if box is None:
        xs, ys = [], []
        for tex, (u, v, w, h), M, mul, add in dr:
            for cx, cy in ((u, v), (u + w, v), (u, v + h), (u + w, v + h)):
                p = M @ np.array([cx, cy, 1.])
                xs.append(p[0])
                ys.append(p[1])
        if not xs:
            return None, None
        box = (min(xs) - 4, min(ys) - 4, max(xs) + 4, max(ys) + 4)
    x0, y0, x1, y1 = box
    W, H = max(8, int((x1 - x0) * s)), max(8, int((y1 - y0) * s))
    C = np.zeros((H, W, 4), np.float32)
    S = np.array([[1 / s, 0, x0], [0, 1 / s, y0], [0, 0, 1.]])
    cache = {}

    def clip_alpha(md):
        if id(md) not in cache:
            a = np.zeros((H, W, 1), np.float32)
            for x in md:
                im = texmap.get(x[0]) or Image.new('RGBA', (int(x[1][2]), int(x[1][3])), (255, 255, 255, 255))
                a = np.maximum(a, _warp(im, x[2], S, W, H)[..., 3:4])
            cache[id(md)] = a
        return cache[id(md)]

    for d in dr:
        tex, rect, M, mul, add = d
        im = texmap.get(tex)
        if im is None:
            continue
        a = _warp(im, M, S, W, H)
        if tint and tex in tint:
            a = a.copy()
            a[..., :3] = a[..., :3] * 0.4 + np.array(TINT[tint[tex]]) / 255. * 0.6
        al = a[..., 3:4] * float(mul[3])
        for md in (d.masks or ()):
            al = al * clip_alpha(md)
        rgb = np.clip(a[..., :3] * np.array(mul[:3]) + np.array(add[:3]), 0, 1) * al
        if d.blend == 1:                     # add
            C[..., :3] = np.clip(C[..., :3] + rgb, 0, 1)
            continue
        if d.blend == 5:                     # multiply
            C[..., :3] = C[..., :3] * (1 - al + rgb)
        else:
            C[..., :3] = rgb + (1 - al) * C[..., :3]
        C[..., 3:4] = al + (1 - al) * C[..., 3:4]
    out = C[..., :3] + (1 - C[..., 3:4]) * np.array(bg, np.float32)
    return Image.fromarray((np.clip(out, 0, 1) * 255).astype('uint8')), box


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--need', default=os.path.join(D, 'tmp', 'i194_23', 'need_now.json'))
    ap.add_argument('--proposal', default=os.path.join(D, 'tmp', 'dedup', 'proposal.json'))
    ap.add_argument('--cache', default=os.path.join(D, 'tmp', 'deep_donors_cache'))
    ap.add_argument('--out', default=os.path.join(D, 'tmp', 'dedup', 'review', 'own_family.tsv'))
    ap.add_argument('--fams', required=True)
    a = ap.parse_args(argv)
    need = json.load(open(a.need, encoding='utf-8'))
    prop = json.load(open(a.proposal, encoding='utf-8'))['rows']
    sig = dd.Sig(os.path.join(a.cache, 'sig32.pkl'))      # read-only here: never saved
    diff = dm.make_diff(sig)
    cur = {(r['fam'], r['anim'], r['tex']): r for r in prop}
    with open(a.out, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write('family\tanim\ttexname\tsize\tsource\tdonor_lwf\tmethod\tconfidence\tscore\tnote\n')
        for fam in a.fams.split(','):
            for an, v in need.get(fam, {}).items():
                if v.get('status') != 'inc' or not v.get('miss'):
                    continue
                for r in own_candidates(fam, an, need[fam], prop, diff):
                    p = cur.get((fam, an, r['tex']))
                    if p and p.get('src') and diff(p['src'], r['src']) < dd.SAME:
                        continue            # the proposal already holds this image
                    was = 'replaces %s (%s)' % (p['conf'], os.path.basename(p['src'])) if p and p.get('src') else 'fills a hole'
                    lw = need[fam][r['from'].split('/')[1].split('#')[0]]['lwf']
                    fh.write('%s\t%s\t%s\t%dx%d\t%s\t%s\t%s\t%s\t\t%s; %s\n' % (
                        fam, an, r['tex'], r['w'], r['h'], r['src'], lw, r['rule'], r['conf'], r['note'], was))
    return 0


if __name__ == '__main__':
    sys.exit(main())
