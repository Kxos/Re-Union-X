"""Genera le armature Cocostudio 1.6 mancanti della bacheca Avatar Board.

Z_SpRoute_{S,B}_{UD,LR,UL,UR,DL,DR}, SphereAnimation (START), Z_SpCursor.
Struttura copiata da Z_SpIcon_Eff.ExportJson (originale).
    python gen_arm.py <cartella uscita>
"""
import json
import math
import os
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = sys.argv[1]
SS = 4  # supersampling

CW, CH = 101, 78          # cella G (LAYOUT.md)
OV = 6                    # sporgenza delle linee piene oltre il bordo della cella
RW, RH = CW + 2 * OV, CH + 2 * OV
RADIUS = 30               # raggio delle curve
LINE_W = 10
DOT_D = 10
DOT_STEP = 16

ORANGE = ((208, 122, 42), (120, 62, 20), (240, 168, 90))   # core, bordo, riflesso
YELLOW = ((240, 200, 40), (150, 110, 10), (255, 240, 140))
DOT = ((138, 166, 224), (90, 112, 180), (205, 220, 255))


# ---------------------------------------------------------------- geometria
def route_path(kind):
    """Punti (in px, origine = centro della cella, y verso il basso) lungo il percorso."""
    hx, hy = CW / 2, CH / 2
    ends = {'U': (0, -hy), 'D': (0, hy), 'L': (-hx, 0), 'R': (hx, 0)}
    a, b = ends[kind[0]], ends[kind[1]]
    if kind in ('UD', 'LR'):
        return [a, b]
    # angolo: segmento dritto dal bordo a, arco, segmento dritto fino al bordo b
    pts = []
    # punto in cui inizia la curva sul ramo a e sul ramo b
    def toward(p, r):
        d = math.hypot(*p)
        return (p[0] / d * r, p[1] / d * r)
    pa, pb = toward(a, RADIUS), toward(b, RADIUS)
    cx, cy = pa[0] + pb[0], pa[1] + pb[1]       # centro dell'arco
    pts.append(a)
    pts.append(pa)
    a0 = math.atan2(pa[1] - cy, pa[0] - cx)
    a1 = math.atan2(pb[1] - cy, pb[0] - cx)
    da = (a1 - a0 + math.pi) % (2 * math.pi) - math.pi
    for i in range(1, 24):
        t = a0 + da * i / 24
        pts.append((cx + RADIUS * math.cos(t), cy + RADIUS * math.sin(t)))
    pts.append(pb)
    pts.append(b)
    return pts


def extend(pts, n):
    """Allunga di n px i due capi (sporgenza nelle celle vicine)."""
    def ext(p, q):
        dx, dy = p[0] - q[0], p[1] - q[1]
        d = math.hypot(dx, dy)
        return (p[0] + dx / d * n, p[1] + dy / d * n)
    return [ext(pts[0], pts[1])] + pts[1:-1] + [ext(pts[-1], pts[-2])]


def resample(pts, step_target):
    seg = [math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]) for i in range(len(pts) - 1)]
    L = sum(seg)
    n = max(1, round(L / step_target))
    s = L / n
    out = []
    for k in range(n):
        d = (k + 0.5) * s
        for i, l in enumerate(seg):
            if d <= l or i == len(seg) - 1:
                t = d / l if l else 0
                out.append((pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t,
                            pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t))
                break
            d -= l
    return out


def to_px(p, w, h):
    return ((p[0] + w / 2) * SS, (p[1] + h / 2) * SS)


def draw_solid(kind, col):
    core, edge, hi = col
    img = Image.new('RGBA', (RW * SS, RH * SS), (0, 0, 0, 0))
    dr = ImageDraw.Draw(img)
    pts = [to_px(p, RW, RH) for p in extend(route_path(kind), OV)]
    for w, c in ((LINE_W + 2, edge), (LINE_W - 1, core), (2, hi)):
        dr.line(pts, fill=c + (255,), width=int(w * SS), joint='curve')
    return img.resize((RW, RH), Image.LANCZOS)


def draw_dots(kind):
    core, edge, hi = DOT
    img = Image.new('RGBA', (RW * SS, RH * SS), (0, 0, 0, 0))
    dr = ImageDraw.Draw(img)
    for p in resample(route_path(kind), DOT_STEP):
        x, y = to_px(p, RW, RH)
        r = DOT_D / 2 * SS
        dr.ellipse((x - r, y - r, x + r, y + r), fill=edge + (255,))
        r2 = r - 1.2 * SS
        dr.ellipse((x - r2, y - r2, x + r2, y + r2), fill=core + (255,))
        r3 = r * 0.35
        dr.ellipse((x - r3 - SS, y - r3 - SS, x + r3 - SS, y + r3 - SS), fill=hi + (255,))
    return img.resize((RW, RH), Image.LANCZOS)


def draw_cursor():
    S = 232            # 66 * sqrt(2) + spessore e alone: ci sta anche ruotato di 45 gradi
    img = Image.new('RGBA', (S * SS, S * SS), (0, 0, 0, 0))
    half = 56          # semilato del quadrato: stretto attorno al nodo come in ab_32
    arm = 30
    th = 17
    c = S / 2
    shapes = []
    for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
        cx, cy = c + sx * half, c + sy * half
        shapes.append([(cx, cy - sy * arm), (cx, cy), (cx - sx * arm, cy)])
    glow = Image.new('RGBA', img.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for s in shapes:
        gd.line([(x * SS, y * SS) for x, y in s], fill=(255, 190, 220, 200), width=(th + 8) * SS, joint='curve')
    glow = glow.filter(ImageFilter.GaussianBlur(5 * SS))
    img.alpha_composite(glow)
    dr = ImageDraw.Draw(img)
    for s in shapes:
        pts = [(x * SS, y * SS) for x, y in s]
        dr.line(pts, fill=(222, 70, 128, 255), width=th * SS, joint='curve')
        for p in (pts[0], pts[-1], pts[1]):
            r = th * SS / 2
            dr.ellipse((p[0] - r, p[1] - r, p[0] + r, p[1] + r), fill=(222, 70, 128, 255))
        dr.line(pts, fill=(240, 120, 160, 255), width=(th - 6) * SS, joint='curve')
        dr.line(pts, fill=(250, 172, 198, 255), width=4 * SS, joint='curve')
    return img.resize((S, S), Image.LANCZOS)


def draw_start():
    W, H = 136, 104
    img = Image.new('RGBA', (W * SS, H * SS), (0, 0, 0, 0))
    cx, cy, R = W / 2 * SS, H / 2 * SS, 44 * SS
    # sfera: gradiente radiale con centro in alto a sinistra
    sph = Image.new('RGBA', img.size, (0, 0, 0, 0))
    px = sph.load()
    fx, fy = cx - R * 0.3, cy - R * 0.35
    for y in range(int(cy - R), int(cy + R) + 1):
        for x in range(int(cx - R), int(cx + R) + 1):
            if (x - cx) ** 2 + (y - cy) ** 2 > R * R:
                continue
            t = min(1.0, math.hypot(x - fx, y - fy) / (R * 1.45))
            stops = [(0.0, (255, 236, 90)), (0.45, (255, 168, 20)), (0.8, (250, 100, 0)), (1.0, (220, 50, 0))]
            for i in range(len(stops) - 1):
                if t <= stops[i + 1][0]:
                    u = (t - stops[i][0]) / (stops[i + 1][0] - stops[i][0])
                    c0, c1 = stops[i][1], stops[i + 1][1]
                    px[x, y] = tuple(int(c0[k] + (c1[k] - c0[k]) * u) for k in range(3)) + (255,)
                    break
    img.alpha_composite(sph)
    dr = ImageDraw.Draw(img)
    dr.ellipse((cx - R, cy - R, cx + R, cy + R), outline=(196, 30, 0, 255), width=4 * SS)
    dr.ellipse((cx - R + 4 * SS, cy - R + 4 * SS, cx + R - 4 * SS, cy + R - 4 * SS), outline=(255, 140, 40, 160), width=2 * SS)
    # riflesso
    hl = Image.new('RGBA', img.size, (0, 0, 0, 0))
    ImageDraw.Draw(hl).ellipse((cx - R * 0.62, cy - R * 0.72, cx - R * 0.22, cy - R * 0.36), fill=(255, 255, 255, 230))
    img.alpha_composite(hl.filter(ImageFilter.GaussianBlur(2 * SS)))
    # testo START corsivo
    font = ImageFont.truetype('C:/Windows/Fonts/ariblk.ttf', 29 * SS)
    txt = Image.new('RGBA', (W * SS * 2, 60 * SS), (0, 0, 0, 0))
    td = ImageDraw.Draw(txt)
    bb = td.textbbox((0, 0), 'START', font=font, stroke_width=4 * SS)
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    ox, oy = (txt.width - tw) / 2 - bb[0], (txt.height - th) / 2 - bb[1]
    td.text((ox, oy), 'START', font=font, fill=(150, 20, 0, 255), stroke_width=4 * SS, stroke_fill=(150, 20, 0, 255))
    # riempimento a gradiente verticale giallo -> arancio
    mask = Image.new('L', txt.size, 0)
    ImageDraw.Draw(mask).text((ox, oy), 'START', font=font, fill=255)
    grad = Image.new('RGBA', txt.size)
    gp = ImageDraw.Draw(grad)
    top, bot = oy + bb[1], oy + bb[3]
    for y in range(txt.height):
        u = min(1, max(0, (y - top) / max(1, bot - top)))
        c0, c1 = (255, 250, 150), (255, 140, 0)
        gp.line((0, y, txt.width, y), fill=tuple(int(c0[k] + (c1[k] - c0[k]) * u) for k in range(3)) + (255,))
    txt.paste(grad, (0, 0), mask)
    # corsivo: shear
    txt = txt.transform(txt.size, Image.AFFINE, (1, 0.22, -0.22 * txt.height / 2, 0, 1, 0), Image.BICUBIC)
    sc = (W * SS - 2 * SS) / tw if tw > W * SS - 2 * SS else 1.0
    if sc < 1:
        txt = txt.resize((int(txt.width * sc), int(txt.height * sc)), Image.LANCZOS)
    img.alpha_composite(txt, (int(cx - txt.width / 2), int(cy - txt.height / 2 + 2 * SS)))
    return img.resize((W, H), Image.LANCZOS)


def draw_start_glow():
    S = 128
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(img).ellipse((S / 2 - 50, S / 2 - 50, S / 2 + 50, S / 2 + 50), fill=(255, 150, 40, 200))
    return img.filter(ImageFilter.GaussianBlur(9))


# ---------------------------------------------------------------- Cocostudio
def frame(fi, dI=0, color=None, kX=0.0, cX=1.0):
    f = {'dI': dI, 'x': 0.0, 'y': 0.0, 'z': 0, 'cX': cX, 'cY': cX, 'kX': kX, 'kY': kX, 'fi': fi,
         'twE': 0, 'tweenFrame': True, 'bd_src': 1, 'bd_dst': 771}
    if color is not None:
        f['color'] = {'a': color, 'r': 255, 'g': 255, 'b': 255}
    return f


def bone(name, displays, z, dI=0):
    return {'name': name, 'parent': '', 'dI': dI, 'x': 0.0, 'y': 0.0, 'z': z, 'cX': 1.0, 'cY': 1.0,
            'kX': 0.0, 'kY': 0.0, 'arrow_x': 0.0, 'arrow_y': 0.0, 'effectbyskeleton': False, 'bl': 0,
            'display_data': [{'name': d + '.png', 'displayType': 0,
                              'skin_data': [{'x': 0.0, 'y': 0.0, 'cX': 1.0, 'cY': 1.0, 'kX': 0.0, 'kY': 0.0}]}
                             for d in displays]}


def mov(name, dr, bones):
    return {'name': name, 'dr': dr, 'lp': True, 'to': 0, 'drTW': 0, 'twE': 0, 'sc': 1.0,
            'mov_bone_data': [{'name': b, 'dl': 0.0, 'frame_data': f} for b, f in bones]}


def pack(images):
    """Scaffali semplici in una texture POT; ritorna (atlas, {nome: (x,y,w,h)})."""
    W = 512
    while True:
        x = y = rowh = 0
        pos = {}
        ok = True
        for n, im in sorted(images.items(), key=lambda kv: -kv[1].height):
            if x + im.width + 2 > W:
                x, y, rowh = 0, y + rowh + 2, 0
            pos[n] = (x, y, im.width, im.height)
            x += im.width + 2
            rowh = max(rowh, im.height)
        H = 1
        while H < y + rowh:
            H *= 2
        if H <= W:
            break
        W *= 2
    atlas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    for n, (x, y, w, h) in pos.items():
        atlas.paste(images[n], (x, y))
    return atlas, pos


def plist(name, pos, size):
    fr = []
    for n, (x, y, w, h) in pos.items():
        fr.append(f'''\t\t\t<key>{n}.png</key>
\t\t\t<dict>
\t\t\t\t<key>width</key>
\t\t\t\t<integer>{w}</integer>
\t\t\t\t<key>height</key>
\t\t\t\t<integer>{h}</integer>
\t\t\t\t<key>originalWidth</key>
\t\t\t\t<integer>{w}</integer>
\t\t\t\t<key>originalHeight</key>
\t\t\t\t<integer>{h}</integer>
\t\t\t\t<key>x</key>
\t\t\t\t<integer>{x}</integer>
\t\t\t\t<key>y</key>
\t\t\t\t<integer>{y}</integer>
\t\t\t\t<key>offsetX</key>
\t\t\t\t<real>0</real>
\t\t\t\t<key>offsetY</key>
\t\t\t\t<real>0</real>
\t\t\t</dict>
''')
    W, H = size
    return ('<?xml version="1.0" encoding="utf-8"?>\n'
            '<!DOCTYPE plist PUBLIC "-//Apple Computer//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n'
            '<plist version="1.0">\n\t<dict>\n\t\t<key>frames</key>\n\t\t<dict>\n' + ''.join(fr) +
            f'''\t\t</dict>
\t\t<key>metadata</key>
\t\t<dict>
\t\t\t<key>format</key>
\t\t\t<integer>0</integer>
\t\t\t<key>textureFileName</key>
\t\t\t<string>{name}0.png</string>
\t\t\t<key>realTextureFileName</key>
\t\t\t<string>{name}0.png</string>
\t\t\t<key>size</key>
\t\t\t<string>{{{W},{H}}}</string>
\t\t</dict>
\t\t<key>texture</key>
\t\t<dict>
\t\t\t<key>width</key>
\t\t\t<integer>{W}</integer>
\t\t\t<key>height</key>
\t\t\t<integer>{H}</integer>
\t\t</dict>
\t</dict>
</plist>
''')


def write(name, bones, movs, images):
    atlas, pos = pack(images)
    j = {'content_scale': 1.0,
         'armature_data': [{'strVersion': '1.6.0.0', 'version': 1.6, 'name': name, 'bone_data': bones}],
         'animation_data': [{'name': name, 'mov_data': movs}],
         'texture_data': [{'name': n, 'width': float(im.width), 'height': float(im.height),
                           'pX': 0.5, 'pY': 0.5, 'plistFile': ''} for n, im in images.items()],
         'config_file_path': [name + '0.plist'],
         'config_png_path': [name + '0.png']}
    with open(os.path.join(OUT, name + '.ExportJson'), 'w', encoding='utf-8', newline='\n') as f:
        json.dump(j, f, indent=2)
    with open(os.path.join(OUT, name + '0.plist'), 'w', encoding='utf-8', newline='\n') as f:
        f.write(plist(name, pos, atlas.size))
    atlas.save(os.path.join(OUT, name + '0.png'), optimize=True)


def main():
    os.makedirs(OUT, exist_ok=True)
    pulse = [frame(0, 0, 255), frame(20, 0, 150), frame(40, 0, 255)]
    for kind in ('UD', 'LR', 'UL', 'UR', 'DL', 'DR'):
        imgs = {f'SpRoute_{kind}_Lock': draw_dots(kind),
                f'SpRoute_{kind}_Release': draw_solid(kind, ORANGE),
                f'SpRoute_{kind}_Target': draw_solid(kind, YELLOW)}
        names = list(imgs)
        for sb in 'SB':
            name = f'Z_SpRoute_{sb}_{kind}'
            # indice 0/1/2 = stato del nodo a cui porta il percorso (playWithIndex)
            movs = [mov('Lock', 1, [('Route', [frame(0, 0)])]),
                    mov('Release', 1, [('Route', [frame(0, 1)])]),
                    mov('Target', 41, [('Route', [dict(f, dI=2) for f in pulse])])]
            write(name, [bone('Route', names, 1)], movs, imgs)

    imgs = {'SpStart_Glow': draw_start_glow(), 'SpStart': draw_start()}
    glow = [frame(0, 0, 90, cX=0.95), frame(30, 0, 220, cX=1.08), frame(60, 0, 90, cX=0.95)]
    still = [frame(0, 0)]
    movs = [mov(n, 61, [('Glow', glow), ('Start', still)]) for n in ('Lock', 'Release', 'Target')]
    write('SphereAnimation', [bone('Glow', ['SpStart_Glow'], 1), bone('Start', ['SpStart'], 2)], movs, imgs)

    # cursore: rotazione rigida (riferimenti ab_29..32) fatta con fotogrammi gia' ruotati e
    # cambio di dI, come Z_SpIcon_Eff. Con kX/kY interpolati il client deformava l'immagine
    # (staffe schiacciate in scie diagonali a meta' giro). Simmetrico a 90 gradi: 12 passi
    # da 7,5 gradi, 5 fotogrammi l'uno, chiudono il giro senza scatti
    cur = draw_cursor()
    steps = 12
    imgs = {f'SpCursor_{i:02d}': cur.rotate(-90 * i / steps, resample=Image.BICUBIC) for i in range(steps)}
    rot = [frame(5 * i, i) for i in range(steps)] + [frame(5 * steps, 0)]
    write('Z_SpCursor', [bone('Cursor', list(imgs), 1)], [mov('Loop', 5 * steps + 1, [('Cursor', rot)])], imgs)


if __name__ == '__main__':
    main()
