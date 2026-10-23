"""Rescaled copies of missing enemy textures, downscaled to the declared size (I-194, 23-10). PROPOSAL ONLY.

    python recon/tools/dedup_rescale.py [--work <tmp\\dedup\\rescale>] [--stage all|collect|search|png|gen|sheets]
                                        [--fams 240,272]                 (numpy + Pillow: without -I)

Nothing here is read by the generator: the script writes, under tmp\\dedup\\rescale (local only),
  png\\<family>\\<anim>\\<texname>   the donor downscaled to the size the enemy LWF declares (never upscaled);
  rescale_proposal.tsv             family, anim, texname, declared size, source, source size, scale factor, method,
                                   confidence, note (+ origin, approved);
  sheets\\<family>.png              per animation: current (as served after the approved integration) | with the
                                   rescaled pieces | tint of the rescaled pieces; per piece: donor original (size),
                                   downscaled result, known original of the slot (if any);
  summary.txt                      counts and the families that would become complete (generator dry runs).

Why: dedup_export.py skips "rescaled copies": the order-aligned donor file is the same art stored at another pixel
size than the declared one (e.g. a 97x24 shadow stored as 855x214) and make_jp_enemies.py fits() refuses anything
more than 2 px off. The user agreed in principle to DOWNSCALE such copies to the declared size (never upscale), each
piece verified on the sheets first.

Candidates:
  1. proposal rows (tmp\\dedup\\proposal.tsv; review overrides tmp\\dedup\\review\\overrides_*.tsv win for the same
     family/anim/texname, as in dedup_export.merge) whose source size differs from the declared size by > 2 px;
  2. search: slots still missing after the approved integration that have no usable source, matched to LWF tables
     that declare the SAME sequence at a larger uniform scale (k-vote over aspect-ratio-compatible sizes, then an LCS
     of the enemy sizes against the donor sizes divided by k, both orders, as dedup_match.align).
Validation: aspect ratio of the file against the declared size (<= AR_TOL), no upscaling, scale factor consistent
with the other files of the donor LWF, order evidence (run/cover/ok/bad), content check of the downscaled image
against the known original of the same slot in another animation of the family (aligned by size order, run >= 2).
Search runs made only of equal sizes count as run 1 (1581: ten 69x186 avatar hair frames are no order evidence).
Sheets: lwf_rig.LWF + dedup_review.render() (blend mode from place.objectId, Flash mask layers clip, never drawn).
Grade A/B/C as dedup_match.classify; R = rejected (upscale / aspect); confirmed by a known original: one grade up;
contradicted: C; scale inconsistent with its donor and not confirmed: one grade down.
"""
import argparse
import collections
import io
import json
import math
import os
import pickle
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

D = r'D:\Progetto_Restauro_KH_UX'
WORK = os.path.join(D, 'tmp', 'dedup', 'rescale')
NEED = os.path.join(D, 'tmp', 'i194_23', 'need_now.json')
TABLES = os.path.join(D, 'tmp', 'dedup', 'work', 'lwf_tables.pkl')      # read-only (shared with other agents)
TOL = 2             # generator fits(): +-2 px
AR_TOL = 0.02       # aspect ratio of the donor file vs the declared size
SCALE_TOL = 0.03    # piece factor vs the donor LWF's typical factor
SAME = 6.0          # deep_donors.SAME: mean difference /255 of the 32x32 premultiplied signatures
MIN_K = 1.04        # search: the donor table must be larger (never upscale)
TOP_DONORS = 25     # search: (table, k) pairs with the most votes evaluated per animation
MAX_CHECK = 12      # search: known pieces compared per donor (ok / bad)
ORIGINAL = ('jp', 'diretto', 'stesso', 'doppione', 'copia')
GRADES = 'ABC'
TINT = {'A': (0, 255, 0), 'B': (255, 220, 0), 'C': (255, 0, 0)}


# --- pure helpers (tested in test_dedup_rescale.py) ---------------------------------------------------------------------
def aspect_err(src, dst):
    """relative difference of the aspect ratios of two (w, h) sizes."""
    return abs((src[0] / max(1, src[1])) / (dst[0] / max(1, dst[1])) - 1)


def is_upscale(src, dst, tol=TOL):
    """the donor is smaller than the declared size in some dimension (beyond the generator tolerance)."""
    return src[0] < dst[0] - tol or src[1] < dst[1] - tol


def needs_rescale(src, dst, tol=TOL):
    return abs(src[0] - dst[0]) > tol or abs(src[1] - dst[1]) > tol


def grade(base, up, ar, known=0, scale_ok=None):
    """-> (grade, reason). base: A/B/C of the order evidence; known: +1 confirmed / -1 contradicted / 0 none by a
    known original of the slot; scale_ok: factor consistent with the donor LWF (None = unknown)."""
    if up:
        return 'R', 'upscale refused'
    if ar > AR_TOL:
        return 'R', 'aspect ratio differs by %.1f%%' % (ar * 100)
    g = GRADES.index(base) if base in GRADES else 2
    why = []
    if known < 0:
        g = 2
        why.append('known original differs')
    elif known > 0:
        g = max(0, g - 1)
        why.append('known original confirms')
    if scale_ok is False and known <= 0:
        g = min(2, g + 1)
        why.append('scale factor unlike the donor LWF')
    return GRADES[g], '; '.join(why)


def downscale(im, size):
    """RGBA image -> RGBA of `size` with LANCZOS on premultiplied alpha (float, no dark fringes). Never upscales."""
    import numpy as np
    from PIL import Image
    if is_upscale(im.size, size):
        raise ValueError('upscale refused: %s -> %s' % (im.size, size))
    a = np.asarray(im.convert('RGBA'), dtype=np.float32) / 255.0
    al = a[..., 3]
    ch = [a[..., k] * al for k in range(3)] + [al]
    out = [np.asarray(Image.fromarray(c, 'F').resize(size, Image.LANCZOS), dtype=np.float32) for c in ch]
    A = np.clip(out[3], 0, 1)
    rgb = [np.where(A > 1e-4, np.clip(c, 0, None) / np.maximum(A, 1e-4), 0) for c in out[:3]]
    res = np.dstack([np.clip(c, 0, 1) for c in rgb] + [A])
    return Image.fromarray((res * 255 + 0.5).astype('uint8'), 'RGBA')


def sig(im):
    """32x32 premultiplied signature of an RGBA image (as deep_donors.Sig)."""
    import numpy as np
    from PIL import Image
    a = np.asarray(im.convert('RGBA'), dtype=np.float32).copy()
    a[..., :3] *= a[..., 3:4] / 255.0
    return np.asarray(Image.fromarray(a.astype('uint8'), 'RGBA').resize((32, 32), Image.BILINEAR), dtype=np.int16)


def sig_diff(a, b):
    import numpy as np
    m = np.maximum(a[..., 3], b[..., 3]) > 8
    d = np.abs(a - b)
    return float(d.mean() if m.sum() < 4 else d[m].mean())


def close_scaled(e, dk, tol=0.03):
    """enemy size e (w, h) vs donor size dk already divided by k: equal within max(1.5 px, tol)."""
    return all(abs(x - y) <= max(1.5, tol * x) for x, y in zip(e, dk))


def lcs_tol(A, B, eq):
    """LCS of A and B with the predicate eq(a, b) -> {i: j}."""
    n, m = len(A), len(B)
    L = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(n - 1, -1, -1):
        Li, Ln = L[i], L[i + 1]
        for j in range(m - 1, -1, -1):
            Li[j] = Ln[j + 1] + 1 if eq(A[i], B[j]) else max(Ln[j], Li[j + 1])
    i = j = 0
    mp = {}
    while i < n and j < m:
        if eq(A[i], B[j]):
            mp[i] = j
            i += 1
            j += 1
        elif L[i + 1][j] >= L[i][j + 1]:
            i += 1
        else:
            j += 1
    return mp


def runs(mp):
    """{i: j} -> {i: length of the contiguous diagonal run containing i} (dedup_match.runs)."""
    out, keys, k = {}, sorted(mp), 0
    while k < len(keys):
        e = k
        while e + 1 < len(keys) and keys[e + 1] == keys[e] + 1 and mp[keys[e + 1]] == mp[keys[e]] + 1:
            e += 1
        for x in keys[k:e + 1]:
            out[x] = e - k + 1
        k = e + 1
    return out


def align_scaled(seq, dseq, k):
    """enemy sizes vs donor sizes at scale k (donor = k * enemy), forward and reversed (dedup_match.align)."""
    ds = [(w / k, h / k) for w, h in dseq]
    mp = lcs_tol(seq, ds, close_scaled)
    rv = lcs_tol(seq, ds[::-1], close_scaled)
    if len(rv) > len(mp):
        n = len(ds)
        return {i: n - 1 - j for i, j in rv.items()}, runs(rv)
    return mp, runs(mp)


def k_votes(pieces, W, H, tid, kmin=MIN_K, ar_tol=AR_TOL, step=0.01):
    """pieces [(i, w, h)]; W, H, tid: numpy arrays of every donor table entry -> Counter{(table, k bin): pieces}."""
    import numpy as np
    votes = collections.Counter()
    lstep = math.log(1 + step)
    for i, w, h in pieces:
        m = (W >= w * kmin) & (H >= h * kmin) & (np.abs(W * h - H * w) <= ar_tol * W * h)
        if not m.any():
            continue
        kb = np.round(np.log(W[m] / w) / lstep).astype(np.int64)
        key = np.unique(tid[m].astype(np.int64) * 100000 + kb)
        for x in key.tolist():
            votes[(x // 100000, x % 100000)] += 1
    return votes


# --- data ---------------------------------------------------------------------------------------------------------------
def load_img(p, size=None):
    import btf
    from PIL import Image
    b = open(p, 'rb').read()
    im = (btf.decode(b) if b[:4] == b'\x89BTF' else Image.open(io.BytesIO(b))).convert('RGBA')
    if size and im.size != tuple(size):
        im = im.resize(tuple(size), Image.BILINEAR)
    return im


def logical(name):
    m = re.match(r'^(.*)\.(\d{8})(\.[^.]+)$', name)
    return m.group(1) + m.group(3) if m else name


class Ctx:
    def __init__(self, work):
        import dedup_export as de
        self.de = de
        self.work = work
        self.need = json.load(open(NEED, encoding='utf-8'))
        self.allow = de.parse_allow(open(de.APPROVED, encoding='utf-8'))
        self.rows, self.reviewed = de.merge(de.read_proposal(de.PROPOSAL), de.overrides_default())
        self.ovkeys = set()
        for f in de.overrides_default():
            for r in de.read_proposal(f):
                self.ovkeys.add((r['family'], r['anim'], r['texname']))
        self._tabs = None
        self.texsrc = None
        self._tex = {}
        self._sigs = {}

    def tabs(self):
        if self._tabs is None:
            T = pickle.load(open(TABLES, 'rb'))
            by, tab = collections.defaultdict(list), {}
            for q, (k, sh, t) in T.items():
                by[sh].append(q)
                tab[sh] = t
            del T
            import deep_donors as dd
            import dedup_match as dm
            order = {k: n for n, (k, r) in enumerate(dd.SCAN_ROOTS)}
            for s in by:
                by[s].sort(key=lambda q: (order.get(dm.pool_of(q), 99), q))
            self._tabs = (by, tab)
        return self._tabs

    def files(self, sha):
        import dedup_match as dm
        by, tab = self.tabs()
        return dm.files_of(sha, by, tab)

    def lwf(self, fam, an):
        v = self.need.get(fam, {}).get(an)
        if v and v.get('lwf'):
            return v['lwf']
        import deep_donors as dd
        return dd.listing(os.path.join(dd.JP431, 'lwf', 'character', 'enemy', fam, an)).get(an + '.lwf')

    def table(self, fam, an):
        """[(name, w, h)] of the enemy animation's LWF."""
        if (fam, an) not in self._tex:
            import deep_donors as dd
            p = self.lwf(fam, an)
            self._tex[(fam, an)] = dd.lwf_textures(open(p, 'rb').read()) if p and os.path.exists(p) else []
        return self._tex[(fam, an)]

    def sig_of(self, p, size=None):
        k = (p, tuple(size) if size else None)
        if k not in self._sigs:
            try:
                self._sigs[k] = sig(load_img(p, size))
            except Exception:                   # noqa: BLE001
                self._sigs[k] = None
        return self._sigs[k]

    def served(self, fam, an):
        """{texname: (path, kind)} of the generator baseline (texsrc.json of the dry run)."""
        return {n: tuple(v) for n, v in self.texsrc.get('%s/%s' % (fam, an), {}).items()}


# --- evidence -----------------------------------------------------------------------------------------------------------
def parse_method(m):
    out = {}
    for k in ('run', 'ok', 'bad', 'nvar', 'agree', 'disagree'):
        x = re.search(r'\b%s=(\d+)' % k, m or '')
        if x:
            out[k] = int(x.group(1))
    x = re.search(r'cover=([\d.]+)', m or '')
    if x:
        out['cover'] = float(x.group(1))
    return out


def own_align(ctx, fam, an, other):
    """{i: j} sizes aligned between two animations of the family (iterated LCS) and runs."""
    import deep_donors as dd
    A = [(w, h) for n, w, h in ctx.table(fam, an)]
    B = [(w, h) for n, w, h in ctx.table(fam, other)]
    mp = {}
    for _ in range(3):
        ia = [i for i in range(len(A)) if i not in mp]
        used = set(mp.values())
        jb = [j for j in range(len(B)) if j not in used]
        m = dd.lcs_map([A[i] for i in ia], [B[j] for j in jb])
        if not m:
            break
        for x, y in m.items():
            mp[ia[x]] = jb[y]
    return mp, runs(mp)


def family_anims(ctx, fam):
    return sorted({k.split('/')[1] for k in ctx.texsrc if k.split('/')[0] == fam} | set(ctx.need.get(fam, {})))


def known_originals(ctx, fam, an, i):
    """[(other anim, texname, path, kind, run, how)] served originals of the same slot in the family's other
    animations: aligned by size order (run >= 2, or the size is unique in both tables: how='slot'); else any served
    piece of the same declared size unique in its table (how='size': confirms only, never contradicts)."""
    out, size = [], []
    T = ctx.table(fam, an)
    if not (0 <= i < len(T)):
        return out
    wh = T[i][1:]
    uniq_a = sum(1 for t in T if t[1:] == wh) == 1
    for other in family_anims(ctx, fam):
        To = ctx.table(fam, other)
        if other == an or not To:
            continue
        served = ctx.served(fam, other)
        mp, rn = own_align(ctx, fam, an, other)
        j = mp.get(i)
        uniq = uniq_a and sum(1 for t in To if t[1:] == wh) == 1
        if j is not None and (rn.get(i, 0) >= 2 or uniq):
            n = To[j][0]
            p, kind = served.get(n, (None, None))
            if p and kind in ORIGINAL + ('dedup',):
                out.append((other, n, p, kind, rn.get(i, 0), 'slot'))
                continue
        hits = [t for t in To if t[1:] == wh]
        if len(hits) == 1:
            p, kind = served.get(hits[0][0], (None, None))
            if p and kind in ORIGINAL + ('dedup',):
                size.append((other, hits[0][0], p, kind, 0, 'size'))
    return out + size


_lwf_dir = {}


def donor_factor(ctx, src, donor_lwf):
    """typical (median) file/declared factor of the donor LWF's other textures -> (factor or None, n, lwf)."""
    import deep_donors as dd
    lw = donor_lwf if donor_lwf and os.path.exists(donor_lwf) else None
    d = os.path.dirname(src)
    if lw is None:
        if d not in _lwf_dir:
            _lwf_dir[d] = [os.path.join(d, f) for f in os.listdir(d) if f.endswith('.lwf')] if os.path.isdir(d) else []
        name = logical(os.path.basename(src))
        for q in _lwf_dir[d]:
            try:
                if any(n == name for n, w, h in dd.lwf_textures(open(q, 'rb').read())):
                    lw = q
                    break
            except Exception:                   # noqa: BLE001
                continue
    if lw is None:
        return None, 0, None
    try:
        T = dd.lwf_textures(open(lw, 'rb').read())
    except Exception:                           # noqa: BLE001
        return None, 0, lw
    ls = dd.listing(os.path.dirname(lw))
    fs = []
    for n, w, h in T:
        f = ls.get(n)
        if f and os.path.normcase(f) != os.path.normcase(src) and os.path.getsize(f) > 64:
            s = ctx.de.file_size(f)
            if s and w > 4 and h > 4:
                fs.append(s[0] / w)
    if not fs:
        return None, 0, lw
    fs.sort()
    return fs[len(fs) // 2], len(fs), lw


# --- stages -------------------------------------------------------------------------------------------------------------
def collect(ctx, fams=None):
    """candidates of kind 1 (proposal/override rows whose source has another size)."""
    out = []
    for r in ctx.rows:
        if fams and r['family'] not in fams or not r.get('source'):
            continue
        s = ctx.de.file_size(r['source'])
        dw, dh = (int(x) for x in r['size'].split('x'))
        if s is None or not needs_rescale(s, (dw, dh)):
            continue
        T = ctx.table(r['family'], r['anim'])
        idx = [k for k, t in enumerate(T) if t[0] == r['texname']]
        out.append({'family': r['family'], 'anim': r['anim'], 'texname': r['texname'], 'i': idx[0] if idx else -1,
                    'size': [dw, dh], 'source': r['source'], 'ssize': list(s), 'donor_lwf': r.get('donor_lwf', ''),
                    'method': r.get('method', ''), 'base': r.get('confidence', 'C'), 'note0': r.get('note', ''),
                    'origin': 'override' if (r['family'], r['anim'], r['texname']) in ctx.ovkeys else 'proposal',
                    'approved': ctx.de.allowed(ctx.allow, r['family'], r['anim'], r)})
    return out


def leftover(ctx, cands, fams=None):
    """slots missing in the baseline without a usable kind-1 candidate -> {(fam, an): [(i, name, w, h)]}."""
    ok = {(c['family'], c['anim'], c['texname']) for c in cands
          if not is_upscale(c['ssize'], c['size']) and aspect_err(c['ssize'], c['size']) <= AR_TOL}
    out = {}
    for key, d in ctx.texsrc.items():
        fam, an = key.split('/')
        if fams and fam not in fams or fam not in ctx.need or an not in ctx.need[fam]:
            continue
        T = ctx.table(fam, an)
        miss = [(i, n, w, h) for i, (n, w, h) in enumerate(T) if not d.get(n, [None])[0] and (fam, an, n) not in ok]
        if miss:
            out[(fam, an)] = miss
    return out


def search(ctx, left, log=print):
    """kind-2 candidates: donor tables declaring the enemy's sequence at a larger uniform scale."""
    import numpy as np
    import deep_donors as dd
    by, tab = ctx.tabs()
    shas = list(tab)
    W, H, tid = [], [], []
    for k, s in enumerate(shas):
        for n, w, h in tab[s]:
            W.append(w)
            H.append(h)
            tid.append(k)
    W, H, tid = (np.array(x, dtype=np.float64) for x in (W, H, tid))
    out = []
    lstep = math.log(1.01)
    for (fam, an), miss in sorted(left.items(), key=lambda x: (int(x[0][0]), x[0][1])):
        T = ctx.table(fam, an)
        seq = [(w, h) for n, w, h in T]
        served = ctx.served(fam, an)
        me = os.path.normcase(ctx.lwf(fam, an) or '')
        votes = k_votes([(i, w, h) for i, n, w, h in miss], W, H, tid)
        # the whole table must vote too (known pieces), not only the missing ones: rank by votes of the missing,
        # merge neighbouring k bins
        agg = collections.Counter()
        for (t, kb), c in votes.items():
            agg[(t, kb)] += c
        top = [x for x, c in agg.most_common(TOP_DONORS) if c >= min(2, len(miss))]
        donors = []
        seen = set()
        for t, kb in top:
            s = shas[t]
            if s in seen or any(os.path.normcase(q) == me for q in by[s]):
                continue
            seen.add(s)
            k0 = math.exp(kb * lstep)
            dt = tab[s]
            mp, rn = align_scaled(seq, [(w, h) for n, w, h in dt], k0)
            if len(mp) < 3:
                continue
            ks = sorted(dt[j][1] / seq[i][0] for i, j in mp.items() if seq[i][0] >= 8)
            k = ks[len(ks) // 2] if ks else k0
            if k < MIN_K:
                continue
            fl = ctx.files(s)
            nmiss = sum(1 for i, n, w, h in miss if i in mp and dt[mp[i]][0] in fl)
            if not nmiss:
                continue
            okn = bad = 0
            for i, j in mp.items():
                if okn + bad >= MAX_CHECK:
                    break
                n = T[i][0]
                p, kind = served.get(n, (None, None))
                f = fl.get(dt[j][0])
                if p and kind in ORIGINAL and f:
                    a, b = ctx.sig_of(f, seq[i]), ctx.sig_of(p, seq[i])
                    if a is None or b is None:
                        continue
                    if sig_diff(a, b) < SAME:
                        okn += 1
                    else:
                        bad += 1
            if True:
                donors.append({'sha': s, 'path': by[s][0], 't': dt, 'files': fl, 'mp': mp, 'runs': rn, 'k': k,
                               'ok': okn, 'bad': bad, 'cover': len(mp) / max(1, len(T))})
        donors.sort(key=lambda d: (d['bad'] > 0, -d['ok'] + 2 * d['bad'], -d['cover']))
        import dedup_match as dm
        for i, n, w, h in miss:
            cands = [(d, d['mp'][i], d['files'][d['t'][d['mp'][i]][0]]) for d in donors
                     if i in d['mp'] and d['t'][d['mp'][i]][0] in d['files']]
            cands = [c for c in cands if ctx.de.file_size(c[2]) and not is_upscale(ctx.de.file_size(c[2]), (w, h))]
            if not cands:
                continue
            d, j, f = min(cands, key=lambda c: (c[0]['bad'] > 0 and c[0]['bad'] >= c[0]['ok'],
                                               -min(c[0]['runs'].get(i, 0), dm.RUN_CAP), c[0]['bad'] > 0,
                                               -c[0]['ok'] + 2 * c[0]['bad'], -c[0]['cover']))
            sf = ctx.sig_of(f, (w, h))
            agree = disagree = 0
            for c in cands:
                if c[0] is d:
                    continue
                o = ctx.sig_of(c[2], (w, h))
                if o is None or sf is None:
                    continue
                if sig_diff(o, sf) < SAME:
                    agree += 1
                elif c[0]['bad'] == 0 and c[0]['runs'].get(i, 0) >= d['runs'].get(i, 0):
                    disagree += 1
            if d['runs'].get(i, 0) < 2:
                continue                    # isolated alignment: no order evidence
            dw, dh = d['t'][j][1], d['t'][j][2]
            var = []
            for x in d['t']:
                if (x[1], x[2]) == (dw, dh) and x[0] in d['files']:
                    q = ctx.sig_of(d['files'][x[0]], (w, h))
                    if q is not None and not any(sig_diff(q, v) < SAME for v in var):
                        var.append(q)
            c = {'bad': d['bad'], 'ok': d['ok'], 'haves': sum(1 for x in served.values() if x[0]),
                 'cover': round(d['cover'], 3), 'run': d['runs'].get(i, 0), 'nvar': max(1, len(var)), 'area': w * h,
                 'agree': agree, 'disagree': disagree, 'name': 0}
            # a run of equal sizes (e.g. 1581: ten 69x186 frames) only says "same size", not "same order"
            lo, hi = i, i
            while lo - 1 in d['mp'] and d['mp'][lo - 1] == d['mp'][lo] - 1:
                lo -= 1
            while hi + 1 in d['mp'] and d['mp'][hi + 1] == d['mp'][hi] + 1:
                hi += 1
            distinct = len({seq[x] for x in range(lo, hi + 1)})
            c['run'] = min(c['run'], distinct)
            meth = 'scaled-order(k=%.3f,run=%d,cover=%.2f,ok=%d,bad=%d,nvar=%d,agree=%d,disagree=%d)' % (
                d['k'], c['run'], c['cover'], c['ok'], c['bad'], c['nvar'], agree, disagree)
            out.append({'family': fam, 'anim': an, 'texname': n, 'i': i, 'size': [w, h], 'source': f,
                        'ssize': list(ctx.de.file_size(f)), 'donor_lwf': d['path'], 'method': meth,
                        'base': dm.classify(c), 'origin': 'search',
                        'note0': 'donor declares %dx%d%s' % (dw, dh, '' if needs_rescale(ctx.de.file_size(f), (w, h))
                                                               else '; file already at the declared size (no rescale)'),
                        'approved': ctx.de.allowed(ctx.allow, fam, an)})
        log('search %s/%s: %d missing, %d donors, %d found' % (fam, an, len(miss), len(donors),
                                                             sum(1 for x in out if x['family'] == fam and x['anim'] == an)))
    return out


def validate(ctx, cands):
    for c in cands:
        dw, dh = c['size']
        up = is_upscale(c['ssize'], c['size'])
        ar = aspect_err(c['ssize'], c['size'])
        c['kx'] = c['ssize'][0] / dw
        c['ky'] = c['ssize'][1] / dh
        c['ar'] = ar
        notes = []
        known, kref = 0, None
        scale_ok = None
        if not up and ar <= AR_TOL:
            # search rows: the donor DECLARES the larger size (its factor is 1), the scale is checked by the alignment
            f, nf, lw = donor_factor(ctx, c['source'], c.get('donor_lwf')) if c['origin'] != 'search' else (None, 0, None)
            if f:
                scale_ok = abs(c['kx'] / f - 1) <= SCALE_TOL
                notes.append('donor LWF factor %.3f over %d files%s' % (f, nf, '' if scale_ok else ' (piece %.3f)' % c['kx']))
            mine = sig(downscale(load_img(c['source']), (dw, dh)))
            ks = known_originals(ctx, c['family'], c['anim'], c['i']) if c['i'] >= 0 else []
            res = []
            for other, n, p, kind, rn, how in ks:
                o = ctx.sig_of(p, (dw, dh))
                if o is not None:
                    res.append((how != 'slot', sig_diff(mine, o), other, n, p, kind, how))
            if res:
                res.sort()
                slot = [x for x in res if x[6] == 'slot']
                _, dmin, other, n, p, kind, how = min(slot or res, key=lambda x: x[1])
                if dmin < SAME:
                    known = 1
                elif how == 'slot':
                    known = -1
                kref = p
                notes.append('%s %s in %s (%s): diff %.1f%s' % (
                    'known original of the slot' if how == 'slot' else 'same-size piece', 'SAME' if dmin < SAME
                    else 'DIFFERENT', other, kind, dmin,
                    '; exact-size copy available there (no rescale needed)' if dmin < SAME and how == 'slot' else ''))
                c['known_anim'] = '%s %s' % (other, kind)
                c['exact_alt'] = p if dmin < SAME and how == 'slot' else ''
        g, why = grade(c['base'], up, ar, known, scale_ok)
        ev = parse_method(c['method'])
        if ev:
            notes.insert(0, 'order run=%s cover=%s ok=%s bad=%s' % (ev.get('run', '-'), ev.get('cover', '-'),
                                                                  ev.get('ok', '-'), ev.get('bad', '-')))
        if why:
            notes.append(why)
        if c.get('note0'):
            notes.append(c['note0'])
        c.update(conf=g, known=known, known_src=kref, scale_ok=scale_ok, note='; '.join(notes))
    return cands


def own_alternatives(ctx, left, cands):
    """slots still missing (no usable candidate) whose aligned slot in another animation of the family is served at
    the exact size: no rescale needed, a plain own-family copy the proposal never made (listed apart)."""
    good = {(c['family'], c['anim'], c['texname']) for c in cands if c['conf'] != 'R'}
    out = []
    for (fam, an), miss in sorted(left.items(), key=lambda x: (int(x[0][0]), x[0][1])):
        for i, n, w, h in miss:
            if (fam, an, n) in good:
                continue
            ks = [k for k in known_originals(ctx, fam, an, i) if k[5] == 'slot']
            if not ks:
                continue
            ks.sort(key=lambda k: (k[3] not in ORIGINAL, -k[4]))
            other, on, p, kind, rn, how = ks[0]
            same = sum(1 for k in ks[1:] if ctx.sig_of(k[2], (w, h)) is not None and ctx.sig_of(p, (w, h)) is not None
                       and sig_diff(ctx.sig_of(k[2], (w, h)), ctx.sig_of(p, (w, h))) < SAME)
            diff = len(ks) - 1 - same
            conf = 'A' if rn >= 4 and not diff else ('B' if (rn >= 2 or same) and not diff else 'C')
            out.append({'family': fam, 'anim': an, 'texname': n, 'size': [w, h], 'source': p, 'from': '%s (%s)' % (other, kind),
                        'run': rn, 'conf': conf, 'note': 'aligned slot in %s run=%d; other anims agree %d, differ %d'
                        % (other, rn, same, diff)})
    return out


def png_path(work, c):
    return os.path.join(work, 'png', c['family'], c['anim'], c['texname'])


def make_pngs(ctx, cands):
    n = 0
    for c in cands:
        if c['conf'] == 'R':
            continue
        p = png_path(ctx.work, c)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        downscale(load_img(c['source']), tuple(c['size'])).save(p)
        n += 1
    return n


def write_tsv(ctx, cands):
    p = os.path.join(ctx.work, 'rescale_proposal.tsv')
    with open(p, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write('family\tanim\ttexname\tsize\tsource\tsource_size\tscale\tmethod\tconfidence\tnote\torigin\tapproved\tpng\n')
        for c in sorted(cands, key=lambda c: (int(c['family']), c['anim'], c['i'])):
            fh.write('%s\t%s\t%s\t%dx%d\t%s\t%dx%d\t%.3f\t%s\t%s\t%s\t%s\t%s\t%s\n' % (
                c['family'], c['anim'], c['texname'], c['size'][0], c['size'][1], c['source'], c['ssize'][0],
                c['ssize'][1], c['kx'], ('downscale-lanczos-premult; ' if c['conf'] != 'R' else '') + c['method'],
                c['conf'], c['note'], c['origin'], 'yes' if c['approved'] else 'no',
                png_path(ctx.work, c) if c['conf'] != 'R' else ''))
    return p


def dedup_rows(ctx, cands, grades):
    """table rows (extra_donors_dedup.tsv format) for a dry run with the rescaled PNGs (container `rescale`)."""
    out = []
    for c in cands:
        if c['conf'] in grades:
            pub = 'lwf/character/enemy/%s/%s/%s' % (c['family'], c['anim'], c['texname'])
            out.append('%s\trescale:%s/%s/%s\tdedup-order\t%dx%d\t%s' % (pub, c['family'], c['anim'], c['texname'],
                                                                       c['size'][0], c['size'][1], c['conf']))
    return out


# --- rendering: lwf_rig.LWF (blend mode from place.objectId bits 16-30; Flash mask layers = place.depth clip depth,
#     never drawn, listed in Draw.masks) and the mask/blend-aware dedup_review.render() --------------------------------
def rig(path):
    import numpy as np
    import lwf_rig

    class SafeLWF(lwf_rig.LWF):
        def ctf(self, cid):
            try:
                return lwf_rig.LWF.ctf(self, cid)
            except IndexError:
                return np.ones(4), np.zeros(4)
    return SafeLWF(path)


def render(L, frame, texmap, tint=None, s=1.0, box=None):
    import dedup_review
    try:
        return dedup_review.render(L, frame, texmap, tint=tint, s=s, box=box)
    except NotImplementedError:             # rotated fragment
        return None, None


def _label(im, txt, w=0):
    from PIL import Image, ImageDraw
    c = Image.new('RGB', (max(im.width, w, 8 + 6 * len(txt)), im.height + 14), (20, 20, 20))
    c.paste(im, (0, 14))
    ImageDraw.Draw(c).text((2, 1), txt, fill=(255, 255, 255))
    return c


def _cat(ims, horiz, gap=6, bg=(10, 10, 10)):
    from PIL import Image
    if horiz:
        R = Image.new('RGB', (sum(i.width + gap for i in ims), max(i.height for i in ims)), bg)
    else:
        R = Image.new('RGB', (max(i.width for i in ims), sum(i.height + gap for i in ims)), bg)
    x = 0
    for i in ims:
        R.paste(i, (x, 0) if horiz else (0, x))
        x += (i.width if horiz else i.height) + gap
    return R


def _thumb(im, cell):
    from PIL import Image
    k = min(cell / im.width, cell / im.height, 4.0)
    t = im.resize((max(1, int(im.width * k)), max(1, int(im.height * k))), Image.NEAREST if k > 1 else Image.LANCZOS)
    c = Image.new('RGB', (cell, cell), (70, 75, 85))
    c.paste(t, ((cell - t.width) // 2, (cell - t.height) // 2), t)
    return c


def family_sheet(ctx, fam, cands, out, maxs=330, nfr=3):
    """sheet of one family (all its non-rejected candidates)."""
    from PIL import Image, ImageDraw
    import numpy as np
    blocks = []
    byan = collections.defaultdict(list)
    for c in cands:
        if c['conf'] != 'R':
            byan[c['anim']].append(c)
    for an in sorted(byan):
        cs = byan[an]
        lw = ctx.lwf(fam, an)
        try:
            L = rig(lw)
        except Exception as e:                  # noqa: BLE001
            blocks.append(_label(Image.new('RGB', (300, 20)), '%s %s: LWF unreadable %s' % (fam, an, e)))
            continue
        served = ctx.served(fam, an)
        cur, new, tint = {}, {}, {}
        for i, (n, f, w, h, sc) in enumerate(L.textures):
            p = served.get(n, (None, None))[0]
            if p:
                try:
                    cur[i] = new[i] = load_img(p, (w, h))
                except Exception:               # noqa: BLE001
                    pass
        for c in cs:
            if 0 <= c['i'] < len(L.textures) and c['i'] not in cur:
                new[c['i']] = Image.open(png_path(ctx.work, c)).convert('RGBA')
                tint[c['i']] = c['conf']
        fn = max(m[4] for m in L.movie) if L.movie else 1
        # frames that draw the most rescaled area
        score = []
        for fr in range(0, fn, max(1, fn // 24)):
            try:
                dr = L.draws(frame_idx=fr)
            except Exception:                   # noqa: BLE001
                continue
            a = sum(abs(np.linalg.det(d[2][:2, :2])) * d[1][2] * d[1][3] for d in dr
                    if d[0] in tint and d[3][3] > 0.05)
            score.append((a, fr))
        frames = sorted({fr for a, fr in sorted(score, reverse=True)[:nfr] if a > 0}) or [0]
        rows = []
        for fr in frames:
            b0, box = render(L, fr, new)
            if b0 is None:
                continue
            s = min(1.0, maxs / max(b0.size))
            a1, _ = render(L, fr, cur, s=s, box=box)
            b1, _ = render(L, fr, new, s=s, box=box)
            t1, _ = render(L, fr, new, tint=tint, s=s, box=box)
            rows.append(_cat([_label(a1, '%s %s f%d current (served)' % (fam, an, fr)),
                              _label(b1, 'with rescaled pieces'),
                              _label(t1, 'tint: green A, yellow B, red C')], True))
        strips = []
        for c in sorted(cs, key=lambda c: c['i']):
            cell = 96
            src = load_img(c['source'])
            ims = [_label(_thumb(src, cell), 'donor %dx%d' % tuple(c['ssize']), cell),
                   _label(_thumb(Image.open(png_path(ctx.work, c)).convert('RGBA'), cell),
                          'down %dx%d' % tuple(c['size']), cell)]
            if c.get('known_src'):
                ims.append(_label(_thumb(load_img(c['known_src'], tuple(c['size'])), cell),
                                  'known %s' % c.get('known_anim', ''), cell))
            hdr = '#%d %s x%.2f %s%s' % (c['i'], c['conf'], c['kx'], c['origin'][:4],
                                        '' if c['approved'] else ' NOT-APPROVED-FAM')
            strips.append(_label(_cat(ims, True, 2), hdr))
        per = 6
        lines = [_cat(strips[k:k + per], True, 8) for k in range(0, len(strips), per)]
        blocks.append(_cat(rows + lines, False))
    if not blocks:
        return None
    sheet = _cat(blocks, False, 18, (40, 40, 40))
    ImageDraw.Draw(sheet)
    sheet.save(out)
    return out


# --- generator dry runs -------------------------------------------------------------------------------------------------
def gen_dry(ctx, table, outdir, rescale_root=None, fams=None):
    """make_jp_enemies.py --dry in-process with `table` as the dedup table -> (report dict, texsrc dict)."""
    import extra_donors
    os.makedirs(outdir, exist_ok=True)
    if rescale_root:
        extra_donors.ROOTS['rescale'] = [rescale_root]
    src = os.path.join(HERE, 'make_jp_enemies.py')
    argv = sys.argv
    sys.argv = [src, '--dry', '--out', outdir, '--dedup', table]
    ns = {'__name__': 'make_jp_enemies_dry', '__file__': src}
    try:
        exec(compile(open(src, encoding='utf-8').read(), src, 'exec'), ns)
        ns['main']()
    finally:
        sys.argv = argv
    res = {}
    for fam in (fams or ctx.need):
        jd = os.path.join(ns['a'].jp, fam)
        if not os.path.isdir(jd):
            continue
        jp_all = {an: ns['listing'](os.path.join(jd, an)) for an in os.listdir(jd) if os.path.isdir(os.path.join(jd, an))}
        for an, fs in jp_all.items():
            jl = fs.get(an + '.lwf')
            if not jl:
                continue
            dims = ns['tex_dims'](jl)
            pre = 'lwf/character/enemy/%s/%s/' % (fam, an)
            res['%s/%s' % (fam, an)] = {t: list(ns['fill_tex'](pre, an, t, fs, jp_all, dims)) for t in ns['refs_of'](jl)}
    json.dump(res, open(os.path.join(outdir, 'texsrc.json'), 'w', encoding='utf-8'), indent=0)
    rep = json.load(open(os.path.join(outdir, 'report.json'), encoding='utf-8'))
    return rep, res


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--work', default=WORK)
    ap.add_argument('--stage', default='all')
    ap.add_argument('--fams')
    a = ap.parse_args(argv)
    fams = set(a.fams.split(',')) if a.fams else None
    st = a.stage
    wk = os.path.join(a.work, 'work')
    os.makedirs(wk, exist_ok=True)
    ctx = Ctx(a.work)
    base_dir = os.path.join(wk, 'gen_base')
    cur_table = os.path.join(wk, 'dedup_current.tsv')
    if st in ('all', 'gen') or not os.path.exists(os.path.join(base_dir, 'texsrc.json')):
        # the table the approved integration serves: dedup_export.py on proposal + overrides + allow-list
        ctx.de.main(['--out', cur_table, '--rebuild'])
        gen_dry(ctx, cur_table, base_dir)
    ctx.texsrc = json.load(open(os.path.join(base_dir, 'texsrc.json'), encoding='utf-8'))
    cpath = os.path.join(wk, 'cands.json')
    if st in ('all', 'collect', 'search'):
        cands = collect(ctx, fams)
        print('kind 1 (proposal rows with another size): %d' % len(cands), flush=True)
        left = leftover(ctx, cands, fams)
        print('slots missing without a usable source: %d in %d animations' % (sum(map(len, left.values())), len(left)),
              flush=True)
        fp = os.path.join(wk, 'search.json')
        if st == 'collect' and os.path.exists(fp):
            found = json.load(open(fp, encoding='utf-8'))
        else:
            found = search(ctx, left)
            json.dump(found, open(fp, 'w', encoding='utf-8'), indent=0)
        print('kind 2 (scaled tables): %d' % len(found), flush=True)
        cands = validate(ctx, cands + found)
        json.dump(cands, open(cpath, 'w', encoding='utf-8'), indent=0)
        alts = own_alternatives(ctx, left, cands)
        json.dump(alts, open(os.path.join(wk, 'own_exact.json'), 'w', encoding='utf-8'), indent=0)
        with open(os.path.join(a.work, 'own_exact_alternatives.tsv'), 'w', encoding='utf-8', newline='\n') as fh:
            fh.write('family\tanim\ttexname\tsize\tsource\tfrom\tconfidence\tnote\n')
            for x in alts:
                fh.write('%s\t%s\t%s\t%dx%d\t%s\t%s\t%s\t%s\n' % (x['family'], x['anim'], x['texname'], x['size'][0],
                                                                  x['size'][1], x['source'], x['from'], x['conf'], x['note']))
        print('own-family exact-size alternatives: %d' % len(alts), flush=True)
    cands = json.load(open(cpath, encoding='utf-8'))
    ap_ = os.path.join(wk, 'own_exact.json')
    alts = json.load(open(ap_, encoding='utf-8')) if os.path.exists(ap_) else []
    if st in ('all', 'collect', 'search', 'png'):
        print('png', make_pngs(ctx, cands), flush=True)
        print('tsv', write_tsv(ctx, cands), flush=True)
    if st in ('all', 'gen', 'png', 'collect', 'search'):
        base = json.load(open(os.path.join(base_dir, 'report.json'), encoding='utf-8'))
        cur = open(cur_table, encoding='utf-8').read()
        reps = {}
        own = []
        for x in alts:
            k, rel = ctx.de.container_of(x['source'])
            if k:
                own.append('lwf/character/enemy/%s/%s/%s\t%s:%s\tdedup-order\t%dx%d\t%s' % (
                    x['family'], x['anim'], x['texname'], k, rel, x['size'][0], x['size'][1], x['conf']))
        for name, grades, extra in (('abc', 'ABC', []), ('ab', 'AB', []), ('abc_own', 'ABC', own)):
            t = os.path.join(wk, 'dedup_with_%s.tsv' % name)
            open(t, 'w', encoding='utf-8', newline='\n').write(cur + '\n'.join(dedup_rows(ctx, cands, grades) + extra) + '\n')
            reps[name], _ = gen_dry(ctx, t, os.path.join(wk, 'gen_' + name), os.path.join(a.work, 'png'), fams=['0'])
        summary(ctx, cands, base, reps, os.path.join(a.work, 'summary.txt'))
    if st in ('all', 'sheets'):
        os.makedirs(os.path.join(a.work, 'sheets'), exist_ok=True)
        byf = collections.defaultdict(list)
        for c in cands:
            byf[c['family']].append(c)
        for fam in sorted(byf, key=int):
            if fams and fam not in fams:
                continue
            p = family_sheet(ctx, fam, byf[fam], os.path.join(a.work, 'sheets', '%s.png' % fam))
            print('sheet', p, flush=True)
    return 0


def summary(ctx, cands, base, reps, out):
    cnt = collections.Counter(c['conf'] for c in cands)
    lines = ['rescaled copies (I-194, proposal only): %d candidates; grades %s' % (len(cands), dict(sorted(cnt.items())))]
    org = collections.Counter((c['origin'], c['conf']) for c in cands)
    lines.append('by origin/grade: %s' % dict(sorted(org.items())))
    rej = collections.Counter(c['note'].split(';')[-1].strip() if c['conf'] == 'R' else '' for c in cands)
    lines.append('rejected: upscale %d, aspect %d' % (sum(1 for c in cands if c['conf'] == 'R' and 'upscale' in c['note']),
                                                      sum(1 for c in cands if c['conf'] == 'R' and 'aspect' in c['note'])))
    del rej
    lines.append('generator dry runs: baseline complete %d / incomplete %d' % (base['complete'], base['incomplete']))
    b0 = set(base['complete_ids'])
    for name, r in reps.items():
        new = sorted(set(r['complete_ids']) - b0)
        lines.append('  with rescaled %s: complete %d (+%d): %s' % (name.upper(), r['complete'], len(new), new))
    byf = collections.defaultdict(collections.Counter)
    for c in cands:
        byf[c['family']][c['conf']] += 1
    lines.append('per family (grades):')
    inc = {e['displayId']: e for e in reps['abc']['results']} if 'results' in reps['abc'] else {}
    for f in sorted(byf, key=int):
        e = inc.get(int(f))
        lines.append('  %s %s%s' % (f, dict(sorted(byf[f].items())),
                                    '' if not e else ' -> %s%s' % (e['status'], ' (' + e.get('why', '') + ')' if e.get('why') else '')))
    open(out, 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
    print('\n'.join(lines))


if __name__ == '__main__':
    sys.exit(main())
