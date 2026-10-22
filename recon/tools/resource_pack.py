"""Crea un pacchetto BGAD (dati .mp4 + indice .png) dai file di una cartella.

Serve ad aggiungere file nostri alle risorse servite (es. mappe generate con
mappoi_gen.py): il pacchetto si unisce agli altri con resource_merge.py, come
l'addnl. I record sono come quelli degli OBB 5.0.1: versione 2, nonce in coda,
cifratura 3 (ChaCha8) con la chiave di sessione (la chiave 5.0.1). L'indice e' un
BGI versione 3 senza strato interno, in un record "/" non cifrato: resource_merge
lo legge e ne scrive uno nuovo nel formato completo.

    python -I recon/tools/resource_pack.py [--cache] <cartella> <chiave hex> <uscita.mp4> <uscita.png>

I nomi dei file sono i percorsi relativi alla cartella, con «/» (es. stage/x.bin).
"""
import hashlib
import os
import struct
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bgad                                             # noqa: E402
from resource_index import obfuscate_name, record      # noqa: E402

# --cache: se il pacchetto c'e' gia' ed e' fatto con gli stessi file (nome, dimensione, data) e la
# stessa chiave non si rifa' (pacchetti statici medal_gen, rooms_gen, enemy_gen: ~1,6 GB, cambiano
# di rado); l'impronta dei file sta in <uscita.png>.src
args = sys.argv[1:]
cache = '--cache' in args
if cache:
    args.remove('--cache')
root, key, out_data, out_index = args[0], bytes.fromhex(args[1]), args[2], args[3]
files = sorted(os.path.relpath(os.path.join(d, f), root).replace(os.sep, '/')
               for d, _, fs in os.walk(root) for f in fs)
h = hashlib.sha1(key)
for name in files:
    st = os.stat(os.path.join(root, name))
    h.update(('%s|%d|%d\n' % (name, st.st_size, st.st_mtime_ns)).encode())
stamp = h.hexdigest()
src = out_index + '.src'
if (cache and os.path.exists(out_data) and os.path.exists(out_index) and os.path.exists(src)
        and open(src).read() == stamp):
    print("%d file invariati: %s gia' fatto" % (len(files), out_data))
    sys.exit(0)
if os.path.exists(src):
    os.remove(src)

offsets, pos = [], 0
with open(out_data, 'wb') as out:                       # scritto man mano: niente GB in memoria
    for name in files:
        plain = open(os.path.join(root, name), 'rb').read()
        rec = record(name.encode(), plain, key)
        # il record si rilegge come quelli originali
        assert bgad.decode(rec, bgad.parse(rec), key) == plain, name
        offsets.append(pos)
        out.write(rec)
        pos += len(rec)

pool, name_offs = bytearray(), []
for name in files:
    name_offs.append(len(pool))
    pool += name.encode() + b'\0'
n = len(files)
bgi = (b'\x89BGI' + struct.pack('<III', 3, 0, n) + struct.pack('<I', n)
       + struct.pack('<%dQ' % n, *offsets) + struct.pack('<%dI' % n, *range(n))
       + struct.pack('<%dI' % n, *name_offs) + bytes(pool) + b'\0' * 8)
hdr = bgad.HDR.pack(b'BGAD', 2, 0, bgad.HDR.size, 1, 0, 0, len(bgi), len(bgi))
with open(out_index, 'wb') as fh:
    fh.write(hdr + obfuscate_name(b'/', len(bgi)) + bgi)
with open(src, 'w') as fh:
    fh.write(stamp)
print('%d file, %d byte -> %s, %s' % (n, pos, out_data, out_index))
