"""Prova offline di import_jp_raisedraw.py (latest() e ref_map() su tabelle sintetiche).

    python recon/tools/test_import_jp_raisedraw.py        -> «OK: ...» oppure «ERRORI (n)», uscita 1
"""
import io
import json
import os
import struct
import sys
import tempfile

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import btf  # noqa: E402
import import_jp_raisedraw as m  # noqa: E402

errori = []


def check(cond, msg):
    if not cond:
        errori.append(msg)


def fn(base, orig):
    return f'{base}_{orig.encode("utf-8").hex()}.png'


def T(base, orig, wh, sig):
    return (fn(base, orig), wh, (('T',) + sig,) if sig is not None else ())


# --- latest(): revisione piu' alta della stessa estensione, altrimenti il file senza revisione
with tempfile.TemporaryDirectory() as d:
    for f in ('a.lwf', 'a.00000005.lwf', 'a.00000010.lwf', 'a.00000020.res', 'ab.00000099.lwf', 'b.lwf'):
        open(os.path.join(d, f), 'wb').close()
    check(os.path.basename(m.latest(d, 'a', '.lwf')) == 'a.00000010.lwf', 'latest: revisione piu\' alta')
    check(os.path.basename(m.latest(d, 'b', '.lwf')) == 'b.lwf', 'latest: solo senza revisione')
    check(os.path.basename(m.latest(d, 'a', '.res')) == 'a.00000020.res', 'latest: estensione')
    check(m.latest(d, 'c', '.lwf') is None, 'latest: assente')

# --- ref_map(): rinumerazione, blocco inserito, dimensioni ripetute, scarto di indice
R, G = 'ref', 'tgt'
B = 'ビットマップ '
ref_tex = [T(R, B + '10.png', (10, 10), (1, 1)),     # ancora
           T(R, B + '11.png', (20, 20), (2, 2)),     # ancora
           T(R, B + '12.png', (30, 30), (3, 3)),     # firma condivisa (contenuto x)
           T(R, B + '13.png', (30, 30), (3, 3)),     # firma condivisa (contenuto y)
           T(R, B + '14.png', (40, 40), (4, 4)),     # ancora
           T(R, 'yellow.png', (50, 50), (5, 5)),     # stessa firma di white_back
           T(R, 'white_back.png', (50, 50), (5, 5)),
           T(R, B + '15.png', (60, 60), (6, 6))]     # stesse dimensioni di una target, altra firma
md5 = {t[0]: f'c{i}' for i, t in enumerate(ref_tex)}
ref = {'base': R, 'tex': ref_tex, 'md5': md5}
# la target rinumera (12->7, 13->8...) e inserisce un blocco nuovo in testa allo scarto di indice
tgt_tex = [T(G, B + '1.png', (99, 99), (9, 9)),      # blocco inserito: assente in ref
           T(G, B + '5.png', (10, 10), (1, 1)),
           T(G, B + '6.png', (20, 20), (2, 2)),
           T(G, B + '7.png', (30, 30), (3, 3)),
           T(G, B + '8.png', (30, 30), (3, 3)),
           T(G, B + '9.png', (40, 40), (4, 4)),
           T(G, 'yellow.png', (50, 50), (5, 5)),     # fuori blocco (white_back assente): per nome
           T(G, B + '2.png', (60, 60), (7, 7))]      # sole dimensioni uguali: non si accetta
out, conflict, pos_only = m.ref_map({'base': G, 'tex': tgt_tex}, ref)
g = lambda o: fn(G, o)  # noqa: E731
r = lambda o: fn(R, o)  # noqa: E731
check(out.get(g(B + '5.png')) == (r(B + '10.png'), 'unique-anchor'), 'ancora 5->10')
check(out.get(g(B + '9.png')) == (r(B + '14.png'), 'unique-anchor'), 'ancora 9->14')
check(out.get(g(B + '7.png')) == (r(B + '12.png'), 'position-corroborated'), 'ambigua 7->12')
check(out.get(g(B + '8.png')) == (r(B + '13.png'), 'position-corroborated'), 'ambigua 8->13')
check(g(B + '1.png') not in out, 'blocco inserito: mancante')
check(out.get(g('yellow.png')) == (r('yellow.png'), 'name-corroborated'), 'yellow per nome+firma')
check(g(B + '2.png') not in out, 'niente ripiego per sole dimensioni')
check(not conflict and not pos_only, f'nessun conflitto/position-only: {conflict} {pos_only}')

# ambigue senza ancora su un lato -> position-only (mai usate)
tgt2 = [T(G, B + '7.png', (30, 30), (3, 3)), T(G, B + '8.png', (30, 30), (3, 3)),
        T(G, B + '9.png', (40, 40), (4, 4))]
ref2 = {'base': R, 'tex': ref_tex[2:5], 'md5': md5}
out, conflict, pos_only = m.ref_map({'base': G, 'tex': tgt2}, ref2)
check(set(pos_only) == {g(B + '7.png'), g(B + '8.png')}, f'position-only senza ancora prima: {pos_only}')
check(g(B + '7.png') not in out and g(B + '9.png') in out, 'position-only non mappate')

# nome generico «ビットマップ N» fuori blocco con firma condivisa: non per nome
tgt3 = [T(G, B + '12.png', (30, 30), (3, 3))]
ref3 = {'base': R, 'tex': [ref_tex[3], ref_tex[0], ref_tex[2]], 'md5': md5}
out, _, _ = m.ref_map({'base': G, 'tex': tgt3}, ref3)
check(g(B + '12.png') not in out, 'nome generico non vale come prova')

# --- WANTED: radice JP = jp_final_4.3.1, percorsi completi da lwf/
NUOVE = (['lwf/medal/guilt_bonus/GuiltBonus_BurstLvup', 'lwf/medal/guilt_bonus/GuiltBonus_BurstLvup_num',
          'lwf/raisedraw/demo/Draw_StatusBonus']
         + [f'lwf/medal/guilt_bonus/GuiltBonus_Wfix{n}' for n in range(10)])
WANTED0, STATIC0, REFS0, JP0 = list(m.WANTED), list(m.STATIC), dict(m.REFS), m.JP
check(len(NUOVE) == 13, 'le cartelle nuove sono 13')
for rel in NUOVE:
    check(rel in WANTED0, f'WANTED contiene {rel}')
check('lwf/raisedraw/demo/raidgacha_result_display_01' in WANTED0, 'vecchie voci con lwf/raisedraw')
check('lwf/raisedraw/Medal/Medal_D_Up1' in WANTED0, 'Medal_D con lwf/raisedraw')
check(all(w.startswith('lwf/') for w in WANTED0), 'tutte le voci iniziano con lwf/')
check(set(STATIC0) == {'img/ui/Minfo_Def12_SB.png', 'img/ui/Deck_Panel_SB.png'}, 'STATIC img/ui/*_SB.png')
check(os.path.basename(JP0) == 'jp_final_4.3.1', f'radice JP: {JP0}')


# --- LWF sintetica con una texture (formato letto da lwf_textures)
def lwf_una_texture(nome, w, h):
    strs = nome.encode('utf-8')
    o_str = 32 + 288
    o_tr = o_str + len(strs)
    o_tex = o_tr + 8
    o_frag = o_tex + 20
    o_bmp = o_frag + 36
    o_stab = o_bmp + 8
    data = [0] * 72
    data[0], data[1] = o_str, len(strs)
    data[4], data[5] = o_tr, 1          # [2] traslazioni
    data[16], data[17] = o_tex, 1       # [8] texture
    data[18], data[19] = o_frag, 1      # [9] frammenti
    data[20], data[21] = o_bmp, 1       # [10] bitmap
    data[70], data[71] = o_stab, 1      # [35] stringhe
    b = b'LWF\0' + bytes(28) + struct.pack('<72i', *data)
    b += strs + struct.pack('<2f', 0, 0)
    b += struct.pack('<5i', 0, 0, w, h, 1)                  # texture {stringId, formato, w, h, scala}
    b += struct.pack('<9i', 0, 0, 0, 0, w, h, 0, 0, 0)      # frammento (textureId = 0)
    b += struct.pack('<2i', 0, 0)                           # bitmap {matrixId, fragmentId}
    b += struct.pack('<2i', 0, len(strs))
    return b


def png(w, h, rgba):
    buf = io.BytesIO()
    Image.new('RGBA', (w, h), rgba).save(buf, 'PNG')
    return buf.getvalue()


def esegui(argv):
    """main() senza stampe."""
    vecchio, sys.stdout = sys.stdout, io.StringIO()
    try:
        m.main(argv)
    finally:
        sys.stdout = vecchio


with tempfile.TemporaryDirectory() as t:
    jp = os.path.join(t, 'jp')
    base, rel = 'Syn', 'lwf/medal/Syn'
    tex = f'{base}_{"Logo.png".encode().hex()}.png'
    os.makedirs(os.path.join(jp, 'lwf', 'medal', 'Syn'))
    os.makedirs(os.path.join(jp, 'img', 'ui'))
    with open(os.path.join(jp, 'lwf', 'medal', 'Syn', 'Syn.lwf'), 'wb') as f:
        f.write(lwf_una_texture(tex, 8, 4))
    with open(os.path.join(jp, 'lwf', 'medal', 'Syn', tex), 'wb') as f:
        f.write(png(8, 4, (255, 0, 0, 255)))
    with open(os.path.join(jp, 'img', 'ui', 'S_SB.png'), 'wb') as f:
        f.write(png(6, 3, (0, 255, 0, 128)))
    m.JP, m.WANTED, m.STATIC, m.REFS = jp, [rel], ['img/ui/S_SB.png'], {}
    rep = os.path.join(t, 'rep.png')
    with open(rep, 'wb') as f:
        f.write(png(8, 4, (0, 0, 255, 255)))
    rep_male = os.path.join(t, 'rep_male.png')
    with open(rep_male, 'wb') as f:
        f.write(png(9, 4, (0, 0, 255, 255)))
    pub = f'{rel}/{tex}'

    def corsa(nome, *extra):
        out, rp = os.path.join(t, 'out_' + nome), os.path.join(t, nome + '.json')
        esegui(['--ww', t, '--out', out, '--report', rp, *extra])
        with open(rp, encoding='utf-8') as f:
            return out, json.load(f)

    # senza --replace: texture JP -> BTF, STATIC -> BTF
    out, r = corsa('base')
    check(r.get(rel, {}).get('status') == 'ok', f'sintetica ok: {r}')
    d = open(os.path.join(out, *rel.split('/'), tex), 'rb').read()
    check(d == btf.encode(Image.open(io.BytesIO(png(8, 4, (255, 0, 0, 255)))).convert('RGBA')),
          'texture JP in BTF')
    check(r.get('img/ui/S_SB.png', {}).get('status') == 'ok', f'STATIC ok: {r}')
    s = open(os.path.join(out, 'img', 'ui', 'S_SB.png'), 'rb').read()
    check(s.startswith(b'\x89BTF') and tuple(btf.info(s)['canvas']) == (6, 3), 'STATIC copiato in BTF')

    # --replace: la texture scritta e' quella del file di sostituzione
    out, r = corsa('rep', '--replace', f'{pub}={rep}')
    check(r.get(rel, {}).get('status') == 'ok', f'replace ok: {r}')
    d = open(os.path.join(out, *rel.split('/'), tex), 'rb').read()
    check(d == btf.encode(Image.open(rep).convert('RGBA')), 'replace: texture sostituita (BTF)')

    # dimensioni diverse dalle dichiarate: cartella non ok, niente scrittura
    out, r = corsa('male', '--replace', f'{pub}={rep_male}')
    check(r.get(rel, {}).get('status') == 'incomplete', f'replace dimensioni: {r}')
    check(not os.path.isdir(os.path.join(out, *rel.split('/'))), 'replace male: niente cartella')
    check(any('8x4' in c for c in r[rel]['conflict']), f'conflitto con le dimensioni: {r[rel]}')

    # --check con --replace: stessa valutazione, nessuna scrittura
    out, r = corsa('chk', '--check', '--replace', f'{pub}={rep}')
    check(r[rel]['status'] == 'ok' and not os.path.exists(out), '--check: nessuna scrittura')
    out, r = corsa('chk2', '--check', '--replace', f'{pub}={rep_male}')
    check(r[rel]['status'] == 'incomplete', '--check: replace con dimensioni diverse')

    # percorso di --replace sconosciuto: errore
    try:
        corsa('ignoto', '--replace', f'{rel}/nonesiste.png={rep}')
        check(False, 'replace sconosciuto: doveva fallire')
    except SystemExit:
        pass

# --- radice JP vera (--check): tutte le cartelle nuove e le STATIC ok
m.JP, m.WANTED, m.STATIC, m.REFS = JP0, WANTED0, STATIC0, REFS0
if os.path.isdir(m.JP):
    with tempfile.TemporaryDirectory() as t:
        rp = os.path.join(t, 'r.json')
        esegui(['--ww', os.path.join(m.D, 'catalog', 'raisedraw_ww'), '--out', os.path.join(t, 'o'),
                '--report', rp, '--check'])
        with open(rp, encoding='utf-8') as f:
            r = json.load(f)
        for rel in NUOVE + STATIC0:
            check(r.get(rel, {}).get('status') == 'ok', f'JP vero: {rel} -> {r.get(rel)}')
        check(set(r) == set(WANTED0) | set(STATIC0), 'rapporto: una voce per cartella')
else:
    print('(radice JP assente: prova --check saltata)')

if errori:
    print(f'ERRORI ({len(errori)})')
    for e in errori:
        print(' -', e)
    sys.exit(1)
print('OK: latest(), ref_map(), WANTED/STATIC, --replace (BTF, dimensioni), --check sulla radice JP vera')
