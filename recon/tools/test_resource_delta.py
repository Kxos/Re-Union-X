"""Prova di resource_delta.py (risorse incrementali, mode 2) su pacchetti finti:
    python -I recon/tools/test_resource_delta.py
Con la libreria 4.3.1 in recon/ext/ww431 prova anche il giro completo con resource_merge.py (versione precedente +
pacchetto delle differenze = stessi byte per ogni nome della versione completa)."""
import hashlib
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import resource_compact as rc  # noqa: E402
import resource_delta as rd  # noqa: E402
from resource_index import record  # noqa: E402

KEY = bytes(range(32))


def write_pack(td, label, recs, names, split=None):
    """come test_resource_compact.py: recs = contenuti dei record, names = [(nome, indice del record)], split = record
    da cui comincia il secondo file dati"""
    # nome interno dal contenuto, non dalla posizione (come un file ripacchettato da una build all'altra)
    blobs = [record(b'r' + hashlib.md5(plain).hexdigest()[:8].encode(), plain, KEY) for plain in recs]
    offs, pos = [], 0
    for b in blobs:
        offs.append(pos)
        pos += len(b)
    cut = [0, split, len(blobs)] if split else [0, len(blobs)]
    datas = []
    for j in range(len(cut) - 1):
        p = os.path.join(td, '%s.d%d' % (label, j))
        with open(p, 'wb') as fh:
            fh.write(b''.join(blobs[cut[j]:cut[j + 1]]))
        datas.append(p)
    idx = os.path.join(td, label + '.png')
    with open(idx, 'wb') as fh:
        fh.write(rc.index_bytes(offs, names))
    return idx, datas


def served(packs):
    """{nome: contenuto in chiaro} come li risolve resource_merge.py --last-wins (primo vince, l'ultimo sostituisce)"""
    out = {}
    for k, (idx, datas) in enumerate(packs):
        offs, names = rc.read_bgi(idx, None, KEY)
        data = rc.Concat(datas)
        for name, r in names:
            if name in out and k != len(packs) - 1:
                continue
            h = rc.bgad.parse(data.read(offs[r], rc.bgad.HDR.size))
            out[name] = rc.bgad.decode(data.read(offs[r], h['end']), h, KEY)     # il contenuto, come lo legge il gioco
        data.close()
    return out

with tempfile.TemporaryDirectory() as td:
    # versione precedente: a, b (due nomi sullo stesso record: b e b2), c, x; zz_pad e' il riempimento (mai cercato)
    prev = write_pack(td, 'prev', [b'A' * 50, b'B' * 70, b'C' * 33, b'X' * 11, b'\0' * 9],
                      [(b'a', 0), (b'b', 1), (b'b2', 1), (b'c', 2), (b'x', 3), (b'zz_pad/xxxx', 4)], split=2)
    # build nuova completa: a uguale (in un altro punto dei dati), b cambiato (e il suo alias b2), c uguale,
    # e nuovo, x tolto
    full = write_pack(td, 'full', [b'C' * 33, b'A' * 50, b'B2' * 30, b'E' * 7],
                      [(b'a', 1), (b'b', 2), (b'b2', 2), (b'c', 0), (b'e', 3)])

    png, mp4 = os.path.join(td, 'delta.png'), os.path.join(td, 'delta.mp4')
    st = rd.delta(prev, full, None, KEY, png, mp4)
    assert st == {'changed': 2, 'new': 1, 'removed': 1, 'records': 2}, st
    offs, names = rc.read_bgi(png, None, KEY)
    assert sorted(n for n, _ in names) == [b'b', b'b2', b'e'], names
    assert len(offs) == 2                                    # b e b2: un solo record copiato
    assert os.path.getsize(mp4) < sum(os.path.getsize(p) for p in full[1])

    # versione precedente + differenze (l'ultimo vince, come resource_merge.py --last-wins) = build completa
    got = served([prev, (png, [mp4])])
    want = served([full])
    assert all(got[n] == want[n] for n in want), 'record diversi'
    assert got[b'x'] == served([prev])[b'x']                # il nome tolto resta (lo toglie una base completa nuova)
    assert rd.check((png, [mp4]), full, None, KEY) != []    # le sole differenze non bastano: mancano a e c
    assert rd.check(full, full, None, KEY) == []

    # niente di cambiato: nessun pacchetto
    same = write_pack(td, 'same', [b'A' * 50, b'B' * 70, b'C' * 33, b'X' * 11],
                      [(b'a', 0), (b'b', 1), (b'b2', 1), (b'c', 2), (b'x', 3)])
    os.remove(png)
    assert rd.delta(prev, same, None, KEY, png, mp4)['records'] == 0
    assert not os.path.exists(png)

    lib = os.path.join(HERE, '..', 'ext', 'ww431', 'libcocos2dcpp.so')
    if os.path.exists(lib):
        def run(*args, ok=True):
            r = subprocess.run([sys.executable, '-I'] + [str(x) for x in args], capture_output=True, text=True)
            assert (r.returncode == 0) == ok, r.stdout + r.stderr
            return r.stdout
        m, d = os.path.join(HERE, 'resource_merge.py'), os.path.join(HERE, 'resource_delta.py')
        # versione N completa (indice unito, con riempimento) e build nuova completa, come build-resources.ps1
        v1 = os.path.join(td, 'v1.png')
        run(m, '--last-wins', '--filler', 64, HERE, lib, KEY.hex(), v1, prev[0], ','.join(prev[1]))
        fullx = os.path.join(td, 'fullx.png')
        run(m, '--last-wins', HERE, lib, KEY.hex(), fullx, full[0], ','.join(full[1]))
        out = run(d, HERE, lib, KEY.hex(), png, mp4, v1, ','.join(prev[1]), fullx, ','.join(full[1]))
        assert 'cambiati 2, nuovi 1, tolti 1' in out, out
        # versione N+1: indice di N + differenze in coda; offset di N invariati, size = dati di N + differenze
        v2 = os.path.join(td, 'v2.png')
        run(m, '--last-wins', HERE, lib, KEY.hex(), v2, v1, ','.join(prev[1]), png, mp4)
        chain = ','.join(prev[1] + [mp4])
        assert 'identici' in run(d, 'check', HERE, lib, KEY.hex(), v2, chain, fullx, ','.join(full[1]))
        # un byte cambiato nel pacchetto delle differenze si vede
        raw = bytearray(open(mp4, 'rb').read())
        raw[-1] ^= 1
        open(mp4, 'wb').write(bytes(raw))
        assert 'record diverso' in run(d, 'check', HERE, lib, KEY.hex(), v2, chain, fullx, ','.join(full[1]), ok=False)
        # niente di cambiato: codice 2, nessun file
        os.remove(png)
        run(d, HERE, lib, KEY.hex(), png, mp4, v1, ','.join(prev[1]), v1, ','.join(prev[1]), ok=False)
        assert not os.path.exists(png)
        print('resource_delta: ok (con resource_merge.py)')
    else:
        print('resource_delta: ok (senza la libreria: niente giro con resource_merge.py)')
