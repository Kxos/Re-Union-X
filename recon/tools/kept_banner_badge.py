"""Bollino «KEPT IN SHOP» sul banner dello Shop (Shop sp3, richiesta dell'utente 20-10; variante C3c scelta dall'utente).

Uso: python -I recon/tools/kept_banner_badge.py <banner.png> <uscita.png>
Copia il banner (stessa dimensione, trasparenza della punta a freccia conservata) con una targhetta in alto a destra:
fondo blu come le piastre dello Shop, bordo oro, puntina tonda, «KEPT» giallo + «IN SHOP» bianco con contorno blu notte.
Il lato destro e' obliquo, parallelo alla freccia del banner. Lo chiama server.js la prima volta che il client chiede
/web/gacha/img/<id>-kept<stile>.png. Esce con codice diverso da zero se non riesce: il server serve allora l'immagine normale.
"""
import math
import sys
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

S = 4  # sovracampionamento per i bordi lisci
FONTS = ['C:/Windows/Fonts/impact.ttf', 'C:/Windows/Fonts/arialbd.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
         'impact.ttf', 'arialbd.ttf', 'DejaVuSans-Bold.ttf']
GOLD_HI, GOLD_LO, GOLD_DK = (255, 244, 186), (214, 150, 34), (92, 56, 4, 255)
NAVY = (10, 26, 80, 255)
CHEV = 0.5               # dx per dy della freccia del banner (misurato: bordo esterno x = 605 + y/2)
TY0, TY1 = 5.5, 38.5     # alto e basso della targhetta (px del banner)
X0, XB = 450, 600 + TY0 * CHEV   # inizio a sinistra; spigolo in alto a destra (5 px dentro la freccia)


def font(px):
    for f in FONTS:
        try:
            return ImageFont.truetype(f, int(px))
        except OSError:
            pass
    return ImageFont.load_default(int(px))


def vgrad(size, top, bot, y0, y1):
    """Sfumatura verticale top -> bot fra y0 e y1 (colori RGB), alta quanto il livello."""
    w, h = size
    g = Image.new('RGBA', (1, h))
    for y in range(h):
        t = min(1, max(0, (y - y0) / max(1, y1 - y0)))
        g.putpixel((0, y), tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3)) + (255,))
    return g.resize((w, h))


def outlined_text(layer, xy, text, f, fill, outline, ow):
    """Scritta con contorno pieno di spessore ow, ancorata a sinistra al centro."""
    d = ImageDraw.Draw(layer)
    d.text(xy, text, font=f, fill=outline, stroke_width=ow, stroke_fill=outline, anchor='lm')
    d.text(xy, text, font=f, fill=fill, anchor='lm')


def glow(layer, radius, alpha=150, dy=0):
    """Ombra morbida sfocata dietro il livello (stacca la targhetta dall'immagine)."""
    a = layer.getchannel('A').filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(radius))
    a = a.point(lambda v: min(255, v * alpha // 160))
    g = Image.new('RGBA', layer.size, (0, 0, 0, 0))
    g.putalpha(a)
    out = Image.new('RGBA', layer.size, (0, 0, 0, 0))
    out.paste(g, (0, dy))
    return Image.alpha_composite(out, layer)


def gold_bevel(L, shape, w, body):
    """Riempie `shape` con `body` e la cornicia con un bordo oro di spessore w: linea scura esterna,
    fascia dorata sfumata, filo chiaro interno solo in alto (luce dall'alto)."""
    m = Image.new('L', L.size, 0)
    ImageDraw.Draw(m).polygon(shape, fill=255)
    L.paste(body, (0, 0), m)
    closed = shape + [shape[0]]
    edge = Image.new('L', L.size, 0)
    ImageDraw.Draw(edge).line(closed, fill=255, width=int(w + 2.4 * S), joint='curve')
    ring = Image.new('L', L.size, 0)
    ImageDraw.Draw(ring).line(closed, fill=255, width=int(w), joint='curve')
    L.paste(Image.new('RGBA', L.size, GOLD_DK), (0, 0), edge)
    ys = [p[1] for p in shape]
    L.paste(vgrad(L.size, GOLD_HI, GOLD_LO, min(ys), max(ys)), (0, 0), ring)
    xs = [p[0] for p in shape]
    y = min(ys) + w * .5 + S
    ImageDraw.Draw(L).line([(min(xs) + w, y), (max(xs) - w, y)], fill=(255, 250, 220, 120), width=max(1, int(.6 * S)))


def round_pin(L, cx, cy, r, head=((255, 236, 140), (206, 128, 18)), edge=GOLD_DK, ang=-130):
    """Puntina da icona: testa tonda lucida con riflesso e breve ago argento (nessun font emoji)."""
    d = ImageDraw.Draw(L)
    a = math.radians(ang)
    nx, ny = cx + math.cos(a) * r * 2.0, cy - math.sin(a) * r * 2.0
    d.line([(cx, cy), (nx, ny)], fill=edge, width=int(r * .42))
    d.line([(cx, cy), (nx, ny)], fill=(236, 240, 248, 255), width=max(1, int(r * .2)))
    e = r * 1.16
    d.ellipse([cx - e, cy - e, cx + e, cy + e], fill=edge)
    m = Image.new('L', L.size, 0)
    ImageDraw.Draw(m).ellipse([cx - r, cy - r, cx + r, cy + r], fill=255)
    L.paste(vgrad(L.size, head[0], head[1], int(cy - r), int(cy + r)), (0, 0), m)
    d.ellipse([cx - r * .55, cy - r * .62, cx + r * .05, cy - r * .12], fill=(255, 255, 255, 210))


def tag_layer(size=(640, 140)):
    """Disegna la targhetta direttamente in coordinate banner (livello sovracampionato S volte)."""
    L = Image.new('RGBA', (size[0] * S, size[1] * S), (0, 0, 0, 0))
    y0, y1 = TY0 * S, TY1 * S
    ym = (y0 + y1) / 2
    x0, xb, notch = X0 * S, XB * S, 11 * S
    # coda di rondine a sinistra, lato destro obliquo parallelo alla freccia del banner
    shape = [(x0, y0), (xb, y0), (xb + (y1 - y0) * CHEV, y1), (x0, y1), (x0 + notch, ym)]
    gold_bevel(L, shape, 3.2 * S, vgrad(L.size, (90, 168, 255), (27, 63, 156), y0, y1))
    # riflesso sulla meta' alta, tenuto dentro il bordo
    m = Image.new('L', L.size, 0)
    ImageDraw.Draw(m).polygon(shape, fill=255)
    m = m.filter(ImageFilter.MinFilter(4 * S + 1))
    gl = Image.new('RGBA', L.size, (0, 0, 0, 0))
    ImageDraw.Draw(gl).rectangle([x0, y0, xb + (y1 - y0) / 2, y0 + (y1 - y0) * .46], fill=(255, 255, 255, 34))
    gl.putalpha(ImageChops.multiply(gl.getchannel('A'), m))
    L = Image.alpha_composite(L, gl)
    d = ImageDraw.Draw(L)
    # puntina e scritta bicolore, la piu' grande che entra fra la puntina e il lato destro
    px = x0 + notch + 9 * S
    round_pin(L, px, ym - 1 * S, 6.0 * S)
    tx, end = px + 10 * S, xb + 1 * S
    fs = 24 * S
    while fs > 14 * S:
        if tx + d.textlength('KEPT IN SHOP', font=font(fs)) + 2.6 * S <= end:
            break
        fs -= S / 4
    f = font(fs)
    wk = d.textlength('KEPT ', font=f)
    ty = ym + .5 * S
    outlined_text(L, (tx, ty), 'KEPT', f, (255, 222, 60, 255), NAVY, int(2.4 * S))
    outlined_text(L, (tx + wk, ty), 'IN SHOP', f, (255, 255, 255, 255), NAVY, int(2.4 * S))
    return glow(L, 3 * S, alpha=150, dy=S)


def main(src, dst):
    im = Image.open(src).convert('RGBA')
    w, h = im.size
    k = w / 640.0
    badge = tag_layer()
    if k != 1:
        badge = badge.resize((int(badge.width * k), int(badge.height * k)), Image.LANCZOS)
    big = Image.new('RGBA', (w * S, h * S), (0, 0, 0, 0))
    big.paste(badge, (int(320 * k * S - badge.width / 2), int(70 * k * S - badge.height / 2)), badge)
    over = big.resize((w, h), Image.LANCZOS)
    Image.alpha_composite(im, over).save(dst, 'PNG')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(2)
    main(sys.argv[1], sys.argv[2])
