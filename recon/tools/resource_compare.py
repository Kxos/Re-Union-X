"""Confronta due risorse unite (indice misc.png + dati): stessi nomi, stessi byte per ogni nome (I-171).

Serve a verificare resource_compact.py: per ogni nome dell'indice A il record che il client leggerebbe
(header, nome offuscato e dati, cioe' i byte da cui bg::FileManager ricava il file) deve essere identico
a quello che cita lo stesso nome nell'indice B. Il nome di riempimento «zz_pad/...» (record 0, mai
cercato) non conta. Esce con codice 1 alla prima differenza di nomi o con record diversi.

    python -I recon/tools/resource_compare.py <recon/tools> <lib 4.3.1> <chiave hex>
        <indiceA.png> <datiA1>[,<datiA2>...]|<cartella> <indiceB.png> <datiB1>[,...]|<cartella>

Con una cartella i dati sono i suoi file in ordine di nome (come li serve il server: resource_data\\<N>\\data).
"""
import hashlib
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bgad                                         # noqa: E402
from resource_compact import Concat, read_bgi      # noqa: E402

PAD = b'zz_pad/'


def data_files(arg):
    if os.path.isdir(arg):
        return [os.path.join(arg, f) for f in sorted(os.listdir(arg)) if os.path.getsize(os.path.join(arg, f))]
    return arg.split(',')


def record_hashes(index, datas, lib, skey):
    """[(nome, sha1 del record)] nell'ordine dell'indice, e i byte dei dati."""
    offs, names = read_bgi(index, lib, skey)
    names = [(n, offs[r]) for n, r in names if not n.startswith(PAD)]
    data = Concat(datas)
    hashes = {}
    for off in sorted({o for _, o in names}):
        h = bgad.parse(data.read(off, bgad.HDR.size))
        hashes[off] = hashlib.sha1(data.read(off, h['end'])).digest()
    size = data.size
    data.close()
    return [(n, hashes[o]) for n, o in names], len(hashes), size


def compare(a, b):
    """Elenco delle differenze fra due elenchi [(nome, hash)]."""
    if [n for n, _ in a] != [n for n, _ in b]:
        sa, sb = {n for n, _ in a}, {n for n, _ in b}
        return ['nomi diversi: %d solo in A, %d solo in B, ordine %s' % (
            len(sa - sb), len(sb - sa), 'uguale' if sa == sb else '-')]
    return ['record diverso: %s' % n.decode('utf-8', 'replace') for (n, ha), (_, hb) in zip(a, b) if ha != hb]


def main(argv):
    sys.path.insert(0, argv[0])
    lib = bgad.lib_key(argv[1])
    skey = bytes.fromhex(argv[2])
    a, ra, za = record_hashes(argv[3], data_files(argv[4]), lib, skey)
    b, rb, zb = record_hashes(argv[5], data_files(argv[6]), lib, skey)
    diff = compare(a, b)
    print('A: %d nomi, %d record, dati %d byte; B: %d nomi, %d record, dati %d byte (%+d)' % (
        len(a), ra, za, len(b), rb, zb, zb - za))
    for d in diff[:20]:
        print(d)
    if diff:
        print('%d differenze' % len(diff))
        sys.exit(1)
    print('identici: ogni nome ha gli stessi byte in A e in B')


if __name__ == '__main__':
    main(sys.argv[1:])
