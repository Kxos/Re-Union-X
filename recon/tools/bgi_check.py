"""Indice BGI (record "/" di un .png) contro piu' file dati concatenati.

Verifica che ogni offset dell'indice punti a un header BGAD nella concatenazione
dei file dati (es. OBB main + patch), e conta le cartelle. IDX_KEY (esadecimale)
e' la chiave dello strato interno, se non e' quella dei pacchetti; IDX_DUMP
scrive l'elenco nome -> offset.

    python -I recon/tools/bgi_check.py recon/tools <lib 4.3.1> <indice.png> <dati1> [dati2 ...]
"""
import collections
import os
import struct
import sys

sys.path.insert(0, sys.argv[1])
import bgad

key = bgad.lib_key(sys.argv[2])
raw = open(sys.argv[3], 'rb').read()
h = bgad.parse(raw)
b = bytearray(bgad.decode(raw, h, key))
print('magic', bytes(b[:4]), 'flag', struct.unpack_from('<I', b, 8)[0])
if struct.unpack_from('<I', b, 8)[0] & 1:
    iv = struct.pack('<Q', struct.unpack_from('<Q', b, len(b) - 8)[0] ^ bgad.INDEX_IV_XOR)
    ikey = bytes.fromhex(os.environ['IDX_KEY']) if os.environ.get('IDX_KEY') else key
    b[0xc:len(b) - 8] = bgad.stream_xor(bytes(b[0xc:len(b) - 8]), ikey, iv, bgad._chacha_block, 8)
n_rec, n_names = struct.unpack_from('<II', b, 0xc)
print('record %d, nomi %d' % (n_rec, n_names))
if n_rec > 10_000_000:
    sys.exit('indice non leggibile con questa chiave')
p_off = 0x14
p_idx = p_off + n_rec * 8
p_name = p_idx + n_names * 4
pool = p_name + n_names * 4
offs = [struct.unpack_from('<Q', b, p_off + i * 8)[0] for i in range(n_rec)]
names = []
for i in range(n_names):
    rec = struct.unpack_from('<I', b, p_idx + i * 4)[0]
    no = struct.unpack_from('<I', b, p_name + i * 4)[0]
    names.append((bytes(b[pool + no:b.index(0, pool + no)]).decode('utf-8', 'replace'), offs[rec]))
files = sys.argv[4:]
sizes = [os.path.getsize(f) for f in files]
total = sum(sizes)
fhs = [open(f, 'rb') for f in files]


def read_at(off, n):
    for fh, sz in zip(fhs, sizes):
        if off < sz:
            fh.seek(off)
            return fh.read(n)
        off -= sz
    return b''


ok = bad = beyond = 0
for o in offs:
    if o >= total:
        beyond += 1
    elif read_at(o, 4) == b'BGAD':
        ok += 1
    else:
        bad += 1
print('offset BGAD %d, non BGAD %d, oltre la fine %d; dati totali %d, offset massimo %d' % (ok, bad, beyond, total, max(offs)))
dirs = collections.Counter(n.split('/')[0] for n, _ in names)
print('cartelle:', dirs.most_common(12))
for w in ('cocostudio/publish/AvatarEditAnim.ExportJson', 'info/obb/main'):
    print(w, any(n == w for n, _ in names))
out = os.environ.get('IDX_DUMP')
if out:
    with open(out, 'w', encoding='utf-8') as fh:
        for n, o in names:
            fh.write('%s\t%d\n' % (n, o))
