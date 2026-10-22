"""Estrae file dalle risorse servite per nome (indice nome<TAB>offset, es. names_v4.tsv).

    python -I recon/tools/res_get.py <nomi.tsv> <cartella dati> <uscita> <nome> [nome ...]

<cartella dati> = resource_data\<N>\data (pezzi d0000.. concatenati nell'ordine);
i file escono in <uscita>/<nome> con le sottocartelle. Usa bgad_extract.py.
"""
import os
import subprocess
import sys

here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, here)
import private_tools  # noqa: E402  (bgad_extract.py is kept outside the public repository)
tsv, datadir, out = sys.argv[1:4]
want = set(sys.argv[4:])
offs = {}
with open(tsv, encoding='utf-8') as fh:
    next(fh)
    for line in fh:
        n, o = line.rstrip('\n').split('\t')
        if n in want:
            offs[n] = o
data = [os.path.join(datadir, f) for f in sorted(os.listdir(datadir))]
lib = os.path.join(here, '..', 'ext', 'ww431', 'libcocos2dcpp.so')
for n in sorted(want):
    if n not in offs:
        print('assente:', n)
        continue
    dst = os.path.join(out, *n.split('/'))
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    subprocess.run([sys.executable, '-I', private_tools.path('bgad_extract.py'), here, lib, offs[n], dst] + data,
                   check=True, stdout=subprocess.DEVNULL)
    print(n, os.path.getsize(dst))
