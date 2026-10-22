"""Sagome e cifre vere delle icone del tier 9 e 10 (MedalInfo_Guilt9/10) dai video.

Le risorse (OBB 5.0.1) hanno solo MedalInfo_Guilt1-8; le 9-10 non sono in nessun dump trovato.
Le si vede pero' nel dettaglio medaglia dei video di YouTube (nessun file originale online):
- tier 9, 720p:  J9wqUBGvVGQ (KH3 Lea, fotogrammi 12-16 a 1 fps), sfondo blu pulito;
- tier 9, 1080p: yiLBzV3q-JE (KH3 Sora MP, fotogrammi 7-10), dietro c'e' l'arte della medaglia;
- tier 10, 1080p: zOP7c8oyAbE (SN++ KH3 Kairi, fotogrammi 93-101).
Fotogrammi: ffmpeg -i <video> -vf fps=1 <cartella>\\<id>\\%04d.png.

Registrazione (texture 100x100 -> fotogramma: x = ox + u * s):
- 720p: misurata sulla MedalInfo_Guilt8 originale negli stessi video 720p con la stessa
  disposizione (sm3FQMk45gQ, cIlh-n1riX8): s = 0,97, origine (640, 442), correlazione 0,90;
- tier 9 1080p: registrata contro la mappa del 720p (s = 1,678, origine 958,75 681,25);
- tier 10: scala dall'altezza della cifra (33 px contro 28 della tier 8 a s = 1,45 nel 1080p
  W5gypueTo34) e cifra centrata a 49,5 come nelle originali.
Poi: mappa del blu notte (2,39,63) nello spazio della texture a 4x, media sulle rotazioni della
simmetria (la 9 ha 7 bracci, la 10 cinque: misurato, scarto 3%) usando solo i pixel validi (via
la lama del keyblade, la cifra e, nel 1080p della 9, l'arte scura della medaglia); la stella a
4 punte sopra il «10» e' unica e viene dal fotogramma. Cifre: dal fotogramma 1080p.

    python -I recon/tools/tier_from_video.py <cartella fotogrammi> <reference\\medal_tier>

Scrive sagoma_tier9/10_video.png e cifra_tier9/10_video.png (400x400, L), che
make_textures.py usa per MedalInfo_Guilt9/10.
"""
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

FR, OUT = sys.argv[1:3]
Z = 4
yy, xx = np.mgrid[0:100 * Z, 0:100 * Z]


def avgframe(vid, frames):
    acc = None
    for f in frames:
        a = np.asarray(Image.open(os.path.join(FR, vid, '%04d.png' % f)).convert('RGB')).astype(np.float32)
        acc = a if acc is None else acc + a
    return acc / len(frames)


def to_tex(a, ox, oy, s):
    """Fotogramma -> spazio della texture a 4x (bicubico)."""
    k = s / Z
    return np.stack([np.asarray(Image.fromarray(a[..., c], mode='F').transform(
        (100 * Z, 100 * Z), Image.AFFINE, (k, 0, ox + k * 0.5 - 0.5, 0, k, oy + k * 0.5 - 0.5),
        resample=Image.BICUBIC)) for c in range(3)], -1)


def navy(a):
    return np.clip((110 - a[..., 2]) / 50.0, 0, 1) * np.clip((70 - a[..., 0]) / 20.0, 0, 1)


def invalid(a, art):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    bad = ((r > 120) & (b < r + 40)) | ((b > 200) & (g > 160) & (r > 100))   # lama, cifra
    if art:                                                                  # arte della medaglia
        bad |= (b < 45) | ((r > 60) & (b > 100) & (g < r)) | ((r > 150) & (g > 150))
    return ndi.binary_dilation(bad, iterations=8 if art else 6)


def rot(m, ang, c):
    return np.asarray(Image.fromarray(m.astype(np.float32), mode='F').rotate(ang, resample=Image.BILINEAR, center=c))


def sym_score(m, v, k, c):
    tot = cnt = 0
    for j in range(1, k):
        ok = v & (rot(v, 360 / k * j, c) > 0.5)
        tot += np.abs(m - rot(m, 360 / k * j, c))[ok].sum()
        cnt += ok.sum()
    return tot / max(cnt, 1)


def silhouette(maps, k, c0):
    m, v = maps[0]
    best = None
    for cx in np.arange(c0[0] - 3, c0[0] + 3.01, 0.5):
        for cy in np.arange(c0[1] - 3, c0[1] + 3.01, 0.5):
            rr = np.hypot(xx - cx, yy - cy)
            sc = sym_score(m, v & (rr > 80) & (rr < 190), k, (cx, cy))
            if best is None or sc < best[0]:
                best = (sc, cx, cy)
    _, cx, cy = best
    print('centro %.2f %.2f, scarto %.3f' % (cx / Z, cy / Z, best[0]))
    num = np.zeros(m.shape, np.float32)
    den = np.zeros(m.shape, np.float32)
    for mm, vv in maps:
        for j in range(k):
            vr = rot(vv, 360 / k * j, (cx, cy)) > 0.99
            num += np.where(vr, rot(mm, 360 / k * j, (cx, cy)), 0)
            den += vr
    sym = np.where(den > 0, num / np.maximum(den, 1), 1.0)
    rr = np.hypot(xx - cx + 0.5, yy - cy + 0.5)
    sym[rr < 14 * Z] = 1.0                      # sotto la cifra
    sym[rr > 49 * Z] = 0.0
    return sym


def finish(m):
    m = ndi.gaussian_filter(m, 1.2) > 0.5
    lab, k = ndi.label(m)
    m = np.isin(lab, 1 + np.nonzero(ndi.sum(m, lab, range(1, k + 1)) >= 200)[0])
    hl, hk = ndi.label(~m)
    return m | np.isin(hl, 1 + np.nonzero(ndi.sum(~m, hl, range(1, hk + 1)) < 40)[0])


def digit(a):
    g, b = a[..., 1], a[..., 2]
    t = np.clip((g - 39) / (202 - 39), 0, 1) * (b > 150)
    core = t > 0.6
    lab, _ = ndi.label(core)
    box = np.zeros_like(core)
    box[40 * Z:60 * Z, 33 * Z:67 * Z] = True
    keep = [i for i in set(np.unique(lab[box])) - {0} if (lab == i).sum() > 300]
    core = np.isin(lab, keep) & ndi.binary_dilation(box, iterations=2 * Z)
    ys, xs = np.nonzero(core)
    region = np.zeros_like(core)
    region[ys.min() - 6:ys.max() + 7, xs.min() - 6:xs.max() + 7] = True
    x = np.clip((t - 0.35) / 0.3, 0, 1)
    dm = x * x * (3 - 2 * x) * region
    l2, k2 = ndi.label(dm > 0.15)
    big = np.isin(l2, 1 + np.nonzero(ndi.sum(dm > 0.15, l2, range(1, k2 + 1)) >= 800)[0])
    return dm * ndi.binary_dilation(big, iterations=1)


def save(arr, name):
    Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8)).save(os.path.join(OUT, name))
    print(name)


t9a = to_tex(avgframe('J9wqUBGvVGQ', range(12, 17)), 640.0, 442.0, 0.97)
t9b = to_tex(avgframe('yiLBzV3q-JE', range(7, 11)), 958.75, 681.25, 1.678)
s10 = 1.45 * 33 / 28
t10 = to_tex(avgframe('zOP7c8oyAbE', range(93, 102)), 1197.0 - 50 * s10, 766.5 - 50 * s10, s10)

m9 = silhouette([(navy(t9a), ~invalid(t9a, False)), (navy(t9b), ~invalid(t9b, True))], 7, (204.0, 200.0))
save(finish(m9), 'sagoma_tier9_video.png')
m10 = silhouette([(navy(t10), ~invalid(t10, False))], 5, (194.0, 204.0))
disk = np.hypot(xx - 47.5 * Z, yy - 34 * Z) < 6 * Z      # stella a 4 punte sopra la cifra
m10[disk] = navy(t10)[disk]
save(finish(m10), 'sagoma_tier10_video.png')
save(digit(t9b), 'cifra_tier9_video.png')
save(digit(t10), 'cifra_tier10_video.png')
