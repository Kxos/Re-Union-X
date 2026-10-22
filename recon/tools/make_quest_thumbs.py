"""Miniature delle missioni nell'elenco Story: img/adventure/stage/stage_select_ico_<w>_<t>.png.

    python recon/tools/make_quest_thumbs.py <stage.json> <originali> <cache> <uscita> [--report r.json] [--force]

Il client (riquadro «Panel» della missione) compone il percorso con
worldId e thumbId della riga master stage e chiama
. Se il file non c'e', initWithFile fallisce e il riquadro tiene la texture di
prima: i riquadri del carosello si riciclano scorrendo con le frecce, quindi le missioni senza
file mostrano la miniatura di un'altra missione (Agrabah con la piazza di Daybreak Town) o il
«?» di stage_select_ico_Blank (missioni non sbloccate). Delle 99 coppie usate
dalle missioni 1-525 le risorse ne hanno 4 (1_0, 1_40000, 2_0, 2_10000): qui si fanno le altre.

thumbId = stanza*10000 + variante*100 + sottovariante, la stanza della mappa
<mondo>_<stanza>_<variante>_<sotto> (1_40000 = DB_0004_00_00 1st District, verificato sulle
quattro originali). Sorgente: le anteprime delle stanze di Roboloid/khux (images/map,
<Mondo>_<stanza>[_<variante>].png, scaricate in <cache>); ritaglio 145x132 come le originali,
alpha e bordo chiaro presi dalle originali (<originali> = cartella con stage_select_ico_*.png, BTF
o PNG: catalog\\files\\img\\adventure\\stage o reference\\quest_list). Anche stage_select_ico_Soon
(con il flag 1, assente dalle risorse): copia di Blank finche' non si trova
l'originale. Le originali non si riscrivono. Uscita in BTF a palette (riserva del pacchetto).
Pillow e numpy: senza -I.
"""
import json
import os
import re
import sys
import urllib.parse
import urllib.request

import numpy as np
from PIL import Image, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import btf  # noqa: E402

args = [a for a in sys.argv[1:] if not a.startswith('--')]
stage_path, orig_dir, cache, out = args[:4]
report_path = sys.argv[sys.argv.index('--report') + 1] if '--report' in sys.argv else None
FORCE = '--force' in sys.argv
RAW = 'https://raw.githubusercontent.com/Roboloid/khux/master/images/map/'
TREE = 'https://api.github.com/repos/Roboloid/khux/git/trees/HEAD?recursive=1'
W, H = 145, 132
# worldId -> nome del mondo nei file di Roboloid (world.json: 1 DB ... 8 ED)
WORLD = {1: 'Daybreak_Town', 2: 'Dwarf_Woodlands', 3: 'Wonderland', 4: 'Agrabah',
         5: 'Olympus_Coliseum', 6: "Beast's_Castle", 7: 'Castle_of_Dreams', 8: 'Enchanted_Dominion'}
# Ritaglio: larghezza in pixel della mappa e centro (frazioni). Le quattro originali, confrontate
# con le stesse stanze di Roboloid, coprono 950-1700 px di larghezza con il centro fra 0,30 e
# 0,78 (scelto a mano): si usa 1200 px vicino al centro, un po' sopra la meta' (place() lo
# sposta dove la stanza e' piena). Correzioni per stanza in CROP: nome -> (larghezza, cx, cy).
CROP_W, CX, CY = 1200, 0.5, 0.45
CROP = {}


def load_img(p):
    d = open(p, 'rb').read()
    if d[:4] == b'\x89BTF':
        return btf.decode(d)
    return Image.open(p).convert('RGBA')


def orig(name):
    p = os.path.join(orig_dir, 'stage_select_ico_%s.png' % name)
    return load_img(p) if os.path.exists(p) else None


def roboloid_names():
    p = os.path.join(cache, 'tree.json')
    if not os.path.exists(p):
        os.makedirs(cache, exist_ok=True)
        req = urllib.request.Request(TREE, headers={'User-Agent': 'khux-restore'})
        with urllib.request.urlopen(req, timeout=120) as r:
            open(p, 'wb').write(r.read())
    tree = json.load(open(p, encoding='utf-8'))['tree']
    return {t['path'][len('images/map/'):-4] for t in tree
            if t['path'].startswith('images/map/') and t['path'].endswith('.png') and 'Extras' not in t['path']}


def fetch(name):
    p = os.path.join(cache, name + '.png')
    if not os.path.exists(p):
        with urllib.request.urlopen(RAW + urllib.parse.quote(name + '.png'), timeout=120) as r:
            data = r.read()
        open(p, 'wb').write(data)
    return p


def source(names, world, thumb):
    """Stanza di Roboloid per (worldId, thumbId): esatta, poi la stessa stanza in un'altra
    variante (la _00 se c'e'). None se il mondo o la stanza mancano."""
    room, var, sub = thumb // 10000, thumb // 100 % 100, thumb % 100
    w = WORLD.get(world)
    if world == 1 and room >= 100:
        w = 'Corridor_of_Darkness'   # DG_0100 nelle righe del mondo 1 (missioni 492-500)
    if not w:
        return None, 'mondo'
    base = '%s_%04d' % (w, room)
    for n in ('%s_%02d_%02d' % (base, var, sub), '%s_%02d' % (base, var)):
        if n in names:
            return n, 'esatta'
    if base in names:
        return base, 'esatta' if var == 0 else 'stanza'
    alt = sorted(n for n in names if n.startswith(base + '_'))
    if alt:
        return alt[0], 'stanza'
    return None, 'stanza'


# --- cornice dalle originali: alpha comune, bordo = fascia larga EDGE px dove le quattro
# originali coincidono (mediana); dentro si sfuma verso la stanza
refs = [orig(n) for n in ('1_0', '1_40000', '2_0', '2_10000')]
refs = [r for r in refs if r is not None]
if not refs:
    sys.exit('originali stage_select_ico_* assenti in %s' % orig_dir)
A = np.stack([np.asarray(r, dtype=np.float32) for r in refs])
alpha = A[0, ..., 3]
frame = np.median(A[..., :3], axis=0)
EDGE = 3
mask = Image.fromarray((alpha > 128).astype(np.uint8) * 255)
dist = np.zeros(alpha.shape, np.float32)
m = mask
for k in range(1, EDGE + 3):
    m = m.filter(ImageFilter.MinFilter(3))
    dist += (np.asarray(m) > 0)
# peso della cornice: 1 fino a EDGE px dal bordo, poi scende a 0 in 2 px
wf = np.clip((EDGE + 2 - dist) / 2.0, 0, 1)[..., None]


def place(im, cw, ch):
    """Angolo del ritaglio: fra i centri di una griglia 5x5 (0,3-0,7) quello con piu' pixel
    pieni (opachi e non quasi neri: molte anteprime hanno fasce vuote ai lati) e piu'
    dettaglio, a parita' il piu' vicino a (CX, CY)."""
    k = 8.0
    sm = np.asarray(im.convert('RGBA').resize((max(1, int(im.width / k)), max(1, int(im.height / k)))),
                    dtype=np.float32)
    lum = sm[..., :3].mean(axis=2)
    full = (sm[..., 3] > 200) & (lum > 24)
    best = None
    for cx in np.linspace(0.3, 0.7, 5):
        for cy in np.linspace(0.3, 0.7, 5):
            x0 = min(max(im.width * cx - cw / 2, 0), im.width - cw)
            y0 = min(max(im.height * cy - ch / 2, 0), im.height - ch)
            a, b = int(x0 / k), int(y0 / k)
            win = (slice(b, b + max(1, int(ch / k))), slice(a, a + max(1, int(cw / k))))
            score = full[win].mean() + lum[win].std() / 255 - 0.5 * np.hypot(cx - CX, cy - CY)
            if best is None or score > best[0]:
                best = (score, x0, y0)
    return best[1:]


def tile(src):
    im = Image.open(src)
    name = os.path.basename(src)[:-4]
    cw = min(CROP.get(name, (CROP_W,))[0], im.width, im.height * W / H)
    ch = cw * H / W
    if name in CROP:
        cx, cy = CROP[name][1:]
        x0 = min(max(im.width * cx - cw / 2, 0), im.width - cw)
        y0 = min(max(im.height * cy - ch / 2, 0), im.height - ch)
    else:
        x0, y0 = place(im, cw, ch)
    im = im.convert('RGB')
    crop = im.resize((W, H), Image.LANCZOS, box=(x0, y0, x0 + cw, y0 + ch))
    rgb = np.asarray(crop, dtype=np.float32) * (1 - wf) + frame * wf
    px = np.dstack([np.clip(rgb, 0, 255), alpha]).astype(np.uint8)
    return Image.fromarray(px, 'RGBA')


stages = json.load(open(stage_path, encoding='utf-8'))
pairs = {}
for s in stages:
    if 1 <= s.get('id', 0) <= 525 and s.get('stageKind') == 1:
        pairs.setdefault((s['worldId'], s['thumbId']), []).append((s['id'], s['mapName']))
names = roboloid_names()
dst = os.path.join(out, 'img', 'adventure', 'stage')
os.makedirs(dst, exist_ok=True)
rep, made = [], 0
for (w, t), qs in sorted(pairs.items()):
    key = '%d_%d' % (w, t)
    row = dict(file='stage_select_ico_%s.png' % key, quests=[q for q, _ in qs],
               maps=sorted({n for _, n in qs}))
    if orig(key) is not None:
        row.update(source='originale')
    else:
        n, how = source(names, w, t)
        row.update(source=n, match=how)
        # gia' fatta: si salta (il build -Quick resta veloce); --force per rifarle dopo CROP
        if n and (FORCE or not os.path.exists(os.path.join(dst, row['file']))):
            open(os.path.join(dst, row['file']), 'wb').write(btf.encode_palette(tile(fetch(n))))
            made += 1
    rep.append(row)
blank = orig('Blank')
if blank is not None and orig('Soon') is None:
    open(os.path.join(dst, 'stage_select_ico_Soon.png'), 'wb').write(btf.encode_palette(blank))
missing = [r for r in rep if not r.get('source')]
print('coppie %d, originali %d, generate %d, senza sorgente %d' % (
    len(rep), sum(r['source'] == 'originale' for r in rep), made, len(missing)))
for r in rep:
    if r.get('match') == 'stanza' or not r.get('source'):
        print('  %s -> %s (%s) missioni %s %s' % (r['file'], r.get('source'), r.get('match'),
                                                   r['quests'][:4], '|'.join(r['maps'])))
if report_path:
    json.dump(rep, open(report_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
