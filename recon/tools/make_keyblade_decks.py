"""Grafica del deck per keyblade e per attributo, di cui le risorse servite hanno solo la
versione di Starlight / Magic. Senza, «Select a Keyblade» va in crash appena il deck di un
keyblade nuovo ha medaglie (banco 11 ottobre, Treasure Trove dopo Optimize: fault 0x0, LWF nullo).

- img/carouselDeck/Deck%03d.png, DeckButton_%03d.png, DeckMedalNumUI_%03d.png,
  DeckMedalNumUI_pvp_%03d.png: %03d = displayId / 100 del keyblade (Starlight 001, Treasure Trove
  201, ...). Servita solo la 001 (rosone azzurro di Starlight): copie con la tinta spostata su
  quella dominante dell'arte del keyblade (bitmap del LWF keyblade_%04d_01).
- lwf/medal/medaldeck/MedalDeck_Type%d e MedalDeck_Type%d1 (attributo della medaglia nello slot:
  1 Power, 2 Speed, 3 Magic) e MedalDeck_Type01: servito solo MedalDeck_Type3. Copie del LWF con le
  texture ricolorate (Power rosso, Speed verde, Magic com'e'); le texture col nome
  <nome LWF>_<hex del nome interno>.png (come MedalDeck_Type3_32656630312e706e67.png) e col nome
  interno.

    python recon/tools/make_keyblade_decks.py <keyblade.json> <cartella estratta> <uscita>

<cartella estratta> = res_bulk.py con lwf/avatar/keyblade/, lwf/medal/medaldeck/, img/carouselDeck/
(catalog\\keyblade_lwf); <uscita> = stage_gen\\files. Pillow e numpy: senza -I.
"""
import json
import os
import re
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import btf  # noqa: E402

TYPE_HUE = {1: 0, 2: 125, 3: None}       # None = colori originali (Magic, blu)


def shift_hue(im, target=None, delta=None):
    hsv = np.asarray(im.convert('RGB').convert('HSV')).astype(np.int16)
    if target is not None:
        hsv[..., 0] = int(target / 360 * 255)
    else:
        hsv[..., 0] = (hsv[..., 0] + int(delta / 360 * 255)) % 256
    out = Image.fromarray(hsv.astype(np.uint8), 'HSV').convert('RGB')
    out.putalpha(im.getchannel('A'))
    return out


def dominant_hue(im):
    """Tinta media (vettoriale) dei pixel opachi e saturi dell'arte, in gradi."""
    a = np.asarray(im.convert('RGBA'))
    hsv = np.asarray(im.convert('RGB').convert('HSV')).astype(np.float64)
    w = (a[..., 3] > 128) * (hsv[..., 1] / 255) * (hsv[..., 2] / 255)
    ang = hsv[..., 0] / 255 * 2 * np.pi
    x, y = (w * np.cos(ang)).sum(), (w * np.sin(ang)).sum()
    return (np.degrees(np.arctan2(y, x)) + 360) % 360


def lwf_textures(folder):
    return sorted(f for f in os.listdir(folder) if f.endswith('.png'))


def internal_name(lwf_name, fname):
    rest = fname[len(lwf_name) + 1:-4]
    if re.fullmatch(r'[0-9a-f]+', rest) and len(rest) % 2 == 0:
        try:
            return bytes.fromhex(rest).decode('utf-8')
        except UnicodeDecodeError:
            pass
    return fname


def main():
    master, src, out = sys.argv[1:4]
    # deck dei keyblade
    cdir = os.path.join(src, 'img', 'carouselDeck')
    base = {n: btf.decode(open(os.path.join(cdir, n + '_001.png' if n != 'Deck' else 'Deck001.png'), 'rb').read())
            for n in ('Deck', 'DeckButton', 'DeckMedalNumUI')}
    ref_hue = dominant_hue(base['Deck'])
    odir = os.path.join(out, 'img', 'carouselDeck')
    os.makedirs(odir, exist_ok=True)
    keys = sorted({r['displayId'] // 100 for r in json.load(open(master, encoding='utf-8'))})
    for k in keys:
        names = {'Deck': 'Deck%03d.png' % k, 'DeckButton': 'DeckButton_%03d.png' % k,
                 'DeckMedalNumUI': 'DeckMedalNumUI_%03d.png' % k}
        if k == 1:
            # 001 e' servita: solo la variante pvp, che manca
            open(os.path.join(odir, 'DeckMedalNumUI_pvp_001.png'), 'wb').write(btf.encode(base['DeckMedalNumUI']))
            continue
        art = os.path.join(src, 'lwf', 'avatar', 'keyblade', 'keyblade_%04d_01' % k)
        if not os.path.isdir(art):
            print('  senza LWF:', k)
            continue
        big = max((btf.decode(open(os.path.join(art, f), 'rb').read()) for f in lwf_textures(art)),
                  key=lambda i: i.width * i.height)
        delta = dominant_hue(big) - ref_hue
        for n, fname in names.items():
            # palette (tipo 9): 15 deck in ~0,5 MB (riserva del pacchetto generato)
            data = btf.encode_palette(shift_hue(base[n], delta=delta))
            open(os.path.join(odir, fname), 'wb').write(data)
            if n == 'DeckMedalNumUI':
                open(os.path.join(odir, 'DeckMedalNumUI_pvp_%03d.png' % k), 'wb').write(data)
        print('deck %03d: tinta %+.0f gradi' % (k, delta))
    # bagliore dell'attributo nel deck
    mdir = os.path.join(src, 'lwf', 'medal', 'medaldeck', 'MedalDeck_Type3')
    lwf = open(os.path.join(mdir, 'MedalDeck_Type3.lwf'), 'rb').read()
    tex = [(f, internal_name('MedalDeck_Type3', f)) for f in lwf_textures(mdir)]
    targets = {'MedalDeck_Type1': 1, 'MedalDeck_Type2': 2, 'MedalDeck_Type11': 1, 'MedalDeck_Type21': 2,
               'MedalDeck_Type31': 3, 'MedalDeck_Type01': 1}
    for name, t in targets.items():
        ddir = os.path.join(out, 'lwf', 'medal', 'medaldeck', name)
        os.makedirs(ddir, exist_ok=True)
        open(os.path.join(ddir, name + '.lwf'), 'wb').write(lwf)
        for f, inner in tex:
            im = btf.decode(open(os.path.join(mdir, f), 'rb').read())
            if TYPE_HUE[t] is not None:
                im = shift_hue(im, target=TYPE_HUE[t])
            data = btf.encode(im)
            open(os.path.join(ddir, '%s_%s.png' % (name, inner.encode().hex())), 'wb').write(data)
            open(os.path.join(ddir, inner), 'wb').write(data)
        print(name, len(tex), 'texture')


if __name__ == '__main__':
    main()
