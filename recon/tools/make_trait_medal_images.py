"""Grafica delle Trait Medal (I-084 parte B): versione in bianco e nero della medaglia associata.

    python recon/tools/make_trait_medal_images.py <trait_medals.json> <medal_gen/files> <uscita> [--check <png originale>]

Per ogni voce di server/trait_medals.json scrive img/medal/Medal_L_<id>.png, Medal_S_<id>.png e, se la medaglia ha un
cut-in, img/Cutin/Cutin_<id>.png (BTF), id = 9000000 + N (server/make-trait-medals.js). Le originali
(reference\\trait_medals\\Trait_Medal_1/8/20_6star_KHUX.png) sono grigio argento, piu' chiare e contrastate della
semplice luminanza: la luminanza (GAIN, OFFSET) ne riproduce media e deviazione della parte opaca entro il 7% (
--check stampa il confronto su #1). Alfa invariato.
"""
import json
import os
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import btf  # noqa: E402

ID_BASE = 9000000
GAIN, OFFSET = 1.0, 0  # luminanza: media e deviazione vicine alle 3 originali (#1 148.6/67.3 vs 158.4/71.4, #8 198.9/53.1 vs 193.5/56.7, #20 61.5/66.4 vs 57.2/66.3)


def gray(img):
    rgba = img.convert('RGBA')
    lum = rgba.convert('L').point(lambda v: max(0, min(255, round(v * GAIN + OFFSET))))
    out = Image.merge('RGBA', (lum, lum, lum, rgba.getchannel('A')))
    return out


def stats(img):
    a = img.getchannel('A')
    lum = img.convert('L')
    vals = [v for v, al in zip(lum.get_flattened_data(), a.get_flattened_data()) if al > 200]
    m = sum(vals) / len(vals)
    sd = (sum((v - m) ** 2 for v in vals) / len(vals)) ** 0.5
    return round(m, 1), round(sd, 1)


def main(argv):
    lst, src, out = argv[1:4]
    entries = json.load(open(lst, encoding='utf8'))
    if '--check' in argv:
        ref = Image.open(argv[argv.index('--check') + 1]).convert('RGBA')
        e = next(x for x in entries if x['n'] == 1)
        mine = gray(btf.decode(open(os.path.join(src, 'img', 'medal', 'Medal_L_%d.png' % e['affected']), 'rb').read()))
        print('originale', stats(ref), 'nostra', stats(mine))
        return
    done = cut = 0
    for e in entries:
        tid = ID_BASE + e['n']
        for kind, folder, name in (('L', 'medal', 'Medal_L_%d.png'), ('S', 'medal', 'Medal_S_%d.png'), ('C', 'Cutin', 'Cutin_%d.png')):
            p = os.path.join(src, 'img', folder, name % e['affected'])
            if not os.path.exists(p):
                if kind != 'C':
                    raise SystemExit('immagine mancante: %s' % p)
                continue
            q = os.path.join(out, 'img', folder, name % tid)
            os.makedirs(os.path.dirname(q), exist_ok=True)
            open(q, 'wb').write(btf.encode(gray(btf.decode(open(p, 'rb').read()))))
            cut += kind == 'C'
        done += 1
    print('trait medal: %d immagini L/S, %d cut-in' % (done, cut))


if __name__ == '__main__':
    main(sys.argv)
