"""rule/keyblade_rule.bin: posa del LWF del keyblade nei riquadri dei menu, ricentrata.

Il formato: record da 0x44 byte = int keybladeId + 4 modi x (rotazione x10000
in gradi, scala x10000, x, y). carica lwf/avatar/keyblade/keyblade_%04d_%02d
(displayId), cerca il record del keybladeId, poi quello della serie (id/1000*1000), poi 1000,
e applica setRotation(rot/10000), setScale(scala/10000), setPosition(x, y) del modo chiesto
(3 = riquadro di «Select a Keyblade»). Se il LWF manca usa
img/keyBlade/KeyBlade_%06d.png. Il file servito ha solo 1000..11000 (le serie 12000-16000
prendono la posa di Starlight) e i LWF della 5.0.1 non sono centrati con quei valori: Treasure
Trove a destra/in alto e tagliato (banco 11 ottobre). Le stesse LWF le usa l'avatar (parti
lwf/avatar/keyblade), quindi non si toccano: si riscrive la regola.

Per ogni riga della tabella keyblade si calcola il centro dell'arte nel LWF (riquadro del
frammento di texture, trasformato dalla traslazione piu' interna e poi dalle matrici in ordine
di indice: il modello delle LWF a una bitmap, stadi 01-05; lo stadio 06 prende il centro del 05)
e, modo per modo, la posizione che lo porta dove Starlight 1000 (stadio 01) ha il suo con la
posa originale; rotazione e scala restano quelle originali della serie (o di Starlight).

    python -I recon/tools/keyblade_rule.py <keyblade.json> <keyblade_rule.bin originale> <cartella LWF estratti> <uscita>

<cartella LWF estratti> = res_bulk.py con lwf/avatar/keyblade/ (catalog\\keyblade_lwf);
<uscita> = stage_gen\\files (scrive rule/keyblade_rule.bin).
"""
import json
import math
import os
import struct
import sys

SECTIONS = ['stringBytes', 'animationBytes', 'translate', 'matrix', 'color', 'alphaTransform',
            'colorTransform', 'objectData', 'texture', 'textureFragment', 'bitmap']


def lwf_center(path):
    d = open(path, 'rb').read()
    sec = {}
    for i, n in enumerate(SECTIONS):
        sec[n] = struct.unpack_from('<2i', d, 32 + 8 * i)
    o, c = sec['translate']
    tr = [struct.unpack_from('<2f', d, o + 8 * i) for i in range(c)][1:]
    o, c = sec['matrix']
    mx = [struct.unpack_from('<6f', d, o + 24 * i) for i in range(c)]
    o, c = sec['textureFragment']
    if c != 1:
        return None
    w, h = struct.unpack_from('<2i', d, o + 28)
    pts = [(0, 0), (w, 0), (0, h), (w, h)]
    for tx, ty in tr:
        pts = [(x + tx, y + ty) for x, y in pts]
    for sx, sy, k0, k1, tx, ty in mx:
        pts = [(sx * x + k0 * y + tx, k1 * x + sy * y + ty) for x, y in pts]
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    return ((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2)


def offset(center, rot, scale):
    """Spostamento sullo schermo (coordinate cocos, y in alto) del centro dell'arte: rotazione
    oraria in gradi, LWF con y in basso."""
    a = math.radians(rot / 10000)
    x, y = center
    s = scale / 10000
    dx = (x * math.cos(a) - y * math.sin(a)) * s
    dy = (x * math.sin(a) + y * math.cos(a)) * s
    return dx, -dy


def main():
    master, rule_in, lwf_dir, out = sys.argv[1:5]
    d = open(rule_in, 'rb').read()
    rules = {}
    for i in range(len(d) // 0x44):
        r = struct.unpack_from('<17i', d, 0x44 * i)
        rules[r[0]] = [list(r[1 + 4 * m:5 + 4 * m]) for m in range(4)]

    def center(disp):
        for stage in (disp % 100, 5):
            p = os.path.join(lwf_dir, 'keyblade_%04d_%02d' % (disp // 100, stage),
                             'keyblade_%04d_%02d.lwf' % (disp // 100, stage))
            if os.path.exists(p):
                c = lwf_center(p)
                if c:
                    return c
        return None

    rows = json.load(open(master, encoding='utf-8'))
    ref_c = center(next(r['displayId'] for r in rows if r['keybladeId'] == 1000))
    targets = []
    for rot, sc, x, y in rules[1000]:
        dx, dy = offset(ref_c, rot, sc)
        targets.append((x + dx, y + dy))
    outrec = []
    for r in sorted(rows, key=lambda r: r['keybladeId']):
        kid = r['keybladeId']
        base = rules.get(kid) or rules.get(kid // 1000 * 1000) or rules[1000]
        c = center(r['displayId'])
        modes = []
        for m, (rot, sc, x, y) in enumerate(base):
            if c is None:
                modes += [rot, sc, x, y]
                continue
            dx, dy = offset(c, rot, sc)
            nx, ny = round(targets[m][0] - dx), round(targets[m][1] - dy)
            modes += [rot, sc, nx, ny]
            if m == 3:
                print('%5d %-24s modo 3: %4d,%4d -> %4d,%4d' % (kid, r['name'], x, y, nx, ny))
        outrec.append(struct.pack('<17i', kid, *modes))
    os.makedirs(os.path.join(out, 'rule'), exist_ok=True)
    open(os.path.join(out, 'rule', 'keyblade_rule.bin'), 'wb').write(b''.join(outrec))
    print('righe:', len(outrec))


if __name__ == '__main__':
    main()
