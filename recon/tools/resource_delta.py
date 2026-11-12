"""Pacchetto delle differenze per una versione incrementale delle risorse (mode 2, docs/notes/server.md#resource-mode2).

Una versione N+1 incrementale e' «N invariata + un pacchetto in coda»: il gioco che ha N scarica solo il pacchetto e
l'indice di N+1. Questo script confronta la versione N (il suo indice unito misc.png e i dati della sua catena, in
ordine) con la build nuova completa (indice unito di tutti i pacchetti, come resource_merge.py lo farebbe per una
versione completa, e i dati dei pacchetti in ordine) e scrive in <uscita.png>/<uscita.mp4> un pacchetto (indice BGI v3
senza strato interno, come resource_pack.py) con i soli record che il gioco leggerebbe diversi: nomi nuovi e nomi il
cui record (header, nome offuscato e dati: i byte da cui bg::FileManager ricava il file) non e' identico. I record si
copiano byte per byte (nome offuscato e cifratura non dipendono dalla posizione, resource_compact.py); piu' nomi sullo
stesso record (alias) restano su un solo record.
Un record si confronta per contenuto: resource_pack.py cifra con un nonce casuale, quindi un file invariato del
pacchetto generato ha byte diversi a ogni build. Byte uguali = invariato; altrimenti si decifrano i due record e conta il
contenuto in chiaro (in cache: sha1 dei byte -> sha1 del contenuto, khux_bgi_cache/plain.pkl nella cartella temporanea,
cosi' la versione dopo non ridecifra i record di questa). Un record che non si decifra conta come cambiato.
Poi build-resources.ps1 -Append unisce con resource_merge.py --last-wins l'indice di N, i dati della catena e questo
pacchetto: gli offset di N non cambiano e «size» = dati di N + pacchetto.
I nomi che la build nuova non ha piu' restano nell'indice (record di N): li toglie solo una base completa nuova.
Il riempimento «zz_pad/...» non conta.

    python -I recon/tools/resource_delta.py <recon/tools> <lib 4.3.1> <chiave hex> <uscita.png> <uscita.mp4>
        <indice N.png> <dati N>[,...] <indice completo.png> <dati completi>[,...]
Codice 2 (e nessun file) se non cambia niente.

    python -I recon/tools/resource_delta.py check <recon/tools> <lib 4.3.1> <chiave hex>
        <indice N+1.png> <dati della catena>[,...] <indice completo.png> <dati completi>[,...]
Verifica: ogni nome della build completa ha in N+1 gli stessi byte. Codice 1 alla prima differenza.
"""
import hashlib
import os
import pickle
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bgad                                                  # noqa: E402
from resource_compact import Concat, compact, index_bytes, read_bgi   # noqa: E402,F401

PAD = b'zz_pad/'


CACHE = os.path.join(tempfile.gettempdir(), 'khux_bgi_cache', 'plain.pkl')


class Pack:
    """(indice, [dati]): {nome: (sha1 dei byte del record, offset)} senza il riempimento, e il contenuto in chiaro"""

    def __init__(self, pack, lib, skey):
        index, self.datas = pack
        self.skey = skey
        offs, names = read_bgi(index, lib, skey)
        self.data = Concat(self.datas)
        hashes = {}
        for off in sorted({offs[r] for n, r in names if not n.startswith(PAD)}):
            h = bgad.parse(self.data.read(off, bgad.HDR.size))
            hashes[off] = hashlib.sha1(self.data.read(off, h['end'])).digest()
        self.names = {n: (hashes[offs[r]], offs[r]) for n, r in names if not n.startswith(PAD)}

    def plain(self, name, cache):
        """sha1 del contenuto in chiaro del record di name (None se non si decifra)"""
        raw, off = self.names[name]
        if raw not in cache:
            h = bgad.parse(self.data.read(off, bgad.HDR.size))
            try:
                cache[raw] = hashlib.sha1(bgad.decode(self.data.read(off, h['end']), h, self.skey)).digest()
            except Exception:                               # noqa: BLE001 - cifratura sconosciuta: conta come cambiato
                return None
        return cache[raw]

    def close(self):
        self.data.close()


def load_cache():
    try:
        with open(CACHE, 'rb') as fh:
            return pickle.load(fh)
    except (OSError, EOFError, pickle.UnpicklingError):
        return {}


def save_cache(cache):
    os.makedirs(os.path.dirname(CACHE), exist_ok=True)
    with open(CACHE + '.tmp', 'wb') as fh:
        pickle.dump(cache, fh)
    os.replace(CACHE + '.tmp', CACHE)


def differs(a, b, name, cache):
    """il gioco leggerebbe un contenuto diverso per name in a e in b"""
    if a.names[name][0] == b.names[name][0]:
        return False
    pa, pb = a.plain(name, cache), b.plain(name, cache)
    return pa is None or pb is None or pa != pb


def delta(prev, full, lib, skey, out_png, out_mp4):
    """scrive il pacchetto delle differenze (se ce ne sono); torna i conteggi"""
    old, new, cache = Pack(prev, lib, skey), Pack(full, lib, skey), load_cache()
    try:
        changed = [n for n in new.names if n in old.names and differs(old, new, n, cache)]
        added = [n for n in new.names if n not in old.names]
        removed = [n for n in old.names if n not in new.names]
        save_cache(cache)
        names = sorted(changed + added)
        stats = {'changed': len(changed), 'new': len(added), 'removed': len(removed), 'records': 0}
        if not names:
            return stats
        # compact() vuole offset dei record e nomi con l'indice del record: un record per offset distinto
        live = sorted({new.names[n][1] for n in names})
        at = {off: i for i, off in enumerate(live)}
        new_offs, new_names = compact(live, [(n, at[new.names[n][1]]) for n in names], new.data, out_mp4 + '.tmp')
    finally:
        old.close()
        new.close()
    with open(out_png + '.tmp', 'wb') as fh:
        fh.write(index_bytes(new_offs, new_names))
    os.replace(out_mp4 + '.tmp', out_mp4)
    os.replace(out_png + '.tmp', out_png)
    stats['records'] = len(new_offs)
    return stats


def check(result, full, lib, skey):
    """differenze fra la versione risultante e la build completa: nomi mancanti o con byte diversi"""
    got, want, cache = Pack(result, lib, skey), Pack(full, lib, skey), load_cache()
    out = []
    try:
        for n in want.names:
            if n not in got.names:
                out.append('nome mancante: %s' % n.decode('utf-8', 'replace'))
            elif differs(got, want, n, cache):
                out.append('record diverso: %s' % n.decode('utf-8', 'replace'))
        save_cache(cache)
    finally:
        got.close()
        want.close()
    return out


def main(argv):
    mode = 'delta'
    if argv[0] == 'check':
        mode, argv = 'check', argv[1:]
    sys.path.insert(0, argv[0])
    lib = bgad.lib_key(argv[1])
    skey = bytes.fromhex(argv[2])
    if mode == 'check':
        diff = check((argv[3], argv[4].split(',')), (argv[5], argv[6].split(',')), lib, skey)
        for d in diff[:20]:
            print(d)
        if diff:
            print('%d differenze' % len(diff))
            sys.exit(1)
        print('identici: ogni nome della build completa ha gli stessi byte nella versione incrementale')
        return
    out_png, out_mp4 = argv[3], argv[4]
    st = delta((argv[5], argv[6].split(',')), (argv[7], argv[8].split(',')), lib, skey, out_png, out_mp4)
    print('nomi cambiati %d, nuovi %d, tolti %d (restano nell\'indice fino a una base completa nuova)' % (
        st['changed'], st['new'], st['removed']))
    if not st['records']:
        print('niente di cambiato rispetto alla versione precedente: nessun pacchetto')
        sys.exit(2)
    print('%s: %d record, %d byte' % (out_mp4, st['records'], os.path.getsize(out_mp4)))


if __name__ == '__main__':
    main(sys.argv[1:])
