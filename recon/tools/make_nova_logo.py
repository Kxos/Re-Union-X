"""Logo «NOVA» del popup del livello del Nova (Guilt Burst) al posto del «BURST» JP.

    python recon/tools/make_nova_logo.py [--out <cartella>] [--confronto <png>]
                                         (Pillow, numpy e scipy: senza -I)

Il popup (lwf/medal/guilt_bonus/GuiltBonus_BurstLvup, importato dal JP 4.3.1 da import_jp_raisedraw.py)
usa Burst_Logo.png (422x142, RGBA: icona rotonda + scritta «BURST» arancio-rossa con bordo nero e
contorno chiaro) e Burst_Logo_B.png (422x142, paletta: sagoma bianca sfumata, il bagliore). «Burst» e'
il nome JP del Nova: il gioco globale mostrava «NOVA» (reference\\nova_lvup\\02_lv3306_to_3307_2m18.jpg,
video LFJ5ikVkIhk 2:18). Si rifanno le due texture, stesse dimensioni e stessa registrazione:

 - registrazione: l'icona JP (pixel opachi) si cerca nel fotogramma (scala e posizione, prima grossolana
   poi fine): da li' ogni pixel della texture ha il suo punto nel fotogramma (scala ~1,99 sul video);
 - scritta: nel fotogramma, a destra dell'icona, i riempimenti caldi (rosso-arancio-giallo) delle lettere
   sono i semi; l'interno della scritta (riempimento + bordo nero + riflessi) e' la zona non chiara che li
   contiene, chiusa dal contorno chiaro (che la separa dallo sfondo); i buchi si riempiono. Colori
   dell'interno dal fotogramma (media pesata sulla maschera, supercampionata), contorno chiaro ricostruito
   come nel JP: 4 px, (252,250,250), alpha 220;
 - logo = JP con la zona della scritta vecchia svuotata (pixel piu' vicini alla scritta che all'icona,
   soglia 160, entro 3 px) + scritta nuova sopra: l'icona e il suo alone restano quelli JP pixel per pixel;
 - bagliore = dal lato dell'icona quello JP; dal lato della scritta sagoma bianca della nuova alpha
   (soglia 64, chiusa di 8 px come il blocco unico del JP, allargata di 6 px, sfocatura gaussiana sigma 4,
   sfumata a 0 fra 6 e 8 px dal contorno), con un passaggio di 10 px fra i due: nessun pixel oltre 8 px dal
   logo nuovo dal lato della scritta (il JP arriva a ~16-20 px con alpha bassa).

Uscita (fuori da git): <out>\\Burst_Logo.png e Burst_Logo_B.png (RGBA, alpha diritta: btf.encode la
premoltiplica), passati da build-resources.ps1 a import_jp_raisedraw.py con --replace.
"""
import argparse
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage as nd

sys.stdout.reconfigure(encoding='utf-8')
D = r'D:\Progetto_Restauro_KH_UX'
GB_DIR = 'lwf/medal/guilt_bonus/GuiltBonus_BurstLvup'
FRAME = os.path.join(D, 'reference', 'nova_lvup', '02_lv3306_to_3307_2m18.jpg')
OUT = os.path.join(D, 'raisedraw_gen', 'nova')

SS = 4                      # supercampionamento della scritta
RING, RING_RGB, RING_A = 4, (252, 250, 250), 220   # contorno chiaro come nel Burst_Logo JP
ERASE = 3                   # px oltre la soglia della scritta vecchia (bordo sfumato) da svuotare
# bagliore: chiusura, allargamento, sigma, inizio della sfumatura, limite (px); tarati sul Burst_Logo_B JP
GLOW_CLOSE, GLOW_GROW, GLOW_SIGMA, GLOW_FADE, GLOW_MAX = 8, 6, 4.0, 6, 8
GLOW_SEAM = 10              # larghezza (px) del passaggio fra il bagliore JP dell'icona e quello nuovo


def jp_name(orig):
    """Nome del file della texture nella cartella JP/pubblicata (GuiltBonus_BurstLvup_<hex UTF-8>.png)."""
    return f'GuiltBonus_BurstLvup_{orig.encode("utf-8").hex()}.png'


def zone(alpha):
    """(icona, scritta vecchia, zona della scritta, peso del bagliore JP) dall'alpha JP: componenti con
    alpha oltre la prima soglia (128, 160, 200, 245) che separa l'icona dalla scritta (nel Burst_Logo
    l'alone dell'icona tocca il contorno della B a 128: si separano a 160); l'icona e' la componente col
    pixel piu' a sinistra; zona della scritta = pixel piu' vicini alla scritta che all'icona."""
    for t in (128, 160, 200, 245):
        lab, n = nd.label(alpha > t)
        if n >= 2:
            break
    cols = np.nonzero((lab > 0).any(0))[0]
    if not len(cols):
        raise SystemExit('logo JP senza pixel opachi')
    x = cols[0]
    icon = lab == lab[np.nonzero(lab[:, x])[0][0], x]
    text = (lab > 0) & ~icon
    if not text.any():
        raise SystemExit('logo JP: nessuna scritta oltre l\'icona')
    dt, di = nd.distance_transform_edt(~text), nd.distance_transform_edt(~icon)
    # peso del bagliore JP: 1 dal lato dell'icona, 0 dal lato della scritta, rampa di GLOW_SEAM px
    w = np.clip((dt - di) / GLOW_SEAM + 0.5, 0, 1).astype(np.float32)
    return icon, text, dt < di, w


def registra(jp, icon, frame):
    """(s, dx, dy): il pixel (u, v) della texture e' nel fotogramma in ((u+dx)*s, (v+dy)*s) (coordinate
    continue). Somma dei quadrati sui pixel opachi dell'icona: prima ogni scala da 1,6 a 2,4 a passo 0,05
    in quarti di pixel su tutto il fotogramma, poi passo 0,01 e +-6 px attorno al migliore."""
    a = np.array(jp)
    m = icon & (a[..., 3] >= 250)
    ys, xs = np.nonzero(m)
    col = a[ys, xs, :3].astype(np.float32)

    def ssd(f, ys, xs, col, rx, ry):
        acc = np.zeros((len(ry), len(rx)), np.float32)
        for y, x, c in zip(ys, xs, col):
            acc += ((f[ry[0] + y:ry[-1] + y + 1, rx[0] + x:rx[-1] + x + 1] - c) ** 2).sum(-1)
        return acc / len(ys)

    fw, fh = frame.size
    best = None
    q = (ys % 4 == 0) & (xs % 4 == 0)                    # un pixel su 16 a un quarto di risoluzione
    for s in np.arange(1.6, 2.401, 0.05):
        w, h = round(fw / s / 4), round(fh / s / 4)
        f = np.array(frame.resize((w, h), Image.BOX), np.float32)
        rx, ry = range(0, w - xs.max() // 4), range(0, h - ys.max() // 4)
        if len(rx) < 1 or len(ry) < 1:
            continue
        e = ssd(f, ys[q] // 4, xs[q] // 4, col[q], rx, ry)
        i = np.unravel_index(e.argmin(), e.shape)
        if best is None or e[i] < best[0]:
            best = (float(e[i]), s, i[1] * 4, i[0] * 4)
    if best is None:
        raise SystemExit('fotogramma troppo piccolo per la registrazione')
    _, s0, x0, y0 = best
    best = None
    for s in np.arange(s0 - 0.05, s0 + 0.0501, 0.01):
        w, h = round(fw / s), round(fh / s)
        f = np.array(frame.resize((w, h), Image.LANCZOS), np.float32)
        cx, cy = round(x0 * s0 / s), round(y0 * s0 / s)
        rx = range(max(0, cx - 6), min(w - xs.max(), cx + 7))
        ry = range(max(0, cy - 6), min(h - ys.max(), cy + 7))
        if len(rx) < 1 or len(ry) < 1:
            continue
        e = ssd(f, ys, xs, col, rx, ry)
        i = np.unravel_index(e.argmin(), e.shape)
        if best is None or e[i] < best[0]:
            best = (float(e[i]), float(s), rx[0] + i[1], ry[0] + i[0])
    return best[1], best[2], best[3], best[0] ** 0.5


def interno(frame, box):
    """Maschera (dimensioni del fotogramma) dell'interno della scritta nel riquadro box."""
    c = frame.crop(box)
    hsv = np.array(c.convert('HSV')).astype(int)
    H, S, V = hsv[..., 0] * 360 // 255, hsv[..., 1], hsv[..., 2]
    warm = (V > 110) & (S > 110) & ((H <= 65) | (H >= 340))
    light = (V > 170) & (S < 90)
    wl, n = nd.label(warm)
    if not n:
        raise SystemExit('nessuna lettera calda nel fotogramma')
    area = nd.sum(warm, wl, range(1, n + 1))
    seeds = np.isin(wl, 1 + np.nonzero(area >= 0.2 * area.max())[0])
    lab, _ = nd.label(~light)
    bordo = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])))
    ids = [i for i in np.unique(lab[seeds]) if i and i not in bordo]
    if not ids:
        raise SystemExit('scritta non chiusa dal contorno chiaro nel fotogramma')
    m = nd.binary_fill_holes(np.isin(lab, ids))
    full = np.zeros((frame.size[1], frame.size[0]), np.uint8)
    full[box[1]:box[3], box[0]:box[2]] = m * 255
    return full


def scritta(frame, reg, x0, size):
    """Scritta nuova (RGBA delle dimensioni della texture) dalla zona del fotogramma a destra della colonna
    x0 della texture."""
    s, dx, dy = reg[:3]
    W, H = size
    fw, fh = frame.size
    box = (max(0, int((x0 + dx) * s)), max(0, int(dy * s)),
           min(fw, int(np.ceil((W + dx) * s))), min(fh, int(np.ceil((H + dy) * s))))
    mask = Image.fromarray(interno(frame, box))
    aff = (s / SS, 0, dx * s, 0, s / SS, dy * s)
    big = (W * SS, H * SS)
    m_ss = np.array(mask.transform(big, Image.AFFINE, aff, Image.BILINEAR), np.float32) / 255
    rgb = np.array(frame.convert('RGB'), np.float32) * (np.array(mask, np.float32)[..., None] / 255)
    pre = np.stack([np.array(Image.fromarray(rgb[..., k]).transform(big, Image.AFFINE, aff, Image.BILINEAR),
                             np.float32) for k in range(3)], -1)

    def giu(x):                                          # media dei blocchi SSxSS
        return x.reshape(H, SS, W, SS, *x.shape[2:]).mean((1, 3))

    a_in = giu(m_ss)
    col = giu(pre) / np.maximum(a_in, 1e-6)[..., None]
    ring = giu((nd.distance_transform_edt(m_ss < 0.5) <= RING * SS).astype(np.float32))
    # composizione: contorno chiaro, poi l'interno sopra (alpha diritta)
    ar = ring * RING_A / 255
    out_a = a_in + ar * (1 - a_in)
    out_rgb = (col * a_in[..., None] + np.array(RING_RGB, np.float32) * (ar * (1 - a_in))[..., None]) \
        / np.maximum(out_a, 1e-6)[..., None]
    out = np.dstack([np.clip(out_rgb, 0, 255), np.clip(out_a * 255, 0, 255)]).round().astype(np.uint8)
    out[out[..., 3] == 0] = 0
    return Image.fromarray(out, 'RGBA')


def bagliore(alpha):
    """Alpha del bagliore dalla nuova alpha del logo (uint8)."""
    d0 = nd.distance_transform_edt(alpha == 0)
    m = alpha >= 64
    m |= nd.distance_transform_edt(nd.distance_transform_edt(~m) <= GLOW_CLOSE) > GLOW_CLOSE   # chiusura
    body = nd.gaussian_filter((nd.distance_transform_edt(~m) <= GLOW_GROW).astype(np.float32) * 255,
                              GLOW_SIGMA)
    fade = np.clip((GLOW_MAX - d0) / (GLOW_MAX - GLOW_FADE), 0, 1)
    return np.clip(body * fade, 0, 255).round().astype(np.uint8)


def build(jp_logo, jp_glow, frame, verbose=False):
    """(logo RGBA, bagliore RGBA) delle dimensioni del logo JP."""
    jp = jp_logo.convert('RGBA')
    if jp_glow.size != jp.size:
        raise SystemExit(f'bagliore JP {jp_glow.size} diverso dal logo {jp.size}')
    J = np.array(jp)
    icon, text, zt, w = zone(J[..., 3])
    reg = registra(jp, icon, frame.convert('RGB'))
    if verbose:
        print(f'registrazione: scala {reg[0]:.2f}, origine ({reg[1] * reg[0]:.1f}, {reg[2] * reg[0]:.1f}), '
              f'scarto RMS {reg[3]:.1f}')
    x0 = int(np.nonzero(icon.any(0))[0].max()) + 1
    nuova = scritta(frame.convert('RGB'), reg, x0, jp.size)
    base = J.copy()
    base[zt & (nd.distance_transform_edt(~text) <= ERASE)] = 0
    logo = Image.fromarray(base, 'RGBA')
    logo.alpha_composite(nuova)
    L = np.array(logo)
    G = np.array(jp_glow.convert('RGBA'))
    ga = bagliore(L[..., 3]).astype(np.float32)
    nuovo = w < 1
    G[nuovo, :3] = 255
    G[..., 3] = (G[..., 3] * w + ga * (1 - w)).round().astype(np.uint8)
    return logo, Image.fromarray(G, 'RGBA')


def confronto(frame, jp_logo, jp_glow, logo, glow, path):
    """Immagine di confronto, una riga ciascuno: fotogramma (stessa scala), logo JP, logo nuovo, bagliore JP,
    bagliore nuovo (su sfondo scuro)."""
    W, H = logo.size
    jp = jp_logo.convert('RGBA')
    reg = registra(jp, zone(np.array(jp)[..., 3])[0], frame.convert('RGB'))
    s, dx, dy = reg[:3]
    fr = frame.convert('RGB').transform((W, H), Image.AFFINE, (s, 0, dx * s, 0, s, dy * s), Image.BICUBIC)
    righe = [fr]
    for im in (jp, logo, jp_glow.convert('RGBA'), glow):
        bg = Image.new('RGBA', (W, H), (24, 18, 40, 255))
        bg.alpha_composite(im)
        righe.append(bg.convert('RGB'))
    out = Image.new('RGB', (W, H * len(righe)), (0, 0, 0))
    for i, im in enumerate(righe):
        out.paste(im, (0, i * H))
    out.resize((W * 2, H * 2 * len(righe)), Image.LANCZOS).save(path)


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=OUT)
    ap.add_argument('--frame', default=FRAME)
    ap.add_argument('--confronto', metavar='PNG')
    a = ap.parse_args(argv)
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import import_jp_raisedraw  # noqa: E402  (radice JP del Task 8)
    folder = os.path.join(import_jp_raisedraw.JP, *GB_DIR.split('/'))
    jp_logo = Image.open(os.path.join(folder, jp_name('Burst_Logo.png')))
    jp_glow = Image.open(os.path.join(folder, jp_name('Burst_Logo_B.png')))
    frame = Image.open(a.frame)
    logo, glow = build(jp_logo, jp_glow, frame, verbose=True)
    os.makedirs(a.out, exist_ok=True)
    logo.save(os.path.join(a.out, 'Burst_Logo.png'))
    glow.save(os.path.join(a.out, 'Burst_Logo_B.png'))
    print(f'scritti {a.out}\\Burst_Logo.png e Burst_Logo_B.png ({logo.size[0]}x{logo.size[1]})')
    if a.confronto:
        confronto(frame, jp_logo, jp_glow, logo, glow, a.confronto)
        print(f'confronto: {a.confronto}')


if __name__ == '__main__':
    main()
