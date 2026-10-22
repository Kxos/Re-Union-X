"""Decodifica righe binarie di tabelle master con lo schema della 4.3.1.

    python -I recon/tools/raw_master.py <tabella> <righe.json> <uscita.json> [--int64-as-int]

Le righe sono quelle di una versione piu' vecchia del gioco nel formato binario delle
master (una struttura C per riga, interi little endian, stringhe a lunghezza fissa
terminate da zero), come in thethiny/KHUx-Server data/<tabella>_raw.json:
[{"_id": ..., "_raw": "<esadecimale>", "_size": N}]. Lo schema e'
recon/out/master_types_ww431.json (nome e tipo di ogni campo, nell'ordine).
Se la dimensione della struttura non coincide con quella delle righe si prova a leggere
gli int64 come int (le versioni vecchie: es. player.needExp); altrimenti si esce.
I dati restano fuori dal repository.
"""
import json
import os
import re
import struct
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'out')
table, src, out = sys.argv[1], sys.argv[2], sys.argv[3]
schema = json.load(open(os.path.join(ROOT, 'master_types_ww431.json'), encoding='utf-8'))[table]
rows = json.load(open(src, encoding='utf-8'))
size = rows[0].get('_size', len(rows[0]['_raw']) // 2)


def layout(int64_as_int):
    fields, off = [], 0
    for name, ty in schema:
        m = re.fullmatch(r'(int|int64|string\((\d+)\)|string)(?:\[(\d+)\])?', ty)
        if not m:
            sys.exit('tipo non gestito: %s %s' % (name, ty))
        base, slen, count = m.group(1), m.group(2), int(m.group(3) or 1)
        if base == 'int' or (base == 'int64' and int64_as_int):
            w, kind = 4, 'i'
        elif base == 'int64':
            w, kind = 8, 'q'
        else:
            w, kind = int(slen or 64), 's'
        fields.append((name, kind, w, count if m.group(3) else None, off))
        off += w * count
    return fields, off


for flag in (False, True):
    fields, total = layout(flag)
    if total == size:
        break
else:
    sys.exit('struttura di %d o %d byte, righe di %d: schema diverso' % (layout(False)[1], layout(True)[1], size))


def read(b, kind, w, off):
    if kind == 's':
        return b[off:off + w].split(b'\0', 1)[0].decode('utf-8', 'replace')
    return struct.unpack_from('<' + kind, b, off)[0]


decoded = []
for r in rows:
    b = bytes.fromhex(r['_raw'])
    row = {}
    for name, kind, w, count, off in fields:
        row[name] = [read(b, kind, w, off + w * i) for i in range(count)] if count else read(b, kind, w, off)
    decoded.append(row)
json.dump(decoded, open(out, 'w', encoding='utf-8'), ensure_ascii=False)
print('%s: %d righe da %d byte (int64 come int: %s) -> %s' % (table, len(decoded), size, flag, out))
