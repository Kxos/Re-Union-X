"""Genera una parte di mappa (stage/mappoi_stg<id>_NN.bin, formato MAP) da un modello
della stessa stanza, con altri nemici e forzieri.

    python -I recon/tools/mappoi_gen.py <modello.bin> <spec.json> <uscita.bin>

Formato (parser del client ricavato sulle mappe 1010-1030):
    +0x00 'MAP\\0', u32 versione (16), ... nome della stanza (es. 'DW_0001_00_00')
    +0x24 u32 X (inizio del blocco dati: 4 o 40)
    +0x28 u32 A, +0x2c B, +0x30 C posizioni delle sezioni dopo i nemici, meno 0x34
    X+0x34 u32 numero di aree, X+0x38 u32 numero di nemici
    X+0x3c aree da 0x44 byte: [0] primo nemico, [1] quanti, poi dati della zona
           (l'area 0 del modello 1030 e' l'arena del bersaglio, con il poligono)
    poi i nemici da 0x20 byte: x, y, enemyId, 1, 1, 1, reward, uid
    A+0x34 forzieri: u32 n, n x (x, y, reward, tipo, uid)
    B+0x34 oggetti: u32 n, n x 4 interi C+0x34 altra sezione, poi zeri
Il modello da' aree, oggetti e coda; la spec:
    {"areas": [[[enemyId, count], ...], ...], un elenco per area del modello
     "chests": [[reward, tipo], ...], alle posizioni dei forzieri del modello
     "dropReward": 1} riga reward dei nemici (1 = predefinita)
Le posizioni dei nemici di ogni area sono quelle del modello per la stessa area (se ne
servono di piu', si ripetono spostate di 40 unita'). Gli uid: nemici da 2, poi forzieri.
"""
import json
import struct
import sys

src = open(sys.argv[1], 'rb').read()
spec = json.load(open(sys.argv[2], encoding='utf-8'))
u32 = lambda b, o: struct.unpack_from('<i', b, o)[0]  # noqa: E731

assert src[:4] == b'MAP\0', 'il modello non e\' un file MAP'
X = u32(src, 0x24)
A, B, C = (u32(src, 0x28 + 4 * i) + 0x34 for i in range(3))
na, ne = u32(src, X + 0x34), u32(src, X + 0x38)
a0 = X + 0x3c
e0 = a0 + na * 0x44
assert e0 + ne * 0x20 == A, 'sezioni del modello inattese (%d != %d)' % (e0 + ne * 0x20, A)
areas = [bytearray(src[a0 + k * 0x44:a0 + (k + 1) * 0x44]) for k in range(na)]
enemies = [struct.unpack_from('<8i', src, e0 + k * 0x20) for k in range(ne)]
nchest = u32(src, A)
chests = [struct.unpack_from('<5i', src, A + 4 + 20 * k) for k in range(nchest)]
objects_and_tail = src[B:]                    # oggetti, sezione C e zeri finali: invariati

groups = spec['areas']
if len(groups) > na:
    sys.exit('la spec ha %d aree, il modello %d' % (len(groups), na))
drop = spec.get('dropReward', 1)
out_areas, out_enemies, uid = [], [], 2
for k in range(na):
    area = areas[k]
    first, count = struct.unpack_from('<2i', area, 0)
    pos = [(e[0], e[1]) for e in enemies[first:first + count]] or [(e[0], e[1]) for e in enemies[:1]]
    wanted = [eid for eid, n in (groups[k] if k < len(groups) else []) for _ in range(n)]
    struct.pack_into('<2i', area, 0, len(out_enemies), len(wanted))
    for i, eid in enumerate(wanted):
        x, y = pos[i % len(pos)]
        shift = 40 * (i // len(pos))
        out_enemies.append((x + shift, y + shift, eid, 1, 1, 1, drop, uid))
        uid += 1
    out_areas.append(bytes(area))

want_chests = spec.get('chests', [])
if len(want_chests) > nchest:
    sys.exit('la spec ha %d forzieri, il modello %d posizioni' % (len(want_chests), nchest))
out_chests = []
for i, (reward, kind) in enumerate(want_chests):
    x, y = chests[i][0], chests[i][1]
    out_chests.append((x, y, reward, kind, uid))
    uid += 1

body = bytearray(src[:a0])
struct.pack_into('<2i', body, X + 0x34, len(out_areas), len(out_enemies))
for a in out_areas:
    body += a
for e in out_enemies:
    body += struct.pack('<8i', *e)
newA = len(body)
body += struct.pack('<i', len(out_chests))
for c in out_chests:
    body += struct.pack('<5i', *c)
newB = len(body)
body += objects_and_tail
shift = newB - B
struct.pack_into('<3i', body, 0x28, newA - 0x34, newB - 0x34, C + shift - 0x34)
open(sys.argv[3], 'wb').write(body)
print('%s: %d aree, %d nemici, %d forzieri, %d byte' % (
    sys.argv[3], len(out_areas), len(out_enemies), len(out_chests), len(body)))
