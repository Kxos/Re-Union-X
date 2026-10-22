"""Copia nel pacchetto generato le versioni 4.3.1 (addnl dell'IPA) di file che l'OBB 5.0.1 ha cambiato.

    python -I recon/tools/prefer_addnl.py <names_addnl.tsv> <addnl.mp4> <uscita> [nome ...]

Nell'indice unito (resource_merge.py) a parita' di nome vince l'OBB 5.0.1, che precede
l'addnl 4.3.1; solo il pacchetto generato, ultimo, sostituisce. Per i file qui sotto la
versione 5.0.1 non va bene col client 4.3.1, quindi si estrae quella dell'addnl in
<uscita> (stage_gen\\files) e il pacchetto generato la serve al suo posto.

I-091, keyblade invisibile nel campo da fermo: il client 4.3.1 mette l'avatar fermo del
campo in lwf/avatar/motion/wait e attacca il
keyblade al movie di nome di istanza "key". Il wait.lwf dell'OBB 5.0.1 e' una posa frontale (faccia serious_o_c) senza
"key", "shadow" ne' "mark"; quello dell'addnl 4.3.1 ha key, shadow, mark e face_normal_o_c,
come nei video del gioco (reference\\field_idle). Anche win_levelup 5.0.1 non ha key, shadow
ne' faccia; quello 4.3.1 si'.

I record con cifratura 3 (le texture) si aprono con BGAD_KEY (chiave di sessione 5.0.1, come in
bgad_extract.py; build-resources.ps1 la imposta). Non si scrive nulla nel repository.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bgad  # noqa: E402

DEFAULT = [
    'lwf/avatar/motion/wait/wait.lwf',
    'lwf/avatar/motion/wait/wait_e38393e38383e38388e3839ee38383e3839720312e706e67.png',
    'lwf/avatar/motion/win_levelup/win_levelup.lwf',
    'lwf/avatar/motion/win_levelup/win_levelup_e38393e38383e38388e3839ee38383e3839720312e706e67.png',
]


def main():
    tsv, pack, out = sys.argv[1:4]
    want = sys.argv[4:] or DEFAULT
    key = bytes.fromhex(os.environ['BGAD_KEY']) if os.environ.get('BGAD_KEY') else None
    offs = {}
    with open(tsv, encoding='utf-8') as fh:
        next(fh)
        for line in fh:
            n, o = line.rstrip('\n').split('\t')
            offs[n] = int(o)
    with open(pack, 'rb') as fh:
        for n in want:
            if n not in offs:
                sys.exit('assente dall\'addnl: ' + n)
            fh.seek(offs[n])
            h = bgad.parse(fh.read(bgad.HDR.size))
            fh.seek(offs[n])
            buf = fh.read(h['hsize'] + h['nlen'] + h['size'])
            h = bgad.parse(buf)
            if h['enc'] == 3 and not key:
                sys.exit('serve BGAD_KEY per ' + n)
            data = bgad.decode(buf, h, key)
            if data[:3] != (b'LWF' if n.endswith('.lwf') else b'\x89BT'):
                sys.exit('contenuto inatteso: ' + n)
            dst = os.path.join(out, *n.split('/'))
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            with open(dst, 'wb') as o:
                o.write(data)
            print(n, len(data))


if __name__ == '__main__':
    main()
