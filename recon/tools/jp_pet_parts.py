"""Parti dello Spirit (pet) dai dati JP 4.3.1: grafica lwf/pet/part e icone img/petParts.

Il client disegna il pet attaccando `lwf/pet/part/%03d/<parte>/<parte>.lwf` (id % 1000 per le parti
303xxx-309xxx, id intero per gli accessori 4xxxxx) e mostra nell'editor degli outfit
`img/petParts/pi<id>.png`. Le risorse WW servono solo la serie 001. Nella copia JP locale i file
uguali sono stati tenuti una volta sola: 445 LWF e qualche texture mancano nelle cartelle delle serie
che li condividono con un'altra (stessa specie: 001, 002 e 015 sono tutte «neko»). Si recuperano dalla
cartella gemella con la stessa parte, la stessa texture (nome e dimensioni) e il numero piu' vicino;
7 LWF hanno gemelle che differiscono di pochi float (posizioni): si prende la piu' vicina.
Accessories (2 Nov 2026): a texture missing from every pet folder is taken from the avatar accessory of the
same item (lwf/avatar/accessory/*/*) when exactly one avatar file has the same texture name (without the
part prefix) and the same size: the dump kept the identical file once, under the avatar part (Balloon
Mike & Sulley 407026 = avatar 208106, Balloon Axel 407047 = avatar 208137). Report key `avatar_twin`.

Own file at another pixel size (2 Nov 2026): an accessory texture whose own file exists but is stored at another size than
the LWF declares is used as it is (the original game shipped such files: avatar 108225 has 12x13 for a declared 5x5,
410014 the same); report key `own_resized`. Reconstructed textures: `recon_root` (the private pet_parts_recon/files
folder, with its README) gives a file for a texture missing from every source; report key `reconstructed`.

Larger file than declared (3 Nov 2026, blur fix): when a served texture is stored larger than the LWF declares, the LWF is
served as a patched copy (`hires_lwf`) that declares the real size and keeps the drawn size; report key `hires`
({served LWF name: bytes}, written by import_jp_coco.py instead of the dump's LWF).

    python -I recon/tools/jp_pet_parts.py <JP_ROOT> [RECON_ROOT] (resoconto, non scrive nulla)
"""
import os
import re
import struct
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REV = re.compile(r'^(.*?)(?:\.(\d{8}))?\.(png|lwf)$')
# Flash default texture name «ビットマップ N.png» (bitmap N), as it appears in the LWF texture table and in the file names:
# UTF-8 hex after the part prefix (ac_hat1_e38393...png), so the comparison is on the hex. The plain string never matches
# there: checked 2 Nov 2026, with it 402119 takes an unrelated earring «ビットマップ 1» from avatar 103183.
GENERIC = 'ビットマップ'.encode().hex()


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


FLAG = 0x80000000


def hires_lwf(data, real):
    """LWF bytes with every texture of `real` ({texture name: (w, h)} of the file actually served) that is stored LARGER
    than declared re-declared at its real pixel size, at the same place and size on screen (3 Nov 2026, blur fix).

    The client draws such a texture at its declared resolution: 407009 Balloon Fairies (green fairy 106x148 declared 42x59,
    scaled x2.5 by the animation), 407043 Flying Carpet (4 frames 2x the declared size) and 402029 Pointy Pumpkin Hat (all
    ~1.8x) came out blurry on the device, while the parts whose files match the table are sharp. The dump holds the newer,
    larger bitmaps next to an LWF that still declares the old sizes. The copy changes only: the texture table (w, h), the
    fragments of those textures (x, y, u, v, w, h times kx = real w / declared w, ky likewise) and the matrix of each bitmap
    that draws them (followed by a scale 1/kx, 1/ky, new entries appended to the matrix table): every drawn point lands
    where it did, the quad just carries k times more texels. Returns None when nothing changes."""
    sys.path.insert(0, HERE)
    from make_pet_motions import SECTIONS
    b = bytearray(data)
    sec = [list(struct.unpack_from('<2i', b, 32 + 8 * i)) for i in range(len(SECTIONS))]
    S = {n: i for i, n in enumerate(SECTIONS)}
    HEADER = 0x20 + 8 * len(SECTIONS) + 4
    sb = sec[S['stringBytes']][0]
    so, sn = sec[S['stringData']]
    strs = [b[sb + a:sb + a + n].decode() for a, n in (struct.unpack_from('<2i', b, so + 8 * k) for k in range(sn))]
    to, tn = sec[S['texture']]
    k_of = {}
    for t in range(tn):
        s, fmt, w, h, sc = struct.unpack_from('<4if', b, to + 20 * t)
        rw, rh = real.get(strs[s], (w, h))
        if rw > w and rh > h:
            k_of[t] = (rw / w, rh / h)
            struct.pack_into('<4if', b, to + 20 * t, s, fmt, rw, rh, sc)
    if not k_of:
        return None
    fo, fn = sec[S['textureFragment']]
    frag_k = {}
    for f in range(fn):
        sid, tex, rot, x, y, u, v, w, h = struct.unpack_from('<9i', b, fo + 36 * f)
        if tex in k_of:
            kx, ky = k_of[tex]
            if rot:      # rotated fragments: never in the pet parts, not handled
                raise ValueError('rotated fragment %d' % f)
            frag_k[f] = (kx, ky)
            struct.pack_into('<9i', b, fo + 36 * f, sid, tex, rot, round(x * kx), round(y * ky), round(u * kx),
                             round(v * ky), round(w * kx), round(h * ky))
    tro = sec[S['translate']][0]
    mo, mn = sec[S['matrix']]
    new, index = [], {}

    def scaled(mid, kx, ky):
        if mid & FLAG:
            sx, sy, k0, k1, tx, ty = struct.unpack_from('<6f', b, mo + 24 * (mid & 0x7fffffff))
        else:
            (tx, ty), sx, sy, k0, k1 = struct.unpack_from('<2f', b, tro + 8 * mid), 1.0, 1.0, 0.0, 0.0
        m = (sx / kx, sy / ky, k0 / ky, k1 / kx, tx, ty)
        if m not in index:
            index[m] = mn + len(new)
            new.append(m)
        return FLAG | index[m]

    for name, fmt in (('bitmap', '<2i'), ('bitmapEx', '<3i4f')):
        o, n = sec[S[name]]
        size = struct.calcsize(fmt)
        for i in range(n):
            rec = list(struct.unpack_from(fmt, b, o + size * i))
            if rec[1] in frag_k:
                rec[0] = scaled(rec[0] & 0xffffffff, *frag_k[rec[1]])
                rec[0] = rec[0] - (1 << 32) if rec[0] & FLAG else rec[0]
                struct.pack_into(fmt, b, o + size * i, *rec)
    # append the new matrices at the end of the matrix table: the sections are stored in table order, back to back
    offs = [s[0] for s in sec]
    assert offs == sorted(offs) and offs[0] == HEADER, 'sections not in table order'
    end = mo + 24 * mn
    nxt = sec[S['matrix'] + 1][0]
    assert end == nxt, 'matrix table not followed by the next section'
    blob = b''.join(struct.pack('<6f', *m) for m in new)
    for i in range(S['matrix'] + 1, len(SECTIONS)):
        sec[i][0] += len(blob)
    sec[S['matrix']][1] = mn + len(new)
    for i, (o, n) in enumerate(sec):
        struct.pack_into('<2i', b, 32 + 8 * i, o, n)
    total = struct.unpack_from('<i', b, HEADER - 4)[0]
    assert total == len(b), 'LWF length field'
    struct.pack_into('<i', b, HEADER - 4, total + len(blob))
    return bytes(b[:end]) + blob + bytes(b[end:])


def collect(jp_root, served=(), recon_root=None):
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

    # avatar accessory textures: (name without the part prefix, size) -> [paths]
    av_root = os.path.join(jp_root, 'lwf', 'avatar', 'accessory')
    av_png = {}
    for aid in sorted(os.listdir(av_root)) if os.path.isdir(av_root) else []:
        ad = os.path.join(av_root, aid)
        for part in sorted(os.listdir(ad)) if os.path.isdir(ad) else []:
            pd = os.path.join(ad, part)
            if not os.path.isdir(pd):
                continue
            for name, path in _latest(os.listdir(pd)).items():
                if name.endswith('.png') and name.startswith(part + '_'):
                    av_png.setdefault((name[len(part) + 1:], _png_size(os.path.join(pd, path))), []).append(os.path.join(pd, path))

    def avatar_twin(part, name, size):
        # never by a Flash default name («ビットマップ N.png», bitmap N): it says nothing about the picture
        if not name.startswith(part + '_') or name[len(part) + 1:].startswith(GENERIC):
            return None
        cands = av_png.get((name[len(part) + 1:], tuple(size)), [])
        return cands[0] if len(cands) == 1 else None

    out, report = {}, {'lwf_twin': [], 'png_twin': [], 'avatar_twin': [], 'reconstructed': [], 'own_resized': [], 'skipped': [], 'hires': {}}
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
                av = avatar_twin(part, name, size) if len(series) == 6 else None  # accessories only
                if av:
                    pick[name] = av
                    report['avatar_twin'].append((series, part, os.path.relpath(av, jp_root)))
                    continue
                rc = os.path.join(recon_root, base + name) if recon_root else None
                if rc and os.path.isfile(rc):
                    pick[name] = rc
                    report['reconstructed'].append((series, part, name))
                    continue
                if len(series) == 6 and name in files:
                    # own file stored at another pixel size than the LWF declares: the original game shipped such
                    # files too (avatar 108225 «Disco: Sparkles»: 12x13 for a declared 5x5), the client scales them
                    pick[name] = files[name]
                    report['own_resized'].append((series, part, name))
                    continue
                break
            pick[name] = nearest(cands, series)
            report['png_twin'].append((series, part, os.path.relpath(pick[name], root)))
        else:
            out[base + part + '.lwf'] = lwf
            for name, path in pick.items():
                out[base + name] = path
            hi = hires_lwf(open(lwf, 'rb').read(), {n: _png_size(p) for n, p in pick.items()})
            if hi:
                report['hires'][base + part + '.lwf'] = hi
            continue
        report['skipped'].append((series, part, 'texture senza gemella'))
    # una parte incompleta esclude tutta la serie (l'accessorio si disegnerebbe a meta')
    bad = {s for s, _, _ in report['skipped']}
    out = {k: v for k, v in out.items() if k.split('/')[3] not in bad}
    report['hires'] = {k: v for k, v in report['hires'].items() if k.split('/')[3] not in bad}
    report['missing_series'] = sorted(bad)
    icons = os.path.join(jp_root, 'img', 'petParts')
    if os.path.isdir(icons):
        for name, f in _latest(os.listdir(icons)).items():
            if name.endswith('.png') and 'img/petParts/' + name not in served:
                out['img/petParts/' + name] = os.path.join(icons, f)
    return out, report


if __name__ == '__main__':
    files, rep = collect(sys.argv[1], recon_root=sys.argv[2] if len(sys.argv) > 2 else None)
    print('file: %d (lwf %d, png %d, icone %d)' % (
        len(files), sum(k.endswith('.lwf') for k in files),
        sum(k.endswith('.png') and k.startswith('lwf/') for k in files),
        sum(k.startswith('img/') for k in files)))
    print('LWF dalla gemella: %d, texture dalla gemella: %d' % (len(rep['lwf_twin']), len(rep['png_twin'])))
    for s in rep['avatar_twin']:
        print('  avatar twin', *s)
    for k in ('reconstructed', 'own_resized'):
        for s in rep[k]:
            print('  %s' % k, s[0], s[1], s[2].encode('ascii', 'backslashreplace').decode())
    for s in rep['skipped']:
        print('  saltata', *s)
    for k in sorted(rep['hires']):
        print('  hires', k)
    print('serie escluse:', ' '.join(rep['missing_series']))
