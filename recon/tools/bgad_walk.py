"""Percorre la catena di record BGAD dei file dati concatenati (es. OBB main + patch)
e la confronta con gli offset di un elenco IDX_DUMP (nome<TAB>offset) di bgi_check.py:
quanti record ci sono, quanti l'indice ne nomina, quanti restano senza nome.
Con un terzo argomento scrive gli offset dei record senza nome.

    python -I recon/tools/bgad_walk.py <nomi.tsv> <senza_nome.txt|-> <dati1> [dati2 ...]
"""
import struct
import sys

HDR = struct.Struct('<4sHHHHHHII')
named = set()
with open(sys.argv[1], encoding='utf-8') as fh:
    for line in fh:
        p = line.rstrip('\n').split('\t')
        if len(p) == 2:
            named.add(int(p[1]))
records, base, unnamed = 0, 0, []
for path in sys.argv[3:]:
    with open(path, 'rb') as fh:
        fh.seek(0, 2)
        size = fh.tell()
        off = 0
        while off + HDR.size <= size:
            fh.seek(off)
            magic, ver, flags, hsize, nlen, enc, comp, dsize, raw = HDR.unpack(fh.read(HDR.size))
            if magic != b'BGAD':
                print('catena interrotta in', path, hex(off))
                break
            records += 1
            if base + off not in named:
                unnamed.append((base + off, dsize, raw))
            off += hsize + nlen + dsize
    base += size
print('record', records, 'nominati', records - len(unnamed), 'senza nome', len(unnamed),
      'offset nominati distinti', len(named))
if sys.argv[2] != '-':
    with open(sys.argv[2], 'w') as fh:
        for o, d, r in unnamed:
            fh.write('%d\t%d\t%d\n' % (o, d, r))
