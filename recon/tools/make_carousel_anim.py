"""Armatura dei cut-in del carosello (cocostudio/publish/ActMapCarouselAnim) completa per il 4.3.1:
quella servita (WW, 52 frame) e' una revisione vecchia, I-124 (docs/notes/battaglia.md#hud).

Cosa vuole il client 4.3.1 (CarouselDeck: armatura
«ActMapCarouselAnim», movimento per nome, NULL se il movimento manca):
- «GuiltBonus» / «GuiltBonus_Plus» = la scritta «xxx% BONUS»
  con la freccia rossa del cut-in dell'attacco speciale con guilt.
  La servita ha solo «GuiltBonus»: senza «GuiltBonus_Plus» il bonus «+» non si vede (null-safe);
- ossa «GuiltBIcon»/«GuiltBIcon_eff»: chiama changeDisplayWithIndex (nessun controllo del limite) con guiltValue - 1 della medaglia. La servita ha 8 immagini (tier 1-8): con una medaglia di tier 9 o 10 (307 righe del
  nostro master) l'indice 8/9 legge oltre il vettore = crash al cut-in. Il JP ne ha 10;
- «PvPGuiltBonus*», «PvPMedalAttack_*» (PvP) e «MedalAttack_SBurst[_Dark]» (Super Burst =
  Supernova) assenti dalla servita.

La revisione JP corrente (cartella di riferimento locale, jp_final_4.3.1: ActMapCarouselAnim.<id piu' alto>.ExportJson,
18 movimenti) li ha tutti ma usa due atlanti, e un plist nuovo (ActMapCarouselAnim1.plist) non si
carica (risorse_layout.md#regole). Quindi un solo atlante col nome servito:
- i 52 frame WW restano dove sono (vince la WW: testo e grafica localizzati) nella meta' sinistra;
- i frame che ha solo il JP (42: icone dei tier 9/10, cifre *_eff del «+», tutto il PvP; nessun
  testo giapponese) si impacchettano a scaffali nella meta' destra (tela 2048x1024, la misura che
  il plist WW dichiara gia');
- l'ExportJson e' quello JP con config_file_path/config_png_path ridotti al solo atlante 0.
Controllo finale: ogni immagine citata dall'armatura esiste nel plist (altrimenti si ferma).

    python recon/tools/make_carousel_anim.py [--served <catalog\\files\\cocostudio\\publish>]
                                             [--jp <cocostudio\\publish JP>] [--out <stage_gen\\files>]

Scrive <out>/cocostudio/publish/ActMapCarouselAnim.ExportJson, ActMapCarouselAnim0.plist,
ActMapCarouselAnim0.png (BTF premoltiplicato, btf.encode). Serve Pillow: senza -I.
"""
import argparse
import json
import os
import plistlib
import re
import sys
from io import BytesIO

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import btf                            # noqa: E402
from PIL import Image                 # noqa: E402

D = r'D:\Progetto_Restauro_KH_UX'
import private_tools  # noqa: E402  (local reference data folders, see private_tools.py)
JP_PUB = private_tools.local_path('jp_data', 'cocostudio', 'publish')
NAME = 'ActMapCarouselAnim'
CANVAS = (2048, 1024)
PAD = 2                               # spazio fra i frame aggiunti (niente sbavature del filtro)
REV = re.compile(r'^(.*)\.(\d{8})(\.[^.]+)$')

ap = argparse.ArgumentParser()
ap.add_argument('--served', default=os.path.join(D, 'catalog', 'files', 'cocostudio', 'publish'))
ap.add_argument('--jp', default=JP_PUB)
ap.add_argument('--out', default=os.path.join(D, 'stage_gen', 'files'))
args = ap.parse_args()


def latest(folder, logical):
    """Revisione JP corrente di un nome logico (entry id piu' alto; il file senza suffisso = -1)."""
    best = (-2, None)
    for f in os.listdir(folder):
        m = REV.match(f)
        base, r = (m.group(1) + m.group(3), int(m.group(2))) if m else (f, -1)
        if base == logical and r > best[0]:
            best = (r, os.path.join(folder, f))
    if not best[1]:
        sys.exit('manca in JP: ' + logical)
    return best[1]


def load_png(path):
    b = open(path, 'rb').read()
    return btf.decode(b) if b[:4] == b'\x89BTF' else Image.open(BytesIO(b)).convert('RGBA')


def displays(arm):
    out = set()
    for a in arm['armature_data']:
        for bone in a['bone_data']:
            for d in bone.get('display_data', []):
                if d.get('name'):
                    out.add(d['name'])
    return out


# ---- sorgenti --------------------------------------------------------------------------------
ww_pl = plistlib.load(open(os.path.join(args.served, NAME + '0.plist'), 'rb'))
ww_img = load_png(os.path.join(args.served, NAME + '0.png'))
jp_arm = json.load(open(latest(args.jp, NAME + '.ExportJson'), encoding='utf-8-sig'))
jp_sheets = []
for i, (pl, png) in enumerate(zip(jp_arm['config_file_path'], jp_arm['config_png_path'])):
    jp_sheets.append((plistlib.load(open(latest(args.jp, pl), 'rb'))['frames'], load_png(latest(args.jp, png))))
ww_arm = json.load(open(os.path.join(args.served, NAME + '.ExportJson'), encoding='utf-8-sig'))
ww_movs = {m['name'] for a in ww_arm['animation_data'] for m in a['mov_data']}
jp_movs = {m['name'] for a in jp_arm['animation_data'] for m in a['mov_data']}
if ww_movs - jp_movs:
    sys.exit('movimenti WW assenti dal JP: %s' % sorted(ww_movs - jp_movs))

# ---- atlante: WW a sinistra, frame solo JP a scaffali a destra -------------------------------
frames = dict(ww_pl['frames'])
ww_w = max(f['x'] + f['width'] for f in frames.values())
if ww_w > CANVAS[0] // 2 or ww_img.size[1] > CANVAS[1]:
    sys.exit('atlante WW piu\' grande del previsto: %s' % (ww_img.size,))
canvas = Image.new('RGBA', CANVAS, (0, 0, 0, 0))
canvas.paste(ww_img, (0, 0))
need = displays(jp_arm)
extra = []
for fr, img in jp_sheets:
    for n, f in fr.items():
        if n in need and n not in frames and n not in [e[0] for e in extra]:
            extra.append((n, f, img))
extra.sort(key=lambda e: (-e[1]['height'], e[0]))
x0 = CANVAS[0] // 2 + PAD
x, y, shelf = x0, PAD, 0
for n, f, img in extra:
    w, h = f['width'], f['height']
    if x + w + PAD > CANVAS[0]:
        x, y, shelf = x0, y + shelf + PAD, 0
    if y + h + PAD > CANVAS[1]:
        sys.exit('non c\'e\' posto per ' + n)
    canvas.paste(img.crop((f['x'], f['y'], f['x'] + w, f['y'] + h)), (x, y))
    nf = dict(f)
    nf['x'], nf['y'] = x, y
    frames[n] = nf
    x += w + PAD
    shelf = max(shelf, h)

missing = sorted(need - set(frames))
if missing:
    sys.exit('immagini dell\'armatura assenti dal plist: %s' % missing)

# ---- scrittura -------------------------------------------------------------------------------
pl = dict(ww_pl)
pl['frames'] = frames
pl['metadata'] = dict(ww_pl['metadata'])
pl['metadata']['size'] = '{%d,%d}' % CANVAS
arm = dict(jp_arm)
arm['config_file_path'] = [NAME + '0.plist']
arm['config_png_path'] = [NAME + '0.png']
dst = os.path.join(args.out, 'cocostudio', 'publish')
os.makedirs(dst, exist_ok=True)
with open(os.path.join(dst, NAME + '.ExportJson'), 'w', encoding='utf-8') as fh:
    json.dump(arm, fh, ensure_ascii=False, indent=1)
with open(os.path.join(dst, NAME + '0.plist'), 'wb') as fh:
    plistlib.dump(pl, fh)
with open(os.path.join(dst, NAME + '0.png'), 'wb') as fh:
    fh.write(btf.encode(canvas))
print('%s: %d movimenti (WW %d), %d frame (WW %d + JP %d), tela %dx%d -> %s' % (
    NAME, len(jp_movs), len(ww_movs), len(frames), len(ww_pl['frames']), len(extra), CANVAS[0], CANVAS[1], dst))
