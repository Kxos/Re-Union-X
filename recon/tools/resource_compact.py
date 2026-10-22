"""Compatta i pacchetti BGAD prima di resource_merge.py: solo i record che l'indice unito puo' citare (I-171).

resource_merge.py concatena i dati dei pacchetti cosi' come sono: i record che perdono a parita' di
nome (vince il primo pacchetto, l'ultimo con --last-wins) e quelli che nessun nome cita restano nei dati
senza mai essere letti. Nella versione 47 erano ~90 MB (addnl 55,8, OBB main 19,8, patch 10,3, medaglie
4,9). Questo script riscrive i pacchetti scelti tenendo solo i record vivi, copiati byte per byte (il
nome offuscato e la cifratura di un record non dipendono dalla sua posizione), e un indice nuovo con gli
offset rifatti; poi resource_merge.py li unisce come prima.

Un record del pacchetto P e' vivo se lo cita un nome di P che nessun pacchetto prima di P ha gia' (la
stessa regola di resource_merge.py). Restano anche i record citati da nomi che l'ultimo pacchetto (il
generato, --last-wins) sostituisce: cosi' il risultato non dipende dal pacchetto generato, e un -Quick
che smette di sostituire un nome ritrova l'originale. L'ultimo pacchetto non si compatta mai.
L'indice unito che ne esce ha gli stessi nomi, nello stesso ordine, e per ogni nome gli stessi byte del
record (resource_compare.py lo verifica).

    python -I recon/tools/resource_compact.py [--compact <etichetta>]... <recon/tools> <lib 4.3.1> <chiave hex>
        <cartella di uscita> <etichetta1> <indice1.png> <dati1a>[,<dati1b>...] [<etichetta2> <indice2.png> <dati2> ...]

Per ogni etichetta in --compact scrive <uscita>/<etichetta>.mp4 (dati) e .png (indice BGI v3 senza strato
interno, come resource_pack.py); <etichetta>.png.src e' l'impronta degli ingressi (pacchetto e quelli
prima): se non cambia il pacchetto non si rifa'. Stampa per ciascuno record e byte prima e dopo.
"""
import hashlib
import os
import struct
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bgad                                   # noqa: E402
from resource_index import obfuscate_name    # noqa: E402

STAMP_VER = b'compact-1'


def read_bgi(path, lib, skey):
    """(offset dei record, [(nome, indice del record)]) dall'indice .png di un pacchetto."""
    raw = open(path, 'rb').read()
    b = bytearray(bgad.decode(raw, bgad.parse(raw), lib))
    assert b[:4] == b'\x89BGI', path
    if struct.unpack_from('<I', b, 8)[0] & 1:
        iv = struct.pack('<Q', struct.unpack_from('<Q', b, len(b) - 8)[0] ^ bgad.INDEX_IV_XOR)
        b[0xc:len(b) - 8] = bgad.chacha_xor(bytes(b[0xc:len(b) - 8]), skey, iv)
    n_rec, n_names = struct.unpack_from('<II', b, 0xc)
    offs = struct.unpack_from('<%dQ' % n_rec, b, 0x14)
    p_idx = 0x14 + n_rec * 8
    recs = struct.unpack_from('<%dI' % n_names, b, p_idx)
    nos = struct.unpack_from('<%dI' % n_names, b, p_idx + n_names * 4)
    pool = p_idx + n_names * 8
    names = [bytes(b[pool + no:b.index(0, pool + no)]) for no in nos]
    return offs, list(zip(names, recs))


def index_bytes(offsets, names):
    """Indice BGI v3 senza strato interno in un record "/" non cifrato (lo stesso di resource_pack.py)."""
    pool, name_offs = bytearray(), []
    for name, _ in names:
        name_offs.append(len(pool))
        pool += name + b'\0'
    bgi = (b'\x89BGI' + struct.pack('<IIII', 3, 0, len(offsets), len(names))
           + struct.pack('<%dQ' % len(offsets), *offsets)
           + struct.pack('<%dI' % len(names), *(r for _, r in names))
           + struct.pack('<%dI' % len(names), *name_offs) + bytes(pool) + b'\0' * 8)
    hdr = bgad.HDR.pack(b'BGAD', 2, 0, bgad.HDR.size, 1, 0, 0, len(bgi), len(bgi))
    return hdr + obfuscate_name(b'/', len(bgi)) + bgi


class Concat:
    """I file dati di un pacchetto letti come un solo flusso (es. OBB main + patch)."""

    def __init__(self, paths):
        self.parts, pos = [], 0
        for p in paths:
            size = os.path.getsize(p)
            self.parts.append((pos, size, open(p, 'rb')))
            pos += size
        self.size = pos

    def read(self, off, n):
        out = bytearray()
        for start, size, fh in self.parts:
            if n and start <= off < start + size:
                fh.seek(off - start)
                buf = fh.read(min(n, start + size - off))
                out += buf
                off += len(buf)
                n -= len(buf)
        if n:
            raise ValueError('lettura oltre la fine dei dati a %d' % off)
        return bytes(out)

    def close(self):
        for _, _, fh in self.parts:
            fh.close()


def live_names(packs_names, last_wins=True):
    """Per ogni pacchetto i nomi che restano suoi nell'indice unito (primo che arriva vince; i nomi che
    l'ultimo pacchetto sostituisce con last_wins contano anche per il pacchetto che li aveva)."""
    seen, out = set(), []
    for k, names in enumerate(packs_names):
        last = last_wins and k == len(packs_names) - 1
        keep, mine = [], set()
        for name, rec in names:
            if name in mine or (name in seen and not last):
                continue
            mine.add(name)
            keep.append((name, rec))
        seen |= mine
        out.append(keep)
    return out


def compact(offs, names, data, out_data):
    """Scrive in out_data i soli record citati da names; torna (offset nuovi, nomi con gli indici nuovi)."""
    live = sorted({offs[r] for _, r in names})
    spans, new_at, pos, prev_end = [], {}, 0, -1
    for off in live:
        if off < prev_end:
            raise ValueError('record sovrapposti a %d' % off)
        h = bgad.parse(data.read(off, bgad.HDR.size))
        end = off + h['end']
        new_at[off] = pos
        pos += end - off
        if spans and spans[-1][1] == off:
            spans[-1][1] = end                  # record contigui: una sola copia
        else:
            spans.append([off, end])
        prev_end = end
    with open(out_data, 'wb') as fh:
        for a, b in spans:
            while a < b:
                n = min(b - a, 1 << 24)
                fh.write(data.read(a, n))
                a += n
    order = {off: i for i, off in enumerate(live)}
    return [new_at[off] for off in live], [(name, order[offs[r]]) for name, r in names]


def stamp(packs, upto):
    h = hashlib.sha1(STAMP_VER)
    for label, index, datas in packs[:upto + 1]:
        for p in [index] + datas:
            st = os.stat(p)
            h.update(('%s|%s|%d|%d\n' % (label, os.path.abspath(p), st.st_size, st.st_mtime_ns)).encode())
    return h.hexdigest()


def main(argv):
    only = []
    while argv[0] == '--compact':
        only.append(argv[1])
        argv = argv[2:]
    sys.path.insert(0, argv[0])
    lib = bgad.lib_key(argv[1])
    skey = bytes.fromhex(argv[2])
    outdir = argv[3]
    rest = argv[4:]
    packs = [(rest[i], rest[i + 1], rest[i + 2].split(',')) for i in range(0, len(rest), 3)]
    labels = [p[0] for p in packs]
    for label in only:
        if label not in labels:
            raise SystemExit('pacchetto %s non in elenco' % label)
        if label == labels[-1]:
            raise SystemExit("l'ultimo pacchetto (%s) non si compatta" % label)
    os.makedirs(outdir, exist_ok=True)
    todo = [i for i, lab in enumerate(labels) if lab in only]
    todo = [i for i in todo if not _fresh(outdir, packs, i)]
    if not todo:
        print('pacchetti compattati invariati: %s' % ', '.join(only))
        return
    bgis = [read_bgi(index, lib, skey) for _, index, _ in packs[:max(todo) + 1]]
    # l'ultimo pacchetto non e' fra questi (non si compatta): nessuno sostituisce i nomi dei precedenti
    keep = live_names([names for _, names in bgis], last_wins=False)
    for i in todo:
        label, _, datas = packs[i]
        offs, names = bgis[i]
        data = Concat(datas)
        mp4, png = os.path.join(outdir, label + '.mp4'), os.path.join(outdir, label + '.png')
        src = png + '.src'
        if os.path.exists(src):
            os.remove(src)
        new_offs, new_names = compact(offs, keep[i], data, mp4)
        with open(png, 'wb') as fh:
            fh.write(index_bytes(new_offs, new_names))
        before, after = data.size, os.path.getsize(mp4)
        data.close()
        with open(src, 'w') as fh:
            fh.write(stamp(packs, i))
        print('%s: record %d -> %d, nomi %d -> %d, dati %d -> %d byte (-%d)' % (
            label, len(set(offs)), len(new_offs), len(names), len(new_names), before, after, before - after))


def _fresh(outdir, packs, i):
    label = packs[i][0]
    png = os.path.join(outdir, label + '.png')
    src = png + '.src'
    return (os.path.exists(os.path.join(outdir, label + '.mp4')) and os.path.exists(png)
            and os.path.exists(src) and open(src).read() == stamp(packs, i))


if __name__ == '__main__':
    main(sys.argv[1:])
