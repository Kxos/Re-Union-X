"""Prova di resource_compact.py e resource_compare.py su pacchetti finti (I-171):
    python -I recon/tools/test_resource_compact.py
Con la libreria 4.3.1 in recon/ext/ww431 prova anche il giro completo con resource_merge.py."""
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import resource_compact as rc  # noqa: E402
import resource_compare as cmp_  # noqa: E402
from resource_index import record  # noqa: E402

KEY = bytes(range(32))


def write_pack(td, label, recs, names, split=None):
    """recs: contenuti dei record in ordine; names: [(nome, indice del record)]. split: indice del record
    da cui comincia il secondo file dati (come OBB main + patch)."""
    blobs = [record(b'r%d' % i, plain, KEY) for i, plain in enumerate(recs)]
    offs, pos = [], 0
    for b in blobs:
        offs.append(pos)
        pos += len(b)
    datas = []
    cut = [0, split, len(blobs)] if split else [0, len(blobs)]
    for j in range(len(cut) - 1):
        p = os.path.join(td, '%s.d%d' % (label, j))
        with open(p, 'wb') as fh:
            fh.write(b''.join(blobs[cut[j]:cut[j + 1]]))
        datas.append(p)
    idx = os.path.join(td, label + '.png')
    with open(idx, 'wb') as fh:
        fh.write(rc.index_bytes(offs, names))
    return idx, datas


def served(packs, last_wins=True):
    """{nome: byte del record} come li risolve resource_merge.py (primo vince, l'ultimo sostituisce)."""
    out = {}
    for k, (idx, datas) in enumerate(packs):
        offs, names = rc.read_bgi(idx, None, KEY)
        data = rc.Concat(datas)
        for name, r in names:
            if name in out and not (last_wins and k == len(packs) - 1):
                continue
            h = rc.bgad.parse(data.read(offs[r], rc.bgad.HDR.size))
            out[name] = data.read(offs[r], h['end'])
        data.close()
    return out


with tempfile.TemporaryDirectory() as td:
    # obb: due file dati; r1 non citato; r2 con due nomi; r3 'x'
    obb = write_pack(td, 'obb', [b'A' * 50, b'morto' * 9, b'B' * 70, b'X' * 11],
                     [(b'a', 0), (b'b', 2), (b'b2', 2), (b'x', 3)], split=2)
    # addnl: 'a' e 'x' perdono contro l'obb; 'd' lo sostituisce il generato (resta); r3 non citato
    addnl = write_pack(td, 'addnl', [b'a2' * 40, b'C' * 33, b'x2' * 5, b'morto2' * 50, b'D' * 21],
                       [(b'a', 0), (b'c', 1), (b'x', 2), (b'd', 4), (b'c', 3)])
    gen = write_pack(td, 'gen', [b'D2' * 8, b'E' * 3], [(b'd', 0), (b'e', 1)])

    keep = rc.live_names([rc.read_bgi(p[0], None, KEY)[1] for p in (obb, addnl, gen)])
    assert keep[0] == [(b'a', 0), (b'b', 2), (b'b2', 2), (b'x', 3)], keep[0]
    assert keep[1] == [(b'c', 1), (b'd', 4)], keep[1]       # il secondo 'c' (record 3) e' un doppione
    assert keep[2] == [(b'd', 0), (b'e', 1)], keep[2]

    out = os.path.join(td, 'out')
    os.makedirs(out)
    packs = [obb, addnl]
    compacted = []
    for i, (idx, datas) in enumerate(packs):
        offs, _ = rc.read_bgi(idx, None, KEY)
        data = rc.Concat(datas)
        mp4 = os.path.join(out, 'p%d.mp4' % i)
        new_offs, new_names = rc.compact(offs, keep[i], data, mp4)
        before = data.size
        data.close()
        png = os.path.join(out, 'p%d.png' % i)
        with open(png, 'wb') as fh:
            fh.write(rc.index_bytes(new_offs, new_names))
        assert os.path.getsize(mp4) < before
        compacted.append((png, [mp4]))
    # obb: tolto solo r1; addnl: restano r1 e r4 (contigui no: r2, r3 in mezzo)
    assert len(rc.read_bgi(compacted[0][0], None, KEY)[0]) == 3
    assert len(rc.read_bgi(compacted[1][0], None, KEY)[0]) == 2
    a = served([obb, addnl, gen])
    b = served(compacted + [gen])
    assert a == b, sorted(set(a.items()) ^ set(b.items()))
    assert a[b'd'] == served([gen])[b'd']                   # vince il generato
    # senza il generato 'd' torna quello dell'addnl, anche compattato
    assert served([obb, addnl], False) == served(compacted, False)

    # compare(): differenze di nomi e di record
    assert cmp_.compare([(b'a', b'1')], [(b'a', b'1')]) == []
    assert cmp_.compare([(b'a', b'1')], [(b'a', b'2')]) == ['record diverso: a']
    assert cmp_.compare([(b'a', b'1')], [(b'b', b'1')])[0].startswith('nomi diversi')

    lib = os.path.join(HERE, '..', 'ext', 'ww431', 'libcocos2dcpp.so')
    if os.path.exists(lib):
        tools = HERE

        def run(*args):
            return subprocess.run([sys.executable, '-I'] + [str(x) for x in args],
                                  capture_output=True, text=True, check=True).stdout
        cdir = os.path.join(td, 'cli')
        args = ['obb', obb[0], ','.join(obb[1]), 'addnl', addnl[0], ','.join(addnl[1]),
                'gen', gen[0], ','.join(gen[1])]
        o1 = run(os.path.join(tools, 'resource_compact.py'), '--compact', 'obb', '--compact', 'addnl',
                 tools, lib, KEY.hex(), cdir, *args)
        assert 'addnl: record 5 -> 2' in o1, o1
        # seconda volta: niente da rifare
        assert 'invariati' in run(os.path.join(tools, 'resource_compact.py'), '--compact', 'obb', '--compact', 'addnl',
                                  tools, lib, KEY.hex(), cdir, *args)
        m = os.path.join(tools, 'resource_merge.py')
        orig, comp = os.path.join(td, 'orig.png'), os.path.join(td, 'comp.png')
        run(m, '--last-wins', '--filler', 64, tools, lib, KEY.hex(), orig,
            obb[0], ','.join(obb[1]), addnl[0], ','.join(addnl[1]), gen[0], ','.join(gen[1]))
        run(m, '--last-wins', '--filler', 64, tools, lib, KEY.hex(), comp,
            os.path.join(cdir, 'obb.png'), os.path.join(cdir, 'obb.mp4'),
            os.path.join(cdir, 'addnl.png'), os.path.join(cdir, 'addnl.mp4'), gen[0], ','.join(gen[1]))
        o2 = run(os.path.join(tools, 'resource_compare.py'), tools, lib, KEY.hex(),
                 orig, ','.join(obb[1] + addnl[1] + gen[1]),
                 comp, ','.join([os.path.join(cdir, 'obb.mp4'), os.path.join(cdir, 'addnl.mp4')] + gen[1]))
        assert 'identici' in o2, o2
        # un record cambiato si vede ('c', primo dell'addnl compattato); l'ultimo ('d', sostituito dal
        # generato) non conta
        bad = os.path.join(cdir, 'addnl.mp4')
        raw = bytearray(open(bad, 'rb').read())
        raw[30] ^= 1
        raw[-1] ^= 1
        open(bad, 'wb').write(bytes(raw))
        r = subprocess.run([sys.executable, '-I', os.path.join(tools, 'resource_compare.py'), tools, lib, KEY.hex(),
                            orig, ','.join(obb[1] + addnl[1] + gen[1]),
                            comp, ','.join([os.path.join(cdir, 'obb.mp4'), bad] + gen[1])],
                           capture_output=True, text=True)
        assert r.returncode == 1 and 'record diverso: c' in r.stdout and 'diverso: d' not in r.stdout, r.stdout
        print('resource_compact: ok (con resource_merge.py)')
    else:
        print('resource_compact: ok (senza la libreria: niente giro con resource_merge.py)')
