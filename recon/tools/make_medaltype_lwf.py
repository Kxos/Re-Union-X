"""LWF del bagliore «medaglia del tipo dello slot» lwf/medal/medaltype/MedalType%d, di cui le
risorse servite hanno solo MedalType3 (Magic, blu): ricostruiti 1 (Power, rosso),
2 (Speed, verde) e MedalType01 come copie di MedalType3 con le texture ricolorate.

Chi li usa: la cella della medaglia (DeckEdit_RevolverMedal_ver330, chiamata): se l'attributo della medaglia e' quello dello slot del
keyblade (attribute[] della tabella keyblade; 4 = qualsiasi, nessun bagliore) crea
sprintf(lwf/medal/medaltype/MedalType%d/MedalType%d.lwf, attributo) e, nei modi di cella
2/4/5/6/7, MedalType01/MedalType01.lwf. Con il file assente il nodo LWF e' nullo e il client va
in crash (banco 11 ottobre: Optimize su Treasure Trove, slot 3 Power -> MedalType1). Starlight
ha solo slot 3 (Magic) e 4: per questo non si era visto.

Nome delle texture: il LWF le chiama MedalType3_0..2.png; il file servito e'
<cartella>/<nome LWF>_<hex del nome>.png quando il nome non comincia con quello del LWF (come
card_evolution_result_0N in make_layouts.py), altrimenti il nome stesso: nelle copie si
scrivono entrambi.

    python recon/tools/make_medaltype_lwf.py <cartella estratta> <uscita>

<cartella estratta> = res_bulk.py con il prefisso lwf/medal/medaltype/; <uscita> = stage_gen\\files.
Pillow e numpy: senza -I.
"""
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import btf  # noqa: E402

SRC_DIR = 'lwf/medal/medaltype/MedalType3'
# tinta di arrivo (gradi HSV) per tipo: Power rosso, Speed verde; MedalType01 come Power
TARGETS = {'MedalType1': 0, 'MedalType2': 125, 'MedalType01': 0}


def recolor(im, hue):
    """Sposta la tinta dei pixel colorati (il blu del bagliore) su `hue`, tenendo saturazione,
    luminosita' e alpha."""
    rgb = im.convert('RGB')
    hsv = np.asarray(rgb.convert('HSV')).copy()
    hsv[..., 0] = int(hue / 360 * 255)
    out = Image.fromarray(hsv, 'HSV').convert('RGB')
    out.putalpha(im.getchannel('A'))
    return out


def main():
    src, out = sys.argv[1:3]
    sdir = os.path.join(src, *SRC_DIR.split('/'))
    lwf = open(os.path.join(sdir, 'MedalType3.lwf'), 'rb').read()
    tex = sorted(f for f in os.listdir(sdir) if f.endswith('.png'))
    for name, hue in TARGETS.items():
        ddir = os.path.join(out, 'lwf', 'medal', 'medaltype', name)
        os.makedirs(ddir, exist_ok=True)
        open(os.path.join(ddir, name + '.lwf'), 'wb').write(lwf)
        for f in tex:
            im = recolor(btf.decode(open(os.path.join(sdir, f), 'rb').read()), hue)
            data = btf.encode(im)
            open(os.path.join(ddir, f), 'wb').write(data)
            open(os.path.join(ddir, '%s_%s.png' % (name, f.encode().hex())), 'wb').write(data)
        print(name, len(tex) * 2, 'texture')


if __name__ == '__main__':
    main()
