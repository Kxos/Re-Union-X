"""Missing enemy textures matched to identical copies stored elsewhere in the dump, by texture-table ORDER (I-194, 23-10).

    python recon/tools/dedup_match.py [--need <need_now.json>] [--out <work dir>] [--fams 1651,1554]
                                      [--names <name_rows_new.tsv>]          (numpy + Pillow: without -I)

Proposal only: writes <out>/proposal.tsv and <out>/proposal.json; nothing is read by the generator.

Why: the containers store identical files once (4-byte stubs for the copies), so whole animation folders of the
extracted dump hold only the .lwf while the very same bitmaps sit in another folder (films lwf/drama, raids
lwf/character/raid, effects, other enemies). deep_donors.py accepts a donor only through content anchors (pieces of
the same animation that survived), so animations with ZERO surviving textures were never matched.

Method, per incomplete animation (need_now.json: lwf, have, miss):
  1. candidate donors: the TOPN LWFs (identical copies by sha1 merged; files resolved over every copy) whose texture
     table declares the most missing sizes (exact size), plus the TOPP whose table is mostly made of missing sizes
     (small specific LWFs: NPCs, raids, other enemies, which big films would otherwise crowd out); the family's
     own other animations are candidates too (only the animation itself is excluded);
  2. alignment: lcs_map of the (w, h) sequences of the enemy table and the donor table (same Flash source -> same
     order; donor tables listed in reverse order are aligned backwards, see align); per aligned index the length of
     the contiguous diagonal run that contains it;
  3. donor check on the enemy's own known pieces aligned to a donor texture: ok (same image, Sig diff < SAME) / bad;
  4. per missing piece the candidates of every donor (aligned file present); agree/disagree = the other
     donors' aligned files equal / different by content (pick: the longest contiguous run at that index, capped at
     RUN_CAP, then the donor rank); nvar = distinct images of that size in the chosen donor;
     an original layer name match (name_rows_new.tsv) confirms or contradicts the pick;
  5. second pass: proposals of pass 1 count as files of their own LWF (e.g. 2021 aligned on 1651 atk1_o).
Confidence (classify): A = clean donor (no contradiction) and either a size unique in the donor, large and aligned on
a long table, or a contiguous run >= RUN_A on a donor covering >= COVER_A of the table, nobody disagreeing, confirmed
by known pieces when the animation has any; B = aligned, ambiguity resolved by run/content, no disagreement;
C = the rest (variants in conflict, short isolated alignments, contradicted donors).
"""
import argparse
import collections
import json
import os
import pickle
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import deep_donors as dd  # noqa: E402

D = dd.D
TOPN = 25
TOPP = 15          # + donors ranked by precision (share of their table that are missing sizes): NPCs, raids
RUN_CAP = 8         # runs longer than this are equally good evidence
RUN_A = 4
COVER_A = 0.6
LARGE = 20000


# --- pure helpers (tested in test_dedup_match.py) ---------------------------------------------------------------------
def runs(mp):
    """{i: j} aligned pairs -> {i: length of the contiguous diagonal run (i+k -> j+k) containing i}."""
    out = {}
    keys = sorted(mp)
    k = 0
    while k < len(keys):
        e = k
        while e + 1 < len(keys) and keys[e + 1] == keys[e] + 1 and mp[keys[e + 1]] == mp[keys[e]] + 1:
            e += 1
        for x in keys[k:e + 1]:
            out[x] = e - k + 1
        k = e + 1
    return out


def align(seq, dseq):
    """enemy (w, h) sequence vs donor sequence -> ({i: j}, runs). Some films list the same bitmaps in REVERSE order
    (e.g. drama 2450101: bitmap 58 .. 8, while enemy 1618 lists bitmap 1 .. 51), so the donor table is aligned both
    ways and the longer alignment is kept; runs are measured on the diagonal of the chosen direction."""
    mp = dd.lcs_map(seq, dseq)
    rv = dd.lcs_map(seq, dseq[::-1])
    if len(rv) > len(mp):
        n = len(dseq)
        return {i: n - 1 - j for i, j in rv.items()}, runs(rv)
    return mp, runs(mp)


def name_key(n):
    """meaningful original layer name of a texture ('<prefix>_<hex utf-8>.png'), or None for the generic
    Flash 'bitmap N' names (their numbers differ between LWFs) and undecodable names."""
    m = re.search(r'_([0-9a-f]+)\.png$', n)
    if not m:
        return None
    try:
        s = bytes.fromhex(m.group(1)).decode('utf-8')
    except ValueError:
        return None
    if re.fullmatch(r'(ビットマップ|bitmap|Bitmap) ?\d+\.png', s):
        return None
    return s


def name_pins(T, t, mp, rn):
    """same meaningful name and same size in the donor table pins the alignment (1554: 37 tail frames of equal size,
    pic000001..037, that the reversed alignment had mapped end to end); pinned pieces count as a capped run."""
    idx = {}
    for j, (n, w, h) in enumerate(t):
        k = name_key(n)
        if k:
            idx.setdefault((k, w, h), j)
    for i, (n, w, h) in enumerate(T):
        k = name_key(n)
        j = idx.get((k, w, h)) if k else None
        if j is not None:
            mp[i] = j
            rn[i] = max(rn.get(i, 0), RUN_CAP)


def classify(c):
    """c: dict with bad, ok, haves (known pieces of the animation), cover (aligned share of the table), run, nvar,
    area, agree, disagree, name (+1 confirmed, -1 contradicted, 0 none) -> 'A' | 'B' | 'C'."""
    if c['disagree'] or c['name'] < 0 or c['bad'] > 0 and c['bad'] >= c['ok']:
        return 'C'
    clean = c['bad'] == 0
    confirmed = c['ok'] >= 1 or c['haves'] == 0
    unique_large = c['nvar'] == 1 and c['area'] >= LARGE and c['cover'] >= COVER_A
    long_run = c['run'] >= RUN_A and c['cover'] >= COVER_A
    if clean and confirmed and (unique_large or long_run):
        g = 'A'
    elif (c['run'] >= 2 or c['nvar'] == 1) and (clean or c['ok'] >= 4 * c['bad']):
        g = 'B'
    else:
        g = 'C'
    if c['name'] > 0 and g != 'A':
        g = 'B' if g == 'C' else 'A'
    return g


def donor_rank(dn):
    """sort key of an evaluated donor (smaller = better)."""
    return (dn['bad'] > 0, -dn['ok'] + 2 * dn['bad'], -dn['cover'])


def make_diff(sig):
    """content difference that tolerates a rescaled copy (the generator's 'copia' survivors are often resized):
    Sig.diff when the sizes agree, else the 32x32 signatures when the aspect ratios agree within 6%."""
    import numpy as np

    def diff(p, q):
        a, b = sig(p), sig(q)
        if a is None or b is None:
            return 999.0
        (aw, ah), (bw, bh) = a[1], b[1]
        if abs(aw - bw) <= 2 and abs(ah - bh) <= 2:
            return sig.diff(p, q)
        if abs(aw / max(1, ah) - bw / max(1, bh)) > 0.06 * (aw / max(1, ah)):
            return 999.0
        m = np.maximum(a[0][..., 3], b[0][..., 3]) > 8
        d = np.abs(a[0] - b[0])
        return float(d.mean() if m.sum() < 4 else d[m].mean())
    return diff


def palette(a):
    """alpha-weighted 4x4x4 colour histogram of a 32x32 premultiplied signature (normalised)."""
    import numpy as np
    x = a.astype(np.float32)
    al = x[..., 3:4] / 255.
    rgb = np.where(al > 0.03, x[..., :3] / np.maximum(al, 1e-3), 0)
    q = np.clip(rgb // 64, 0, 3).astype(int)
    idx = q[..., 0] * 16 + q[..., 1] * 4 + q[..., 2]
    h = np.bincount(idx.ravel(), weights=al[..., 0].ravel(), minlength=64)
    return h / max(1e-6, h.sum())


def pick_by_palette(cands, refs):
    """cands: [palette] of the variants, refs: [palette] of trusted neighbours -> (best index, margin) or None.
    score = mean histogram intersection with the neighbours."""
    import numpy as np
    if len(cands) < 2 or not refs:
        return None
    sc = [float(np.mean([np.minimum(c, r).sum() for r in refs])) for c in cands]
    o = sorted(range(len(sc)), key=lambda k: -sc[k])
    return o[0], sc[o[0]] - sc[o[1]]


PAL_WIN = 4
PAL_MARGIN = 0.08


def palette_pass(rows, T, have, sig, diff):
    """C / ambiguous B pieces with same-size variants: the variant whose colours agree best with the trusted
    neighbours in the enemy table (known pieces and A picks within PAL_WIN); a clear margin lifts C -> B only
    when no other clean donor disagreed (a conflict between donors stays C, e.g. 1544's lid, where the palette
    chose 1637's bow over the video-confirmed 1545 lid); a different variant than the aligned one is reported."""
    trusted = {}
    for i, (n, w, h) in enumerate(T):
        if n in have and sig(have[n]) is not None:
            trusted[i] = palette(sig(have[n])[0])
    for r in rows:
        if r['src'] and r['conf'] == 'A' and sig(r['src']) is not None:
            trusted[r['i']] = palette(sig(r['src'])[0])
    for r in rows:
        if not r['src'] or r['conf'] == 'A' or len(r.get('alts') or []) < 2:
            continue
        refs = [p for k, p in trusted.items() if k != r['i'] and abs(k - r['i']) <= PAL_WIN]
        alts = [q for q in r['alts'] if sig(q) is not None]
        res = pick_by_palette([palette(sig(q)[0]) for q in alts], refs)
        if not res:
            continue
        k, margin = res
        if margin < PAL_MARGIN:
            continue
        if diff(alts[k], r['src']) >= dd.SAME:
            r['method'] += '+palette(changed,margin=%.2f)' % margin
            r['src'] = alts[k]
        else:
            r['method'] += '+palette(margin=%.2f)' % margin
        if r['conf'] == 'C' and r['c']['bad'] == 0 and r['c']['disagree'] == 0 and r['c']['name'] >= 0:
            r['conf'] = 'B'


BITMAP = re.compile(r'^(?:ビットマップ|bitmap|Bitmap) ?(\d+)\.png$')
OFF_MIN = 5         # survivors supporting one numbering offset
OFF_SHARE = 0.8     # share of the survivors of that film with that offset


def bitmap_no(n):
    """'<prefix>_<hex of "bitmap N.png">.png' -> N, else None"""
    m = re.search(r'_([0-9a-f]+)\.png$', n)
    if not m:
        return None
    try:
        b = BITMAP.match(bytes.fromhex(m.group(1)).decode('utf-8'))
    except ValueError:
        return None
    return int(b.group(1)) if b else None


def offsets(pairs):
    """[(enemy bitmap N, film bitmap M)] -> dominant M - N when supported by >= OFF_MIN and >= OFF_SHARE, else None."""
    c = collections.Counter(m - n for n, m in pairs)
    if not c:
        return None
    k, s = c.most_common(1)[0]
    return k if s >= OFF_MIN and s >= OFF_SHARE * len(pairs) else None


def local_offset(pairs, n, k=4):
    """offset at enemy bitmap n from the k survivors with the nearest numbers: all equal (and >= 3) -> it, else None
    (1550 dead: bitmaps 2..9 at +18, 10..20 at +22, so bitmap 1 takes +18)."""
    near = sorted(pairs, key=lambda x: (abs(x[0] - n), x[0]))[:k]
    offs = {m - a for a, m in near}
    return offs.pop() if len(near) >= 3 and len(offs) == 1 else None


def offset_pass(fam, an, rows, T, have, by, tab, sha_of):
    """the survivors often come from the creature's own film with a constant bitmap-number offset (enemy 'bitmap N' =
    film 'bitmap N+k': 1618 +7 from 2450101, 1629 +319 from 2470401, 1550 dead +18 from 2323901), while the film table
    order is shuffled or reversed so that the order alignment misses it. k: the film's dominant offset, else the
    offset shared by the nearest survivors (local_offset). A missing 'bitmap N' then takes the film's
    'bitmap N+k' when it exists with the exact declared size; it replaces pieces without source and B/C picks (A picks
    stay; a different image is reported in the method)."""
    lwf_in = {}
    for q, s in sha_of.items():
        lwf_in.setdefault(os.path.normcase(os.path.dirname(q)), s)
    pairs = collections.defaultdict(list)
    for n, f in have.items():
        a, b = bitmap_no(n), bitmap_no(os.path.basename(f).split('.')[0] + '.png')
        s = lwf_in.get(os.path.normcase(os.path.dirname(f)))
        if a is not None and b is not None and s:
            pairs[s].append((a, b))
    byrow = {r['tex']: r for r in rows}
    for s, pr in pairs.items():
        kg = offsets(pr)
        fl = files_of(s, by, tab)
        film = {bitmap_no(n): (w, h, fl[n]) for n, w, h in tab[s] if n in fl and bitmap_no(n) is not None}
        for n, w, h in T:
            r = byrow.get(n)
            a = bitmap_no(n)
            if r is None or a is None or r['conf'] == 'A':
                continue
            k = kg if kg is not None else local_offset(pr, a)
            if k is None or (a + k) not in film or film[a + k][:2] != (w, h):
                continue
            r['src'], r['donor'], r['conf'] = film[a + k][2], by[s][0], 'A'
            r['method'] = 'offset(film bitmap N%+d, %d/%d survivors)' % (k, sum(1 for x in pr if x[1] - x[0] == k),
                                                                        len(pr))


# --- data ---------------------------------------------------------------------------------------------------------------
def pool_of(p):
    pn = os.path.normcase(p)
    for k, r in dd.SCAN_ROOTS:
        if pn.startswith(os.path.normcase(r) + os.sep):
            return k
    return None


def load_index(cache):
    """{sha: [paths]}, {sha: table}, {path: sha} from the deep_donors LWF index cache."""
    old = pickle.load(open(cache, 'rb'))
    by, tab, sha_of = collections.defaultdict(list), {}, {}
    for (q, sz, mt), v in old.items():
        if v:
            by[v[0]].append(q)
            tab[v[0]] = v[1]
            sha_of[q] = v[0]
    del old
    order = {k: n for n, (k, r) in enumerate(dd.SCAN_ROOTS)}
    for s in by:
        by[s].sort(key=lambda q: (order.get(pool_of(q), 99), q))
    return by, tab, sha_of


_files = {}


def files_of(sha, by, tab):
    """texture name -> first existing file over every copy of the LWF (stubs of the dedup skipped)."""
    if sha not in _files:
        names = [x[0] for x in tab[sha]]
        out = {}
        for q in by[sha]:
            pool = pool_of(q)
            if not pool:
                continue
            for n, f in dd.resolve(pool, q, [n for n in names if n not in out]).items():
                if f and os.path.getsize(f) > 64:
                    out[n] = f
        _files[sha] = out
    return _files[sha]


def load_names(p):
    out = {}
    if p and os.path.exists(p):
        for line in open(p, encoding='utf-8'):
            x = line.rstrip('\n').split('\t')
            if len(x) >= 2:
                out[x[0]] = x[1]
    return out


# --- matcher ------------------------------------------------------------------------------------------------------------
def match_anim(fam, an, v, by, tab, sha_of, sig, names, virt):
    diff = make_diff(sig)
    T = dd.lwf_textures(open(v['lwf'], 'rb').read())
    seq = [(w, h) for n, w, h in T]
    miss = {m[0] for m in v['miss']}
    have = {n: x[0] for n, x in v['have'].items()}
    mi = [i for i, (n, w, h) in enumerate(T) if n in miss]
    ms = collections.Counter(seq[i] for i in mi)
    # only the animation itself is excluded: the family's OTHER animations are the best donors (1520 atk1_o: the
    # 85x76 torso is in its own complete wait, under another bitmap number)
    me = sha_of.get(v['lwf'])
    sc = []
    for s, t in tab.items():
        if s == me or any(os.path.normcase(q) == os.path.normcase(v['lwf']) for q in by[s]):
            continue
        dims = {(w, h) for n, w, h in t}
        c = sum(k for wh, k in ms.items() if wh in dims)
        if c:
            sc.append((c, s, c / max(1, len(t))))
    sc.sort(key=lambda x: -x[0])
    need = min(3, len(mi))
    prec = sorted((x for x in sc if x[0] >= need), key=lambda x: (-x[2], -x[0]))[:TOPP]
    pick = sc[:TOPN] + [x for x in prec if x not in sc[:TOPN]]
    donors = []
    for c, s, pr in pick:
        t = tab[s]
        fl = dict(files_of(s, by, tab))
        for q in by[s]:
            fl.update({k: f for k, f in virt.get(q, {}).items() if k not in fl})
        mp, rn = align(seq, [(w, h) for n, w, h in t])
        name_pins(T, t, mp, rn)
        ok = bad = 0
        for i, j in mp.items():
            n = T[i][0]
            if n in have and t[j][0] in fl:
                if diff(have[n], fl[t[j][0]]) < dd.SAME:
                    ok += 1
                else:
                    bad += 1
        donors.append({'sha': s, 'path': by[s][0], 't': t, 'files': fl, 'mp': mp, 'runs': rn, 'ok': ok, 'bad': bad,
                       'cover': len(mp) / max(1, len(T)), 'nmiss': sum(1 for i in mi if i in mp and t[mp[i]][0] in fl)})
    donors = [d for d in donors if d['nmiss']]
    donors.sort(key=donor_rank)
    rows = []
    for i in mi:
        n, w, h = T[i]
        cands = []
        for k, d in enumerate(donors):
            j = d['mp'].get(i)
            if j is not None and d['t'][j][0] in d['files']:
                cands.append((k, d, j, d['files'][d['t'][j][0]]))
        pub = 'lwf/character/enemy/%s/%s/%s' % (fam, an, n)
        if not cands:
            rows.append({'fam': fam, 'anim': an, 'i': i, 'tex': n, 'w': w, 'h': h, 'src': None, 'conf': '-',
                         'method': 'none'})
            continue
        # best donor; when equal by rank prefer the longest run at this index
        k0 = min(cands, key=lambda c: (c[1]['bad'] > 0 and c[1]['bad'] >= c[1]['ok'], -min(c[1]['runs'].get(i, 0), RUN_CAP))
                 + donor_rank(c[1]))
        _, d, j, f = k0
        agree = sum(1 for c in cands if c is not k0 and diff(c[3], f) < dd.SAME)
        disagree = sum(1 for c in cands if c is not k0 and diff(c[3], f) >= dd.SAME
                       and c[1]['bad'] == 0 and c[1]['runs'].get(i, 0) >= d['runs'].get(i, 0))
        same = [d['files'][x[0]] for x in d['t'] if (x[1], x[2]) == (w, h) and x[0] in d['files']]
        var = []
        for q in same:
            if not any(diff(q, r) < dd.SAME for r in var):
                var.append(q)
        nm = 0
        if pub in names:
            nm = 1 if diff(names[pub], f) < dd.SAME else -1
        c = {'bad': d['bad'], 'ok': d['ok'], 'haves': len(have), 'cover': round(d['cover'], 3),
             'run': d['runs'].get(i, 0), 'nvar': max(1, len(var)), 'area': w * h, 'agree': agree,
             'disagree': disagree, 'name': nm}
        g = classify(c)
        meth = 'order(run=%d,cover=%.2f,ok=%d,bad=%d,nvar=%d,agree=%d,disagree=%d)%s' % (
            c['run'], c['cover'], c['ok'], c['bad'], c['nvar'], agree, disagree,
            '+name' if nm > 0 else ('-name' if nm < 0 else ''))
        alts = list(var)
        for dx in donors:
            for x in dx['t']:
                if (x[1], x[2]) == (w, h) and x[0] in dx['files']:
                    q = dx['files'][x[0]]
                    if not any(diff(q, r) < dd.SAME for r in alts):
                        alts.append(q)
        rows.append({'fam': fam, 'anim': an, 'i': i, 'tex': n, 'w': w, 'h': h, 'src': f, 'donor': d['path'], 'alts': alts,
                     'conf': g, 'method': meth, 'score': round(d['ok'] / max(1, d['ok'] + d['bad']), 3), 'c': c})
    palette_pass(rows, T, have, sig, diff)
    offset_pass(fam, an, rows, T, have, by, tab, sha_of)
    for r in rows:              # earlier visual rejects (deep_donors.VISUAL_REJECT) stay visible but never above C
        if r['src'] and dd.rejected(int(fam), r['src']):
            r['conf'] = 'C'
            r['method'] += '+visual_reject'
    for r in rows:
        r.pop('alts', None)
    return rows, [{'path': d['path'], 'ok': d['ok'], 'bad': d['bad'], 'cover': round(d['cover'], 3),
                   'nmiss': d['nmiss']} for d in donors]


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--need', default=os.path.join(D, 'tmp', 'i194_23', 'need_now.json'))
    ap.add_argument('--cache', default=os.path.join(D, 'tmp', 'deep_donors_cache'))
    ap.add_argument('--names', default=os.path.join(D, 'tmp', 'i194_sources', 'name_rows_new.tsv'))
    ap.add_argument('--out', default=os.path.join(D, 'tmp', 'dedup'))
    ap.add_argument('--fams')
    a = ap.parse_args(argv)
    need = json.load(open(a.need, encoding='utf-8'))
    if a.fams:
        need = {k: v for k, v in need.items() if k in a.fams.split(',')}
    by, tab, sha_of = load_index(os.path.join(a.cache, 'lwf_index.pkl'))
    print('LWF tables', len(tab), flush=True)
    sig = dd.Sig(os.path.join(a.cache, 'sig32.pkl'))
    names = load_names(a.names)
    virt = {}
    for rnd in (1, 2):
        allrows, dons = [], {}
        for fam in sorted(need, key=int):
            for an, v in need[fam].items():
                if v.get('status') != 'inc' or not v.get('miss'):
                    continue
                rows, ds = match_anim(fam, an, v, by, tab, sha_of, sig, names, virt)
                allrows += rows
                dons['%s/%s' % (fam, an)] = ds
            sig.save()
        virt = {}
        for r in allrows:
            if r['src'] and r['conf'] in 'AB':
                lw = need[r['fam']][r['anim']]['lwf']
                virt.setdefault(lw, {})[r['tex']] = r['src']
        cnt = collections.Counter(r['conf'] for r in allrows)
        print('round', rnd, dict(cnt), flush=True)
    os.makedirs(a.out, exist_ok=True)
    with open(os.path.join(a.out, 'proposal.tsv'), 'w', encoding='utf-8', newline='\n') as fh:
        fh.write('family\tanim\ttexname\tsize\tsource\tdonor_lwf\tmethod\tconfidence\tscore\n')
        for r in allrows:
            fh.write('%s\t%s\t%s\t%dx%d\t%s\t%s\t%s\t%s\t%s\n' % (
                r['fam'], r['anim'], r['tex'], r['w'], r['h'], r['src'] or '', r.get('donor', ''), r['method'],
                r['conf'], r.get('score', '')))
    json.dump({'rows': allrows, 'donors': dons}, open(os.path.join(a.out, 'proposal.json'), 'w', encoding='utf-8'),
              indent=0, ensure_ascii=False)
    return 0


if __name__ == '__main__':
    sys.exit(main())
