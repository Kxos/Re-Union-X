"""LWF del risultato delle estrazioni (Shop > Draw) dai dati JP 4.3.1 per le cartelle non servite.

    python recon/tools/import_jp_raisedraw.py --ww <catalog\\raisedraw_ww> --out <stage_gen\\files>
                                              --report <stage_gen\\raisedraw_report.json> [--check]
                                              (Pillow: senza -I)

Il client apre
lwf/raisedraw/demo/raidgacha_result_display_%02d/ (%02d = medaglie estratte, 1-10; file mancante =
crash) e per ogni medaglia lwf/raisedraw/Medal/Medal_D_Up|Rev|None<rare> secondo darklight.
Le risorse WW servono solo raidgacha_result_display_01 e Medal_D_Up3 (catalog\\raisedraw_ww,
estratte una volta da build-resources.ps1 con res_bulk.py).

LWF: la revisione JP piu' alta (`<nome>.<8 cifre>.lwf`, come latest di import_jp_coco.py; la
00152892 di raidgacha_result_display_01 e' identica byte per byte alla LWF WW servita).
Texture richieste = tabella delle texture della LWF (header: Data[8] texture {stringId, formato,
larghezza, altezza, scala}, Data[35] stringhe), non le stringhe .png: i segnaposto
`Medal_D_*.png` che le LWF demo nominano non sono texture (li sostituisce il codice con le LWF
Medal_D_*) e infatti mancano dal .res JP e dalle risorse WW. Il .res JP e' vecchio (elenca
ビットマップ 80 che la LWF corrente non usa piu'): non si usa.

Fonti di ogni texture, in ordine (16 ott 2026, mai una texture assente):
 (1) stesso file nella cartella JP (PNG vero, alpha diritta -> BTF con btf.encode, che premoltiplica);
 (2) solo per demo/raidgacha_result_display_NN: la texture corrispondente della
     raidgacha_result_display_01 servita (BTF, copiata cosi' com'e'). NON per nome: le esportazioni
     02-10 rinumerano le «ビットマップ N» (la 73 di _10 e' la 75 di _01, entrambe 109x109), quindi la
     ricerca per <esadecimale del nome> come make_jp_enemies.py darebbe immagini sbagliate (verificato:
     le omonime di gacha_result_display_01 JP hanno altre dimensioni).
     Firma di una texture = dimensioni dichiarate + matrici di registrazione delle bitmap che la usano
     (Data[10] bitmap {matrixId, fragmentId} -> Data[9] frammento {.., textureId, ..}; matrixId con
     bit 31 = Data[3] matrice 6 float, senza = Data[2] traslazione 2 float). I rettangoli dei
     frammenti non distinguono nulla (un frammento per texture, sempre 0,0,w,h); le registrazioni si'
     (es. 54x54: -27,-54.05; 109x109: -54.6,-54.6) e sono identiche fra _01 e 02-10.
     Si allineano le due tabelle delle texture sulle firme (stesso ordine di esportazione; difflib).
     Classi (contate nel rapporto):
       - «unique-anchor»: la firma individua un solo contenuto in _01 (se la texture e' anche
         allineata, l'allineamento deve dare quel contenuto, se no conflitto);
       - «position-corroborated»: firma condivisa da piu' contenuti in _01 (es. 4 x 390x373 con le
         stesse registrazioni a coppie), allineata, e il suo blocco allineato ha un'ancora univoca
         prima e una dopo (stesso scarto di indice);
       - «position-only»: allineata ma senza ancore su entrambi i lati: NON si usa (cartella
         incompleta);
       - fuori dai blocchi allineati: l'ancora univoca, oppure «name-corroborated»: stesso nome
         dato a mano (non «ビットマップ N») e stessa firma in _01 (solo yellow.png, che ha la
         firma di white_back.png). Niente ripiego per sole dimensioni.
Le Medal_D_* non hanno riferimento WW della stessa immagine (Medal_D_Up3 e' un'altra medaglia):
solo (1). Le dimensioni del file trovato devono essere quelle dichiarate nella LWF.
Una cartella entra solo se TUTTE le texture sono trovate; rapporto JSON per cartella (lo legge il
server: lotCount solo fra le raidgacha_result_display_NN servite od ok). Senza --check, le
cartelle gestite qui che non sono piu' ok si tolgono da <out>.

Radice JP = jp_final_4.3.1; WANTED e il rapporto usano il percorso pubblicato completo (lwf/...). Le
cartelle del popup del Nova (GuiltBonus_BurstLvup, _num, Wfix0-9) e Draw_StatusBonus non hanno
riferimento WW: solo la fonte (1). STATIC = img/ui/*_SB.png (targhette rosse delle boosted), copiate come
texture. `--replace <percorso pubblicato>=<png>` (ripetibile) sostituisce una texture dopo la copia (il
logo NOVA: Burst_Logo / Burst_Logo_B 422x142): il PNG deve avere le dimensioni dichiarate dalla LWF,
altrimenti la cartella non e' ok; un percorso sconosciuto e' un errore.
"""
import argparse
import difflib
import hashlib
import io
import json
import os
import re
import shutil
import struct
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import btf  # noqa: E402

sys.stdout.reconfigure(encoding='utf-8')
D = r'D:\Progetto_Restauro_KH_UX'
import private_tools  # noqa: E402  (local reference data folders, see private_tools.py)
JP = private_tools.local_path('jp_data')
REV = re.compile(r'^(.*)\.(\d{8})(\.[^.]+)$')
GENERIC = re.compile(r'^ビットマップ \d+\.png$')

RD = 'lwf/raisedraw/'
GB = 'lwf/medal/guilt_bonus/'
# percorsi completi dalla radice JP (= percorso pubblicato della cartella)
WANTED = ([f'{RD}demo/raidgacha_result_display_{n:02d}' for n in range(1, 11)]
          + [f'{RD}Medal/Medal_D_Up{n}' for n in range(1, 13)]
          + [f'{RD}Medal/Medal_D_Rev{n}' for n in range(1, 8)]
          + [f'{RD}Medal/Medal_D_None{n}' for n in range(1, 8)]
          # popup del Nova e animazione «BONUS» delle boosted (sp. 2b, task 8): solo fonte (1)
          + [GB + 'GuiltBonus_BurstLvup', GB + 'GuiltBonus_BurstLvup_num']
          + [f'{GB}GuiltBonus_Wfix{n}' for n in range(10)]
          + [RD + 'demo/Draw_StatusBonus']
          # animazioni della guilt nel Level Up (sblocco/rilancio, risultato, massimo; cifre gialle e
          # rosse), al posto delle nostre di make_guilt_bonus_lwf.py (19-10): solo fonte (1)
          + [GB + n for n in ('GuiltBonus', 'GuiltBonus_result', 'GuiltBonus_max')]
          + [f'{GB}GuiltBonus_{c}fix{n}' for c in 'YR' for n in range(10)])
# Animazioni della guilt (cartelle sotto GB, 19-10): l'esportazione JP salva una texture condivisa solo nella
# prima cartella che la usa (le cifre png_num_Y* di Yfix0-9 e _result stanno in GuiltBonus; i KeyBlade_ef* in
# altre LWF). Fonte (1b) solo per queste cartelle: stesso NOME originale (mai «ビットマップ N», che le
# esportazioni rinumerano) e stesse dimensioni dichiarate, prima in un'altra cartella JP (revisione piu'
# alta), poi nelle cartelle WW servite di NAME_WW (estratte con res_bulk.py in --ww).
NAME_WW = ['lwf/battleresult/Result_LuxLevelUp']
# Texture assente da ogni fonte: png_logo_guilt_bonus2.png (336x35, _result e _max, tutte le revisioni) ->
# png_logo_guilt_bonus.png di GuiltBonus, stesso logo «GUILT BONUS» e stesse dimensioni. Unico sostituto,
# contato come «substitute» nel rapporto.
SUBST = {'png_logo_guilt_bonus2.png': 'png_logo_guilt_bonus.png'}
# immagini singole (targhette rosse delle boosted), copiate come le texture: PNG vero -> BTF
STATIC = ['img/ui/Minfo_Def12_SB.png', 'img/ui/Deck_Panel_SB.png']
# cartella WW servita della stessa animazione (riferimento per le texture tolte dall'estrazione JP)
REFS = {RD + 'demo/raidgacha_result_display_': RD + 'demo/raidgacha_result_display_01'}


def served_names():
    names = set()
    with open(os.path.join(D, 'resource_data', 'names_v4.tsv'), encoding='utf-8') as f:
        for line in f:
            names.add(line.split('\t', 1)[0])
    return names


def latest(folder, base, ext):
    """File <base><ext> o la revisione piu' alta <base>.<8 cifre><ext> nella cartella JP."""
    best, best_rev = None, -2
    for f in os.listdir(folder):
        m = REV.match(f)
        rev = int(m.group(2)) if m and m.group(1) == base and m.group(3) == ext else (
            -1 if f == base + ext else -2)
        if rev > best_rev:
            best, best_rev = f, rev
    return os.path.join(folder, best) if best else None


def lwf_textures(path):
    """[(nome file della texture, (larghezza, altezza), firma)] dalla tabella texture della LWF, in
    ordine. Header: 'LWF\\0', 3 byte di versione, opzione, 6 int, poi Data {offset, numero} (int32):
    [0] byte delle stringhe, [2] traslazioni (2 float), [3] matrici (6 float), [8] texture (20 byte),
    [9] frammenti (9 int), [10] bitmap {matrixId, fragmentId}, [35] stringhe {offset, lunghezza}.
    Firma = registrazioni (arrotondate al millesimo) delle bitmap che usano la texture, ordinate."""
    d = open(path, 'rb').read()
    if d[:4] != b'LWF\0':
        raise ValueError(f'{os.path.basename(path)}: non LWF')
    data = struct.unpack_from('<72i', d, 32)
    sec = lambda i: (data[2 * i], data[2 * i + 1])  # noqa: E731
    sb, _ = sec(0)
    so, sn = sec(35)
    if so + 8 * sn != len(d):
        raise ValueError(f'{os.path.basename(path)}: tabella stringhe inattesa')
    strs = []
    for i in range(sn):
        o, n = struct.unpack_from('<2i', d, so + 8 * i)
        strs.append(d[sb + o:sb + o + n].decode('utf-8'))
    to, tn = sec(8)
    fo, fn = sec(9)
    bo, bn = sec(10)
    tro, _ = sec(2)
    mo, _ = sec(3)

    def matrix(m):
        if m & 0x80000000:
            vals = struct.unpack_from('<6f', d, mo + 24 * (m & 0x7fffffff))
            return ('M',) + tuple(round(x, 3) for x in vals)
        return ('T',) + tuple(round(x, 3) for x in struct.unpack_from('<2f', d, tro + 8 * m))

    frag_tex = [struct.unpack_from('<2i', d, fo + 36 * i)[1] for i in range(fn)]
    sigs = {}
    for i in range(bn):
        m, f = struct.unpack_from('<2i', d, bo + 8 * i)
        sigs.setdefault(frag_tex[f], []).append(matrix(m & 0xffffffff))
    out = []
    for i in range(tn):
        sid, _fmt, w, h = struct.unpack_from('<4i', d, to + 20 * i)
        out.append((strs[sid], (w, h), tuple(sorted(sigs.get(i, [])))))
    return out


def name_index(ww):
    """{nome originale: [(tipo, percorso)]} delle texture con nome dato a mano: JP sotto lwf/ (revisione
    piu' alta per cartella), poi le cartelle WW di NAME_WW. Fonte (1b), vedi NAME_WW."""
    idx = {}
    tex = re.compile(r'^(.+?)_([0-9a-f]+)(?:\.(\d{8}))?\.png$')
    for root, _dirs, files in os.walk(os.path.join(JP, 'lwf')):
        best = {}
        for f in files:
            m = tex.match(f)
            if not m:
                continue
            try:
                name = bytes.fromhex(m.group(2)).decode('utf-8')
            except ValueError:
                continue
            rev = int(m.group(3) or -1)
            if GENERIC.match(name) or best.get(name, (-2,))[0] >= rev:
                continue
            best[name] = (rev, os.path.join(root, f))
        for name, (_r, p) in sorted(best.items()):
            idx.setdefault(name, []).append(('jp', p))
    for rel in NAME_WW:
        folder = os.path.join(ww, *rel.split('/'))
        base = rel.split('/')[-1]
        for f in sorted(os.listdir(folder)) if os.path.isdir(folder) else []:
            if f.endswith('.png'):
                name = orig_name(base, f)
                if not GENERIC.match(name):
                    idx.setdefault(name, []).append(('ww', os.path.join(folder, f)))
    return idx


def by_name(names, name, wh):
    """Fonte (1b): ((tipo, percorso), classe) della prima texture di nome `name` (poi SUBST) con dimensioni wh."""
    for n, sub in ((name, False), (SUBST.get(name), True)):
        for kind, p in names.get(n, []) if n else []:
            if tuple(img_size(open(p, 'rb').read()) or ()) == wh:
                return (kind, p), 'substitute' if sub else f'name-{kind}'
    return None


def orig_name(base, fname):
    """Nome originale della texture (<base>_<hex UTF-8>.png); se non e' esadecimale, il file."""
    try:
        return bytes.fromhex(fname[len(base) + 1:-4]).decode('utf-8')
    except ValueError:
        return fname


def img_size(data):
    """Dimensioni (tela) di un BTF o di un PNG vero."""
    i = btf.info(data)
    if i:
        return i['canvas']
    if data[:8] == b'\x89PNG\r\n\x1a\n':
        return struct.unpack('>2I', data[16:24])
    return None


def ref_map(target, ref):
    """Texture della LWF target -> texture della LWF di riferimento WW (regole nel docstring).
    target['tex'], ref['tex'] = [(nome, dim, firma)]; ref['md5'] = {nome ref: contenuto}.
    Restituisce ({nome target: (nome ref, classe)}, [conflitti], [position-only])."""
    rtex, md5 = ref['tex'], ref['md5']
    key = lambda t: (t[1], t[2])  # noqa: E731
    bykey = {}
    for t in rtex:
        bykey.setdefault(key(t), {}).setdefault(md5[t[0]], t[0])
    by_name = {orig_name(ref['base'], t[0]): t for t in rtex}
    anchor = [len(bykey.get(key(t), {})) == 1 and bool(t[2]) for t in target['tex']]
    sm = difflib.SequenceMatcher(None, [key(t) for t in rtex], [key(t) for t in target['tex']],
                                 autojunk=False)
    aligned, block = {}, {}
    for op, a1, a2, b1, b2 in sm.get_opcodes():
        if op == 'equal':
            for i in range(a2 - a1):
                aligned[b1 + i] = a1 + i
                block[b1 + i] = (b1, b2)
    out, conflict, pos_only = {}, [], []
    for j, t in enumerate(target['tex']):
        k = t[0]
        if anchor[j]:
            uniq = next(iter(bykey[key(t)].values()))
            if j in aligned and md5[rtex[aligned[j]][0]] != md5[uniq]:
                conflict.append(k)
            else:
                out[k] = (rtex[aligned[j]][0] if j in aligned else uniq, 'unique-anchor')
        else:
            # firma condivisa da piu' contenuti di _01
            name = orig_name(target['base'], k)
            hit = by_name.get(name)
            if not GENERIC.match(name) and hit and key(hit) == key(t):
                # stesso nome dato a mano (non «ビットマップ N», che le esportazioni rinumerano) e
                # stessa firma: yellow.png, che ha la firma di white_back.png (540x540, -22,-22)
                out[k] = (hit[0], 'name-corroborated')
            elif j in aligned:
                b1, b2 = block[j]
                if any(anchor[b1:j]) and any(anchor[j + 1:b2]):
                    out[k] = (rtex[aligned[j]][0], 'position-corroborated')
                else:
                    pos_only.append(k)
    return out, conflict, pos_only


def parse_replace(items):
    """['<percorso pubblicato>=<png>'] -> {percorso: png}."""
    out = {}
    for it in items:
        pub, sep, src = it.partition('=')
        if not sep or not pub or not src or not os.path.isfile(src):
            raise SystemExit(f'--replace {it!r}: serve <percorso pubblicato>=<png esistente>')
        out[pub.replace('\\', '/')] = src
    return out


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--ww', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--report', required=True)
    ap.add_argument('--check', action='store_true')
    ap.add_argument('--replace', action='append', default=[], metavar='PERCORSO=PNG',
                    help='sostituisce la texture pubblicata (es. lwf/.../X_<hex>.png) con un PNG, dopo la '
                         'copia; le dimensioni devono essere quelle dichiarate dalla LWF')
    a = ap.parse_args(argv)
    replaces = parse_replace(a.replace)
    usati = set()
    Image = None
    if not a.check:
        from PIL import Image
    served = served_names()
    refs = {}
    for prefix, rel in REFS.items():
        rdir = os.path.join(a.ww, *rel.split('/'))
        rl = os.path.join(rdir, rel.split('/')[-1] + '.lwf')
        if not os.path.exists(rl):
            raise SystemExit(f'manca il riferimento WW {rl} (estrarlo con res_bulk.py)')
        rtex = lwf_textures(rl)
        md5 = {t[0]: hashlib.md5(open(os.path.join(rdir, t[0]), 'rb').read()).hexdigest() for t in rtex}
        refs[prefix] = {'dir': rdir, 'base': rel.split('/')[-1], 'tex': rtex, 'md5': md5}
    names = name_index(a.ww)
    report = {}
    for rel in WANTED:
        base = rel.split('/')[-1]
        if f'{rel}/{base}.lwf' in served:
            report[rel] = {'status': 'served'}
            continue
        folder = os.path.join(JP, *rel.split('/'))
        lwf = latest(folder, base, '.lwf') if os.path.isdir(folder) else None
        if not lwf:
            report[rel] = {'status': 'missing-lwf'}
            continue
        try:
            tex = lwf_textures(lwf)
            ref = next((r for p, r in refs.items() if rel.startswith(p)), None)
            mapped, conflict, pos_only = ref_map({'base': base, 'tex': tex}, ref) if ref else ({}, [], [])
        except (ValueError, struct.error, IndexError, UnicodeDecodeError) as e:
            report[rel] = {'status': 'incomplete', 'error': str(e), 'missing': [], 'conflict': []}
            continue
        files, missing = {}, []
        count = {'own-jp': 0, 'unique-anchor': 0, 'position-corroborated': 0, 'name-corroborated': 0,
                 'position-only': len(pos_only), 'name-jp': 0, 'name-ww': 0, 'substitute': 0}
        bad = set(conflict) | set(pos_only)
        conflict = [orig_name(base, k) for k in conflict]
        for k, wh, _sig in tex:
            name = orig_name(base, k)
            if k in bad:
                continue
            own = os.path.join(folder, k)
            if f'{rel}/{k}' in replaces:
                cand, cls = ('jp', replaces[f'{rel}/{k}']), 'own-jp'
                usati.add(f'{rel}/{k}')
            elif os.path.exists(own):
                cand, cls = ('jp', own), 'own-jp'
            elif k in mapped:
                cand, cls = ('ww', os.path.join(ref['dir'], mapped[k][0])), mapped[k][1]
            elif rel.startswith(GB) and (hit := by_name(names, name, wh)):
                cand, cls = hit
            else:
                missing.append(name)
                continue
            if tuple(img_size(open(cand[1], 'rb').read()) or ()) != wh:
                conflict.append(f'{name} (dimensioni diverse da {wh[0]}x{wh[1]}'
                                + (', file di --replace)' if f'{rel}/{k}' in replaces else ')'))
                continue
            files[k] = cand
            count[cls] += 1
        entry = {'lwf': os.path.basename(lwf), 'textures': len(tex), 'count': count}
        if missing or conflict or pos_only:
            report[rel] = {'status': 'incomplete', **entry, 'missing': missing, 'conflict': conflict,
                           'position_only': [orig_name(base, k) for k in pos_only]}
            continue
        report[rel] = {'status': 'ok', **entry}
        if a.check:
            continue
        dst = os.path.join(a.out, *rel.split('/'))
        os.makedirs(dst, exist_ok=True)
        with open(lwf, 'rb') as s, open(os.path.join(dst, base + '.lwf'), 'wb') as d:
            d.write(s.read())
        for k, (kind, src) in files.items():
            data = open(src, 'rb').read()
            if kind == 'jp' and not data.startswith(b'\x89BTF'):
                data = btf.encode(Image.open(io.BytesIO(data)).convert('RGBA'))
            with open(os.path.join(dst, k), 'wb') as d:
                d.write(data)
    # immagini singole: devono esserci; il file di --replace deve avere le dimensioni del PNG JP
    for pub in STATIC:
        orig = os.path.join(JP, *pub.split('/'))
        src = replaces.get(pub) or orig
        usati.add(pub)
        if not os.path.isfile(src) or not os.path.isfile(orig):
            report[pub] = {'status': 'missing'}
            continue
        data = open(src, 'rb').read()
        wh = img_size(data)
        if not wh or tuple(wh) != tuple(img_size(open(orig, 'rb').read()) or ()):
            report[pub] = {'status': 'incomplete', 'error': 'non PNG/BTF o dimensioni diverse da JP'}
            continue
        report[pub] = {'status': 'ok', 'size': list(wh)}
        if a.check:
            continue
        if not data.startswith(b'\x89BTF'):
            data = btf.encode(Image.open(io.BytesIO(data)).convert('RGBA'))
        os.makedirs(os.path.join(a.out, *pub.split('/')[:-1]), exist_ok=True)
        with open(os.path.join(a.out, *pub.split('/')), 'wb') as d:
            d.write(data)
    ignoti = sorted(set(replaces) - usati)
    if ignoti:
        raise SystemExit(f'--replace: nessuna texture con questo percorso pubblicato: {ignoti}')
    if not a.check:
        # cartelle scritte da una corsa precedente e non piu' ok: via (solo quelle di WANTED)
        for rel, r in report.items():
            dst = os.path.join(a.out, *rel.split('/'))
            if rel in WANTED and r['status'] != 'ok' and os.path.isdir(dst):
                shutil.rmtree(dst)
                print(f'{rel}: tolta la copia precedente')
    os.makedirs(os.path.dirname(os.path.abspath(a.report)), exist_ok=True)
    with open(a.report, 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=1)
    for rel, r in report.items():
        extra = f" {r['size']}" if 'size' in r else ''
        if 'count' in r:
            c = r['count']
            extra = (f" ({r['lwf']}, {r['textures']} texture: {c['own-jp']} JP, {c['unique-anchor']}"
                     f" ancore, {c['position-corroborated']} posizione corroborata,"
                     f" {c['name-corroborated']} nome corroborato, {c['position-only']} solo posizione"
                     + ''.join(f", {c[x]} {x}" for x in ('name-jp', 'name-ww', 'substitute') if c[x]) + ')')
        if r['status'] == 'incomplete':
            extra += (f" mancanti {r['missing']} conflitti {r['conflict']}"
                      + (f" errore {r['error']}" if 'error' in r else ''))
        print(f"{rel}: {r['status']}{extra}")
    return 0


if __name__ == '__main__':
    sys.exit(main())
