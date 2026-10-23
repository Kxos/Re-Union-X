"""Pacchetto statico delle grafiche originali dei nemici (JP 4.3.1 + 2016) per il client: enemy_gen\\files.

    python recon/tools/make_jp_enemies.py [--out D:\\Progetto_Restauro_KH_UX\\enemy_gen] [--story-only]
        [--ids 2,3] [--dry] [--jobs N] (Pillow: senza -I)

Le risorse WW servono lwf/character/enemy/<displayId>/ solo per 6 nemici KHUX (1, 6, 8, 17, 37, 1020)
e per le serie di Dark Road: make-game-tables.js da' a tutti gli altri un sostituto (Shadow, Armored
Knight...). Qui si ricostruiscono le cartelle dei displayId originali (master_data\\enemy_display_orig.json)
che il master usa e che nessun indice serve (names_v4.tsv + ipa431\\names_addnl.tsv), dalle fonti in
sola lettura: dati JP 4.3.1 della cartella di riferimento locale (`lwf/character/enemy/`, PNG veri, nomi con revisione
`<nome>.<8 cifre>.<ext>`: vale la piu' alta, come latest di import_jp_coco.py) e pacchetto 2016
(<ref_work>\\bundle2016\\files\\lwf\\character\\enemy, gia' BTF).

Animazioni (docs/notes/battaglia.md#nemici-jp): apre per stato la LWF della {wait, bwait, move, atk%d_o, atkSp, knockback, dead}; rende NULL se il file
manca e il chiamante lo dereferenzia: crash. bwait e atkSp sono facoltative (ne prova
l'esistenza: assenti -> wait); atk%d_o usa attackMotion di enemyAttack (oggi sempre 1).
  * obbligatorie: wait, atk1_o, knockback, dead e move;
  * move assente o incompleta nelle fonti (142 dei 360 nemici JP non l'hanno: piante, boss fermi)
    -> copia di wait come fa make_enemy_moves.py per Dark Road (il nemico scivola senza animarsi);
  * facoltative (bwait, atkSp, atk2_o..): solo se complete; le altre cartelle JP (atk1_n, open,
    wait_dead...) il client non le apre.
Per ogni animazione si sceglie, in ordine: (1) LWF JP con tutte le texture JP (le mancanti prese dal
2016 solo se il LWF 2016 e' identico byte per byte); (2) LWF 2016 con tutte le texture 2016;
(3) LWF JP con le texture scartate dall'estrazione JP (file identici tolti) riprese da un'altra
animazione dello stesso nemico con lo stesso nome originale (<anim>_<esadecimale>.png), se tutte le
copie candidate sono identiche (come LWF_FILL di import_jp_coco.py). Altrimenti l'animazione e'
incompleta; un nemico entra solo se tutte le obbligatorie sono complete (mai una texture assente).
In (3), se nessuna copia dello stesso nemico va bene, la texture si prende dalla tabella dei doppioni
(recon/tools/jp_dedup_donors.tsv, jp_dedup_donors.py: file identico rimasto in un'altra cartella JP, spesso
lwf/drama/<id>/; regole misurate sul pacchetto 2016, precisione >= 99%); `--donors ''` la esclude.
Poi, solo per le famiglie che cosi' diventano complete, la tabella delle texture RICOSTRUITE
(recon/tools/jp_reconstructed.tsv, jp_reconstructed.py, I-194 del 21-10: ombra standard o stessa parte da un'altra
animazione della stessa famiglia, sempre un file JP reale); `--recon ''` la esclude. La regola dello stesso nome vale
solo con le misure dichiarate dalla LWF (+-2 px, tex_dims/fits): lo stesso numero di bitmap in un'altra FLA non e'
la stessa immagine (1577: fumo di dead al posto degli ingranaggi di wait).

Fonti in piu' (I-194, 21-10 sera, regola dell'utente: i file originali vincono sempre; extra_donors.py): file diretti
allo stesso percorso nell'OBB JP 5.0.1 (categoria 1) e copie da OBB JP/WW 5.0.1, 2016 e gemelli Dark Road verificati a
vista, anche animazioni intere (recon/tools/extra_donors.tsv, categoria 2; `--extra ''` la esclude), poi le ricostruite
(categoria 3) e per ultime le RICOLORATE dal gemello di colore (recon/tools/jp_recoloured.tsv, categoria 4, PNG generati
in enemy_gen_src\\recolour; `--recolour ''` la esclude), con la dead generica intera del gemello. Radici dei contenitori:
`--src-root jp501=<cartella>`. Ogni famiglia completa ha la sua categoria (la peggiore) in report.json.
Category 2 also includes the original copies found by content in other LWFs of the same creature (I-194, 22-10:
recon/tools/extra_donors_deep.tsv from deep_donors.py, rules content-anchor and bracket; `--deep ''` excludes it).
Last among the category-2 copies (I-194, 23-10): pieces matched by texture-table ORDER to identical copies in other
folders of the dump (dedup_match.py proposal), only the rows the user approved on the review sheets
(recon/tools/extra_donors_dedup.tsv from dedup_export.py, rule dedup-order; `--dedup ''` excludes it). The same table
holds the user-approved DOWNSCALED copies of original art (rule dedup-rescale, 23-10, category 3, containers rescale and
rescale_e1 outside the repo): same place in the order, accepted only at exactly the declared size.

Effetti di comparsa: lwf/character/enemy/show_effect_fla/show_effect<N>/ per gli showSwf originali
(external\\thethiny\\enemy_dec.json) non serviti, stesse regole (completi o niente).

Texture: PNG JP (alpha diritta) -> BTF tipo 8 con btf.encode (premoltiplica); BTF 2016 copiati.
Uscita: <out>\\files\\lwf\\character\\enemy\\... (i file non piu' previsti si tolgono), <out>\\report.json
e report.md. make-game-tables.js legge <out>\\files per tenere il displayId originale.
"""
import argparse
import hashlib
import json
import os
import re
import sys
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
D = r'D:\Progetto_Restauro_KH_UX'
REPO = os.path.dirname(os.path.dirname(HERE))
import private_tools  # noqa: E402  (local reference data folders, see private_tools.py)
JP_ROOT = private_tools.local_path('jp_data')
REV = re.compile(r'^(.*)\.(\d{8})(\.[^.]+)$')
PNGREF = re.compile(rb'[\w\-.]+\.png')
MANDATORY = ['wait', 'atk1_o', 'knockback', 'dead']          # + move (eventualmente da wait)
OPTIONAL = re.compile(r'^(bwait|atkSp|atk\d+_o)$')
# Guest allies (I-199, recon/tools/ally_families.json): families that the JP stages use only in teams with flag 0x20.
# The client keeps them in its ally list (4.3.1): they enter only wait (field and battle, bwait falls back
# to it), atk1_o / atkSp (their attack) and possibly move (the ally attack waits for the approach);
# they are never targeted nor killed, so knockback and dead are never opened. Ally rule: wait + atk1_o complete;
# move, knockback and dead copied from wait when absent or incomplete (safety net: never opened, but no NULL LWF).
ALLY_MANDATORY = ['wait', 'atk1_o']
ALLY_FROM_WAIT = ['move', 'knockback', 'dead']
ALLY_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'ally_families.json')
ALLY_FAMILIES = {int(k) for k in json.load(open(ALLY_FILE, encoding='utf-8'))['families']} if os.path.exists(ALLY_FILE) else set()
ENEMY = 'lwf/character/enemy'

ap = argparse.ArgumentParser()
ap.add_argument('--jp', default=os.path.join(JP_ROOT, 'lwf', 'character', 'enemy'))
ap.add_argument('--jp-root', default=JP_ROOT, help='radice JP delle sorgenti della tabella dei doppioni')
ap.add_argument('--donors', default=None, help="tabella dei doppioni (default recon/tools/jp_dedup_donors.tsv; '' = nessuna)")
ap.add_argument('--recon', default=None,
                help="tabella delle texture ricostruite (default recon/tools/jp_reconstructed.tsv; '' = nessuna)")
ap.add_argument('--extra', default=None,
                help="copie originali da altri contenitori (default recon/tools/extra_donors.tsv; '' = nessuna)")
ap.add_argument('--deep', default=None,
                help="original copies found by content (default recon/tools/extra_donors_deep.tsv, deep_donors.py; '' = none)")
ap.add_argument('--dedup', default=None,
                help="original copies matched by texture-table order, user-approved (default "
                     "recon/tools/extra_donors_dedup.tsv, dedup_export.py; '' = none)")
ap.add_argument('--recolour', default=None,
                help="texture ricolorate da un gemello (default recon/tools/jp_recoloured.tsv; '' = nessuna)")
ap.add_argument('--src-root', action='append', default=[], metavar='CONTENITORE=CARTELLA',
                help='radice di un contenitore di extra_donors.py (jp501, ww501, b2016, jp431, recolour); ripetibile')
ap.add_argument('--b2016', default=private_tools.local_path('ref_work', 'bundle2016', 'files', 'lwf', 'character', 'enemy'))
ap.add_argument('--index', action='append')
ap.add_argument('--master', default=os.path.join(REPO, 'server', 'master_data'))
ap.add_argument('--real', default=os.path.join(D, 'external', 'thethiny', 'enemy_dec.json'))
ap.add_argument('--poi', action='append', help='stage_poi (enemyId degli stage di storia)')
ap.add_argument('--oltre', default=os.path.join(D, 'reference', 'world_schema', 'oltre525', 'enemies_oltre525.json'),
                help='nemici delle missioni 526-979 assenti dal master ({missing}): anche le cartelle delle loro famiglie')
ap.add_argument('--out', default=os.path.join(D, 'enemy_gen'))
ap.add_argument('--story-only', action='store_true', help='solo i nemici degli stage di storia (--poi)')
ap.add_argument('--ids', help='solo questi displayId (elenco con virgole), per prove')
ap.add_argument('--dry', action='store_true', help='solo rapporto, nessuna scrittura in files')
ap.add_argument('--jobs', type=int, default=0)
a = ap.parse_args()
a.index = a.index or [os.path.join(D, 'resource_data', 'names_v4.tsv'), os.path.join(D, 'ipa431', 'names_addnl.tsv')]
a.poi = a.poi or [os.path.join(D, 'stage_gen', 'orig_stages', 'stage_poi_orig.json'),
                  os.path.join(REPO, 'server', 'game_data', 'stage_poi.json')]
OUT_FILES = os.path.join(a.out, 'files')
import jp_dedup_donors  # noqa: E402
DONORS = jp_dedup_donors.load(jp_dedup_donors.TABLE if a.donors is None else a.donors)
import jp_reconstructed  # noqa: E402
RECON = jp_reconstructed.load(jp_reconstructed.TABLE if a.recon is None else a.recon)
import extra_donors  # noqa: E402
EXTRA = extra_donors.load(extra_donors.TABLE if a.extra is None else a.extra, rules=set(extra_donors.RULES) - {'recolour', 'recolour-whole', 'dedup-override', 'dedup-rescale'})
# original copies found by content (deep_donors.py: rules content-anchor and bracket, category 2); extra_donors.tsv
# wins on the same rows
EXTRA = dict(extra_donors.load(extra_donors.DEEP_TABLE if a.deep is None else a.deep,
                               rules={'content-anchor', 'bracket'}), **EXTRA)
# original copies matched by texture-table order (dedup_match.py proposal, user-approved rows; dedup_export.py):
# category 2, read last among the copies (never overrides a file or a row of the tables above), except the rows with
# rule dedup-override (user's decision 23-10, 1636 wait only): those win over every other source for that exact path
# Rows with rule dedup-rescale (user-approved 23-10): DOWNSCALED copies of original art (category 3), same place in the
# order as dedup-order but accepted only at EXACTLY the declared size (no +-2 px tolerance)
DEDUP = extra_donors.load(extra_donors.DEDUP_TABLE if a.dedup is None else a.dedup,
                          rules={'dedup-order', 'dedup-override', 'dedup-rescale'})
RECOL = extra_donors.load(extra_donors.RECOLOUR_TABLE if a.recolour is None else a.recolour, rules={'recolour', 'recolour-whole'})
ROOTS = dict(extra_donors.ROOTS, jp431=[a.jp_root])
for _x in a.src_root:
    _k, _v = _x.split('=', 1)
    ROOTS[_k] = [_v]


def donor(published):
    """Texture scartata come doppione dall'estrazione JP: il file identico rimasto altrove (tabella)."""
    return jp_dedup_donors.lookup(DONORS, published, a.jp_root)


def recon(published):
    """Texture persa ricostruita con un'altra texture JP reale (ombra standard, stessa parte da un'altra animazione):
    tabella jp_reconstructed.tsv, solo per le famiglie che cosi' diventano complete (I-194, 21-10)."""
    return jp_reconstructed.lookup(RECON, published, a.jp_root)


def extra(published, table=None):
    """Copia originale da un altro contenitore (extra_donors.tsv: OBB JP/WW 5.0.1, 2016, gemelli Dark Road) o texture
    ricolorata (table=RECOL) -> (percorso assoluto, categoria della regola) o (None, None)."""
    t = EXTRA if table is None else table
    p = extra_donors.lookup(t, published, ROOTS)
    return (p, extra_donors.category(t[published][2])) if p else (None, None)


def override(published):
    """user-approved replacement of a piece another source supplies (dedup-override rows) -> path or None."""
    v = DEDUP.get(published)
    return extra_donors.lookup(DEDUP, published, ROOTS) if v and v[2] == 'dedup-override' else None


def listing(p):
    """Cartella -> {nome logico: percorso della revisione piu' alta}."""
    idx = {}
    if os.path.isdir(p):
        for f in os.listdir(p):
            if not os.path.isfile(os.path.join(p, f)):
                continue
            m = REV.match(f)
            base, r = (m.group(1) + m.group(3), int(m.group(2))) if m else (f, -1)
            if base not in idx or idx[base][0] < r:
                idx[base] = (r, os.path.join(p, f))
    return {k: v[1] for k, v in idx.items()}


_sha = {}


def sha(p):
    if p not in _sha:
        _sha[p] = hashlib.sha1(open(p, 'rb').read()).digest()
    return _sha[p]


def refs_of(lwf):
    return sorted({m.decode() for m in PNGREF.findall(open(lwf, 'rb').read())})


_dims = {}


def tex_dims(lwf):
    """{nome texture: (w, h) dichiarate} dalla sezione texture della LWF (GREE lwf_format.h: Data{offset, len} da 32,
    texture = 9a sezione, record {stringId, format, width, height, scale}; stringhe dalla sezione stringData a 312).
    None se il file non si legge come LWF (allora le dimensioni non si controllano)."""
    if lwf not in _dims:
        try:
            _dims[lwf] = _tex_dims(open(lwf, 'rb').read())
        except Exception:                   # noqa: BLE001
            _dims[lwf] = None
    return _dims[lwf]


def _tex_dims(b):
    import struct
    sb = struct.unpack_from('<i', b, 32)[0]
    so, sn = struct.unpack_from('<ii', b, 312)
    strs = [b[sb + o:sb + o + n].decode('utf-8', 'replace') for o, n in
            (struct.unpack_from('<ii', b, so + 8 * k) for k in range(sn))]
    to, tn = struct.unpack_from('<ii', b, 32 + 8 * 8)
    return {strs[t[0]]: (t[2], t[3]) for t in (struct.unpack_from('<iiiif', b, to + 20 * k) for k in range(tn))
            if 0 <= t[0] < sn}


def img_size(p):
    """(w, h) di un PNG (IHDR) o di un BTF del 2016 (None se illeggibile)."""
    d = open(p, 'rb').read(32)
    if d[:8] == b'\x89PNG\r\n\x1a\n':
        import struct
        return struct.unpack('>II', d[16:24])
    try:
        import btf
        return btf.decode(open(p, 'rb').read()).size
    except Exception:                       # noqa: BLE001
        return None


def fits(p, wh):
    """la texture p ha le dimensioni dichiarate wh (+-2 px dell'esportazione)? (21-10, I-194: senza questo controllo la
    regola dello stesso nome prendeva per la wait di 1577 le nuvole di fumo 146x148 di dead al posto degli ingranaggi
    95x65: in Flash la numerazione delle bitmap e' di ogni FLA, lo stesso numero non e' la stessa immagine)"""
    s = img_size(p)
    return s is not None and wh is not None and abs(s[0] - wh[0]) <= 2 and abs(s[1] - wh[1]) <= 2


def fits_exact(p, wh):
    """downscaled copies (rule dedup-rescale, I-194 23-10): written at the declared size, accepted only at that size."""
    s = img_size(p)
    return s is not None and wh is not None and tuple(s) == tuple(wh)


# tipo di fonte di una texture -> categoria della regola dell'utente (extra_donors.py)
KIND_CAT = {'jp': 1, 'diretto': 1, 'stesso': 2, 'doppione': 2, 'copia': 2, 'dedup': 2, 'riscalata': 3, 'ricostruita': 3,
            'ricolorata': 4}


def fill_tex(pre, anim, t, jp, jp_all, dims):
    """Fonte della texture t citata dalla LWF JP di <pre> -> (percorso, tipo) o (None, None). Ordine (regola dell'utente
    del 21-10, extra_donors.py): file JP; file diretto allo stesso percorso in un altro contenitore (exact501); copie
    dello stesso nemico (texture scartate dall'estrazione JP perche' identiche: stesso nome originale dopo il prefisso
    dell'animazione, o lo stesso nome esatto, in un'altra animazione), tabella dei doppioni, copie degli altri
    contenitori (extra_donors.tsv); ricostruite (jp_reconstructed.tsv); ricolorate (jp_recoloured.tsv). Copie e
    ricolorate con le misure dichiarate (+-2 px); le ricostruite no (ombre scalate)."""
    def fit(q):
        return dims is None or fits(q, dims.get(t))
    op = override(pre + t)
    if op and fit(op):
        return op, 'dedup'
    if t in jp:
        return jp[t], 'jp'
    xp, xc = extra(pre + t)
    if xp and xc == 1 and fit(xp):
        return xp, 'diretto'
    suf = t[len(anim) + 1:] if t.startswith(anim + '_') else None
    cands = [] if suf is None else [fs[o + '_' + suf] for o, fs in jp_all.items()
                                      if o != anim and (o + '_' + suf) in fs and fit(fs[o + '_' + suf])]
    if not (cands and len({sha(c) for c in cands}) == 1):
        # stesso nome esatto in un'altra animazione (21-10, I-009 Task 7): il LWF di wait cita wait_<x>.png e il file
        # vero e' rimasto solo in atk1_o/ (che cita le stesse bitmap di wait), le altre copie erano stub di
        # deduplicazione (es. 1532, 1550, 1561: 0 texture in wait/)
        cands = [fs[t] for o, fs in jp_all.items() if o != anim and t in fs and fit(fs[t])]
    if cands and len({sha(c) for c in cands}) == 1:
        return cands[0], 'stesso'
    dp = donor(pre + t)
    if dp and fit(dp):
        return dp, 'doppione'
    if xp and fit(xp):
        return xp, 'copia'
    qp, _ = extra(pre + t, DEDUP)
    if qp and DEDUP[pre + t][2] == 'dedup-rescale':
        if dims is not None and fits_exact(qp, dims.get(t)):
            return qp, 'riscalata'
    elif qp and fit(qp):
        return qp, 'dedup'
    rp = recon(pre + t)
    if rp:
        return rp, 'ricostruita'
    cp, _ = extra(pre + t, RECOL)
    if cp and fit(cp):
        return cp, 'ricolorata'
    return None, None


def plan_anim(root_rel, anim, jp_all):
    """Animazione <root_rel>/<anim>/: -> (stato, {nome: fonte} o None, nota, categoria).
    jp_all: {anim: listing JP} dello stesso nemico (per le texture scartate come doppioni).
    categoria (regola dell'utente, extra_donors.py): 1 file diretti, 2 copie originali, 3 ricostruite, 4 ricolorate;
    la peggiore fra le texture."""
    jp = jp_all.get(anim) or {}
    b = listing(os.path.join(a.b2016, *root_rel.split('/'), anim))
    lw = anim + '.lwf'
    jl, bl = jp.get(lw), b.get(lw)
    pre = '%s/%s/%s/' % (ENEMY, root_rel, anim)
    notes = []
    if jl:
        refs = refs_of(jl)
        same_b = bl is not None and sha(bl) == sha(jl)
        todo, miss = {pre + lw: jl}, []
        for t in refs:
            p = jp.get(t) or (b.get(t) if same_b else None)
            if p and not override(pre + t):
                todo[pre + t] = p
            else:
                miss.append(t)
        if not miss:
            return 'jp', todo, 'texture dal 2016 (LWF identico)' if any(v in b.values() for v in todo.values()) else '', 1
        notes.append('JP: %d texture assenti su %d' % (len(miss), len(refs)))
    if bl:
        refs = refs_of(bl)
        miss = [t for t in refs if t not in b]
        if not miss:
            return '2016', {pre + lw: bl, **{pre + t: b[t] for t in refs}}, '; '.join(notes), 1
        notes.append('2016: %d texture assenti su %d' % (len(miss), len(refs)))
    if jl:
        # texture scartate dall'estrazione JP perche' identiche a un altro file: stesso nome originale
        # (dopo il prefisso dell'animazione) in un'altra animazione dello stesso nemico
        todo, cat, ok = {pre + lw: jl}, 1, True
        dims = tex_dims(jl)
        count = {}
        for t in refs_of(jl):
            q, kind = fill_tex(pre, anim, t, jp, jp_all, dims)
            if not q:
                ok = False
                break
            todo[pre + t] = q
            count[kind] = count.get(kind, 0) + 1
            cat = max(cat, KIND_CAT[kind])
        if ok:
            notes.append('%d texture da altre animazioni dello stesso nemico' % count.get('stesso', 0))
            for kind, what in (('doppione', 'dalla tabella dei doppioni'), ('diretto', 'dirette da altri contenitori (exact501)'),
                               ('copia', 'da altri contenitori (extra_donors.tsv)'),
                               ('dedup', 'by table order (extra_donors_dedup.tsv)'),
                               ('riscalata', 'downscaled copies of original art (extra_donors_dedup.tsv, dedup-rescale)'),
                               ('ricostruita', 'ricostruite (jp_reconstructed.tsv)'), ('ricolorata', 'ricolorate (jp_recoloured.tsv)')):
                if count.get(kind):
                    notes.append('%d %s' % (count[kind], what))
            return 'jp+riempite', todo, '; '.join(notes), cat
    # animazione INTERA da un gemello Dark Road verificato a vista (extra_donors.tsv, regola whole-dr-twin): la LWF
    # 4.3.1 manca del tutto (es. wait e dead di 1543 Pot Spider da 5048); LWF e tutte le sue texture dalla tabella
    # Poi (categoria 4, jp_recoloured.tsv regola recolour-whole) la dead generica del gemello di colore: solo fumo, le
    # stesse texture in tutte le LWF dead con quella tabella (JP 4.3.1 contro DR: 394 texture, differenza <= 1,6/255)
    for table, rule, label in ((EXTRA, 'whole-dr-twin', 'animazione intera dal gemello Dark Road'),
                               (RECOL, 'recolour-whole', 'animazione intera generica dal gemello di colore')):
        wl, wc = extra(pre + lw, table)
        if not (wl and table[pre + lw][2] == rule):
            continue
        todo, dims = {pre + lw: wl}, tex_dims(wl)
        for t in refs_of(wl):
            tp, _ = extra(pre + t, table)
            if not (tp and table[pre + t][2] == rule and (dims is None or fits(tp, dims.get(t)))):
                break
            todo[pre + t] = tp
        else:
            notes.append('%s (%s)' % (label, table[pre + lw][3]))
            return 'gemello DR' if table is EXTRA else 'gemello ricolorato', todo, '; '.join(notes), wc
    if not jl and not bl:
        return 'assente', None, '; '.join(notes) or 'nessuna fonte', None
    return 'incompleta', None, '; '.join(notes), None


def plan_enemy(d):
    rel = str(d)
    jp_all = {}
    jd = os.path.join(a.jp, rel)
    if os.path.isdir(jd):
        for an in os.listdir(jd):
            if os.path.isdir(os.path.join(jd, an)):
                jp_all[an] = listing(os.path.join(jd, an))
    bd = os.path.join(a.b2016, rel)
    anims = set(jp_all) | (set(f for f in os.listdir(bd) if os.path.isdir(os.path.join(bd, f))) if os.path.isdir(bd) else set())
    r = {'displayId': d, 'sources': [s for s, p in (('jp', jd), ('2016', bd)) if os.path.isdir(p)], 'anims': {}}
    todo = {}
    fatal = []
    cat = 1
    ally = d in ALLY_FAMILIES
    mandatory = ALLY_MANDATORY if ally else MANDATORY
    if ally:
        r['ally'] = True
    for an in MANDATORY + ['move'] + sorted(x for x in anims if OPTIONAL.match(x)):
        st, files, note, c = plan_anim(rel, an, jp_all)
        r['anims'][an] = {'status': st, 'note': note} if note else {'status': st}
        if files:
            r['anims'][an]['category'] = c
            todo.update(files)
            cat = max(cat, c)
        elif an in mandatory:
            fatal.append(an)
    # da wait: move per tutti, knockback e dead solo per gli alleati (stessi file: le texture tengono il nome wait_*,
    # che il LWF cita)
    for an in (ALLY_FROM_WAIT if ally else ['move']):
        if 'wait' in fatal or r['anims'][an]['status'] not in ('assente', 'incompleta'):
            continue
        pre_w, pre_m = '%s/%s/wait/' % (ENEMY, rel), '%s/%s/%s/' % (ENEMY, rel, an)
        for n, p in list(todo.items()):
            if n.startswith(pre_w):
                f = n[len(pre_w):]
                todo[pre_m + (an + '.lwf' if f == 'wait.lwf' else f)] = p
        r['anims'][an]['status'] = 'da wait (' + r['anims'][an]['status'] + ')'
    if fatal:
        r.update(status='incompleto', why='animazioni obbligatorie mancanti o incomplete: ' + ', '.join(fatal))
        return r, {}
    # categoria della famiglia: la peggiore delle animazioni servite (1 diretti, 2 copie, 3 ricostruite, 4 ricolorate)
    r.update(status='completo', files=len(todo), category=cat)
    return r, todo


def family_of(i):
    """Famiglia grafica di un enemyId: ultime 4 cifre (delle ultime 5 per gli id da 8 cifre in su), come familyOf
    di server/make-enemy-oltre.js."""
    return (i % 100000 if i >= 10 ** 7 else i) % 10000


def oltre_families(ids, served=()):
    """Nemici delle missioni 526-979 assenti dal master (enemies_oltre525.json) -> {famiglia: [enemyId]} per le
    famiglie con la cartella JP (o 2016) non servite dagli indici. displayId originale = famiglia: nel master ogni
    riga di storia da 1000 in su ha displayId = famiglia (1001-1006, 1020-1023, 1501, 2001-2003, 11501, 12001...;
    le eccezioni sono solo eventi 5xxx/6xxx/8xxx/9xxx) e le 139 famiglie nuove hanno tutte la loro cartella JP."""
    out = {}
    for i in ids:
        f = family_of(i)
        if f in served or f >= 5000:
            continue
        if os.path.isdir(os.path.join(a.jp, str(f))) or os.path.isdir(os.path.join(a.b2016, str(f))):
            out.setdefault(f, []).append(i)
    return out


def plan_show(n):
    rel = 'show_effect_fla'
    an = 'show_effect%d' % n
    jp_all = {an: listing(os.path.join(a.jp, rel, an))}
    st, files, note, _ = plan_anim(rel, an, jp_all)
    return {'showSwf': n, 'status': st, 'note': note}, files or {}


def convert(job):
    name, src, dst = job
    try:
        if os.path.exists(dst) and os.path.getmtime(dst) >= os.path.getmtime(src):
            return name, 'tenuto', os.path.getsize(dst)
        d = open(src, 'rb').read()
        if name.endswith('.png'):
            if d[:4] == b'\x89BTF':
                out = d
            elif d[:8] == b'\x89PNG\r\n\x1a\n':
                import btf
                from PIL import Image
                out = btf.encode(Image.open(src).convert('RGBA'))
            else:
                return name, 'formato sconosciuto', 0
        else:
            out = d
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        tmp = dst + '.tmp'
        with open(tmp, 'wb') as fh:
            fh.write(out)
        os.replace(tmp, dst)
        return name, 'scritto', len(out)
    except Exception as e:                  # noqa: BLE001
        return name, 'errore %r' % e, 0


def main():
    served = set()
    shows_served = set()
    for tsv in a.index:
        with open(tsv, encoding='utf-8') as fh:
            for line in fh:
                m = re.match(r'lwf/character/enemy/(\d+)/wait/', line)
                if m:
                    served.add(int(m.group(1)))
                m = re.match(r'lwf/character/enemy/show_effect_fla/show_effect(\d+)/', line)
                if m:
                    shows_served.add(int(m.group(1)))
    enemies = json.load(open(os.path.join(a.master, 'enemy.json'), encoding='utf-8'))
    orig = json.load(open(os.path.join(a.master, 'enemy_display_orig.json'), encoding='utf-8'))
    disp = {e['enemyId']: orig.get(str(e['enemyId']), e['displayId']) for e in enemies}
    story_ids = set()
    for p in a.poi:
        if os.path.exists(p):
            for st in json.load(open(p, encoding='utf-8')).values():
                story_ids.update(x['enemyId'] for x in st.get('enemies', []))
    story_disp = {disp[i] for i in story_ids if i in disp}
    want = sorted({d for d in disp.values() if d not in served and d < 5000})
    if a.story_only:
        want = [d for d in want if d in story_disp]
    # famiglie dei nemici delle missioni 526-979 (I-009 Task 7, 21-10): righe aggiunte da make-enemy-oltre.js, che
    # prende il displayId della famiglia quando la sua cartella qui e' completa; sono tutte di storia
    oltre = {}
    if a.oltre and os.path.exists(a.oltre):
        miss = json.load(open(a.oltre, encoding='utf-8')).get('missing', {})
        # solo le famiglie che il master non chiede gia' (le altre, es. 3 o 56, sono il displayId di righe vere)
        oltre = {f: v for f, v in oltre_families(sorted(int(k) for k in miss), served).items()
                 if f not in want and f not in disp.values()}
        story_disp |= set(oltre)
        want = sorted(set(want) | set(oltre))
    if a.ids:
        want = [int(x) for x in a.ids.split(',') if x]
    results, plan = [], {}
    for d in want:
        r, todo = plan_enemy(d)
        r['story'] = d in story_disp
        r['enemies'] = sorted(i for i, x in disp.items() if x == d)
        if d in oltre:
            r['oltre'] = sorted(oltre[d])
        results.append(r)
        plan.update(todo)
    # effetti di comparsa: showSwf originali (righe vere) non serviti
    real = json.load(open(a.real, encoding='utf-8')) if os.path.exists(a.real) else []
    have = set(disp)
    need_shows = sorted({x['showSwf'] for x in real if x['enemyId'] in have} - shows_served)
    show_res = []
    for n in need_shows:
        r, todo = plan_show(n)
        show_res.append(r)
        plan.update(todo)
    jobs = [(n, p, os.path.join(OUT_FILES, *n.split('/'))) for n, p in sorted(plan.items())]
    stats, size, errors = {}, 0, []
    if not a.dry:
        with Pool(a.jobs or None) as pool:
            for n, st, sz in pool.imap_unordered(convert, jobs, chunksize=32):
                k = st.split(' ')[0]
                stats[k] = stats.get(k, 0) + 1
                size += sz
                if st.startswith(('errore', 'formato')):
                    errors.append((n, st))
        keep = {os.path.normcase(j[2]) for j in jobs}
        removed = 0
        for dp, _, fs in os.walk(OUT_FILES, topdown=False):
            for f in fs:
                p = os.path.join(dp, f)
                if os.path.normcase(p) not in keep:
                    os.remove(p)
                    removed += 1
            if dp != OUT_FILES and not os.listdir(dp):
                os.rmdir(dp)
        stats['tolti'] = removed
    else:
        have_sz = [os.path.getsize(j[2]) for j in jobs if os.path.exists(j[2])]
        size = sum(have_sz)
        stats['gia_scritti'] = len(have_sz)
    ok = [r for r in results if r['status'] == 'completo']
    bad = [r for r in results if r['status'] != 'completo']
    n_en_ok = sum(len(r['enemies']) for r in ok)
    story_en_bad = sorted(i for i in story_ids if i in disp and disp[i] in {r['displayId'] for r in bad})
    story_en_served = sorted(i for i in story_ids if i in disp and disp[i] in served)
    rep = {'out': OUT_FILES, 'story_only': a.story_only, 'displayIds': len(results), 'complete': len(ok),
           'incomplete': len(bad), 'enemy_rows_original': n_en_ok, 'files': len(jobs), 'bytes': size,
           'write_stats': stats, 'errors': errors,
           'complete_ids': [r['displayId'] for r in ok], 'incomplete_ids': [r['displayId'] for r in bad],
           'story_displayIds': sorted(story_disp), 'story_enemies': len(story_ids & have),
           'story_enemies_served': len(story_en_served), 'story_enemies_substituted': story_en_bad,
           'oltre_families': len(oltre), 'oltre_complete': [r['displayId'] for r in ok if r.get('oltre')],
           'oltre_incomplete': [r['displayId'] for r in bad if r.get('oltre')],
           'complete_by_category': {c: [r['displayId'] for r in ok if r.get('category') == c] for c in (1, 2, 3, 4)},
           'move_from_wait': [r['displayId'] for r in ok if r['anims']['move']['status'].startswith('da wait')],
           'allies_complete': [r['displayId'] for r in ok if r.get('ally')],
           'shows': show_res, 'results': results}
    os.makedirs(a.out, exist_ok=True)
    json.dump(rep, open(os.path.join(a.out, 'report.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    names = {e['enemyId']: e['name'] for e in enemies}
    prop_p = os.path.join(os.path.dirname(a.oltre or ''), 'enemy_clone_proposal.json')
    prop = json.load(open(prop_p, encoding='utf-8')) if a.oltre and os.path.exists(prop_p) else {}

    def label(r):
        if r['enemies']:
            return ', '.join(names.get(i, '?') for i in r['enemies'][:3])
        return '526-979: ' + ', '.join('%d %s' % (i, (prop.get(str(i)) or {}).get('name') or '?') for i in r.get('oltre', [])[:3])
    L = ['# enemy_gen: grafiche originali dei nemici', '',
         'Generato da `recon/tools/make_jp_enemies.py`%s. displayId non serviti usati dal master: %d; completi: %d '
         '(%d righe enemy); incompleti: %d. File: %d (%.1f MB).' % (
             ' --story-only' if a.story_only else '', len(results), len(ok), n_en_ok, len(bad), len(jobs), size / 1e6),
         '', 'Nemici degli stage di storia: %d (serviti dalle risorse WW: %d); restano col sostituto: %d.' % (
             len(story_ids & have), len(story_en_served), len(story_en_bad)),
         '', 'move ricostruita da wait: %s' % ', '.join(map(str, rep['move_from_wait'])), '',
         '## Incompleti (restano col sostituto)', '']
    for r in bad:
        L.append('- %d%s (%s): %s; %s' % (r['displayId'], ' storia' if r['story'] else '',
                                          label(r), r['why'],
                                          '; '.join('%s %s%s' % (k, v['status'], ' (' + v['note'] + ')' if v.get('note') else '')
                                                    for k, v in r['anims'].items() if k in MANDATORY)))
    L += ['', '## Completi', '', '| displayId | nemici | animazioni |', '|---|---|---|']
    for r in ok:
        L.append('| %d%s | %s | %s |' % (r['displayId'], ' (storia)' if r['story'] else '',
                                         label(r),
                                         ', '.join('%s:%s' % (k, v['status']) for k, v in r['anims'].items()
                                                   if v['status'] not in ('assente', 'incompleta'))))
    L += ['', '## Effetti di comparsa', '']
    for r in show_res:
        L.append('- show_effect%d: %s%s' % (r['showSwf'], r['status'], ' (' + r['note'] + ')' if r.get('note') else ''))
    open(os.path.join(a.out, 'report.md'), 'w', encoding='utf-8').write('\n'.join(L) + '\n')
    print('displayId %d: completi %d (%d righe enemy), incompleti %d | effetti %s | file %d | %.1f MB | %s' % (
        len(results), len(ok), n_en_ok, len(bad),
        {r['showSwf']: r['status'] for r in show_res}, len(jobs), size / 1e6, stats))
    print('storia: nemici %d, serviti %d, col sostituto %d' % (len(story_ids & have), len(story_en_served), len(story_en_bad)))
    for n, st in errors[:20]:
        print('  ERRORE', n, st)
    return 1 if errors else 0


if __name__ == '__main__':
    sys.exit(main())
