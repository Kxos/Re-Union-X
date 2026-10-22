"""Estrae in blocco i file delle risorse servite i cui nomi iniziano con dei prefissi.

    python -I recon/tools/res_bulk.py <nomi.tsv> <resource_data\\N\\data> <uscita> <prefisso> [...]

Come res_get.py (indice nome<TAB>offset, es. names_v4.tsv, offset sulla concatenazione dei
pezzi d0000..), ma in un solo processo: per migliaia di file (catalogo delle texture).
Chiave dei record cifrati: BGAD_KEY (esadecimale, la chiave 5.0.1), come bgad_extract.py.
I file gia' presenti in <uscita> si saltano.
"""
import bisect
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bgad  # noqa: E402

tsv, datadir, out = sys.argv[1:4]
prefixes = tuple(sys.argv[4:])
key = bytes.fromhex(os.environ['BGAD_KEY'])
pieces = [os.path.join(datadir, f) for f in sorted(os.listdir(datadir))]
starts, total = [], 0
for p in pieces:
    starts.append(total)
    total += os.path.getsize(p)
handles = {}

todo = []
with open(tsv, encoding='utf-8') as fh:
    next(fh)
    for line in fh:
        name, off = line.rstrip('\n').split('\t')
        if name.startswith(prefixes):
            todo.append((int(off), name))
todo.sort()
n = skipped = failed = 0
for off, name in todo:
    dst = os.path.join(out, *name.split('/'))
    if os.path.exists(dst):
        skipped += 1
        continue
    i = bisect.bisect_right(starts, off) - 1
    fh = handles.get(i) or handles.setdefault(i, open(pieces[i], 'rb'))
    try:
        fh.seek(off - starts[i])
        h = bgad.parse(fh.read(bgad.HDR.size))
        fh.seek(off - starts[i])
        buf = fh.read(h['hsize'] + h['nlen'] + h['size'])
        data = bgad.decode(buf, bgad.parse(buf), key)
    except Exception as e:                  # record a cavallo di due pezzi o illeggibile
        failed += 1
        print('errore', name, e)
        continue
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    with open(dst, 'wb') as o:
        o.write(data)
    n += 1
print('estratti %d, gia\' presenti %d, errori %d (di %d)' % (n, skipped, failed, len(todo)))
