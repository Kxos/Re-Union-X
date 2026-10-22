"""Layout CocoStudio originali dai dati JP 4.3.1 (cartella di riferimento locale) al posto dei nostri generati.

    python recon/tools/import_jp_coco.py [--check] [--list <file>] [--out <stage_gen\\files>]
                                         [--report <cartella>] [--jp <cocostudio JP>] ...

Per ogni layout attivo dell'elenco (`recon/tools/jp_coco_layouts.txt`, versionato) prende la
revisione JP corrente (entry id piu' alto: `Nome.<id 8 cifre>.ext`) e la sua chiusura
(sotto-layout delle scene, armature, texture) e la scrive in `<out>/cocostudio/publish/`,
sopra il layout generato da make_layouts.py (che va lanciato prima: il build lo fa).

Regole (docs/notes/risorse_layout.md#jp-originali):
- un nome gia' servito dalle risorse originali (indice `names_v4.tsv`) non si copia mai: vince
  la versione WW, comprese le 11 texture localizzate (Ch_Logo, World_Stage_Clear...);
- se la radice e' essa stessa un layout WW servito che make_layouts sovrascrive (es.
  MedalInfo_ReleaseWindow), si toglie la copia generata e restano il layout WW e le texture
  mancanti prese da JP;
- un sotto-layout che generiamo noi e che non e' nell'elenco resta il nostro;
- texture: servite -> nulla; disegnate da noi (make_textures) -> sostituite dall'originale
  JP solo se non sono l'atlante di un'armatura (plist) e se la tela e' uguale o nessun altro
  layout generato le usa; altrimenti restano le nostre (segnalato);
- PNG JP (alpha diritta) -> BTF premoltiplicato (btf.encode; senza Pillow resta il PNG e lo
  converte btf_fix.py nel build);
- testi: un'etichetta giapponese uguale (spazi esclusi) al testo JP di `text/ui/<id>` diventa
  il testo inglese dello stesso id, se l'id e' certo (tutti gli id candidati hanno lo stesso
  testo inglese); altrimenti resta il segnaposto (il codice lo sovrascrive).
Controlli che fermano la radice (non si scrive nulla della sua chiusura, resta il generato):
9-slice su una texture che non ci sarebbe (crash 0x2c, I-049), plist non servito (i plist
nuovi non si caricano), texture assente ovunque (salvo `+absent-ok`), widget `Txt_*_Cus`
(lo crea), widget richiesti dal codice (`need=`) assenti nell'originale, layout
assente in JP.

Manifest della provenienza in `<report>/manifest.json`: alla corsa successiva i file scritti
prima e non piu' richiesti si tolgono (solo se nessun altro li ha riscritti nel frattempo),
cosi' togliere una riga dall'elenco ripristina il generato. `--check` non scrive nulla.
Pillow e numpy servono per la conversione BTF: senza -I.
"""
import argparse
import hashlib
import json
import os
import re
import shutil
import sys

sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
D = r'D:\Progetto_Restauro_KH_UX'
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # with python -I the script folder is not on sys.path
import private_tools  # noqa: E402  (local reference data folders, see private_tools.py)
JP_ROOT = private_tools.local_path('jp_data')
PUB = 'cocostudio/publish/'
# texture localizzate o ridisegnate nel WW (jp431_cocostudio.md §1): servite, vince sempre la WW
WW_WINS = {'Ch_Logo.png', 'Deck_Title_MD.png', 'Av_Title3.png', 'World_Stage_Clear.png', 'Raid_ChanceLogo.png',
           'Raid_List_BossWin2.png', 'Raid_List_Gage_Green.png', 'But04_On.png', 'AvtInfo_CrownIcon4.png',
           'Opt_Vol_Gage_Blue.png', 'Skill_Icon1.png'}
# texture JP con testo giapponese disegnato (jp431_cocostudio.md §3.1): non si importano mai,
# contano come assenti (da ridisegnare in inglese)
JP_DRAWN = re.compile(r'^(QuestBut6_Title|QuestBut7_Title|Rank_Title_3|Comeback_Tutorial_1|Comeback_Tutorial_Title1|'
                      r'Camp_Balloon3|TresXTresStartUp_.*_Logo)\.png$')
REV = re.compile(r'^(.*)\.(\d{8})(\.[^.]+)$')
JPCHR = re.compile(r'[\u3040-\u30ff\u3400-\u9fff\uff00-\uffef]')
CUS = re.compile(r'^Txt_.*_Cus$')

ap = argparse.ArgumentParser()
ap.add_argument('--list', default=os.path.join(HERE, 'jp_coco_layouts.txt'))
ap.add_argument('--texts', default=os.path.join(HERE, 'jp_coco_texts.tsv'))
ap.add_argument('--out', default=os.path.join(D, 'stage_gen', 'files'))
ap.add_argument('--report', default=None, help='cartella del rapporto (predefinita: <out>/../jp_import)')
ap.add_argument('--jp', default=os.path.join(JP_ROOT, 'cocostudio'))
ap.add_argument('--jp-text', default=os.path.join(JP_ROOT, 'text', 'ui'))
ap.add_argument('--served', default=os.path.join(D, 'resource_data', 'names_v4.tsv'))
ap.add_argument('--served-files', default=os.path.join(D, 'catalog', 'files'))
ap.add_argument('--en-text', action='append',
                default=None, help='cartelle text/ui inglesi (la prima che ha l\'id vince)')
ap.add_argument('--check', action='store_true', help='solo controlli e rapporto, nessuna scrittura')
ap.add_argument('--no-static', action='append', default=[],
                choices=('medal_gen', 'rooms_gen', 'enemy_gen', 'raisedraw_gen'),
                help="pacchetto statico non nell'indice (build-resources -NoRooms/-NoEnemies/-NoRaisedraw o assente "
                     'dalla versione installata): i suoi LWF e AKB non contano per gli effetti sonori')
ap.add_argument('--none', action='store_true',
                help='nessuna radice: toglie soltanto i file importati dalla corsa precedente (build-resources -NoJp)')
args = ap.parse_args()
OUT = args.out
REPORT = args.report or os.path.join(os.path.dirname(os.path.abspath(OUT)), 'jp_import')
EN_DIRS = args.en_text or [os.path.join(OUT, 'text', 'ui'), os.path.join(D, 'layouts', 'ui_texts', 'text', 'ui'),
                           os.path.join(D, 'catalog', 'files', 'text', 'ui')]

try:
    sys.path.insert(0, HERE)
    import btf                       # noqa: E402
    from PIL import Image            # noqa: E402
except ImportError:                  # python -I: niente Pillow, la conversione la fa btf_fix.py
    btf = Image = None


def latest(root):
    """nome logico relativo (con /) -> percorso della revisione corrente."""
    idx = {}
    for dp, _, fs in os.walk(root):
        rel = os.path.relpath(dp, root).replace(os.sep, '/')
        for f in fs:
            m = REV.match(f)
            base, r = (m.group(1) + m.group(3), int(m.group(2))) if m else (f, -1)
            key = base if rel == '.' else rel + '/' + base
            if key not in idx or idx[key][0] < r:
                idx[key] = (r, os.path.join(dp, f))
    return {k: v[1] for k, v in idx.items()}


def read_text(p):
    b = open(p, 'rb').read()
    for enc in ('utf-8-sig', 'utf-16'):
        try:
            return b.decode(enc)
        except UnicodeDecodeError:
            pass
    return b.decode('utf-8', 'replace')


def load_json(p):
    return json.load(open(p, encoding='utf-8-sig'))


def sha(b):
    return hashlib.sha1(b).hexdigest()


# ---- elenco -------------------------------------------------------------------------------
roots, undecided = [], []
PIN = {}                                              # layout -> revisione scelta nell'elenco (rev=)
for ln, line in enumerate(open(args.list, encoding='utf-8'), 1):
    s = line.split('#', 1)[0].strip()
    if not s:
        continue
    parts = s.split()
    if parts[0] == '?':                       # da decidere: non si importa, solo rapporto
        undecided.append((parts[1], line.split('#', 1)[1].strip() if '#' in line else ''))
        continue
    opts = {'absent_ok': False, 'need': []}
    for p in parts[1:]:
        if p == '+absent-ok':
            opts['absent_ok'] = True
        elif p.startswith('rev='):              # revisione JP fissata: rev=0 = file senza suffisso
            opts['rev'] = int(p[4:])
        elif p.startswith('need='):
            opts['need'] += [x for x in p[5:].split(',') if x]
        elif p.startswith('clone='):            # clone=Origine>Nuovo[@Rif]: widget del WW assente nel JP
            for c in p[6:].split(','):
                m = re.match(r'^([^>@]+)>([^>@]+)(?:@(.+))?$', c)
                if not m:
                    sys.exit('%s:%d: clone= non valido %r' % (args.list, ln, c))
                opts.setdefault('clone', []).append(m.groups())
        elif p.startswith('graft='):            # graft=W1,W2: widget del JP (rev=) innestati nel layout WW servito
            opts.setdefault('graft', []).extend(x for x in p[6:].split(',') if x)
        elif p.startswith('set='):              # set=Widget.opzione=valore[,...]: ritocco del layout JP
            for c in p[4:].split(','):
                m = re.match(r'^([^.=]+)\.([^.=]+)=(.+)$', c)
                if not m:
                    sys.exit('%s:%d: set= non valido %r' % (args.list, ln, c))
                v = m.group(3)
                v = int(v) if re.fullmatch(r'-?\d+', v) else float(v) if re.fullmatch(r'-?\d+\.\d+', v) else v
                opts.setdefault('set', []).append((m.group(1), m.group(2), v))
        else:
            sys.exit('%s:%d: opzione sconosciuta %r' % (args.list, ln, p))
    if args.none:
        continue
    roots.append((parts[0], opts))
    if 'rev' in opts:
        PIN[parts[0]] = opts['rev']

# testi scritti a mano per le etichette che il codice non tocca e senza id certo
# (layout <tab> widget <tab> testo, \n per andare a capo)
TEXT_FIX = {}
if os.path.exists(args.texts):
    for line in open(args.texts, encoding='utf-8'):
        if line.strip() and not line.startswith('#'):
            a, b, c = line.rstrip('\r\n').split('\t')
            TEXT_FIX[(a, b)] = c.replace('\\n', '\n')

# ---- indici ---------------------------------------------------------------------------------
jp = latest(args.jp)                                   # 'publish/X.json' -> percorso
served = set()
for line in open(args.served, encoding='utf-8'):
    n = line.split('\t')[0].strip()
    if n.startswith(PUB):
        served.add(n[len(PUB):])
pub_out = os.path.join(OUT, *PUB.split('/'))
ours = set()                                           # file nostri in <out>/cocostudio/publish
for dp, _, fs in os.walk(pub_out):
    for f in fs:
        ours.add(os.path.relpath(os.path.join(dp, f), pub_out).replace(os.sep, '/'))
ours -= served
# i file copiati da JP alla corsa precedente (ancora intatti) non sono «nostri»
os.makedirs(REPORT, exist_ok=True)
man_path = os.path.join(REPORT, 'manifest.json')
old = json.load(open(man_path, encoding='utf-8')) if os.path.exists(man_path) else {}
for _n, _m in old.items():
    _p = os.path.join(pub_out, *_n.split('/'))
    if _n in ours and sha(open(_p, 'rb').read()) == _m['sha1']:
        ours.discard(_n)
# atlanti delle armature nostre: X0.plist -> X0.png e config_png_path degli ExportJson
atlases = {n[:-6] + '.png' for n in ours if n.endswith('.plist')}
gen_tex_users = {}                                     # texture -> layout generati che la citano
for n in ours:
    if n.endswith('.ExportJson'):
        try:
            atlases.update(x.split('/')[-1] for x in load_json(os.path.join(pub_out, n)).get('config_png_path') or [])
        except (ValueError, OSError):
            pass

jp_ui = {}
for k, p in latest(args.jp_text).items():
    if k.endswith('.txt') and '/' not in k:
        jp_ui[k[:-4]] = read_text(p).strip()
by_jp = {}
for i, t in jp_ui.items():
    by_jp.setdefault(re.sub(r'\s+', '', t), set()).add(i)


def en_text(i):
    for d in EN_DIRS:
        p = os.path.join(d, i + '.txt')
        if os.path.exists(p):
            return read_text(p)
    return None


def served_path(name):
    return os.path.join(args.served_files, *(PUB + name).split('/'))


jp_revs = {}                                          # 'X.json' -> [(entry id, percorso)], 0 = senza suffisso
for _f in os.listdir(os.path.join(args.jp, 'publish')):
    _m = REV.match(_f)
    _b, _r = (_m.group(1) + _m.group(3), int(_m.group(2))) if _m else (_f, 0)
    jp_revs.setdefault(_b, []).append((_r, os.path.join(args.jp, 'publish', _f)))


def jp_path(name):
    if name in PIN:
        return dict(jp_revs.get(name, [])).get(PIN[name])
    return jp.get('publish/' + name)


def widget_names(data):
    acc = set()

    def walk(n):
        if isinstance(n, dict):
            o = n.get('options')
            if isinstance(o, dict) and o.get('name'):
                acc.add(o['name'])
            if 'gameobjects' in n and n.get('name'):
                acc.add(n['name'])
            for v in n.values():
                if isinstance(v, (dict, list)):
                    walk(v)
        elif isinstance(n, list):
            for x in n:
                walk(x)
    walk(data)
    return acc


def suspicious_revision(name):
    """L'estrazione locale a volte da' a una revisione il contenuto di un altro layout
    (PresentBOX_Panel_ver131.00265720 e' un pannello di icone): se la revisione scelta ha meno
    di meta' dei nomi di widget della prima, la si segnala."""
    rs = sorted(jp_revs.get(name, []))
    if len(rs) < 2 or name in PIN or not name.endswith('.json'):
        return None
    a, b = widget_names(load_json(rs[0][1])), widget_names(load_json(rs[-1][1]))
    if a and len(a & b) * 2 < len(a):
        return 'revisione %d con %d nomi su %d della prima: contenuto di un altro layout? (rev=0 nell\'elenco)' % (
            rs[-1][0], len(a & b), len(a))
    return None


# Stub: l'estrazione locale ha tolto i file uguali a un altro, quindi una texture di
# publish/ puo' esistere solo con lo stesso nome in un'altra cartella (cocostudio/Panel10.png,
# img/ui/Complete_icon1.png...). Si cerca per nome, prima in cocostudio/, poi in img/.
jp_any = {}
for _k, _p in latest(args.jp).items():
    if not _k.startswith('publish/'):
        jp_any.setdefault(_k.split('/')[-1], _p)
for _k, _p in sorted(latest(os.path.join(os.path.dirname(args.jp), 'img')).items()):
    jp_any.setdefault(_k.split('/')[-1], _p)
ALT = {}                                              # texture -> percorso fuori da publish/


def jp_tex(name):
    if JP_DRAWN.match(name.split('/')[-1]):
        return None
    p = jp_path(name)
    if p is None and '/' not in name and name in jp_any:
        p = ALT[name] = jp_any[name]
    return p


def walk_widgets(w):
    yield w
    for c in w.get('children', []):
        yield from walk_widgets(c)


def clone_widget(data, src, new, ref=None):
    """Opzione clone=: copia il widget src (stesso genitore) col nome new e un tag nuovo; con ref
    lo mette alla posizione del widget ref. Per i widget che il codice WW cerca senza controllo e
    che il layout JP non ha (es. Txt_Medal_Label di Album_Medal_ver140)."""
    import copy
    found, tags = {}, []

    def walk(n, parent):
        o = n.get('options') or {}
        if isinstance(o.get('tag'), int):
            tags.append(o['tag'])
        if o.get('name') in (src, ref):
            found.setdefault(o['name'], (n, parent))
        for c in n.get('children') or []:
            walk(c, n)
    walk(data.get('widgetTree') or {}, None)
    if src not in found or found[src][1] is None:
        return 'widget origine assente'
    if ref and ref not in found:
        return 'widget di riferimento assente'
    node, parent = found[src]
    dup = copy.deepcopy(node)
    o = dup['options']
    o['name'] = new
    o['tag'] = max(tags) + 1
    o['visible'] = True
    if ref:
        ro = found[ref][0]['options']
        o['x'], o['y'] = ro.get('x', o.get('x')), ro.get('y', o.get('y'))
    parent['children'].append(dup)
    return None


def graft_widget(data, jp_file, name):
    """Opzione graft= (solo radici WW servite): copia il widget name (con i figli) dalla revisione JP
    nel layout WW, sotto il genitore con lo stesso nome e alla stessa posizione; tag nuovo se il suo e'
    gia' usato. Eccezione alla regola «un nome servito non si copia mai»: il resto del layout resta WW
    (es. BaseBuff_Avt_Null1/2 di ActionMap_PlayerStatusField_new, rev. 00360289, I-155)."""
    import copy
    if not jp_file:
        return 'revisione JP assente'

    def index(d):
        found, tags = {}, []

        def walk(n, parent):
            o = n.get('options') or {}
            if isinstance(o.get('tag'), int):
                tags.append(o['tag'])
            if o.get('name'):
                found.setdefault(o['name'], (n, parent))
            for c in n.get('children') or []:
                walk(c, n)
        walk(d.get('widgetTree') or {}, None)
        return found, tags
    ww, ww_tags = index(data)
    if name in ww:
        return None                                    # gia' presente (WW piu' nuovo o corsa ripetuta)
    jp_found, _ = index(load_json(jp_file))
    if name not in jp_found or jp_found[name][1] is None:
        return 'widget assente nella revisione JP'
    node, parent = jp_found[name]
    pname = (parent.get('options') or {}).get('name')
    if pname not in ww:
        return 'genitore %s assente nel WW' % pname
    dup = copy.deepcopy(node)
    if dup['options'].get('tag') in ww_tags:
        dup['options']['tag'] = max(ww_tags) + 1
    ww[pname][0].setdefault('children', []).append(dup)
    return None


# ---- analisi di un layout ---------------------------------------------------------------------
def scan(data):
    """(sotto-layout, texture [(nome, 9-slice)], plist, nomi dei widget, testi [(dict, chiave)])."""
    subs, texs, plists, names, texts = [], [], [], [], []
    if isinstance(data, dict):
        for k in ('textures',):
            for t in data.get(k) or []:
                plists.append(t.split('/')[-1] if '/' not in t else t)
        for t in data.get('config_file_path') or []:      # ExportJson
            plists.append(t)
        for t in data.get('config_png_path') or []:
            texs.append((t, False))

    def walk(n, s9):
        if isinstance(n, dict):
            o = n.get('options') if isinstance(n.get('options'), dict) else None
            if o is not None and 'classname' in n:
                if o.get('name'):
                    names.append(o['name'])
                for k in ('text', 'buttonText', 'placeHolder'):
                    if isinstance(o.get(k), str) and JPCHR.search(o[k]):
                        texts.append((o, k))
                s9 = bool(o.get('scale9Enable') or o.get('backGroundScale9Enable'))
            if 'gameobjects' in n and n.get('name'):        # nodo di una scena
                names.append(n['name'])
            for k, v in n.items():
                if isinstance(v, dict) and 'path' in v and 'resourceType' in v:
                    pth = v.get('path') or ''
                    if not pth:
                        continue
                    if pth.endswith(('.json', '.ExportJson')):
                        subs.append(pth[len('publish/'):] if pth.startswith('publish/') else pth)
                    elif v.get('resourceType') == 1:
                        plists.append(v.get('plistFile') or '?')
                    elif pth.endswith('.plist'):
                        plists.append(pth[len('publish/'):] if pth.startswith('publish/') else pth)
                    else:
                        texs.append((pth[len('publish/'):] if pth.startswith('publish/') else pth,
                                     s9 and k in ('fileNameData', 'normalData', 'pressedData', 'disabledData',
                                                  'backGroundImageData')))
                if isinstance(v, (dict, list)):
                    walk(v, s9 if k != 'children' else False)
        elif isinstance(n, list):
            for x in n:
                walk(x, s9)
    walk(data, False)
    return subs, texs, plists, names, texts


def tex_available(t, planned):
    return t in served or t in ours or t in planned


def canvas(p):
    b = open(p, 'rb').read(64)
    if b[:4] == b'\x89BTF' and btf is not None:
        i = btf.info(open(p, 'rb').read())
        return tuple(i['canvas']) if i and all(i['canvas']) else (tuple(i['size']) if i else None)
    if b[:8] == b'\x89PNG\r\n\x1a\n':
        return int.from_bytes(b[16:20], 'big'), int.from_bytes(b[20:24], 'big')
    return None


# riferimenti alle texture dai layout generati che restano (per non cambiare l'aspetto altrove)
root_names = {r for r, _ in roots}
for n in ours:
    if n.endswith('.json') and n not in root_names:
        try:
            for t, _ in scan(load_json(os.path.join(pub_out, n)))[1]:
                gen_tex_users.setdefault(t, set()).add(n)
        except (ValueError, OSError):
            pass

# ---- armature originali JP su un plist libero (scritte piu' avanti) ---------------------------
# Armature che il client WW crea e che nessuna risorsa serve: senza ExportJson la creazione va in
# crash. Cursor_Anim_Ranking/Ranking2: bagliore della riga del giocatore nelle
# classifiche (con Ranking_MainPanel_ver230; SIGSEGV a 0x8 dopo /ranking/lux/border,
# banco 14-10). I plist con un nome nuovo non si caricano (docs/notes/risorse_layout.md#regole): il
# plist e la texture vanno sul nome di un plist servito che il binario non cita mai; le due armature
# hanno lo stesso fotogramma (Rank_Panel_User_Eff.png) e condividono il plist. La texture di
# Ranking2 (Cursor_Anim_Ranking20.png) manca anche nel JP: si usa quella di Ranking.
# Cursor_Anim_Proud (Proud Mode, I-200): cursore rosso del nodo «Cursor» di StartDeckProudScene_ver260
# (servita, come StartDeckEdit2/3Scene): un fotogramma, PMode_Rule_Panel_B.png. Va su
# ActMapTreasureBoxExAnim0: plist servito che nessun layout servito o generato e il binario citano
# (verifica del 22-10, tmp/proud/res). Nella chiusura di una radice queste armature non bloccano
# (il plist e' quello dello slot) e la loro scrittura resta a questo blocco.
JP_ARM = {'Cursor_Anim_Ranking': ('MyPageAnime0', 'Cursor_Anim_Ranking0'),
          'Cursor_Anim_Ranking2': ('MyPageAnime0', 'Cursor_Anim_Ranking0'),
          'Cursor_Anim_Proud': ('ActMapTreasureBoxExAnim0', 'Cursor_Anim_Proud0')}

results, writes = [], {}            # writes: nome publish -> ('jp', percorso, dati|None) | ('delete')
for root, opts in roots:
    r = dict(root=root, status='ok', block=[], warn=[], layouts=[], keep_served=[], keep_ours=[],
             textures_new=[], textures_replaced=[], textures_kept_ours=[], texts=[], kind=None)
    plan, pre = {}, {}
    if root in served:
        # layout WW servito che make_layouts sovrascrive: si torna al WW (copiato solo per
        # tradurne i segnaposto con gli id certi; texture mancanti da JP)
        r['kind'] = 'ww'
        src = served_path(root)
        pre[root] = (src, load_json(src))
        for g in opts.get('graft', []):
            err = graft_widget(pre[root][1], jp_path(root), g)
            if err:
                r['block'].append('%s: graft %s: %s' % (root, g, err))
            else:
                r['warn'].append('widget %s innestato dal JP (rev %s)' % (g, PIN.get(root, 'corrente')))
        plan[root] = ('jp', src, pre[root][1])
        todo = [(root, 'pre')]
    elif opts.get('graft'):
        r['block'].append('graft= solo per un layout WW servito')
        todo = []
    elif jp_path(root):
        r['kind'] = 'jp'
        todo = [(root, None)]
    else:
        r['block'].append('assente in JP')
        todo = []
    seen, names_all, absent = set(), set(), []
    while todo:
        name, src = todo.pop()
        if name in seen:
            continue
        seen.add(name)
        if name in pre:
            src, data = pre[name]
        elif src is None:
            src = jp_path(name)
            if src is None:
                r['block'].append('sotto-layout assente in JP: ' + name)
                continue
            sus = suspicious_revision(name)
            if sus:
                r['block'].append('%s: %s' % (name, sus))
            data = load_json(src)
            if name == root:
                for c in opts.get('clone', []):
                    err = clone_widget(data, *c)
                    if err:
                        r['block'].append('%s: clone %s>%s: %s' % (name, c[0], c[1], err))
                    else:
                        r['warn'].append('widget %s aggiunto (copia di %s)' % (c[1], c[0]))
                for wname, key, val in opts.get('set', []):
                    found = [w for w in walk_widgets(data.get('widgetTree', {}))
                             if w.get('options', {}).get('name') == wname]
                    if not found:
                        r['block'].append('%s: set %s.%s: widget assente' % (name, wname, key))
                    for w in found:
                        w['options'][key] = val
                    if found:
                        r['warn'].append('ritocco %s.%s = %s' % (wname, key, val))
            plan[name] = ('jp', src, data)
            r['layouts'].append(name)
        else:
            data = load_json(src)
        subs, texs, plists, names, texts = scan(data)
        names_all.update(names)
        for w in names:
            if CUS.match(w):
                r['block'].append('%s: widget %s (lo crea il client)' % (name, w))
        for s in subs:
            if s.endswith('.ExportJson') and s[:-len('.ExportJson')] in JP_ARM and s not in served:
                _w = 'armatura %s sul plist %s (JP_ARM)' % (s, JP_ARM[s[:-len('.ExportJson')]][0])
                if _w not in r['warn']:
                    r['warn'].append(_w)
                continue
            if s in served:
                r['keep_served'].append(s)
                s_path = served_path(s)
                if os.path.exists(s_path):    # si guardano comunque le sue texture e i suoi nomi
                    todo.append((s, s_path))
            elif s in ours and s not in root_names:
                r['keep_ours'].append(s)
                try:
                    names_all.update(scan(load_json(os.path.join(pub_out, s)))[3])
                except (ValueError, OSError):
                    pass
            else:
                todo.append((s, None))
        for p in plists:
            if p not in served:
                r['block'].append('%s: plist non servito %s (i plist nuovi non si caricano)' % (name, p))
        if plan.get(name, ('',))[0] == 'jp':
            for o, k in texts:
                key = re.sub(r'\s+', '', o[k])
                ids = by_jp.get(key, set())
                ens = {i: en_text(i) for i in ids}
                ens = {i: t for i, t in ens.items() if t is not None}
                vals = {t.strip() for t in ens.values()}
                if len(vals) == 1:
                    new = ens[sorted(ens)[0]].strip()
                    r['texts'].append((name, o.get('name'), o[k], ','.join(sorted(ens)), new))
                    o[k] = new
                elif (name, o.get('name')) in TEXT_FIX:
                    new = TEXT_FIX[(name, o.get('name'))]
                    r['texts'].append((name, o.get('name'), o[k], 'jp_coco_texts.tsv', new))
                    o[k] = new
                else:
                    r.setdefault('texts_left', []).append((name, o.get('name'), o[k]))
        for t, s9 in texs:
            if t in served:
                continue
            j = jp_tex(t)
            if t in ALT and not any(w.startswith('stub: %s ' % t) for w in r['warn']):
                r['warn'].append('stub: %s da %s' % (t, os.path.relpath(ALT[t], os.path.dirname(args.jp))))
            if t in ours:
                if j is None:
                    continue
                why = None
                if t in atlases:
                    why = 'atlante di un\'armatura'
                elif t in WW_WINS:
                    why = 'localizzata WW'
                else:
                    c_ours, c_jp = canvas(os.path.join(pub_out, *t.split('/'))), canvas(j)
                    users = gen_tex_users.get(t, set()) - set(plan)
                    if c_ours != c_jp and users:
                        why = 'tela %s contro JP %s, usata anche da %s' % (c_ours, c_jp, ', '.join(sorted(users)[:3]))
                if why:
                    if ('%s (%s)' % (t, why)) not in r['textures_kept_ours']:
                        r['textures_kept_ours'].append('%s (%s)' % (t, why))
                else:
                    plan[t] = ('jp', j, None)
                    if t not in r['textures_replaced']:
                        r['textures_replaced'].append(t)
            elif j is not None:
                plan[t] = ('jp', j, None)
                if t not in r['textures_new']:
                    r['textures_new'].append(t)
            else:
                if s9:
                    r['block'].append('%s: 9-slice su texture assente %s (crash 0x2c, I-049)' % (name, t))
                elif t not in absent:
                    absent.append(t)
    if absent:
        (r['warn'] if opts['absent_ok'] else r['block']).append('texture assenti: ' + ', '.join(sorted(absent)))
    r['widgets'] = sorted(names_all)
    miss = [w for w in opts['need'] if w not in names_all]
    if miss:
        r['block'].append('widget cercati dal codice assenti nell\'originale: ' + ', '.join(miss))
    if r['block']:
        r['status'] = 'bloccato'
    else:
        for k, v in plan.items():
            if k in writes and writes[k][0] != v[0]:
                r['warn'].append('conflitto su ' + k)
            writes.setdefault(k, v)
    results.append(r)

# ---- animazioni LWF originali -----------------------------------------------------------------
# Cartelle lwf/ assenti dalle risorse WW che make_layouts sostituiva con copie rinominate di
# Result_Reward: la copia mostrava «CONGRATULATIONS!» sul nodo della bacheca appena aperto e il
# client aspettava la sua fine (~7 s) prima del popup (banco 14-10). Si prendono .lwf e PNG (->
# BTF) della revisione corrente; il .res non lo serve nessuna risorsa. Chiavi relative a OUT.
JP_LWF = ['lwf/sphere/SpIcon_Open', 'lwf/sphere/SphereMap_Complete']
# Supernova (I-124, docs/notes/battaglia.md#supernova): animazione del lancio, del rinnovo
# (recurringAttribute) e del gauge recuperato (campo recovery), assenti dalle risorse WW
JP_LWF += ['lwf/battle/Sburst', 'lwf/battle/SBurst_Revival', 'lwf/battle/BurstGauge_Recovery']
# NPC degli stage originali importati (import_orig_stages.py) senza grafica nelle risorse WW: 19 stage
# (2010, 2100, 2180, 2400, 11110, 11140, 11250, 13150, 13220, 16160-16250) li usano
NPC_JP = [5500] + list(range(5504, 5517)) + [5518, 5519, 5520, 5528, 5529]
JP_LWF += ['lwf/character/npc/%d/wait' % n for n in NPC_JP]
# Trait (I-084 A, 19-10): la ruota del trait ottenuto (fusione, Moogle Shop, training) e le 11 icone originali,
# al posto delle nostre di make_pet_training_fx.py (come le LWF della guilt, I-163)
JP_LWF += ['lwf/medal/Kakusei/Kakusei_Get1', 'lwf/medal/Kakusei/Kakusei_Get2']
JP_LWF += ['lwf/medal/Kakusei/Kakusei_Icon%04d' % n for n in (10, 20, 30, 40, 50, 60, 61, 70, 80, 90, 100)]
# RESULTS di una quest «Must clear all together» (Proud 801+, combinedSubmissionFlag 1, I-202): con tutti e tre gli
# obiettivi compiuti insieme il client mostra questa animazione unica al posto delle tre Result_Clear_On_eff; senza il
# file la salta e non si vede nessuna spunta (banco 22-10, Proud 979). La sua texture (Result_Clear_Challenge_On) sta
# solo in Result_Clear_On_eff: riempimento da LWF_FILL
JP_LWF += ['lwf/battleresult/Result_Clear_On_eff_all']
# Texture citate dal LWF ma assenti dall'estrazione JP: il nome e' <cartella>_<nome originale in
# esadecimale>.png e lo stesso nome originale (effetti KeyBlade_ef*, png_ef0*, star01, 進化_KeyBlade_
# ef*) sta in altre LWF. Senza, il client non disegna quei pezzi: «COMPLET» senza la seconda E
# (banco 14-10). Prima le LWF JP, poi la Result_Reward servita (gia' BTF, estratta in layouts\orig).
LWF_FILL = [os.path.join(JP_ROOT, 'lwf', 'battleresult', 'Result_Reward'),
            os.path.join(JP_ROOT, 'lwf', 'battleresult', 'Result_Clear_On_eff'),
            os.path.join(JP_ROOT, 'lwf', 'adventure', 'Colosseum_Open'),
            os.path.join(JP_ROOT, 'lwf', 'battle', 'Burst_Medal_Change'),
            os.path.join(D, 'layouts', 'orig', 'lwf', 'battleresult', 'Result_Reward')]
# Kakusei_Get1 (ruota del trait, I-084 A): sh_plate, sh_skill_eff5/plate_hikari/star1/star2/white sono salvate solo in
# Kakusei_Get2, l'icona 0090 in Kakusei_Icon0090
_kak = os.path.join(JP_ROOT, 'lwf', 'medal', 'Kakusei')
if os.path.isdir(_kak):
    LWF_FILL += [os.path.join(_kak, n) for n in sorted(os.listdir(_kak)) if os.path.isdir(os.path.join(_kak, n))]
_npc = os.path.join(JP_ROOT, 'lwf', 'character', 'npc')
if os.path.isdir(_npc):
    LWF_FILL += [os.path.join(_npc, n, 'wait') for n in sorted(os.listdir(_npc)) if os.path.isdir(os.path.join(_npc, n, 'wait'))]
# Icone di stato sopra l'avatar in battaglia (I-124, docs/notes/battaglia.md#hud): BattleStateIcon
# carica lwf/battle/ActMapBuffDeBuffAnim/<BIconNN|DIconNN>/... (tabelle buff,
# debuff) e il tier BuffNum_Up/DownNN (indice tier + 20); le
# icone del Reflect lwf/battle/ActMapReflectionAnim/RIcon_* (se il file esiste). Nessuna delle due
# cartelle e' servita (names_v4 e addnl): niente icone, niente crash. Le texture condivise stanno
# una sola volta nell'estrazione JP (es. «素材画像_Buff01» in DIcon02): le stesse cartelle fanno
# da riempimento (101 texture citate, 0 assenti).
for _grp in ('ActMapBuffDeBuffAnim', 'ActMapReflectionAnim'):
    _gd = os.path.join(JP_ROOT, 'lwf', 'battle', _grp)
    if os.path.isdir(_gd):
        _subs = sorted(n for n in os.listdir(_gd) if os.path.isdir(os.path.join(_gd, n)))
        JP_LWF += ['lwf/battle/%s/%s' % (_grp, n) for n in _subs]
        LWF_FILL += [os.path.join(_gd, n) for n in _subs]
# nomi solo numerici (lettere della scritta) non si cercano altrove: «8» e' la seconda E di COMPLETE
LWF_ALIAS = {'lwf/sphere/SphereMap_Complete/SphereMap_Complete_382e706e67.png':
             'lwf/sphere/SphereMap_Complete/SphereMap_Complete_362e706e67.png'}
fill_idx = {}
for fd in LWF_FILL:
    if os.path.isdir(fd):
        pre = os.path.basename(fd) + '_'
        for rel, p in latest(fd).items():
            if rel.startswith(pre) and rel.endswith('.png'):
                fill_idx.setdefault(rel[len(pre):], p)
# icone del trait citate dentro Kakusei_Get1 come png_Kakusei_IconNNNN.png: nella loro cartella si chiamano
# Kakusei_IconNNNN.png (senza il prefisso png_)
if os.path.isdir(_kak):
    for n in sorted(os.listdir(_kak)):
        icon = os.path.join(_kak, n, '%s_%s.png' % (n, (n + '.png').encode().hex()))
        if n.startswith('Kakusei_Icon') and os.path.isfile(icon):
            fill_idx.setdefault(('png_%s.png' % n).encode().hex() + '.png', icon)
for d in JP_LWF:
    src_dir = os.path.join(JP_ROOT, *d.split('/'))
    if not os.path.isdir(src_dir):
        continue
    have = {}
    for rel, p in latest(src_dir).items():
        if rel.endswith(('.lwf', '.png')):
            have[d + '/' + rel] = p
    base = os.path.basename(d)
    lwf = have.get('%s/%s.lwf' % (d, base))
    if lwf:
        for t in sorted(set(re.findall((re.escape(base) + r'_([0-9a-f]+\.png)').encode(), open(lwf, 'rb').read()))):
            name = '%s/%s_%s' % (d, base, t.decode())
            if name in have:
                continue
            if name in LWF_ALIAS and LWF_ALIAS[name] in have:
                have[name] = have[LWF_ALIAS[name]]
            elif t.decode() in fill_idx:
                have[name] = fill_idx[t.decode()]
            else:
                print('jp_lwf: texture assente ' + name)
    for name, p in have.items():
        writes.setdefault(name, ('jp', p, None))


# ---- immagini originali JP assenti dalle risorse WW -------------------------------------------
# Cartelle img/ di cui il client WW chiede file che nessuna risorsa serve. PlayerStatusIndicator:
# sceglie la cornice dell'avatar dell'HUD per soglie (Avatar_Circle_03..06, Side_02..04);
# servite solo Circle_03/04/05: oltre la soglia (HP saliti con le Avatar Boards) texture nulla e
# crash a ogni battaglia (indirizzo 0x24; banco 14-10). Solo i file non serviti.
JP_IMG = ['img/ui/PlayerStatusIndicator']
_served_all = set()
for _tsv in (os.path.join(D, 'resource_data', 'names_v4.tsv'), os.path.join(D, 'ipa431', 'names_addnl.tsv')):
    if os.path.exists(_tsv):
        for _line in open(_tsv, encoding='utf-8'):
            _served_all.add(_line.split('\t')[0])
# poi il pacchetto 2016 (stessi nomi; Circle_01/02 e Side_01 mancano anche nel JP: Circle_01 e' la
# cornice a vita quasi piena, chiesta a inizio battaglia)
B16_ROOT = private_tools.local_path('ref_work', 'bundle2016', 'files')
for d in JP_IMG:
    for root in (JP_ROOT, B16_ROOT):
        src_dir = os.path.join(root, *d.split('/'))
        if not os.path.isdir(src_dir):
            continue
        for rel, p in latest(src_dir).items():
            name = d + '/' + rel
            if rel.endswith('.png') and name not in _served_all:
                writes.setdefault(name, ('jp', p, None))
# icone SN/SN+/SN++ della Supernova: img/ui/SBurst_Icon1..3 e ...R (il JP tiene le
# non R in cocostudio/publish) e le texture del pannello assenti dalle risorse WW
_jp_pub = os.path.join(JP_ROOT, 'cocostudio', 'publish')
for _n in (1, 2, 3):
    for _name, _src in (('img/ui/SBurst_Icon%dR.png' % _n, os.path.join(JP_ROOT, 'img', 'ui', 'SBurst_Icon%dR.png' % _n)),
                        ('img/ui/SBurst_Icon%d.png' % _n, os.path.join(_jp_pub, 'SBurst_Icon%d.png' % _n))):
        if os.path.exists(_src) and _name not in _served_all:
            writes.setdefault(_name, ('jp', _src, None))
for _t in ('SBurst_Icon1.png', 'SBurst_Icon2.png', 'SBurst_Icon3.png', 'SBurst_Plate01re.png'):
    if os.path.exists(os.path.join(_jp_pub, _t)) and 'cocostudio/publish/' + _t not in _served_all:
        writes.setdefault(_t, ('jp', os.path.join(_jp_pub, _t), None))

# righe delle classifiche: numero di posizione 1-10 img/colosseum/Colosseum_Rank_Num%d
# (la 3 il JP la tiene in cocostudio/publish) e fumetti img/ranking/Rank_Balloon* di
# Ranking_IconPanel_ver131; Rank_Balloon1_01 manca anche nel JP: copia di 1_02 (stesso
# fumetto azzurro). Rank_Title_%d (scritte «N位» disegnate, schermata dei premi) non si importa.
_rank_img = {'img/colosseum/Colosseum_Rank_Num%d.png' % n: os.path.join(JP_ROOT, 'img', 'colosseum', 'Colosseum_Rank_Num%d.png' % n)
             for n in range(1, 11)}
_rank_img['img/colosseum/Colosseum_Rank_Num3.png'] = os.path.join(_jp_pub, 'Colosseum_Rank_Num3.png')
for _b in ('1_02', '1_03', '2_01', '2_02', '2_03'):
    _rank_img['img/ranking/Rank_Balloon%s.png' % _b] = os.path.join(JP_ROOT, 'img', 'ranking', 'Rank_Balloon%s.png' % _b)
_rank_img['img/ranking/Rank_Balloon1_01.png'] = _rank_img['img/ranking/Rank_Balloon1_02.png']
# icona del rango del party (party.rank): img/partyRank/Party_RankIcon1..5, corone
# arcobaleno/argento luccicante/oro/argento/bronzo; la 1 il JP la tiene in cocostudio/publish
for _n in range(1, 6):
    _rank_img['img/partyRank/Party_RankIcon%d.png' % _n] = os.path.join(JP_ROOT, 'img', 'partyRank', 'Party_RankIcon%d.png' % _n)
_rank_img['img/partyRank/Party_RankIcon1.png'] = os.path.join(_jp_pub, 'Party_RankIcon1.png')
# musica delle BGM Medals (server/medal_bgm.json): audio/<id>.akb dal JP 4.3.1 (stesso formato AKB dei serviti,
# md5 uguali su 501006019/021); le gia' servite si saltano (_served_all)
_bgm = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'server', 'medal_bgm.json'),
                      encoding='utf-8'))['medals']
for _id in sorted(set(_bgm.values())):
    _rank_img['audio/%09d.akb' % _id] = os.path.join(JP_ROOT, 'audio', '%09d.akb' % _id)
for _name, _src in sorted(_rank_img.items()):
    if os.path.exists(_src) and _name not in _served_all:
        writes.setdefault(_name, ('jp', _src, None))


# ---- NPC originali (lwf/character/npc/<id>/wait) ------------------------------------------------
# make_layouts.py mette LWF vuoti per gli NPC non serviti (la home e gli stage li caricano senza
# controllo): Chirithy della home (999, ISSUES I-016) era invisibile. Il JP 4.3.1 ha l'animazione
# originale di 89 dei 93; nella copia locale mancano alcune parti (file uguali scartati?). Si
# importano gli NPC con tutte le parti, o a cui manca solo l'ombra 97x24: quella e' identica alla
# wait_7 dell'NPC 4001 servito dal WW (BTF letto dalle risorse originali). Gli altri restano vuoti. Le parti
# scartate come doppioni si prendono prima dalla tabella dei doppioni (jp_dedup_donors.tsv, 21-10); poi le texture
# perse ricostruite con un'altra texture JP reale (jp_reconstructed.tsv, I-194 del 21-10: ombre 144x35 di 5009 e 9002),
# solo per gli NPC che cosi' diventano completi.
def _lwf_textures(path):
    """{nome texture: (w, h)} dalla tabella texture di un LWF (formato di make_pet_motions.py)."""
    import struct
    from make_pet_motions import SECTIONS
    d = open(path, 'rb').read()
    sec = {n: struct.unpack_from('<2i', d, 32 + 8 * i) for i, n in enumerate(SECTIONS)}
    sb = sec['stringBytes'][0]
    so, sn = sec['stringData']
    strs = [d[sb + a:sb + a + b].decode() for a, b in (struct.unpack_from('<2i', d, so + 8 * k) for k in range(sn))]
    to, tn = sec['texture']
    return {strs[t[0]]: (t[2], t[3]) for t in (struct.unpack_from('<4if', d, to + 20 * k) for k in range(tn))}


def _served_bytes(name):
    """Contenuto di un file delle risorse originali (indice names_v4.tsv, dati resource_data\\7\\data)."""
    import bgad
    ddir = os.path.join(D, 'resource_data', '7', 'data')
    off = None
    for line in open(os.path.join(D, 'resource_data', 'names_v4.tsv'), encoding='utf-8'):
        n, _, o = line.rstrip('\n').partition('\t')
        if n == name:
            off = int(o)
            break
    if off is None or not os.path.isdir(ddir):
        return None
    for path in [os.path.join(ddir, f) for f in sorted(os.listdir(ddir))]:
        size = os.path.getsize(path)
        if off < size:
            break
        off -= size
    with open(path, 'rb') as fh:
        fh.seek(off)
        h = bgad.parse(fh.read(bgad.HDR.size))
        fh.seek(off)
        buf = fh.read(h['hsize'] + h['nlen'] + h['size'])
    lib = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'ext', 'ww431', 'libcocos2dcpp.so')
    key = bytes.fromhex(os.environ['BGAD_KEY']) if os.environ.get('BGAD_KEY') else bgad.lib_key(lib)
    return bgad.decode(buf, bgad.parse(buf), key)


NPC_SHADOW = 'lwf/character/npc/4001/wait/wait_7.png'
_npc_root = os.path.join(JP_ROOT, 'lwf', 'character', 'npc')
_gen_npc = os.path.join(OUT, 'lwf', 'character', 'npc')
_npc_ok, _npc_skip, _shadow = [], [], None
if os.path.isdir(_gen_npc) and os.path.isdir(_npc_root):
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import jp_dedup_donors
    import jp_reconstructed
    _npc_donors = jp_dedup_donors.load()
    _npc_recon = jp_reconstructed.load()
    for _id in sorted(os.listdir(_gen_npc)):
        _dir = os.path.join(_npc_root, _id, 'wait')
        _lwf = os.path.join(_dir, 'wait.lwf')
        _base = 'lwf/character/npc/%s/wait/' % _id
        if _base + 'wait.lwf' in _served_all or not os.path.exists(_lwf):
            continue
        _tex = _lwf_textures(_lwf)
        _miss = {k: v for k, v in _tex.items() if not os.path.exists(os.path.join(_dir, k))}
        # texture scartate come doppioni dall'estrazione JP: il file identico rimasto in un'altra cartella JP
        # (tabella recon/tools/jp_dedup_donors.tsv, jp_dedup_donors.py; regole misurate sul 2016, >= 99%)
        _don = {k: jp_dedup_donors.lookup(_npc_donors, _base + k, JP_ROOT) for k in _miss}
        _don = {k: v for k, v in _don.items() if v}
        _don.update({k: v for k, v in ((k, jp_reconstructed.lookup(_npc_recon, _base + k, JP_ROOT)) for k in _miss
                                       if k not in _don) if v})
        _miss = {k: v for k, v in _miss.items() if k not in _don}
        if any(v != (97, 24) for v in _miss.values()):
            _npc_skip.append(_id)
            continue
        if _miss and _shadow is None:
            _shadow = _served_bytes(NPC_SHADOW) or b''
        if _miss and not _shadow:
            _npc_skip.append(_id)
            continue
        writes[_base + 'wait.lwf'] = ('jp', _lwf, None)
        for _k in _tex:
            if _k in _miss:
                writes[_base + _k] = ('jp', NPC_SHADOW, _shadow)
            elif _k in _don:
                writes[_base + _k] = ('jp', _don[_k], None)
            else:
                writes[_base + _k] = ('jp', os.path.join(_dir, _k), None)
        _npc_ok.append(_id)
    print('NPC originali JP: %d importati (%s), %d con parti mancanti restano vuoti'
          % (len(_npc_ok), ' '.join(_npc_ok), len(_npc_skip)))

# ---- parti dello Spirit (lwf/pet/part, img/petParts) -------------------------------------------
# Le risorse WW servono solo la serie 001: le altre (specie, colori, accessori) e le icone
# dell'editor degli outfit vengono dal JP; jp_pet_parts.py ricostruisce i file che la copia
# locale ha tenuto una volta sola. Gli accessori con texture assenti anche li' restano fuori
# (server/make-pet-parts.js non li mette nella tabella petParts).
if os.path.isdir(os.path.join(JP_ROOT, 'lwf', 'pet', 'part')):
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import jp_pet_parts
    _pp, _pp_rep = jp_pet_parts.collect(JP_ROOT, _served_all)
    for _name, _src in sorted(_pp.items()):
        writes.setdefault(_name, ('jp', _src, None))
    print('parti dello Spirit JP: %d file (%d LWF e %d texture dalle gemelle), %d parti saltate'
          % (len(_pp), len(_pp_rep['lwf_twin']), len(_pp_rep['png_twin']), len(_pp_rep['skipped'])))
    # Movimenti originali (lwf/pet/motion/<nome>): i nostri di make_pet_motions.py hanno solo i
    # movie delle 9 parti base, quindi gli accessori (ac_mask, ac_hat1-4, bag_*, ac_necklace1-3,
    # ac_special, ac_mouth) non si vedevano. Si prendono gli originali a cui manca al massimo
    # l'ombra 97x24 (quella degli NPC, NPC_SHADOW); restano i nostri dove mancano effetti veri
    # (battle_all, pvp_start/total_*, recovery_skill, rolling3).
    _mot_root = os.path.join(JP_ROOT, 'lwf', 'pet', 'motion')
    _mot_ok, _mot_keep = [], []
    for _n in sorted(os.listdir(_mot_root)) if os.path.isdir(_mot_root) else []:
        _files = latest(os.path.join(_mot_root, _n))
        _lwf = _files.get(_n + '.lwf')
        if not _lwf:
            continue
        _tex = _lwf_textures(_lwf)
        _miss = {k: v for k, v in _tex.items() if k not in _files}
        if any(tuple(v) != (97, 24) for v in _miss.values()):
            _mot_keep.append(_n)
            continue
        if _miss and _shadow is None:
            _shadow = _served_bytes(NPC_SHADOW) or b''
        if _miss and not _shadow:
            _mot_keep.append(_n)
            continue
        _base = 'lwf/pet/motion/%s/' % _n
        writes[_base + _n + '.lwf'] = ('jp', _lwf, None)
        for _k in _tex:
            writes[_base + _k] = ('jp', NPC_SHADOW, _shadow) if _k in _miss else ('jp', _files[_k], None)
        _mot_ok.append(_n)
    print('movimenti del pet originali JP: %d (%s), restano i generati: %s'
          % (len(_mot_ok), ' '.join(_mot_ok), ' '.join(_mot_keep)))

# ---- armature originali JP su un plist libero -------------------------------------------------
# (JP_ARM e' definito prima delle radici: scritto qui sotto, dopo le radici)
for _arm, (_slot, _src) in sorted(JP_ARM.items()):
    _ej = os.path.join(_jp_pub, _arm + '.ExportJson')
    if 'cocostudio/publish/%s.ExportJson' % _arm in _served_all or not os.path.exists(_ej):
        continue
    _data = load_json(_ej)
    _data['config_file_path'] = [_slot + '.plist']
    _data['config_png_path'] = [_slot + '.png']
    writes[_arm + '.ExportJson'] = ('jp', _ej, _data)
    _pl = open(os.path.join(_jp_pub, _src + '.plist'), encoding='utf-8').read()
    writes[_slot + '.plist'] = ('jp', os.path.join(_jp_pub, _src + '.plist'),
                                _pl.replace(_src + '.png', _slot + '.png').encode('utf-8'))
    writes[_slot + '.png'] = ('jp', os.path.join(_jp_pub, _src + '.png'), None)


# ---- effetti sonori originali citati dai LWF (I-152) -------------------------------------------
# Gli eventi se_<nome>/playBGM_<nome> dei LWF serviti e generati (compresi i LWF JP decisi qui sopra)
# suonano audio/%09d.akb (id da text/audio/<nome>): quelli che nessuna risorsa serve si copiano dal JP,
# come la musica delle BGM Medals (x10 draw 509000390, popup del Nova 509000740, nemici JP...).
# Rapporto in <report>/sound_effects.json; jp_sound_effects.py, docs/notes/risorse_layout.md#suoni-jp.
sys.path.insert(0, HERE)
import jp_sound_effects  # noqa: E402
if not os.path.exists(args.served):
    print('jp_se: ATTENZIONE, indice servito %s assente: suoni dei soli LWF generati' % args.served)
_se = jp_sound_effects.collect(
    OUT, _served_all, writes=writes, owned=set(old), jp_root=JP_ROOT,
    served=jp_sound_effects.Served(args.served, os.path.join(D, 'resource_data', '7', 'data'))
    if os.path.exists(args.served) else None,
    static_roots=jp_sound_effects.static_dirs(args.no_static),
    cache_path=os.path.join(REPORT, 'served_lwf_sounds.json'), save_cache=not args.check)
for _name, _src in sorted(list(_se['add'].items()) + list(_se['texts'].items())):
    writes.setdefault(_name, ('jp', _src, None))
if not args.check:
    json.dump(_se, open(os.path.join(REPORT, 'sound_effects.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(jp_sound_effects.summary(_se) + (' [--check]' if args.check else ''))


def out_path(name):
    return os.path.join(OUT if name.startswith(('lwf/', 'img/', 'audio/', 'text/')) else pub_out, *name.split('/'))


# ---- scrittura --------------------------------------------------------------------------------
manifest, n_btf, n_png, removed = {}, 0, 0, []
if not args.check:
    for name, w in sorted(writes.items()):
        dst = out_path(name)
        if w[0] == 'delete':
            if os.path.exists(dst):
                os.remove(dst)
            continue
        src, data = w[1], w[2]
        if isinstance(data, bytes):                   # testo gia' pronto (plist rinominato)
            blob = data
        elif data is not None:
            blob = json.dumps(data, ensure_ascii=False).encode('utf-8')
        else:
            blob = open(src, 'rb').read()
            if name.lower().endswith('.png') and blob[:8] == b'\x89PNG\r\n\x1a\n':
                if btf is not None:
                    from io import BytesIO
                    blob = btf.encode(Image.open(BytesIO(blob)).convert('RGBA'))
                    n_btf += 1
                else:
                    n_png += 1
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        # un file nostro sostituito (layout generato, texture disegnata) si mette da parte: se poi
        # nessun generatore lo riscrive, la pulizia lo rimette com'era
        backup = None
        if os.path.exists(dst):
            cur = open(dst, 'rb').read()
            prev = old.get(name)
            if prev and sha(cur) == prev['sha1']:
                backup = prev.get('backup')           # e' ancora la nostra copia: resta la copia di prima
            else:
                backup = os.path.join(REPORT, 'orig', *name.split('/'))
                os.makedirs(os.path.dirname(backup), exist_ok=True)
                with open(backup, 'wb') as fh:
                    fh.write(cur)
        with open(dst, 'wb') as fh:
            fh.write(blob)
        rel = os.path.relpath(src, JP_ROOT) if src.startswith(JP_ROOT) else src
        manifest[name] = dict(src=rel.replace(os.sep, '/'), sha1=sha(blob), backup=backup)
    # file scritti dalla corsa precedente e non piu' richiesti: se nessuno li ha riscritti, si
    # rimette la copia di prima (se c'era) o si tolgono
    for name, m in old.items():
        if name in manifest or name in writes:
            continue
        dst = out_path(name)
        if os.path.exists(dst) and sha(open(dst, 'rb').read()) == m['sha1']:
            if m.get('backup') and os.path.exists(m['backup']):
                shutil.copyfile(m['backup'], dst)
            else:
                os.remove(dst)
            removed.append(name)
    json.dump(manifest, open(man_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    # stima del pacchetto generato (file senza intestazioni BGAD) contro la riserva delle versioni complete;
    # il controllo vero e' in build-resources.ps1 (gen.mp4 contro la dimensione installata)
    _tot = sum(os.path.getsize(p) for p in jp_sound_effects.walk_names(OUT).values())
    print('pacchetto generato stimato: %d byte di file su %d di riserva (%.1f%%)%s' % (
        _tot, jp_sound_effects.RESERVE, 100.0 * _tot / jp_sound_effects.RESERVE,
        '' if _tot < jp_sound_effects.RESERVE else ' -- OLTRE LA RISERVA'))

# ---- rapporto ---------------------------------------------------------------------------------
rep = dict(roots=results, undecided=[dict(root=a, why=b) for a, b in undecided], removed=removed)
json.dump(rep, open(os.path.join(REPORT, 'report.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
ok = [r for r in results if r['status'] == 'ok']
bad = [r for r in results if r['status'] != 'ok']
lines = []
for r in results:
    lines.append('%-46s %-8s %s layout %d, texture nuove %d, sostituite %d, testi %d%s' % (
        r['root'], r['status'], r['kind'] or '-', len(r['layouts']), len(r['textures_new']),
        len(r['textures_replaced']), len(r['texts']),
        ''.join('\n    ! ' + b for b in r['block']) + ''.join('\n    ~ ' + w for w in r['warn'])
        + ''.join('\n    = nostra: ' + t for t in r['textures_kept_ours'])))
for a, b in undecided:
    lines.append('%-46s da decidere: %s' % (a, b))
open(os.path.join(REPORT, 'report.txt'), 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
print('\n'.join(l for l in lines if '!' in l or '~' in l or 'nostra' in l))
print('jp_coco: %d radici importate, %d bloccate, %d da decidere; %d file scritti (%d BTF, %d PNG per btf_fix)%s, '
      '%d tolti dalla corsa precedente%s' % (
          len(ok), len(bad), len(undecided), len(manifest), n_btf, n_png, '' if not args.check else ' [--check]',
          len(removed), '' if not bad else '; bloccate: ' + ', '.join(r['root'] for r in bad)))
