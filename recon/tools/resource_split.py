"""Concatena i file dati e li spezza in pezzi di dimensione fissa.

Serve a servire gli OBB come risorse: il downloader del client tiene in memoria
ogni file intero, ma l'installatore concatena i "data" nell'ordine dato, quindi
pezzi da 64 MB danno lo stesso r/misc.mp4 senza file da gigabyte.

    python -I recon/tools/resource_split.py <cartella_uscita> <MB> <file1> [file2 ...]
"""
import os
import sys

out, mb, files = sys.argv[1], int(sys.argv[2]), sys.argv[3:]
os.makedirs(out, exist_ok=True)
piece = mb * 1024 * 1024
idx = 0
cur = None
written = 0
total = 0
for f in files:
    with open(f, 'rb') as src:
        while True:
            if cur is None:
                cur = open(os.path.join(out, 'd%04d' % idx), 'wb')
                written = 0
            buf = src.read(min(8 * 1024 * 1024, piece - written))
            if not buf:
                break
            cur.write(buf)
            written += len(buf)
            total += len(buf)
            if written == piece:
                cur.close()
                cur = None
                idx += 1
if cur is not None:
    cur.close()
    idx += 1
print('%d pezzi, %d byte' % (idx, total))
