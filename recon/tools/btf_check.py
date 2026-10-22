"""Controllo strutturale delle texture BTF di un pacchetto generato (I-182): la lunghezza dei dati
dichiarata nell'intestazione deve coincidere con quella del file, altrimenti il decodificatore del
client legge fuori dal file e il gioco crasha entrando nella stanza.

    python -I recon/tools/btf_check.py <cartella> [<cartella> ...]

Regole (verificate il 21-10 su 57.800 BTF di rooms_gen, stage_gen, enemy_gen, medal_gen, raisedraw_gen):
    tipo 8 (RGBA zlib): 0x26 + u32 a +0x22
    tipo 9 (palette zlib): 0x28 + u32 a +0x24
    tipo 1 (palette senza zlib, anche il segnaposto 1x1 da 45 byte): 0x28 + u32 a +0x24
Esce con 1 se trova file incoerenti.
"""
import collections
import os
import struct
import sys

HEAD = {8: (0x26, 0x22), 9: (0x28, 0x24), 1: (0x28, 0x24)}


def expected(d):
    t = d[0x10]
    if t not in HEAD:
        return t, None
    base, at = HEAD[t]
    return t, base + struct.unpack_from('<I', d, at)[0]


def main(roots):
    stats = collections.Counter()
    bad = []
    for root in roots:
        for dp, _, fn in os.walk(root):
            for f in fn:
                p = os.path.join(dp, f)
                with open(p, 'rb') as fh:
                    d = fh.read(0x28)
                if d[:4] != b'\x89BTF' or len(d) < 0x28:
                    continue
                t, exp = expected(d)
                size = os.path.getsize(p)
                stats[(t, 'ignoto' if exp is None else exp == size)] += 1
                if exp is not None and exp != size:
                    bad.append((p, t, size, exp))
    for k, v in sorted(stats.items(), key=str):
        print('tipo %s coerente=%s: %d' % (k[0], k[1], v))
    for p, t, size, exp in bad:
        print('INCOERENTE %s tipo %d: %d byte, attesi %d' % (p, t, size, exp))
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
