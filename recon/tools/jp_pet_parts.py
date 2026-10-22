"""Parti dello Spirit (pet) dai dati JP 4.3.1: grafica lwf/pet/part e icone img/petParts.

Il client disegna il pet attaccando `lwf/pet/part/%03d/<parte>/<parte>.lwf` (id % 1000 per le parti
303xxx-309xxx, id intero per gli accessori 4xxxxx) e mostra nell'editor degli outfit
`img/petParts/pi<id>.png`. Le risorse WW servono solo la serie 001. Nella copia JP locale i file
uguali sono stati tenuti una volta sola: 445 LWF e qualche texture mancano nelle cartelle delle serie
che li condividono con un'altra (stessa specie: 001, 002 e 015 sono tutte «neko»). Si recuperano dalla
cartella gemella con la stessa parte, la stessa texture (nome e dimensioni) e il numero piu' vicino;
7 LWF hanno gemelle che differiscono di pochi float (posizioni): si prende la piu' vicina.

    python -I recon/tools/jp_pet_parts.py <JP_ROOT> (resoconto, non scrive nulla)
"""
import os
import re
import struct
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REV = re.compile(r'^(.*?)(?:\.(\d{8}))?\.(png|lwf)$')


def _latest(files):
    """{nome logico: file della revisione piu' alta}"""
    best = {}
    for f in files:
        m = REV.match(f)
        if not m:
            continue
        base, rev = m.group(1) + '.' + m.group(3), int(m.group(2) or 0)
        if base not in best or rev > best[base][0]:
            best[base] = (rev, f)
    return {b: f for b, (r, f) in best.items()}


def _png_size(path):
    with open(path, 'rb') as fh:
        h = fh.read(24)
    return struct.unpack('>II', h[16:24]) if h[:4] == b'\x89PNG' else None


def _lwf_textures(path):
    """{nome texture: (w, h)} dalla tabella texture di un LWF (formato di make_pet_motions.py)."""
    sys.path.insert(0, HERE)
    from make_pet_motions import SECTIONS
    d = open(path, 'rb').read()
    sec = {n: struct.unpack_from('<2i', d, 32 + 8 * i) for i, n in enumerate(SECTIONS)}
    sb = sec['stringBytes'][0]
    so, sn = sec['stringData']
    strs = [d[sb + a:sb + a + b].decode() for a, b in (struct.unpack_from('<2i', d, so + 8 * k) for k in range(sn))]
    to, tn = sec['texture']
    return {strs[t[0]]: (t[2], t[3]) for t in (struct.unpack_from('<4if', d, to + 20 * k) for k in range(tn))}


def _num(series):
    return int(series)


def collect(jp_root, served=()):
    """{nome servito: percorso JP} per tutte le parti e le icone non gia' servite, piu' il resoconto."""
    root = os.path.join(jp_root, 'lwf', 'pet', 'part')
    dirs = {}            # (serie, parte) -> {nome logico: percorso}
    for series in sorted(os.listdir(root)):
        sd = os.path.join(root, series)
        if not os.path.isdir(sd):
            continue
        for part in sorted(os.listdir(sd)):
            pd = os.path.join(sd, part)
            if os.path.isdir(pd):
                dirs[(series, part)] = {k: os.path.join(pd, f) for k, f in _latest(os.listdir(pd)).items()}
    # indici delle gemelle: LWF per (parte, {texture: dimensioni}), texture per (nome, dimensioni)
    lwf_by_key, png_by_key = {}, {}
    for (series, part), files in dirs.items():
        for name, path in files.items():
            if name.endswith('.png'):
                png_by_key.setdefault((name, _png_size(path)), []).append((series, path))
        lwf = files.get(part + '.lwf')
        if lwf:
            key = (part, tuple(sorted(_lwf_textures(lwf).items())))
            lwf_by_key.setdefault(key, []).append((series, lwf))
    pngs_of = {}
    for (series, part), files in dirs.items():
        pngs_of[(series, part)] = tuple(sorted((n, _png_size(p)) for n, p in files.items() if n.endswith('.png')))

    def nearest(cands, series):
        return min(cands, key=lambda c: (abs(_num(c[0]) - _num(series)), c[0]))[1]

    out, report = {}, {'lwf_twin': [], 'png_twin': [], 'skipped': []}
    for (series, part), files in sorted(dirs.items()):
        base = 'lwf/pet/part/%s/%s/' % (series, part)
        if base + part + '.lwf' in served:
            continue
        lwf = files.get(part + '.lwf')
        if not lwf:
            cands = [c for k, cs in lwf_by_key.items() if k[0] == part and k[1] == pngs_of[(series, part)] for c in cs]
            if not cands:
                report['skipped'].append((series, part, 'LWF senza gemella'))
                continue
            lwf = nearest(cands, series)
            report['lwf_twin'].append((series, part, os.path.relpath(lwf, root)))
        tex = _lwf_textures(lwf)
        pick = {}
        for name, size in tex.items():
            if name in files and _png_size(files[name]) == tuple(size):
                pick[name] = files[name]
                continue
            cands = png_by_key.get((name, tuple(size)), [])
            if not cands:
                break
            pick[name] = nearest(cands, series)
            report['png_twin'].append((series, part, os.path.relpath(pick[name], root)))
        else:
            out[base + part + '.lwf'] = lwf
            for name, path in pick.items():
                out[base + name] = path
            continue
        report['skipped'].append((series, part, 'texture senza gemella'))
    # una parte incompleta esclude tutta la serie (l'accessorio si disegnerebbe a meta')
    bad = {s for s, _, _ in report['skipped']}
    out = {k: v for k, v in out.items() if k.split('/')[3] not in bad}
    report['missing_series'] = sorted(bad)
    icons = os.path.join(jp_root, 'img', 'petParts')
    if os.path.isdir(icons):
        for name, f in _latest(os.listdir(icons)).items():
            if name.endswith('.png') and 'img/petParts/' + name not in served:
                out['img/petParts/' + name] = os.path.join(icons, f)
    return out, report


if __name__ == '__main__':
    files, rep = collect(sys.argv[1])
    print('file: %d (lwf %d, png %d, icone %d)' % (
        len(files), sum(k.endswith('.lwf') for k in files),
        sum(k.endswith('.png') and k.startswith('lwf/') for k in files),
        sum(k.startswith('img/') for k in files)))
    print('LWF dalla gemella: %d, texture dalla gemella: %d' % (len(rep['lwf_twin']), len(rep['png_twin'])))
    for s in rep['skipped']:
        print('  saltata', *s)
    print('serie escluse:', ' '.join(rep['missing_series']))
