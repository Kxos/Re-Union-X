"""Parte di mappa (formato MAP, vedi mappoi_gen.py) per una stanza che non ha un modello
proprio: struttura presa da una mappa di un'altra stanza, posizioni scritte a mano nella
spec e controllate sulla bitmap delle collisioni della stanza (map/<stanza>/<stanza>_cls.bin:
'CLS\\0', larghezza, altezza, byte per riga, poi 1 bit per pixel dall'alto, bit piu'
significativo a sinistra; 0 = percorribile, verificato sui punti delle mappe 1030/1040).

    python -I recon/tools/mappoi_room.py <modello.bin> <cls.bin> <spec.json> <uscita.bin>

Spec:
    {"room": "DW_0003_00_00",
     "areas": [{"template": 0, "poly": [[x, y] x 4] | null, "enemies": [[enemyId, x, y], ...]}],
     "chests": [[x, y, reward, tipo], ...],
     "objects": [[x, y, a, b], ...],
     "c_point": [x, y]} punto della sezione C (copiata dal modello)
Ogni area copia i campi dell'area "template" del modello (l'area 0 del 1040 e' l'arena del
bersaglio, con il poligono a +0x24) e prende i suoi nemici dalla spec. Uid: nemici da 2,
poi forzieri, come nelle mappe vere. Ogni punto deve essere percorribile con un margine
(MARGIN pixel in ogni direzione), altrimenti errore.
"""
import json
import struct
import sys

MARGIN = 40

src = open(sys.argv[1], 'rb').read()
cls = open(sys.argv[2], 'rb').read()
spec = json.load(open(sys.argv[3], encoding='utf-8'))
u32 = lambda b, o: struct.unpack_from('<i', b, o)[0]  # noqa: E731

assert cls[:4] == b'CLS\0', 'bitmap delle collisioni attesa'
W, H, stride = struct.unpack_from('<3i', cls, 4)


def free(x, y):
    if not (0 <= x < W and 0 <= y < H):
        return False
    return not (cls[16 + y * stride + x // 8] >> (7 - x % 8)) & 1


def check(x, y, what):
    bad = [(dx, dy) for dx in (-MARGIN, 0, MARGIN) for dy in (-MARGIN, 0, MARGIN) if not free(x + dx, y + dy)]
    if bad:
        sys.exit('%s (%d, %d) non percorribile (scarti %s)' % (what, x, y, bad))


assert src[:4] == b'MAP\0', 'il modello non e\' un file MAP'
X = u32(src, 0x24)
A, B, C = (u32(src, 0x28 + 4 * i) + 0x34 for i in range(3))
na = u32(src, X + 0x34)
a0 = X + 0x3c
tmpl_areas = [bytes(src[a0 + k * 0x44:a0 + (k + 1) * 0x44]) for k in range(na)]
c_section = bytearray(src[C:])

body = bytearray(src[:a0])
room = spec['room'].encode()
body[0x0c:0x0c + 16] = room + b'\0' * (16 - len(room))

areas, enemies, uid = [], [], 2
for a in spec['areas']:
    rec = bytearray(tmpl_areas[a.get('template', 0)])
    struct.pack_into('<2i', rec, 0, len(enemies), len(a['enemies']))
    if a.get('poly'):
        for i, (x, y) in enumerate(a['poly']):
            check(x, y, 'vertice dell\'area')
            struct.pack_into('<2i', rec, 0x24 + 8 * i, x, y)
    for eid, x, y in a['enemies']:
        check(x, y, 'nemico %d' % eid)
        enemies.append((x, y, eid, 1, 1, 1, spec.get('dropReward', 1), uid))
        uid += 1
    areas.append(bytes(rec))
struct.pack_into('<2i', body, X + 0x34, len(areas), len(enemies))
for r in areas:
    body += r
for e in enemies:
    body += struct.pack('<8i', *e)
newA = len(body)
body += struct.pack('<i', len(spec['chests']))
for x, y, reward, kind in spec['chests']:
    check(x, y, 'forziere')
    body += struct.pack('<5i', x, y, reward, kind, uid)
    uid += 1
newB = len(body)
body += struct.pack('<i', len(spec['objects']))
for x, y, a, b in spec['objects']:
    check(x, y, 'oggetto')
    body += struct.pack('<4i', x, y, a, b)
newC = len(body)
if spec.get('c_point'):
    x, y = spec['c_point']
    check(x, y, 'punto della sezione C')
    struct.pack_into('<2i', c_section, 4, x, y)
body += c_section
struct.pack_into('<3i', body, 0x28, newA - 0x34, newB - 0x34, newC - 0x34)
open(sys.argv[4], 'wb').write(bytes(body))
print('%s: %d aree, %d nemici, %d forzieri, %d oggetti, %d byte'
      % (spec['room'], len(areas), len(enemies), len(spec['chests']), len(spec['objects']), len(body)))
