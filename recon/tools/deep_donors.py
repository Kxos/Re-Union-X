"""Original copies of missing enemy textures found BY CONTENT in other contexts of the same creature (I-194, 22-10).

    python recon/tools/deep_donors.py [--out recon/tools/extra_donors_deep.tsv] [--cache <dir>] [--validate]
        [--fams 1561,1600]                                   (Pillow + numpy: without -I; first run ~30 min)

Category 2 of the user's rule (original files always win; extra_donors.py): the real texture still exists,
identical, in another LWF that uses the same creature (lwf/character/raid, lwf/raid/demo, lwf/drama films, another
enemy, burst), under another name and another bitmap number. Deterministic redo, from local sources only, of the
analysis in D:\\Progetto_Restauro_KH_UX\\tmp\\deep_scan (engine2.py + mk_tsv.py, 22-10):

  1. families: the incomplete displayIds of make_jp_enemies.py (dry run with the versioned tables, without this
     one); for each mandatory animation (+ move) that is not complete: present textures (survivors, original files
     only: JP, direct, same enemy, dedup donors, copies) and missing ones, with the sizes declared by the LWF;
  2. index of every LWF in the local containers (SCAN_ROOTS; path -> sha1, texture table);
  3. candidate donors: the TOPN LWFs (outside the family folder) declaring the most missing sizes of the family
     (>= 3), then the most surviving sizes; identical copies (same sha1) count once;
  4. anchors: family survivors equal by content (32x32 premultiplied signature, mean difference < SAME/255 on the
     visible pixels, sizes +-1 px) to a donor texture; donor accepted with >= 2 anchors (A), or with 1 anchor when
     its table holds >= COV of the family's declared sizes (>= 8 sizes) (B); then dropped when, on the family's own
     survivors, it picks wrong images (>= 2 errors and > 5%): incoherent donors (e.g. a film with another
     character of the same sizes);
  5. rules for a missing texture (declared w x h):
     * content-anchor: every texture of the accepted donors with that size (+-1 px) is the same image;
     * bracket: both table neighbours (index -1 and +1) are known and in the donors the same two images enclose a
       texture of that size (all donors agree);
     (table alignment alone, `align`, is NOT used: 88/117 on survivors);
  6. visual rejects (VISUAL_REJECT, sheets tmp\\deep_scan\\sheets\\v2_<family>.png).
Validation (--validate, 22-10, 105 incomplete families): each survivor treated as missing with its own anchor
removed (self) and, for families with >= 6 survivors, one survivor kept as the only anchor and the others hidden
(hide, rule B only): content-anchor 1841/1856 (99.2%) self and 3871/3882 (99.7%) hide; bracket 34/35 + 53/53
(87/88); align alone 88/117 + 136/144 (not used). (The first scan, 92 families: 99.3% / 99.8%, bracket 82/83.)
Output: TSV in the extra_donors.tsv format (`<published path>\\t<container>:<path>\\t<rule>\\t<WxH>`), read by
make_jp_enemies.py (--deep) as category 2 after extra_donors.tsv. Donors outside the extra_donors.py containers
(jp431, jp501, b2016) take part in the rules but give no rows.
"""
import argparse
import hashlib
import io
import json
import os
import pickle
import re
import struct
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
D = r'D:\Progetto_Restauro_KH_UX'
import private_tools  # noqa: E402  (local reference data folders, see private_tools.py)
JP431 = private_tools.local_path('jp_data')
X501 = os.path.join(D, 'tmp', 'jp501', 'x')
B16 = private_tools.local_path('ref_work', 'bundle2016', 'files')
WWTEX = os.path.join(D, 'tmp', 'enemy_src2', 'wwtex')
ALIAS501 = os.path.join(D, 'tmp', 'jp501', 'aliases.tsv')
# scanned containers (order = index order, breaks ties between donors)
SCAN_ROOTS = [('jp431', JP431), ('jp501', X501), ('ww501', os.path.join(D, 'tmp', 'enemy_src2', 'ww')),
              ('wwtex', WWTEX), ('b2016', private_tools.local_path('ref_work')), ('jp441', os.path.join(D, 'tmp', 'jp441')),
              ('enemy_x', os.path.join(D, 'enemy_x')), ('resdata', os.path.join(D, 'resource_data')),
              ('apk501', os.path.join(D, 'apk501')), ('assets431', os.path.join(D, 'assets431'))]
# extra_donors.py containers whose files may become table sources
OUT_ROOTS = [('jp431', JP431), ('jp501', X501), ('b2016', B16)]
SAME = 6.0          # mean difference /255 of the 32x32 premultiplied signatures: same image
TOL = 1             # declared size +-1 px
COV = 0.8           # rule B: share of the family sizes in the donor table
MIN_DIMS = 8        # rule B: minimum distinct family sizes
TOPN = 60           # candidate donors per family
ORIGINAL_KINDS = ('jp', 'diretto', 'stesso', 'doppione', 'copia')     # survivors usable as anchors
# Visual check of the v2 sheets (22-10): the new part is not clearly the same creature or the same piece.
# (family, source path fragment or '' = whole family, reason)
VISUAL_REJECT = [
    (285, '', 'only survivor a 9x6 speck; 21x7/8x12 pieces of enemy 1 not recognisable'),
    (1541, '2321701_e38393e38383e38388e3839ee38383e38397203138392e706e67', 'orange 74x41 shell foreign to the creature'),
    (1635, '', 'white clouds of a player ability (burst/motion/abl_12046): an effect, not the creature'),
    (1645, 'lwf/drama/2552701/', 'knockback from film 2552701: Turbo/Cy-Bug pieces, not clearly King Candy'),
    (1650, 'lwf/drama/2420701/', 'small orange 36x56 flame foreign to Darkness'),
    (2011, '', 'anchors are generic smoke only; keyblade, hair and effects of another character (enemy 7005)'),
    (2021, '', 'anchors are generic smoke only; rings and effects of another character (film 2120201)'),
]


# --- LWF ------------------------------------------------------------------------------------------------------------
def lwf_textures(b):
    """texture table of an LWF (GREE lwf_format.h): [(name, w, h)] in the order of the texture section."""
    sb = struct.unpack_from('<i', b, 32)[0]
    so, sn = struct.unpack_from('<ii', b, 312)
    strs = [b[sb + o:sb + o + n].decode('utf-8', 'replace') for o, n in
            (struct.unpack_from('<ii', b, so + 8 * k) for k in range(sn))]
    to, tn = struct.unpack_from('<ii', b, 32 + 8 * 8)
    return [(strs[t[0]], t[2], t[3]) for t in (struct.unpack_from('<iiiif', b, to + 20 * k) for k in range(tn))
            if 0 <= t[0] < sn]


def close(a, b, tol=TOL):
    return abs(a[0] - b[0]) <= tol and abs(a[1] - b[1]) <= tol


def lcs_map(A, B):
    """A, B: lists of (w, h) -> {i: j} of the aligned equal elements (LCS)."""
    n, m = len(A), len(B)
    L = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(n - 1, -1, -1):
        for j in range(m - 1, -1, -1):
            L[i][j] = L[i + 1][j + 1] + 1 if A[i] == B[j] else max(L[i + 1][j], L[i][j + 1])
    i = j = 0
    mp = {}
    while i < n and j < m:
        if A[i] == B[j]:
            mp[i] = j
            i += 1
            j += 1
        elif L[i + 1][j] >= L[i][j + 1]:
            i += 1
        else:
            j += 1
    return mp


# --- comparison by content --------------------------------------------------------------------------------------------
class Sig:
    """32x32 premultiplied RGBA signatures (+ real size), cached on disk (a pure function of the file)."""

    def __init__(self, cache=None):
        self.cache, self.d, self.dirty = cache, {}, False
        if cache and os.path.exists(cache):
            self.d = pickle.load(open(cache, 'rb'))

    def __call__(self, p):
        if p not in self.d:
            self.d[p] = self._sig(p)
            self.dirty = True
        return self.d[p]

    @staticmethod
    def _sig(p):
        import numpy as np
        from PIL import Image
        import btf
        try:
            data = open(p, 'rb').read()
            im = (btf.decode(data) if data[:4] == b'\x89BTF' else Image.open(io.BytesIO(data))).convert('RGBA')
            a = np.asarray(im, dtype=np.float32).copy()
            a[..., :3] *= a[..., 3:4] / 255.0
            small = Image.fromarray(a.astype('uint8'), 'RGBA').resize((32, 32), Image.BILINEAR)
            return np.asarray(small, dtype=np.int16), im.size
        except Exception:                   # noqa: BLE001
            return None

    def save(self):
        if self.cache and self.dirty:
            os.makedirs(os.path.dirname(self.cache), exist_ok=True)
            pickle.dump(self.d, open(self.cache + '.tmp', 'wb'))
            os.replace(self.cache + '.tmp', self.cache)
            self.dirty = False

    def diff(self, p, q):
        """mean difference /255 on the visible pixels (alpha > 8 in either); 999 when sizes differ by > 2 px."""
        import numpy as np
        a, b = self(p), self(q)
        if a is None or b is None or abs(a[1][0] - b[1][0]) > 2 or abs(a[1][1] - b[1][1]) > 2:
            return 999.0
        m = np.maximum(a[0][..., 3], b[0][..., 3]) > 8
        d = np.abs(a[0] - b[0])
        return float(d.mean() if m.sum() < 4 else d[m].mean())


# --- rules (pure: diff(p, q) is the difference between two images) ----------------------------------------------------
def anchors(donor, survs, diff):
    """family survivors (image, (w, h)) equal to a donor texture of the same size."""
    pool, path, t, files = donor
    out = set()
    for sp, wh in survs:
        for dn, dw, dh in t:
            q = files.get(dn)
            if q and close(wh, (dw, dh)) and diff(sp, q) < SAME:
                out.add(sp)
                break
    return out


def accept(t, anch, famdims, mode='AB'):
    """'A' (>= 2 anchors), 'B' (1 anchor and the table covers >= COV of the family sizes, >= MIN_DIMS) or None."""
    if 'A' in mode and len(anch) >= 2:
        return 'A'
    if 'B' in mode and len(anch) >= 1 and len(famdims) >= MIN_DIMS:
        if len(famdims & {(w, h) for n, w, h in t}) >= COV * len(famdims):
            return 'B'
    return None


def pick(T, i, acc, diff):
    """texture i of table T from the accepted donors acc [(pool, path, t, files, lcs map, why)] ->
    (file, 'content') when every donor texture of that size is the same image; (file, 'align')
    when all aligned donors agree (not used for the table); (None, 'ambiguous'|'none')."""
    n, w, h = T[i]
    cands = [files[dn] for pool, path, t, files, mp, why in acc for dn, dw, dh in t
             if files.get(dn) and close((w, h), (dw, dh))]
    if cands and all(diff(cands[0], c) < SAME for c in cands[1:]):
        return cands[0], 'content'
    al = []
    for pool, path, t, files, mp, why in acc:
        j = mp.get(i)
        if j is not None and t[j][0] in files:
            al.append(files[t[j][0]])
    if al and all(diff(al[0], c) < SAME for c in al[1:]):
        return al[0], 'align'
    return None, 'ambiguous' if cands else 'none'


def bracket(T, i, acc, known, diff):
    """texture i with neighbours i-1 and i+1 known (known: index -> image): in each donor, a texture of the same
    size enclosed by the same two images; all agree -> file, else None."""
    if (i - 1) not in known or (i + 1) not in known:
        return None
    n, w, h = T[i]
    picks = []
    for pool, path, t, files, mp, why in acc:
        for j in range(1, len(t) - 1):
            dn, dw, dh = t[j]
            if not (close((w, h), (dw, dh)) and dn in files):
                continue
            a, b = t[j - 1][0], t[j + 1][0]
            if a in files and b in files and diff(files[a], known[i - 1]) < SAME and diff(files[b], known[i + 1]) < SAME:
                picks.append(files[dn])
    if picks and all(diff(picks[0], c) < SAME for c in picks[1:]):
        return picks[0]
    return None


def gate(donor, why, anims, diff):
    """'content' picks of this donor alone on the family survivors: False when >= 2 are wrong and > 5%."""
    ok = ko = 0
    for an, (T, have, miss) in anims.items():
        one = [(donor[0], donor[1], donor[2], donor[3], lcs_map([(w, h) for n, w, h in T],
                                                                 [(dw, dh) for dn, dw, dh in donor[2]]), why)]
        for i, (n, w, h) in enumerate(T):
            if n in have:
                q, rule = pick(T, i, one, diff)
                if q and rule == 'content':
                    if diff(q, have[n][0]) < SAME:
                        ok += 1
                    else:
                        ko += 1
    return not (ko >= 2 and ko > 0.05 * (ok + ko))


def solve(anims, survs, famdims, donors, diff, mode='AB'):
    """-> {anim: {'donors': [(pool, path, why, anchors)], 'pick': {i: (file, rule)}, 'T': T}}"""
    acc0 = []
    for d in donors:
        a = anchors(d, survs, diff)
        why = accept(d[2], a, famdims, mode)
        if why and gate(d, why, anims, diff):
            acc0.append((d, why, len(a)))
    res = {}
    for an, (T, have, miss) in anims.items():
        acc = [(d[0], d[1], d[2], d[3], lcs_map([(w, h) for n, w, h in T], [(dw, dh) for dn, dw, dh in d[2]]), why)
               for d, why, na in acc0]
        r = res[an] = {'donors': [(d[0], d[1], why, na) for d, why, na in acc0], 'T': T, 'pick': {}}
        if not acc:
            continue
        r['pick'] = {i: pick(T, i, acc, diff) for i in range(len(T))}
        sp = {x for x, _ in survs}
        known = {i: have[n][0] for i, (n, w, h) in enumerate(T) if n in have and have[n][0] in sp}
        for i, (q, rule) in r['pick'].items():
            if q and rule == 'content':
                known.setdefault(i, q)
        for i in range(len(T)):
            if r['pick'][i][1] == 'content':
                continue
            b = bracket(T, i, acc, {k: v for k, v in known.items() if k != i}, diff)
            if b:
                r['pick'][i] = (b, 'bracket')
    return res


# --- local sources ----------------------------------------------------------------------------------------------------
REV = re.compile(r'^(.*)\.(\d{8})(\.[^.]+)$')
_dir = {}


def listing(p):
    """folder -> {logical name: file of the highest revision} (as make_jp_enemies.listing)."""
    if p not in _dir:
        idx = {}
        if os.path.isdir(p):
            for f in sorted(os.listdir(p)):
                m = REV.match(f)
                base, r = (m.group(1) + m.group(3), int(m.group(2))) if m else (f, -1)
                if base not in idx or idx[base][0] < r:
                    idx[base] = (r, os.path.join(p, f))
        _dir[p] = {k: v[1] for k, v in idx.items()}
    return _dir[p]


_alias = None


def alias501():
    global _alias
    if _alias is None:
        _alias = {}
        if os.path.exists(ALIAS501):
            with open(ALIAS501, encoding='utf-8') as fh:
                next(fh)
                for line in fh:
                    x = line.rstrip('\n').split('\t')
                    _alias[x[0]] = x[2]
    return _alias


def rel_dir(lwfpath):
    p = os.path.normcase(lwfpath)
    for root in (JP431, X501, B16, os.path.join(D, 'tmp', 'enemy_src2', 'ww'), WWTEX):
        r = os.path.normcase(root) + os.sep
        if p.startswith(r):
            return os.path.dirname(lwfpath[len(r):]).replace('\\', '/')
    return None


def resolve(pool, lwfpath, names):
    """texture files of a donor LWF in its container -> {name: path or None}."""
    d, rel = os.path.dirname(lwfpath), rel_dir(lwfpath)
    if pool in ('jp431', 'b2016', 'jp441', 'enemy_x', 'wwtex'):
        ls = listing(d)
        return {n: ls.get(n) for n in names}
    if pool == 'jp501':
        al = alias501()
        out = {}
        for n in names:
            c = al.get('%s/%s' % (rel, n))
            q = os.path.join(X501, *c.split('/')) if c else None
            out[n] = q if q and os.path.exists(q) else None
        return out
    if pool == 'ww501' and rel:
        out = {}
        for n in names:
            q = os.path.join(WWTEX, *('%s/%s' % (rel, n)).split('/'))
            out[n] = q if os.path.exists(q) else None
        return out
    return {n: None for n in names}


def index_lwfs(cache=None, roots=SCAN_ROOTS):
    """{path: (container, sha1, texture table)} of every LWF in the containers, in deterministic order
    (roots in order, folders and files sorted). Cached by (path, size, mtime)."""
    old = pickle.load(open(cache, 'rb')) if cache and os.path.exists(cache) else {}
    idx, new = {}, {}
    for k, r in roots:
        for dp, dn, fn in os.walk(r):
            dn.sort()
            for f in sorted(fn):
                q = os.path.join(dp, f)
                try:
                    st = os.stat(q)
                    if st.st_size < 64 or st.st_size > 60_000_000:
                        continue
                    key = (q, st.st_size, st.st_mtime_ns)
                    if key in old:
                        v = old[key]
                    else:
                        with open(q, 'rb') as fh:
                            if fh.read(4) != b'LWF\x00':
                                v = None
                            else:
                                fh.seek(0)
                                b = fh.read()
                                v = (hashlib.sha1(b).hexdigest(), lwf_textures(b))
                    new[key] = v
                    if v:
                        idx[q] = (k, v[0], v[1])
                except Exception:           # noqa: BLE001
                    new[key] = None
    if cache:
        os.makedirs(os.path.dirname(cache), exist_ok=True)
        pickle.dump(new, open(cache + '.tmp', 'wb'))
        os.replace(cache + '.tmp', cache)
    return idx


def family_needs(fams, workdir):
    """as tmp\\deep_scan\\scripts\\need.py: per family and mandatory animation (+ move) that is not complete and has
    its JP LWF: survivors (fill_tex, original sources only) and missing textures, with declared sizes. The versioned tables
    of make_jp_enemies.py, without extra_donors_deep.tsv."""
    sys.argv = ['make_jp_enemies.py', '--dry', '--deep', '', '--out', os.path.join(workdir, 'dry')]
    import make_jp_enemies as M
    if fams is None:
        M.main()
        rep = json.load(open(os.path.join(workdir, 'dry', 'report.json'), encoding='utf-8'))
        fams = rep['incomplete_ids']
    out = {}
    for d in fams:
        rel = str(d)
        jd = os.path.join(M.a.jp, rel)
        jp_all = {an: M.listing(os.path.join(jd, an)) for an in sorted(os.listdir(jd))
                  if os.path.isdir(os.path.join(jd, an))} if os.path.isdir(jd) else {}
        fam = {}
        for an in M.MANDATORY + ['move']:
            st, files, note, c = M.plan_anim(rel, an, jp_all)
            if files is not None:
                continue
            jl = (jp_all.get(an) or {}).get(an + '.lwf')
            if not jl:
                continue
            dims = M.tex_dims(jl) or {}
            pre = '%s/%s/%s/' % (M.ENEMY, rel, an)
            have, miss = {}, []
            for t in M.refs_of(jl):
                q, kind = M.fill_tex(pre, an, t, jp_all.get(an) or {}, jp_all, dims)
                if q and kind in ORIGINAL_KINDS:
                    have[t] = [q, kind, dims.get(t)]
                elif not q:
                    miss.append([t, dims.get(t)])
            fam[an] = {'lwf': jl, 'have': have, 'miss': miss}
        out[d] = fam
    return out


def fam_data(need_f, diff):
    anims, survs, dims = {}, [], set()
    for an, e in need_f.items():
        T = lwf_textures(open(e['lwf'], 'rb').read())
        anims[an] = (T, e['have'], {x[0] for x in e['miss']})
        for n, v in e['have'].items():
            if v[2] and not any(diff(v[0], s) < SAME for s, _ in survs):
                survs.append((v[0], tuple(v[2])))
        dims |= {(w, h) for n, w, h in T}
    return anims, survs, dims


def candidates(fam, need_f, idx):
    """TOPN LWFs outside the family by (missing sizes covered, surviving sizes covered); >= 3 missing."""
    mset = {tuple(wh) for e in need_f.values() for t, wh in e['miss'] if wh}
    sset = {tuple(v[2]) for e in need_f.values() for v in e['have'].values() if v[2]}
    scores = []
    for p, (k, sh, t) in idx.items():
        if ('\\enemy\\%s\\' % fam) in p or ('/enemy/%s/' % fam) in p:
            continue
        dd = {(x[1], x[2]) for x in t}
        sm = len(mset & dd)
        if sm >= 3:
            scores.append((sm, len(sset & dd), k, p))
    scores.sort(key=lambda x: (-x[0], -x[1]))
    out, seen = [], set()
    for sm, ss, pool, path in scores[:TOPN]:
        k, sh, t = idx[path]
        if sh in seen:
            continue
        seen.add(sh)
        files = {a: b for a, b in resolve(pool, path, [x[0] for x in t]).items() if b}
        if files:
            out.append((pool, path, t, files))
    return out


def container_of(p):
    for k, r in OUT_ROOTS:
        r = os.path.normcase(r) + os.sep
        if os.path.normcase(p).startswith(r):
            return k, p[len(r):].replace('\\', '/')
    return None, None


def rejected(fam, src):
    for f, frag, why in VISUAL_REJECT:
        if f == fam and frag in src.replace('\\', '/'):
            return why
    return None


def validate(anims, survs, famdims, donors, res, diff, val):
    """self: the pick for each survivor (anchors included) must be that image; hide (>= 6 survivors): one
    survivor as the only anchor, rule B, the hidden ones must be guessed."""
    for an, (T, have, miss) in anims.items():
        for i, (n, w, h) in enumerate(T):
            if n in have and i in res[an]['pick']:
                q, rule = res[an]['pick'][i]
                if q:
                    k = ('self', rule, diff(q, have[n][0]) < SAME)
                    val[k] = val.get(k, 0) + 1
    if len(survs) >= 6:
        for keep in survs[:3]:
            r2 = solve(anims, [keep], famdims, donors, diff, mode='B')
            for an, (T, have, miss) in anims.items():
                for i, (n, w, h) in enumerate(T):
                    if n in have and have[n][0] != keep[0] and i in r2[an]['pick']:
                        q, rule = r2[an]['pick'][i]
                        if q:
                            k = ('hide', rule, diff(q, have[n][0]) < SAME)
                            val[k] = val.get(k, 0) + 1


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=os.path.join(HERE, 'extra_donors_deep.tsv'))
    ap.add_argument('--cache', default=os.path.join(D, 'tmp', 'deep_donors_cache'),
                    help='cache folder (LWF index, signatures, dry run)')
    ap.add_argument('--fams', help='only these families (tests)')
    ap.add_argument('--validate', action='store_true', help='also the self/hide validation (slower)')
    ap.add_argument('--report', help='json with rows, rejects and validation (default <cache>\\deep_report.json)')
    a = ap.parse_args(argv)
    os.makedirs(a.cache, exist_ok=True)
    fams = [int(x) for x in a.fams.split(',')] if a.fams else None
    need = family_needs(fams, a.cache)
    print('families', len(need), flush=True)
    idx = index_lwfs(os.path.join(a.cache, 'lwf_index.pkl'))
    print('LWFs indexed', len(idx), flush=True)
    sig = Sig(os.path.join(a.cache, 'sig32.pkl'))
    rows, rej, dropped, val, per_fam = [], [], [], {}, {}
    for n_f, fam in enumerate(sorted(need)):
        if not need[fam]:
            continue
        anims, survs, famdims = fam_data(need[fam], sig.diff)
        donors = candidates(fam, need[fam], idx)
        res = solve(anims, survs, famdims, donors, sig.diff)
        if a.validate:
            validate(anims, survs, famdims, donors, res, sig.diff, val)
        got = 0
        for an, (T, have, miss) in anims.items():
            for i, (n, w, h) in enumerate(T):
                if n not in miss:
                    continue
                q, rule = res[an]['pick'].get(i, (None, 'none'))
                if not q or rule not in ('content', 'bracket'):
                    continue
                k, rel = container_of(q)
                pub = 'lwf/character/enemy/%s/%s/%s' % (fam, an, n)
                row = (pub, '%s:%s' % (k, rel), 'content-anchor' if rule == 'content' else 'bracket', '%dx%d' % (w, h))
                if not k:
                    dropped.append((pub, q))
                    continue
                why = rejected(fam, rel)
                if why:
                    rej.append(row + (why,))
                    continue
                rows.append(row)
                got += 1
        per_fam[fam] = got
        if n_f % 10 == 0:
            sig.save()
        print(fam, 'rows', got, flush=True)
    sig.save()
    rows.sort()
    with open(a.out, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write('# Original copies found by content (I-194, 22-10-2026; recon/tools/deep_donors.py, category 2):\n'
                 '# rules content-anchor and bracket on donor LWFs of the same creature (raid, demo, films, other enemies).\n'
                 '# Columns: published path, <container>:<source>, rule, declared size. Names and paths only.\n'
                 '# Generated by deep_donors.py; %d rows (%d rejected by the visual check, VISUAL_REJECT).\n'
                 % (len(rows), len(rej)))
        for r in rows:
            fh.write('\t'.join(r) + '\n')
    rep = {'rows': len(rows), 'rejected': rej, 'dropped_outside_containers': dropped, 'per_family': per_fam,
           'validation': {'%s/%s/%s' % k: v for k, v in sorted(val.items())}}
    json.dump(rep, open(a.report or os.path.join(a.cache, 'deep_report.json'), 'w', encoding='utf-8'), indent=1,
              ensure_ascii=False)
    print('rows %d, visually rejected %d, outside the containers %d' % (len(rows), len(rej), len(dropped)))
    if val:
        print('validation', rep['validation'])
    return 0


if __name__ == '__main__':
    sys.exit(main())
