"""Texture dell'interfaccia che non esistono in nessuna risorsa servita (le avevano i client
2015-2017, Dark Road le ha tolte): ricostruite con Pillow e scritte in formato BTF.

    python recon/tools/make_textures.py <cartella catalogo estratto> <uscita>

<cartella catalogo estratto> = res_bulk.py (catalog\\files), per le texture di partenza;
<uscita> = stage_gen\\files: i file finiscono in cocostudio/publish/<nome>. Pillow: senza -I.

Riferimento: reference\\medal_list\\sort_filter\\ (guida khux-guides 2017).
"""
import os
import shutil
import sys

from PIL import Image, ImageChops, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import btf  # noqa: E402

src, out = sys.argv[1:3]
pub = os.path.join(out, 'cocostudio', 'publish')
os.makedirs(pub, exist_ok=True)
S = 4                                        # disegno a 4x e riduzione (bordi morbidi)


def save(name, im):
    with open(os.path.join(pub, name), 'wb') as fh:
        fh.write(btf.encode(im))
    print(name, im.size)


def load(rel):
    return btf.decode(open(os.path.join(src, *rel.split('/')), 'rb').read())


def switch(active_left):
    """Sf_Switch1/2 (373x59, PopupNormal_SortMedal_ver260: Switch_Sort / Switch_Filter):
    pillola blu scuro con bordo azzurro, la meta' attiva magenta (colori dallo screenshot:
    fondo 6,40,75; bordo 9,144,210; magenta 204,2,210 -> 185,0,194)."""
    w, h = 373, 59
    im = Image.new('RGBA', (w * S, h * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    r = h * S // 2
    d.rounded_rectangle((0, 0, w * S - 1, h * S - 1), r, fill=(9, 144, 210, 255))
    b = 3 * S
    d.rounded_rectangle((b, b, w * S - 1 - b, h * S - 1 - b), r - b, fill=(6, 40, 75, 255))
    half = Image.new('RGBA', im.size, (0, 0, 0, 0))
    hd = ImageDraw.Draw(half)
    for y in range(b, h * S - b):           # sfumatura verticale del magenta
        t = (y - b) / (h * S - 2 * b)
        hd.line((0, y, w * S, y), fill=(int(214 - 30 * t), int(10 - 10 * t), int(220 - 26 * t), 255))
    mask = Image.new('L', im.size, 0)
    md = ImageDraw.Draw(mask)
    x0, x1 = (b, w * S // 2) if active_left else (w * S // 2, w * S - 1 - b)
    md.rounded_rectangle((x0, b, x1, h * S - 1 - b), r - b, fill=255)
    if active_left:                         # lato verso il centro dritto
        md.rectangle((x1 - r, b, x1, h * S - 1 - b), fill=255)
    else:
        md.rectangle((x0, b, x0 + r, h * S - 1 - b), fill=255)
    im.paste(half, (0, 0), mask)
    return im.resize((w, h), Image.LANCZOS)


def sort_arrow(up):
    """Sf_But_21/22 (149x54, Logo_Up / Logo_Down di Sort_Up / Sort_Down): triangolo bianco a
    sinistra del testo (nello screenshot «▲昇順» / «▼降順»), fondo trasparente."""
    w, h = 149, 54
    im = Image.new('RGBA', (w * S, h * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    cx, cy, a = 38 * S, h * S // 2, 8 * S
    pts = [(cx - a, cy + a * 0.7), (cx + a, cy + a * 0.7), (cx, cy - a * 0.9)] if up else \
        [(cx - a, cy - a * 0.7), (cx + a, cy - a * 0.7), (cx, cy + a * 0.9)]
    d.polygon(pts, fill=(255, 255, 255, 255))
    return im.resize((w, h), Image.LANCZOS)


save('Sf_Switch1.png', switch(True))
save('Sf_Switch2.png', switch(False))
save('Sf_But_21.png', sort_arrow(True))
save('Sf_But_22.png', sort_arrow(False))
# rare_star (26x26, i filtri della rarita'): la stella della rarita' delle medaglie
save('rare_star.png', load('img/ui/Rare_Medal_Star01.png').resize((26, 26), Image.LANCZOS))


def fit(im, size, box=None):
    """im (ritagliata al contenuto) ridotta/ingrandita dentro box (default: tutta la tela)
    e centrata su una tela trasparente size."""
    im = im.crop(im.getbbox())
    bw, bh = box or size
    k = min(bw / im.width, bh / im.height)
    im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
    out = Image.new('RGBA', size, (0, 0, 0, 0))
    out.alpha_composite(im, ((size[0] - im.width) // 2, (size[1] - im.height) // 2))
    return out


# icone dei tipi di abilita' nel filtro (Filter_Ability01..12, scala 0,7): spada (Buff01),
# scudo (Buff05) con freccia su (Buff_UP, rossa) o giu' (Buff_Down, blu capovolta), e il
# simbolo degli attributi (Sf_Icon_Zokusei) per le abilita' «di attributo»
save('Buff01.png', fit(load('cocostudio/publish/Ico_Param_Offense.png'), (77, 54), (60, 50)))
save('Buff05.png', fit(load('cocostudio/publish/Ico_Param_Defense.png'), (77, 54), (60, 50)))
save('Buff_UP.png', fit(load('cocostudio/publish/Minfo_Def04A.png'), (24, 34)))
save('Buff_Down.png', fit(load('img/ui/Minfo_Def04C.png').transpose(Image.FLIP_TOP_BOTTOM), (24, 34)))
save('Sf_Icon_Zokusei.png', fit(load('cocostudio/publish/AttributeCompatibility.png'), (46, 44)))
def hslice(im, w, h, cap):
    """Ridimensiona un pulsante a w x h tenendo gli angoli: fasce laterali di cap px fisse,
    centro stirato (dopo aver portato l'altezza a h)."""
    k = h / im.height
    im = im.resize((round(im.width * k), h), Image.LANCZOS)
    c = round(cap * k)
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    out.paste(im.crop((0, 0, c, h)), (0, 0))
    out.paste(im.crop((im.width - c, 0, im.width, h)), (w - c, 0))
    out.paste(im.crop((c, 0, im.width - c, h)).resize((w - 2 * c, h), Image.LANCZOS), (c, 0))
    return out


# But23 (CheckBox 95x72 dei filtri Guilt e Skill: la CheckBox usa la texture a dimensione
# naturale): But16 dello stesso popup ridotto a 95x58 con gli angoli intatti, su tela 95x72
for suf in ('Off', 'On'):
    b = Image.new('RGBA', (95, 72), (0, 0, 0, 0))
    b.alpha_composite(hslice(load('cocostudio/publish/But16_%s.png' % suf), 95, 58, 30), (0, 7))
    save('But23_%s.png' % suf, b)
def mog_tab(active):
    """Scheda del Moogle Shop (img/ui/Mogshop_tab_Off/_On, pulsante):
    linguetta arrotondata in alto; spenta blu scuro con bordo azzurro, accesa azzurra
    (reference\\moogle_shop\\jp410_160.png); 200x48 come le schede di moogle_shop_01.png."""
    w, h = 200, 48
    im = Image.new('RGBA', (w * S, h * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    r = 10 * S
    d.rounded_rectangle((0, 0, w * S - 1, h * S + r), r, fill=(90, 190, 240, 255))
    b = 2 * S
    top, bottom = ((80, 200, 245), (40, 140, 210)) if active else ((25, 70, 150), (15, 45, 110))
    for y in range(b, h * S):
        t = y / (h * S)
        c = tuple(int(top[k] + (bottom[k] - top[k]) * t) for k in range(3))
        d.line((b, y, w * S - 1 - b, y), fill=c + (255,))
    mask = Image.new('L', im.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, w * S - 1, h * S + r), r, fill=255)
    out = Image.new('RGBA', im.size, (0, 0, 0, 0))
    out.paste(im, (0, 0), mask)
    return out.resize((w, h), Image.LANCZOS)


def save_ui(name, im):
    p = os.path.join(out, 'img', 'ui')
    os.makedirs(p, exist_ok=True)
    with open(os.path.join(p, name), 'wb') as fh:
        fh.write(btf.encode(im))
    print('img/ui/' + name, im.size)


def mog_plate():
    """Riquadro dell'icona di un articolo del Moogle Shop (img/ui/Mogshop_plate1.png, Base di
    MoogleShop_IconPanel, caricato): quadrato arrotondato quasi nero con
    bordo chiaro sottile (reference\\moogle_shop\\moogle_shop_01.png)."""
    w = 140
    im = Image.new('RGBA', (w * S, w * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    r = 12 * S
    d.rounded_rectangle((0, 0, w * S - 1, w * S - 1), r, fill=(190, 200, 215, 255))
    b = 3 * S
    inner = Image.new('RGBA', im.size, (0, 0, 0, 0))
    idr = ImageDraw.Draw(inner)
    for y in range(w * S):                  # sfumatura verticale blu notte
        t = y / (w * S)
        idr.line((0, y, w * S, y), fill=(int(8 + 14 * t), int(14 + 24 * t), int(28 + 40 * t), 255))
    mask = Image.new('L', im.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((b, b, w * S - 1 - b, w * S - 1 - b), r - b, fill=255)
    im.paste(inner, (0, 0), mask)
    return im.resize((w, w), Image.LANCZOS)


def mog_row(gold, pressed):
    """Righe dei trait del Moogle Shop: img/ui/But29_* (blu) e But31_* (dorata, offerte a
    tempo), caricate da changeRowKakusei (crash in loadTexture se mancano).
    Colori da reference\\moogle_shop\\moogle_shop_traits_yt_03.jpg: blu 30,110,200 ->
    20,80,170 con bordo azzurro; dorata 250,175,50 -> 225,120,20 con bordo giallo chiaro.
    Premuta un po' piu' scura."""
    w, h = 704, 106
    im = Image.new('RGBA', (w * S, h * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    r = 10 * S
    edge, top, bottom = (((255, 235, 150), (250, 175, 50), (225, 120, 20)) if gold
                         else ((110, 200, 250), (30, 110, 200), (20, 80, 170)))
    if pressed:
        top, bottom = tuple(int(c * 0.8) for c in top), tuple(int(c * 0.8) for c in bottom)
    d.rounded_rectangle((0, 0, w * S - 1, h * S - 1), r, fill=edge + (255,))
    b = 3 * S
    body = Image.new('RGBA', im.size, (0, 0, 0, 0))
    bd = ImageDraw.Draw(body)
    for y in range(h * S):
        t = y / (h * S)
        bd.line((0, y, w * S, y), fill=tuple(int(top[k] + (bottom[k] - top[k]) * t) for k in range(3)) + (255,))
    mask = Image.new('L', im.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((b, b, w * S - 1 - b, h * S - 1 - b), r - b, fill=255)
    im.paste(body, (0, 0), mask)
    return im.resize((w, h), Image.LANCZOS)


for _name, _gold in (('But29', False), ('But31', True)):
    save_ui(_name + '_Off.png', mog_row(_gold, False))
    save_ui(_name + '_On.png', mog_row(_gold, True))
save_ui('Mogshop_tab_Off.png', mog_tab(False))
save_ui('Mogshop_tab_On.png', mog_tab(True))
save_ui('Mogshop_plate1.png', mog_plate())
save('Mogshop_plate1.png', mog_plate())          # Base di MoogleShop_IconPanel (riga normale)


def mission_tab(state):
    """Schede della finestra Missioni (img/ui/MyMission_Category_On/_Off/_Disable, pulsante): linguetta 176x50 arrotondata in alto, aperta in basso
    sulla finestra. Colori da reference\\other_menu\\missions_list_01.jpg: spenta blu notte
    19,37,113 con bordo 30,75,160; accesa 36,80,145 con bordo azzurro 70,146,206."""
    w, h = 176, 50
    edge, body = {'On': ((70, 146, 206), (36, 80, 145)),
                  'Off': ((30, 75, 160), (19, 37, 113)),
                  'Disable': ((70, 75, 90), (40, 42, 55))}[state]
    im = Image.new('RGBA', (w * S, h * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    r = 11 * S
    d.rounded_rectangle((0, 0, w * S - 1, h * S + r), r, fill=edge + (255,))
    b = 5 * S
    inner = Image.new('RGBA', im.size, (0, 0, 0, 0))
    idr = ImageDraw.Draw(inner)
    for y in range(h * S):                  # leggera luce in alto
        t = min(1.0, y / (h * S * 0.35))
        idr.line((0, y, w * S, y), fill=tuple(int(body[k] * (1.15 - 0.15 * t)) for k in range(3)) + (255,))
    mask = Image.new('L', im.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((b, b, w * S - 1 - b, h * S + r), r - b, fill=255)
    im.paste(inner, (0, 0), mask)
    return im.resize((w, h), Image.LANCZOS)


def mission_person(draw, cx, top, k):
    """Omino dorato sorridente (testa tonda, corpo a campana) di altezza 36*k."""
    hr = 9.5 * k
    hx, hy = cx, top + hr
    draw.polygon([(cx - 3 * k, hy + hr - 2 * k), (cx + 3 * k, hy + hr - 2 * k),
                  (cx + 9.5 * k, top + 36 * k), (cx - 9.5 * k, top + 36 * k)], fill=(214, 176, 40, 255))
    draw.ellipse((hx - hr, hy - hr, hx + hr, hy + hr), fill=(236, 205, 60, 255))
    draw.ellipse((hx - hr + 1.5 * k, hy - hr + 1 * k, hx + hr - 2.5 * k, hy + hr - 3 * k),
                 fill=(250, 236, 80, 255))
    e = 1.4 * k
    for ex in (hx - 3.3 * k, hx + 3.3 * k):
        draw.ellipse((ex - e, hy - 2.5 * k - e, ex + e, hy - 2.5 * k + e), fill=(70, 50, 10, 255))
    draw.arc((hx - 5 * k, hy - 3.5 * k, hx + 5 * k, hy + 5 * k), 25, 155, fill=(70, 50, 10, 255),
             width=max(1, int(1.3 * k)))


def mission_group_icon(n):
    """img/ui/MyMission_GroupIcon1/2 (missioni personali / di party): uno o due omini dorati
    come in missions_list_01.jpg (Daily e Limited uno, Weekly due)."""
    w, h = (28, 38) if n == 1 else (48, 38)
    im = Image.new('RGBA', (w * S, h * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    for cx in ([14] if n == 1 else [14, 34]):
        mission_person(d, cx * S, 1 * S, S)
    return im.resize((w, h), Image.LANCZOS)


for _st in ('On', 'Off', 'Disable'):
    save_ui('MyMission_Category_%s.png' % _st, mission_tab(_st))
save_ui('MyMission_GroupIcon1.png', mission_group_icon(1))
save_ui('MyMission_GroupIcon2.png', mission_group_icon(2))
def mission_stock():
    """Pillola blu notte (16,37,68, senza bordo) dietro «Missions Cleared n/m», 426x28."""
    w, h = 426, 28
    im = Image.new('RGBA', (w * S, h * S), (0, 0, 0, 0))
    ImageDraw.Draw(im).rounded_rectangle((0, 0, w * S - 1, h * S - 1), h * S // 2, fill=(16, 37, 68, 255))
    return im.resize((w, h), Image.LANCZOS)


save('MyMission_Stock.png', mission_stock())
# texture iniziali di tab1..tab4 e GroupIcon in MyPageMission_Base_ver320 (il codice le sostituisce)
save('MyMission_Category_Off.png', mission_tab('Off'))
save('MyMission_GroupIcon1.png', mission_group_icon(1))
# Icone dei materiali assenti dalle risorse (ce ne sono 9): scaricate dalla khuxwiki con
# fetch_material_icons.py in reference\materials, ritagliate sul contenuto e messe al centro
# di una tela 80x90 come le originali (contenuto ~50-66 px). Servono a Sell Materials e al
# Moogle Shop (img/material/material_%d.png).
MAT = os.path.join(src, '..', '..', 'reference', 'materials')
if os.path.isdir(MAT):
    for fn in sorted(os.listdir(MAT)):
        if not fn.startswith('material_') or not fn.endswith('.png'):
            continue
        ic = Image.open(os.path.join(MAT, fn)).convert('RGBA')
        ic = ic.crop(ic.getbbox() or (0, 0) + ic.size)
        k = 66 / max(ic.size)
        ic = ic.resize((max(1, round(ic.width * k)), max(1, round(ic.height * k))), Image.LANCZOS)
        canvas = Image.new('RGBA', (80, 90), (0, 0, 0, 0))
        canvas.paste(ic, ((80 - ic.width) // 2, (90 - ic.height) // 2), ic)
        p = os.path.join(out, 'img', 'material')
        os.makedirs(p, exist_ok=True)
        with open(os.path.join(p, fn), 'wb') as fh:
            fh.write(btf.encode(canvas))
    print('img/material: icone dalla khuxwiki', len(os.listdir(MAT)))
# Icone del tier (SP Attack Bonus, guiltValue 1-10; docs/notes/medaglie.md#tier). Nelle risorse ci
# sono solo le tier 1-8: MedalInfo_Guilt (100x100, sagoma blu notte con la cifra: dettaglio e
# filtro), Guilt_draw / Guilt_num_draw (57x53), Guilt_Err (36x36 rossa), Guilt4_On (e Guilt5_On in
# publish). Il client 4.3.1 conosce le tier 9-10 (filtro Filter_Guilt1..10) e carica anche
# Guilt%d_On/_Off/_num e MD_Guilt%d_On/_Off/_Num (icone del keyblade). Riferimento:
# le icone della khuxwiki (pagina «Special Attack Bonus», scaricate in reference\medal_tier: attive
# = Guilt_On 34x34 per le tier 1-8 e 42x42 per 9-10, inattive 42x42 = Guilt_Off). Sagome delle tier
# 9-10 dalle icone inattive della wiki; cifre «9» = «6» ruotato di 180 gradi, «0» = «8» senza la
# barra centrale (stesso carattere delle originali).
TIER = os.path.join(src, '..', '..', 'reference', 'medal_tier')


def save_guilt(name, im):
    p = os.path.join(out, 'img', 'ui', 'guilt')
    os.makedirs(p, exist_ok=True)
    with open(os.path.join(p, name), 'wb') as fh:
        fh.write(btf.encode(im))
    print('img/ui/guilt/' + name, im.size)


def wiki_tier(n, inactive=False):
    return Image.open(os.path.join(TIER, 'Special_Attack_Bonus_Level_%d_%sKHUX.png'
                                   % (n, 'Inactive_' if inactive else ''))).convert('RGBA')


def tier_mask(n):
    """Sagoma della tier n (L, 34x34). Tier 1-8: i pixel viola dell'icona inattiva della wiki,
    dentro la cornice. Tier 9-10: i tratti rossi, bianchi e gialli dell'icona ATTIVA (l'inattiva
    e' una macchia piena: dava sagome tozze, poi tagliate a cerchio, «tagliate» sul banco)."""
    if n < 9:
        im = wiki_tier(n, True).crop((4, 4, 38, 38))
        px = im.load()
        m = Image.new('L', im.size, 0)
        mp = m.load()
        for y in range(im.height):
            for x in range(im.width):
                r, g, b, a = px[x, y]
                mp[x, y] = max(0, min(255, int((min(r, b) - g - 20) * 3))) if a else 0
        return m
    im = wiki_tier(n).crop((4, 4, 38, 38))
    px = im.load()
    m = Image.new('L', im.size, 0)
    mp = m.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            red = r > 110 and b < r * 0.75
            white = r > 180 and g > 150 and b > 150 and b <= g + 40
            yellow = r > 180 and g > 150 and b < 120
            mp[x, y] = 255 if a >= 128 and (red or white or yellow) else 0
    return m


def big_mask(n, size):
    """Sagoma pulita a size x size: la maschera 34x34 ingrandita a 8x la dimensione finale,
    sfocata (contorno liscio, come vettorializzato), soglia netta, poi ridotta con LANCZOS
    (antialias di 1 px come le originali). Tier 9-10: verso il bordo della cornice la maschera
    si attenua (dall'88% del raggio), cosi' le punte che la cornice della wiki taglia diventano
    punte affilate invece di tagli dritti."""
    import math
    from PIL import ImageFilter
    big = size * 8
    m = tier_mask(n).resize((big, big), Image.BICUBIC).filter(ImageFilter.GaussianBlur(big / 34 * (0.38 if n >= 9 else 0.6)))
    if n < 9:
        return m.point(lambda v: 255 if v >= 128 else 0).resize((size, size), Image.LANCZOS)
    # simmetria di rotazione dei disegni della wiki (misurata: la 9 a 7 bracci, la 10 a 5): la
    # media delle k rotazioni toglie il rumore della sorgente a 34 px e ridà tratti netti
    k = {9: 7, 10: 5}[n]
    c = (big - 1) / 2
    acc = m
    for j in range(1, k):
        acc = Image.blend(acc, m.rotate(360 / k * j, resample=Image.BICUBIC, center=(c, c)), 1 / (j + 1))
    m = acc
    fall = Image.new('L', (big, big), 0)
    fp = fall.load()
    for y in range(big):
        for x in range(big):
            r = math.hypot(x - c, y - c) / c
            f = 1.0 if r < 0.88 else max(0.0, 1 - (r - 0.88) / 0.12)
            fp[x, y] = int(255 * (0.35 + 0.65 * f)) if f > 0 else 0
    m = ImageChops.multiply(m, fall).point(lambda v: 255 if v >= 150 else 0)
    m = m.filter(ImageFilter.MinFilter(9)).filter(ImageFilter.MaxFilter(9))   # via i granelli
    return m.resize((size, size), Image.LANCZOS)

def white_glow(m, cap=110):
    """Alone bianco semitrasparente fuori dalla sagoma e nei suoi fori, come le MedalInfo_Guilt
    originali (misurato sull'8: ~110 a 1 px dal bordo, ~45 a 3 px, 0 a 6 px)."""
    from PIL import ImageFilter
    g1 = m.filter(ImageFilter.GaussianBlur(1.0))
    g2 = m.filter(ImageFilter.GaussianBlur(3.0))
    a = ImageChops.add(g1.point(lambda v: v * 7 // 10), g2.point(lambda v: v * 30 // 100))
    a = a.point(lambda v: min(cap, v))
    im = Image.new('RGBA', m.size, (255, 255, 255, 0))
    im.putalpha(a)
    return im


def digit_layer(im, test, core, keep=lambda r, g, b: True):
    """Cifra di un'icona originale: i pixel del colore pieno della cifra (core(r, g, b)) nel
    riquadro centrale e, entro 2 px da questi, i pixel con alpha test(r, g, b) (bordo
    sfumato); il resto (sagoma e suoi riflessi) trasparente. Ritagliata."""
    px = im.load()
    out_ = Image.new('RGBA', im.size, (0, 0, 0, 0))
    op = out_.load()
    cx, cy = im.width // 2, im.height // 2
    rx, ry = im.width * 3 // 10, im.height // 4
    strong = {(x, y) for y in range(cy - ry, cy + ry) for x in range(cx - rx, cx + rx)
              if px[x, y][3] >= 200 and core(*px[x, y][:3])}
    # entro 3 px dalla cifra tutti i pixel opachi: anche il contorno scuro della cifra (0,49,98
    # sulle MedalInfo) e il fondo della sagoma, che sta comunque sotto la cifra
    near = {(x + i, y + j) for x, y in strong for i in range(-3, 4) for j in range(-3, 4)}
    for x, y in near:
        # alpha >= 200: fuori dalla sagoma ci sono pixel bianchi quasi trasparenti (alone)
        if 0 <= x < im.width and 0 <= y < im.height and px[x, y][3] >= 200 and keep(*px[x, y][:3]):
            op[x, y] = px[x, y]
    return out_.crop(out_.getbbox())


def hole_fill(dg, digit, color, test):
    """«8» -> «0»: riempie l'inviluppo convesso dei buchi (pixel non della cifra chiusi da
    pixel della cifra a sinistra, destra, sopra e sotto) col colore dei buchi: i due fori
    diventano uno solo."""
    a = digit.load()
    W, H = digit.size
    on = lambda x, y: a[x, y][3] >= 128 and test(*a[x, y][:3]) >= 128
    pts = [(x, y) for y in range(H) for x in range(W) if not on(x, y)
           and any(on(i, y) for i in range(x)) and any(on(i, y) for i in range(x + 1, W))
           and any(on(x, j) for j in range(y)) and any(on(x, j) for j in range(y + 1, H))]
    if not pts:
        return dg
    pts = sorted(set(pts))
    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo, hi = [], []
    for p in pts:
        while len(lo) >= 2 and cross(lo[-2], lo[-1], p) <= 0:
            lo.pop()
        lo.append(p)
    for p in reversed(pts):
        while len(hi) >= 2 and cross(hi[-2], hi[-1], p) <= 0:
            hi.pop()
        hi.append(p)
    ImageDraw.Draw(dg).polygon(lo[:-1] + hi[:-1], fill=color)
    return dg


def two_digits(a, b, gap):
    w = a.width + b.width - gap
    h = max(a.height, b.height)
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    im.alpha_composite(a, (0, h - a.height))
    im.alpha_composite(b, (a.width - gap, h - b.height))
    return im


def glyphs(style):
    """Cifre «9» e «10» nello stile delle originali: 'info' (MedalInfo_Guilt, azzurre) o 'num'
    (Guilt_num_draw, bianche)."""
    if style == 'info':
        fn, test = 'img/ui/guilt/MedalInfo_Guilt%d.png', lambda r, g, b: max(0, min(255, (b - 100) * 255 // 100))
        core = lambda r, g, b: r >= 140 and b >= 240
        keep = lambda r, g, b: True
        hole = (2, 39, 63, 255)
    else:
        fn, test = 'img/ui/guilt/Guilt%d_num_draw.png', lambda r, g, b: max(0, min(255, (g - 110) * 255 // 100))
        core = lambda r, g, b: r >= 235 and g >= 225
        keep = lambda r, g, b: g >= 150 or b < 180     # cifra bianca e contorno viola scuro
        hole = (90, 0, 124, 255)
    d6 = digit_layer(load(fn % 6), test, core, keep)
    d8 = digit_layer(load(fn % 8), test, core, keep)
    d1 = digit_layer(load(fn % 1), test, core, keep)
    plate = lambda d: _plate(d, hole)
    nine = plate(d6.rotate(180))
    zero = hole_fill(plate(d8), d8, hole, test)
    return nine, two_digits(plate(d1), zero, 2)


def _plate(d, hole):
    """Cifra su un rettangolo del colore dei buchi (i fori della cifra restano visibili)."""
    im = Image.new('RGBA', d.size, (0, 0, 0, 0))
    m = d.getchannel('A')
    from PIL import ImageFilter
    filled = m.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))
    im.paste(hole, (0, 0), filled)
    im.alpha_composite(d)
    return im


def medalinfo_icon(n, digit):
    """MedalInfo_Guilt9/10 (100x100): sagoma blu notte 2,39,63 con un filo chiaro, cifra
    azzurra 154,202,255 al centro con alone (come MedalInfo_Guilt1-8)."""
    # misure delle originali: sagoma 70-88 px (riquadro), centrata; corpo 2,39,63 opaco con
    # antialias di 1 px; fuori e nei fori un alone bianco semitrasparente (il «filo chiaro»);
    # cifra azzurra col contorno scuro alla dimensione originale (l'8: 31x20 a 34,40)
    # Sagoma: quella vera del gioco, ricavata dai fotogrammi dei video del dettaglio medaglia
    # (recon/tools/tier_from_video.py -> reference\medal_tier\sagoma_tierN_video.png, 400x400 =
    # la texture 100x100 a 4x); senza, la vecchia ricostruzione dall'icona della wiki.
    vid = os.path.join(TIER, 'sagoma_tier%d_video.png' % n)
    if os.path.exists(vid):
        body = Image.open(vid).convert('L').resize((100, 100), Image.LANCZOS)
    else:
        body = Image.new('L', (100, 100), 0)
        body.paste(big_mask(n, 80), (10, 10))
    im = white_glow(body)
    navy = Image.new('RGBA', (100, 100), (2, 39, 63, 255))
    navy.putalpha(body)
    im.alpha_composite(navy)
    cif = os.path.join(TIER, 'cifra_tier%d_video.png' % n)
    if os.path.exists(vid) and os.path.exists(cif):
        # cifra vera dagli stessi fotogrammi (copertura 0-255 a 4x, al suo posto nella texture):
        # targa blu notte sotto, contorno 0,49,98 di ~1 px e cifra 154,202,255 come le 1-8
        from PIL import ImageFilter
        c4 = Image.open(cif).convert('L')
        x0, y0, x1, y1 = [v / 4 for v in c4.point(lambda v: 255 if v >= 128 else 0).getbbox()]
        plate = Image.new('RGBA', (100, 100), (0, 0, 0, 0))
        ImageDraw.Draw(plate).ellipse((x0 - 5, y0 - 4, x1 + 4, y1 + 3), fill=(2, 39, 63, 255))
        im.alpha_composite(plate)
        im.paste((0, 49, 98, 255), (0, 0), c4.filter(ImageFilter.MaxFilter(9)).resize((100, 100), Image.LANCZOS))
        im.paste((154, 202, 255, 255), (0, 0), c4.resize((100, 100), Image.LANCZOS))
        return im
    # «10»: stessa altezza delle altre cifre, stretto in larghezza fino a 44 px
    dg = digit if digit.width <= 44 else digit.resize((44, digit.height), Image.LANCZOS)
    x0, y0 = (100 - dg.width) // 2, 50 - dg.height // 2
    plate = Image.new('RGBA', (100, 100), (0, 0, 0, 0))
    ImageDraw.Draw(plate).ellipse((x0 - 5, y0 - 4, x0 + dg.width + 4, y0 + dg.height + 3), fill=(2, 39, 63, 255))
    im.alpha_composite(plate)
    im.alpha_composite(dg, (x0, y0))
    return im


def square_icon(n, active):
    """Guilt%d_On (attiva) / _Off (inattiva), 36x36: icone della wiki. Le attive 1-8 sono le
    originali ritagliate di 1 px (34x34): rimesse su una tela 36x36; le altre (42x42) ridotte."""
    w = wiki_tier(n, not active)
    if w.size == (34, 34):
        im = Image.new('RGBA', (36, 36), (0, 0, 0, 0))
        im.alpha_composite(w, (1, 1))
        return im
    return w.resize((36, 36), Image.LANCZOS)


def err_icon(n):
    """Guilt%d_Err (36x36): cornice e fondo di Guilt8_Err con la sagoma rossa 180,17,28."""
    base = load('img/ui/guilt/Guilt8_Err.png')
    bg = base.getpixel((6, 6))
    d = ImageDraw.Draw(base)
    d.rectangle((4, 4, 31, 31), fill=bg)
    m = tier_mask(n).resize((30, 30), Image.LANCZOS)
    base.paste((180, 17, 28, 245), (3, 3), m)
    return base


def draw_icon(n):
    """Guilt%d_draw (57x53): sagoma bianca con alone magenta 198,0,255 (come Guilt1-8_draw)."""
    from PIL import ImageFilter
    m = big_mask(n, 42)                 # come l'8 (46x40 con le punte)
    im = Image.new('RGBA', (57, 53), (0, 0, 0, 0))
    a = Image.new('L', (57, 53), 0)
    a.paste(m, (7, 5))
    glow = Image.new('RGBA', (57, 53), (198, 0, 255, 0))
    glow.putalpha(a.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(2.5)))
    im.alpha_composite(glow)
    im.paste((255, 255, 255, 255), (0, 0), a)
    return im


def num_draw_icon(n, digit):
    """Guilt%d_num_draw (57x53): sagoma viola 199,102,255 con bordo 90,0,124 e cifra bianca
    su targa viola scura (come Guilt1-8_num_draw)."""
    from PIL import ImageFilter
    m = big_mask(n, 42)                 # come l'8 (46x40 con le punte)
    im = Image.new('RGBA', (57, 53), (0, 0, 0, 0))
    a = Image.new('L', (57, 53), 0)
    a.paste(m, (7, 5))
    im.paste((90, 0, 124, 255), (0, 0), a.filter(ImageFilter.MaxFilter(3)))
    im.paste((199, 102, 255, 255), (0, 0), a.filter(ImageFilter.MinFilter(3)))
    # cifra alla dimensione originale (contorno viola scuro compreso); «10» stretto a 38 px
    dg = digit if digit.width <= 38 else digit.resize((38, digit.height), Image.LANCZOS)
    x0, y0 = (57 - dg.width) // 2, (53 - dg.height) // 2
    im.alpha_composite(dg, (x0, y0))
    return im


if os.path.isdir(TIER):
    info9, info10 = glyphs('info')
    num9, num10 = glyphs('num')
    for n, gi, gn in ((9, info9, num9), (10, info10, num10)):
        save_guilt('MedalInfo_Guilt%d.png' % n, medalinfo_icon(n, gi))
        save_guilt('Guilt%d_draw.png' % n, draw_icon(n))
        save_guilt('Guilt%d_num_draw.png' % n, num_draw_icon(n, gn))
        save_guilt('Guilt%d_Err.png' % n, err_icon(n))
    # filtro (Logo_01 dei Filter_Guilt, cercati accanto ai layout; 2-8 copiati da make_layouts)
    save('MedalInfo_Guilt9.png', medalinfo_icon(9, info9))
    save('MedalInfo_Guilt10.png', medalinfo_icon(10, info10))
    for n in range(1, 11):
        on = load('img/ui/guilt/Guilt4_On.png') if n == 4 else \
            load('cocostudio/publish/Guilt5_On.png') if n == 5 else square_icon(n, True)
        off = square_icon(n, False)
        if n not in (4, ):
            save_guilt('Guilt%d_On.png' % n, on)
        save_guilt('Guilt%d_Off.png' % n, off)
        # _num e MD_*: nessun originale ne' riferimento; copie dell'icona attiva/inattiva
        save_guilt('Guilt%d_num.png' % n, on)
        save_guilt('MD_Guilt%d_On.png' % n, on)
        save_guilt('MD_Guilt%d_Num.png' % n, on)
        save_guilt('MD_Guilt%d_Off.png' % n, off)


# Profilo: texture di AvatarInfo_Txt_ver340 (layout originale nelle risorse) che non esistono
# in nessuna risorsa servita. Colori da reference\profile\profile_06.png (video 7-R0jhyzlso):
# riquadri blu notte 0,48,87 con bordo 8,76,150 e linguetta azzurra 0,126,208 (riflesso
# 105,183,224) col titolo; «HP» verde 56,195,107; fumetto bianco.
def av_panel(w, h, head):
    """Av_Panel_Colosseum (280x151) e Av_Panel1 (280x98): riquadro con la linguetta del titolo
    in alto a sinistra (lato destro obliquo) e una riga chiara sotto la linguetta."""
    im = Image.new('RGBA', (w * S, h * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    r = 8 * S
    d.rounded_rectangle((0, 0, w * S - 1, h * S - 1), r, fill=(8, 76, 150, 255))
    b = 2 * S
    d.rounded_rectangle((b, b, w * S - 1 - b, h * S - 1 - b), r - b, fill=(0, 48, 87, 255))
    tab = Image.new('RGBA', im.size, (0, 0, 0, 0))
    td = ImageDraw.Draw(tab)
    for y in range(head * S):
        t = y / (head * S)
        td.line((0, y, w * S, y), fill=(int(40 - 40 * t), int(160 - 40 * t), int(230 - 25 * t), 255))
    mask = Image.new('L', im.size, 0)
    md = ImageDraw.Draw(mask)
    tw = int(w * 0.72) * S
    md.polygon([(b, b), (tw, b), (tw - head * S, head * S), (b, head * S)], fill=255)
    md.rounded_rectangle((b, b, tw, head * S), r - b, fill=255)
    md.polygon([(tw - r, b), (tw, b), (tw - head * S, head * S), (tw - r - head * S, head * S)], fill=255)
    im.paste(tab, (0, 0), mask)
    d.line((b, head * S, w * S - 1 - b, head * S), fill=(0, 126, 208, 255), width=S)
    return im.resize((w, h), Image.LANCZOS)


def hp_icon():
    """Ico_Param_HP (36x14): «HP» verde in corsivo con il bordo scuro (Ico_Param_Offense e
    _Defense, le altre due, esistono)."""
    from PIL import ImageFont
    w, h = 36, 14
    im = Image.new('RGBA', (w * S * 2, h * S), (0, 0, 0, 0))
    font = ImageFont.truetype(os.path.join(os.environ.get('WINDIR', r'C:\Windows'), 'Fonts', 'arialbi.ttf'), 15 * S)
    d = ImageDraw.Draw(im)
    d.text((3 * S, -2 * S), 'HP', font=font, fill=(56, 195, 107, 255), stroke_width=S, stroke_fill=(0, 40, 30, 255))
    im = im.crop(im.getbbox())
    return fit(im.resize((max(1, im.width // S), max(1, im.height // S)), Image.LANCZOS), (w, h))


def guilt_plate():
    """Av_Guiltbonus (132x102): targa scura arrotondata della Nova (attacco speciale) con
    «LV n» (Txt_Burst_Label) sotto il logo, come nel riferimento."""
    w, h = 132, 102
    im = Image.new('RGBA', (w * S, h * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    y0, y1 = 30 * S, 80 * S
    d.rounded_rectangle((0, y0, w * S - 1, y1), (y1 - y0) // 2, fill=(70, 100, 140, 255))
    b = 2 * S
    d.rounded_rectangle((b, y0 + b, w * S - 1 - b, y1 - b), (y1 - y0) // 2 - b, fill=(15, 42, 68, 255))
    return im.resize((w, h), Image.LANCZOS)


def balloon():
    """Av_Panel2 (236x86): fumetto bianco del commento con la punta in basso a destra, verso
    l'avatar (reference\\profile\\profile_06.png)."""
    w, h = 236, 86
    im = Image.new('RGBA', (w * S, h * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    body = 70 * S
    d.rounded_rectangle((0, 0, w * S - 1, body), 14 * S, fill=(120, 130, 150, 255))
    b = 2 * S
    d.rounded_rectangle((b, b, w * S - 1 - b, body - b), 14 * S - b, fill=(253, 253, 253, 255))
    d.polygon([(150 * S, body - b), (178 * S, body - b), (184 * S, h * S - 1)], fill=(253, 253, 253, 255))
    return im.resize((w, h), Image.LANCZOS)


def dark_panel(w, h):
    """AvInfo_PetInfoPanel (244x80): riquadro scuro arrotondato col bordo chiaro."""
    im = Image.new('RGBA', (w * S, h * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, w * S - 1, h * S - 1), 10 * S, fill=(8, 76, 150, 255))
    b = 2 * S
    d.rounded_rectangle((b, b, w * S - 1 - b, h * S - 1 - b), 10 * S - b, fill=(0, 30, 60, 235))
    return im.resize((w, h), Image.LANCZOS)


# Tabelle avatar (Avatar Boards): decorazioni della scheda completata, spunta dei nodi
# sbloccati e linguetta «No. n». Riferimenti reference\avatar_boards\ab_ref_list_complete_01
# e ab_ref_node_check_01 (1080p: scheda ~510 px = 306 nel layout 960x640, scala 0.6).
def _chaikin(pts, n=3):
    """Poligono chiuso smussato (Chaikin): angoli arrotondati per fiocco e nastri."""
    for _ in range(n):
        q = []
        for i in range(len(pts)):
            (x0, y0), (x1, y1) = pts[i], pts[(i + 1) % len(pts)]
            q += [(x0 * .75 + x1 * .25, y0 * .75 + y1 * .25), (x0 * .25 + x1 * .75, y0 * .25 + y1 * .75)]
        pts = q
    return pts


def _vgrad(size, top, bot, y0=0, y1=None):
    """Riempimento RGBA con sfumatura verticale da top (a y0) a bot (a y1)."""
    w, h = size
    y1 = h if y1 is None else y1
    g = Image.new('RGBA', (1, h))
    for y in range(h):
        t = min(1, max(0, (y - y0) / max(1, y1 - y0)))
        g.putpixel((0, y), tuple(int(a + (b - a) * t) for a, b in zip(top, bot)))
    return g.resize((w, h))


def _erode(mask, px):
    from PIL import ImageFilter
    return mask.filter(ImageFilter.MinFilter(2 * px + 1)) if px > 0 else mask


def _ribbon_piece(size, pts, top, bot, k):
    """Pezzo di nastro rosso: bordo rosso scuro, filetto oro rientrato, interno sfumato."""
    m = Image.new('L', size, 0)
    ImageDraw.Draw(m).polygon(_chaikin([(x * k, y * k) for x, y in pts]), fill=255)
    ys = [y * k for _, y in pts]
    im = Image.new('RGBA', size, (120, 0, 0, 255))
    e1 = _erode(m, S)
    im.paste((245, 205, 120, 255), (0, 0), e1)                      # filetto oro
    e2 = _erode(e1, S + S // 2)
    im.paste(_vgrad(size, top, bot, int(min(ys)), int(max(ys))), (0, 0), e2)
    im.putalpha(m)
    return im, m


def board_clear():
    """Sphere_Board_Clear (306x306): sovrapposizione della scheda completata. Fiocco rosso
    bordato d'oro sull'angolo in alto a sinistra con il nastro lungo il bordo superiore,
    fascia rossa diagonale sull'angolo in basso a destra (ritagliata sulla scheda) e la
    scritta «COMPLETE» arancione con l'alone giallo. Coordinate prese a 1080p e portate
    a 306: (x - 705, y - 250) * 0.6; il fiocco un po' piu' grande e spostato verso l'interno."""
    from PIL import ImageChops, ImageFilter, ImageFont
    w = h = 306
    W = w * S
    im = Image.new('RGBA', (W, W), (0, 0, 0, 0))

    # Fascia diagonale: tra le rette x+y=495 e x+y=549 (1080p: da (1225,555) a (1010,770)),
    # rosso 200..240,0,0 con filetto chiaro vicino al bordo interno; ritaglio sulla scheda.
    card = Image.new('L', (W, W), 0)
    ImageDraw.Draw(card).rounded_rectangle((3 * S, 3 * S, W - 1 - 3 * S, W - 1 - 3 * S), 16 * S, fill=255)
    sash = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sash)
    a0, a1 = 495 * S, 551 * S
    for i in range(a0 - S, a1 + S):                                # rosso piu' scuro ai bordi
        t = (i - a0) / (a1 - a0)
        v = int(185 + 57 * max(0, 1 - abs(t - .6) * 2))
        sd.line((i, 0, i - 2 * W, 2 * W), fill=(v, 0, 0, 255), width=2)
    for c, wd, col in ((a0 + 5 * S, S + S // 2, (245, 180, 140, 255)), (a1 - 5 * S, S, (250, 140, 110, 220))):
        sd.line((c, 0, c - 2 * W, 2 * W), fill=col, width=wd)
    smask = Image.new('L', (W, W), 0)
    ImageDraw.Draw(smask).polygon([(a0, 0), (a1, 0), (a1 - 2 * W, 2 * W), (a0 - 2 * W, 2 * W)], fill=255)
    smask = ImageChops.multiply(smask, card)
    sash.putalpha(smask)
    im.alpha_composite(sash)

    # «COMPLETE»: 1080p x 860..1180, y 700..745 -> 93..285 x 270..297 (centro 0.62 della
    # larghezza). Lettere arancioni (piu' chiare in alto), bordo arancio scuro, alone giallo.
    font = ImageFont.truetype(os.path.join(os.environ.get('WINDIR', r'C:\Windows'), 'Fonts', 'arialbd.ttf'), 60 * S)
    tm = Image.new('L', (int(60 * S * 7), 80 * S), 0)
    ImageDraw.Draw(tm).text((10 * S, 0), 'COMPLETE', font=font, fill=255)
    tm = tm.crop(tm.getbbox())
    tx0, ty0, tx1, ty1 = 93 * S, 270 * S, 285 * S, 297 * S
    tm = tm.resize((tx1 - tx0, ty1 - ty0), Image.LANCZOS)
    full = Image.new('L', (W, W), 0)
    full.paste(tm, (tx0, ty0))
    edge = full.filter(ImageFilter.MaxFilter(2 * S + 1))
    glow = full.filter(ImageFilter.MaxFilter(4 * S + 1)).filter(ImageFilter.GaussianBlur(3 * S))
    glow = glow.point(lambda v: min(255, v * 2))
    layer = Image.new('RGBA', (W, W), (255, 245, 60, 0))
    layer.putalpha(glow)
    im.alpha_composite(layer)
    layer = Image.new('RGBA', (W, W), (225, 75, 0, 0))
    layer.putalpha(edge)
    im.alpha_composite(layer)
    fill = _vgrad((W, W), (255, 205, 40, 255), (255, 105, 0, 255), ty0, ty1)
    fill.putalpha(full)
    im.alpha_composite(fill)

    # Fiocco (punti a 1080p sul riferimento): scala 0.6 * 1.1 attorno al nodo (762,307),
    # che va in (54,53) cosi' asole e code restano dentro la tela.
    def P(pts):
        return [(54 + (x - 762) * .66, 53 + (y - 307) * .66) for x, y in pts]
    pieces = [
        # nastro lungo il bordo superiore, dal fiocco verso destra (taglio dritto sotto la linguetta)
        (P([(835, 262), (902, 238), (910, 256), (850, 284)]), (235, 25, 20), (175, 0, 5)),
        # code che pendono
        (P([(730, 330), (700, 385), (690, 462), (718, 428), (735, 410), (757, 332)]), (215, 10, 10), (150, 0, 0)),
        (P([(752, 332), (745, 418), (762, 404), (790, 418), (772, 330)]), (215, 10, 10), (145, 0, 0)),
        # asola sinistra
        (P([(746, 302), (698, 306), (678, 335), (690, 375), (722, 396), (750, 326)]), (240, 30, 25), (170, 0, 5)),
        # asola destra / coda verso destra
        (P([(780, 296), (875, 288), (842, 310), (872, 338), (778, 318)]), (240, 30, 25), (170, 0, 5)),
        # asola superiore
        (P([(760, 296), (762, 250), (790, 228), (835, 238), (860, 268), (845, 285), (788, 302)]), (250, 45, 35), (185, 5, 10)),
        # nodo
        (P([(748, 295), (765, 288), (782, 298), (778, 320), (760, 326), (746, 316)]), (235, 35, 30), (160, 0, 5)),
    ]
    bow = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    allm = Image.new('L', (W, W), 0)
    for pts, top, bot in pieces:
        p, m = _ribbon_piece((W, W), pts, top, bot, S)
        bow.alpha_composite(p)
        allm = ImageChops.lighter(allm, m)
    # piega scura dentro le asole e riflesso lucido, solo dove c'e' nastro
    fold = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    fd = ImageDraw.Draw(fold)
    for a, b, col in (((751, 312), (712, 352), (110, 0, 5, 150)), ((785, 300), (835, 262), (110, 0, 5, 150)),
                      ((788, 308), (850, 310), (110, 0, 5, 130)), ((775, 245), (820, 242), (255, 170, 150, 110)),
                      ((700, 330), (715, 318), (255, 170, 150, 110))):
        (x0, y0), (x1, y1) = P([a, b])
        fd.line((x0 * S, y0 * S, x1 * S, y1 * S), fill=col, width=2 * S)
    fold = fold.filter(ImageFilter.GaussianBlur(S))
    fold.putalpha(ImageChops.multiply(fold.getchannel('A'), _erode(allm, 2 * S)))
    bow.alpha_composite(fold)
    shadow = Image.new('RGBA', (W, W), (40, 0, 0, 0))
    shadow.putalpha(allm.filter(ImageFilter.GaussianBlur(2 * S)).point(lambda v: v * 90 // 255))
    im.alpha_composite(shadow, (S, 2 * S))
    im.alpha_composite(bow)
    return im.resize((w, h), Image.LANCZOS)


def node_check():
    """Sphere_Node_Check (64x56): spunta gialla 255,228,0 dei nodi sbloccati, bordo rosso
    240,32,0 (~4 px a 1080p) con un filo piu' scuro all'esterno e riflesso chiaro sui lati
    alti. Punti a 1080p relativi al centro del nodo (618,317 in ab_ref_node_check_01, nodo
    ~150 px = 90 nel layout), scala 0.6; centro della tela = centro del nodo + (0.6, -24.3)
    (y in giu'): la punta lunga esce di ~5 px oltre il bordo del nodo in alto a destra."""
    from PIL import ImageChops
    w, h = 64, 56
    W, H = w * S, h * S
    pts = [(-50, -34), (-33, -54), (-8, -29), (30, -82), (52, -64), (-10, 1)]
    cx, cy = 0.6, -24.3
    poly = [((x * .6 - cx + w / 2) * S, (y * .6 - cy + h / 2) * S) for x, y in pts]
    m = Image.new('L', (W, H), 0)
    ImageDraw.Draw(m).polygon(poly, fill=255)
    im = Image.new('RGBA', (W, H), (110, 15, 0, 255))
    e1 = _erode(m, S // 2)
    im.paste((235, 35, 0, 255), (0, 0), e1)
    e2 = _erode(e1, 2 * S)
    im.paste((255, 228, 0, 255), (0, 0), e2)
    # riflesso: fascia chiara lungo i lati alti (maschera spostata in basso a destra)
    hi = ImageChops.subtract(e2, ImageChops.offset(e2, S, 2 * S))
    im.paste((255, 250, 170, 255), (0, 0), hi.point(lambda v: v * 3 // 4))
    im.putalpha(m)
    return im.resize((w, h), Image.LANCZOS)


def no_tab():
    """Sphere_No_Tab (195x30): linguetta a pillola grigio-azzurra sopra la scheda («No. n»,
    testo del gioco). 1080p 325x48: corpo 90,126,154, filo chiaro 175,200,222 in alto e
    sui lati, ombra 59,100,129 sul bordo basso."""
    w, h = 195, 30
    W, H = w * S, h * S
    r = 13 * S
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, W - 1, H - 1), r, fill=(150, 178, 204, 255))
    d.rounded_rectangle((0, 2 * S, W - 1, H - 1), r, fill=(56, 92, 122, 255))
    body = _vgrad((W, H), (104, 138, 168, 255), (86, 121, 150, 255))
    m = Image.new('L', (W, H), 0)
    b = S + S // 2
    ImageDraw.Draw(m).rounded_rectangle((b, b, W - 1 - b, H - 1 - b), r - b, fill=255)
    im.paste(body, (0, 0), m)
    d.line((r, S // 2, W - r, S // 2), fill=(185, 208, 228, 255), width=S)   # riflesso in alto
    return im.resize((w, h), Image.LANCZOS)


def sphere_congrats():
    """Sphere_Congrats: scritta «CONGRATULATIONS!» con le stelle ai lati, fissa, per il popup del
    titolo (Sphere_Popup_Comp: aperto con parametro 0 non avvia la LWF del banner).
    Lettere e stella dalla LWF Result_Reward (layouts\\orig: «重複したアイテムのフォルダー_1..10»
    = C O N G R A T U L A, 11..16 = T I O N S !), C piu' grande come in ab_ref_title_popup_01
    (1080p: banner x 290-1640, y 70-235 -> circa 800x98 nel layout 960x640)."""
    rr = os.path.join(src, '..', '..', 'layouts', 'orig', 'lwf', 'battleresult', 'Result_Reward')

    def piece(name):
        fn = 'Result_Reward_' + name.encode('utf-8').hex() + '.png'
        im = btf.decode(open(os.path.join(rr, fn), 'rb').read()).convert('RGBA')
        return im.crop(im.getbbox())

    names = ['重複したアイテムのフォルダー_%d.png' % i for i in range(1, 11)] + \
            ['%d.png' % i for i in range(11, 17)]
    glyphs = [piece(n) for n in names]
    big = glyphs[0].resize((int(glyphs[0].width * 1.3), int(glyphs[0].height * 1.3)), Image.LANCZOS)
    glyphs[0] = big
    gh = max(g.height for g in glyphs)
    star = piece('star01.png')
    spark = piece('png_ef02.png')
    star = star.resize((int(star.width * 0.8), int(star.height * 0.8)), Image.LANCZOS)
    pad = int(star.width * 1.25)
    W = pad * 2 + sum(g.width - 2 for g in glyphs) + 2
    H = gh + 40
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    x = pad
    for g in glyphs:                             # allineate in basso, leggermente sovrapposte
        im.alpha_composite(g, (x, H - 20 - g.height))
        x += g.width - 2
    for sx, sc, dy in ((0, 1.0, 0), (int(pad * 0.5), 0.65, -12)):           # stelle a sinistra
        s = star.resize((int(star.width * sc), int(star.height * sc)), Image.LANCZOS)
        im.alpha_composite(s, (sx, (H - s.height) // 2 + dy))
    for sx, sc, dy in ((W - star.width, 1.0, 0), (W - pad, 0.65, -12)):
        s = star.resize((int(star.width * sc), int(star.height * sc)), Image.LANCZOS)
        im.alpha_composite(s, (sx, (H - s.height) // 2 + dy))
    sp = spark.resize((spark.width // 2, spark.height // 2), Image.LANCZOS)
    im.alpha_composite(sp, (pad + big.width, 0))
    im.alpha_composite(sp, (W - pad - sp.width * 2, 0))
    w = 800
    return im.resize((w, int(H * w / W)), Image.LANCZOS)


save('Sphere_Board_Clear.png', board_clear())
save('Sphere_Node_Check.png', node_check())
save('Sphere_No_Tab.png', no_tab())
save('Sphere_Congrats.png', sphere_congrats())
save('Av_Panel_Colosseum.png', av_panel(280, 151, 28))
save('Av_Panel1.png', av_panel(280, 98, 28))
save('Ico_Param_HP.png', hp_icon())
save('Av_Guiltbonus.png', guilt_plate())
save('Av_Panel2.png', balloon())
save('AvInfo_PetInfoPanel.png', dark_panel(244, 80))


# Burst (ActionMap_Guiltburst, 1.40): pulsante rosso in alto a destra della battaglia. Le risorse
# hanno solo Guiltburst_eff01 (anello rosso 128x128); le altre 5 texture, tutte centrate in (64,64)
# nel pannello Guiltburst_UI, sono ricostruite dai video (reference\burst: ogp-7tDSmdg 1.40 1080p,
# A0KztBILF9U 2019): disco di ~70 unita' con bordo grigio scuro, anello rosso, fondo blu-ardesia
# con un cerchio arancione e tratti arancioni nei quadranti, stella dorata a 4 punte al centro e
# keyblade bianco in diagonale (guardia in basso a sinistra, denti in alto a destra).
def _radial(size, fn):
    """Immagine RGBA size x size: fn(r) -> (r, g, b, a) con r = distanza dal centro in px."""
    c = (size - 1) / 2
    im = Image.new('RGBA', (size, size))
    im.putdata([fn(((x - c) ** 2 + (y - c) ** 2) ** 0.5) for y in range(size) for x in range(size)])
    return im


def burst_button(pressed=False):
    """Guiltburst_but01 / but02 (80x80): but02 (premuto) e' la stessa piu' scura."""
    import math
    w = 80
    W, c = w * S, w * S / 2
    im = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)

    def disc(r, fill):
        d.ellipse((c - r * S, c - r * S, c + r * S, c + r * S), fill=fill)

    def pt(r, ang, off=0.0):                 # ang in gradi (0 = destra, 90 = su), off perpendicolare
        a = math.radians(ang)
        return (c + (r * math.cos(a) - off * math.sin(a)) * S, c - (r * math.sin(a) + off * math.cos(a)) * S)

    disc(35, (96, 96, 104, 255))                                          # bordo grigio smussato
    d.ellipse((c - 35 * S, c - 34 * S, c + 35 * S, c + 35 * S), fill=(30, 30, 36, 255))
    disc(33.5, (44, 44, 52, 255))
    disc(29.5, (214, 24, 10, 255))                                        # anello rosso
    disc(28.5, (240, 44, 16, 255))
    disc(24.6, (255, 96, 30, 255))
    disc(24, (34, 36, 52, 255))                                           # fondo scuro
    im.alpha_composite(_radial(W, lambda r: (90, 70, 80, int(max(0, 1 - r / (20 * S)) * 120))))
    d = ImageDraw.Draw(im)
    for base in (45, 135, 225, 315):                                      # tratti nei quadranti
        for da in (-14, 14):
            a = base + da
            d.polygon([pt(9, a, -0.4), pt(9, a, 0.4), pt(23, a + da * 0.25, 1.3), pt(23, a + da * 0.25, -1.3)],
                      fill=(222, 104, 28, 235))
    r17 = 17 * S                                                          # cerchio arancione
    d.ellipse((c - r17, c - r17, c + r17, c + r17), outline=(226, 116, 34, 255), width=int(1.8 * S))
    # keyblade bianco col bordo scuro: denti in alto a destra, guardia e impugnatura in basso a sinistra
    for col, g in (((40, 40, 46, 255), 0.9), ((250, 250, 250, 255), 0)):
        d.polygon([pt(23 - g, 45, -3.4 - g), pt(23 - g, 45, 3.4 + g), pt(33 + g, 45, 3.4 + g), pt(33 + g, 45, -3.4 - g)], fill=col)
        for off in (-1.5, 1.5):
            d.line((pt(13 - g, 45, off), pt(24, 45, off)), fill=col, width=int((1.3 + 2 * g) * S))
        d.polygon([pt(23 - g, 225, -3.4 - g), pt(23 - g, 225, 3.4 + g), pt(33 + g, 225, 3.4 + g), pt(33 + g, 225, -3.4 - g)], fill=col)
        d.line((pt(16.5 - g, 225), pt(24, 225)), fill=col, width=int((1.6 + 2 * g) * S))
        d.line((pt(17, 225, -4 - g), pt(17, 225, 4 + g)), fill=col, width=int((1.6 + 2 * g) * S))

    def star(k, fill):                                                    # stella a 4 punte
        pts = []
        for ang in (0, 90, 180, 270):
            pts += [pt(3.2 * k, ang - 45), pt(6.5, ang, -2.0 * k), pt(12, ang, -3.8 * k), pt(23 * (0.82 + 0.18 * k), ang),
                    pt(12, ang, 3.8 * k), pt(6.5, ang, 2.0 * k)]
        d.polygon(pts, fill=fill)

    star(1.25, (120, 50, 10, 255))
    star(1.0, (246, 138, 22, 255))
    star(0.7, (255, 206, 48, 255))
    im.alpha_composite(_radial(W, lambda r: (255, 250, 200, int(max(0, 1 - r / (5 * S)) * 230))))
    im = im.resize((w, w), Image.LANCZOS)
    if pressed:
        a = im.getchannel('A')
        im = im.convert('RGB').point(lambda v: v * 62 // 100).convert('RGBA')
        im.putalpha(a)
    return im


def burst_shadow():
    """Guiltburst_Shadow (80x80, opacita' 128 sotto il pulsante): disco nero sfumato."""
    return _radial(80, lambda r: (0, 0, 0, int(255 * min(1, max(0, (37 - r) / 3)))))


def burst_glow():
    """Guiltburst_eff02 (80x80, ImageView Eff02: pulsa 0,8 -> 1,15 dietro il pulsante): alone
    rosso-arancio pieno, palette di Guiltburst_eff01."""
    def f(r):
        t = min(1, r / 39)
        a = 255 if r < 27 else int(255 * max(0, (39.5 - r) / 12.5) ** 1.5)
        return (255, int(110 - 90 * t), 0, a)
    return _radial(80, f)


def burst_ring():
    """Guiltburst_eff03 (80x80, ImageView Eff01: onda 0,8 -> 1,35): anello rosso come
    Guiltburst_eff01 (stesso profilo radiale ridotto a 80) ma col velo interno piu' corto."""
    e = load('cocostudio/publish/Guiltburst_eff01.png').convert('RGBA').resize((80, 80), Image.LANCZOS)
    a = e.getchannel('A')
    k = _radial(80, lambda r: (0, 0, 0, int(255 * min(1, max(0, (r - 18) / 13)) ** 2))).getchannel('A')
    e.putalpha(ImageChops.multiply(a, k))
    return e


save('Guiltburst_but01.png', burst_button())
save('Guiltburst_but02.png', burst_button(True))
save('Guiltburst_Shadow.png', burst_shadow())
save('Guiltburst_eff02.png', burst_glow())
save('Guiltburst_eff03.png', burst_ring())
# Stemma della Union nell'anello delle medaglie del Profilo (Revolver >
# Revolver_Center, «img/union/Union_%02d.png»; crash in loadTexture se manca). Nelle risorse
# c'e' solo cocostudio/publish/Union_03 (128x128): le altre dalle Union_L_%02d (330x330).
_up = os.path.join(out, 'img', 'union')
os.makedirs(_up, exist_ok=True)
for _n in range(1, 6):
    _im = (load('cocostudio/publish/Union_03.png') if _n == 3 else
           load('cocostudio/publish/Union_L_%02d.png' % _n).resize((128, 128), Image.LANCZOS))
    with open(os.path.join(_up, 'Union_%02d.png' % _n), 'wb') as _fh:
        _fh.write(btf.encode(_im))
    for _s in ('', '_on'):                  # «img/union/Union_L_%02d[_on].png»: copie
        shutil.copyfile(os.path.join(src, 'cocostudio', 'publish', 'Union_L_%02d%s.png' % (_n, _s)),
                        os.path.join(_up, 'Union_L_%02d%s.png' % (_n, _s)))
print('img/union/Union_01..05, Union_L_01..05')
# Tendina del passaggio fra le parti di una missione («img/wipe/wipe_%d.png», %d =
# worldId della tabella world il cui worldName e' il prefisso della stanza; Sprite
# che non si carica -> crash nel distruttore). Nelle risorse c'e' solo wipe_1 (DB): copie per gli altri.
_wp = os.path.join(out, 'img', 'wipe')
os.makedirs(_wp, exist_ok=True)
_wids = (2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 10000, 10001)   # 11-14: Ralph; gli originali (import_originals, dopo) sovrascrivono
for _n in _wids:
    shutil.copyfile(os.path.join(src, 'img', 'wipe', 'wipe_1.png'), os.path.join(_wp, 'wipe_%d.png' % _n))
print('img/wipe/wipe_%s' % ','.join(map(str, _wids)))


def slot_num(d):
    """Deck_Slot_Num_4/5 (34x26, cifra accanto a Deck_Slot «SLOT» sugli slot vuoti del keyblade:
    il client carica «img/ui/Deck_Slot_Num_%d.png» con il numero dello slot; le risorse hanno solo
    1-3, lo slot 4 sbloccato all'evoluzione restava con l'«1» del layout, I-068). Forma della cifra
    dal foglio Mu_Num_Slot (stesso carattere, 44 px per cifra); colori come Deck_Slot_Num_2:
    riempimento bianco e contorno nero ad alfa 128, alone bianco tenue."""
    from PIL import ImageFilter
    ref = load('img/ui/Deck_Slot_Num_2.png').convert('RGBA')
    fill = Image.new('L', ref.size, 0)
    fill.putdata([255 if (p[0] > 200 and p[3] >= 100) else 0 for p in ref.get_flattened_data()])
    fx0, fy0, fx1, fy1 = fill.getbbox()
    sheet = load('cocostudio/publish/Mu_Num_Slot.png').convert('RGBA')
    g = sheet.crop((d * 44, 0, d * 44 + 44, sheet.height)).getchannel('A')
    g = g.crop(g.getbbox()).filter(ImageFilter.MaxFilter(3))   # tratto pieno come 1-3
    h = fy1 - fy0
    w = max(1, round(g.width * h / g.height))
    m = Image.new('L', ref.size, 0)
    m.paste(g.resize((w, h), Image.LANCZOS), ((fx0 + fx1 - w) // 2, fy0))
    outline = m.filter(ImageFilter.MaxFilter(5))
    glow = outline.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(1.2))
    im = Image.new('RGBA', ref.size, (255, 255, 255, 0))
    im.putalpha(glow.point(lambda v: v * 60 // 255))
    im.paste((0, 0, 0, 128), (0, 0), outline)
    im.paste((255, 255, 255, 128), (0, 0), m)
    return im


for _d in (4, 5, 6):   # 6 = slot del pet (Spirit, KHUX_PET)
    save_ui('Deck_Slot_Num_%d.png' % _d, slot_num(_d))


# Schermata dei sub-slot (I-066, DeckEditSubSlotScene_ver340 di make_layouts.py). Riferimento:
# reference\subslot\subslot_JP_1.png e subslot_JP_3.png (khux-guides, JP 2018): ogni slot e' un
# disco blu notte con due anelli blu-viola, «SLOT n» grigio al centro, linee rosa fra gli slot.
def subslot_disc():
    """Subslot_MedalSlot (128x128, MedalBase delle celle DeckEdit_SubSlotMedal_ver260; il codice, carica «img/ui/Subslot_MedalSlot%03d.png» con la category del keyblade: 001,
    201 ... 1901, assenti da ogni risorsa). Disco 14,22,48 con anello esterno 70,90,170 sfumato
    e anello interno sottile 40,55,110."""
    def f(r):
        if r > 63.5:
            return (0, 0, 0, 0)
        a = int(255 * min(1, 63.5 - r))                     # bordo esterno antialias
        ring = max(0.0, 1 - abs(r - 57) / 4.5)                # anello esterno
        inner = max(0.0, 1 - abs(r - 45) / 1.5) * 0.8        # anello interno
        glow = max(0.0, 1 - abs(r - 57) / 12) * 0.35          # alone dell'anello
        k = min(1.0, ring + inner * 0.6 + glow)
        base, hi = (14, 22, 48), (70, 90, 170) if inner <= ring else (40, 55, 110)
        return tuple(int(b + (h - b) * k) for b, h in zip(base, hi)) + (a,)
    return _radial(128, f)


def subslot_route():
    """Subslot_Route (64x12, SubSlot_Route_LR/UD delle celle: linea fra due slot vicini, UD =
    ruotata di 90 gradi): barra bianca con i bordi sfumati, colorata dal layout (grigio-blu =
    da riempire, rosa = slot pieni)."""
    w, h = 64, 12
    im = Image.new('RGBA', (w, h))
    im.putdata([(255, 255, 255, int(255 * max(0.0, 1 - abs(y - (h - 1) / 2) / (h / 2)) ** 0.7))
                for y in range(h) for x in range(w)])
    return im


def subslot_info_plate():
    """Subslot_InfoPlate (116x26, base_Type di DeckEdit_SubSlot_MedalInfo_ver260 = SubslotInfoPanel):
    pillola blu notte 6,32,66 con il filo azzurro 70,170,235 sopra e sotto, come la targhetta tier /
    «+0,005» / attributo sotto le medaglie di subslot_JP_1. Opaca: copre Icon_1/Txt_1 «×0.030» di
    DeckEdit_Deck_MedalInfo_ver260, che il modo 10 mostra nello stesso Area_MedalInfo
    con img/ui/Minfo_Pet01.png (assente da ogni risorsa)."""
    w, h = 116, 26
    im = Image.new('RGBA', (w * S, h * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    r = h * S // 2
    d.rounded_rectangle((0, 0, w * S - 1, h * S - 1), r, fill=(70, 170, 235, 255))
    b = 2 * S
    d.rounded_rectangle((b, b, w * S - 1 - b, h * S - 1 - b), r - b, fill=(6, 32, 66, 255))
    return im.resize((w, h), Image.LANCZOS)


save('Subslot_MedalSlot001.png', subslot_disc())
save('Subslot_Route.png', subslot_route())
save('Subslot_InfoPlate.png', subslot_info_plate())
for _c in (1, 201, 301, 401, 501, 701, 901, 1101, 1201, 1301, 1401, 1501, 1601, 1701, 1801, 1901):
    save_ui('Subslot_MedalSlot%03d.png' % _c, subslot_disc())
# Contrassegni e bagliore dell'attributo delle celle: il codice li carica da img/ui,
# le risorse li hanno solo in cocostudio/publish (Deck_Mark_Uplight/Reverse, Deck_Medal1) o non li
# hanno (Deck_Medal2: il verde della Speed, tinta di Deck_Medal1 rossa; Deck_Medal3 c'e')
for _n in ('Deck_Mark_Uplight', 'Deck_Mark_Reverse', 'Deck_Medal1'):
    shutil.copyfile(os.path.join(src, 'cocostudio', 'publish', _n + '.png'), os.path.join(out, 'img', 'ui', _n + '.png'))
_r = load('cocostudio/publish/Deck_Medal1.png').convert('RGBA')
_ch = _r.split()
save_ui('Deck_Medal2.png', Image.merge('RGBA', (_ch[2], _ch[0], _ch[1], _ch[3])))   # rosso -> verde
print('img/ui/Deck_Mark_Uplight, Deck_Mark_Reverse, Deck_Medal1')# Pulsante Supernova della battaglia (SuperBurst_but di ActionMap_SuperBurst_SelectWindow): al posto
# della bussola SBurst_but01/02 l'icona SN dei filtri della Medal List (SBurst_Icon1 JP, 112x112,
# alpha diritta) ridotta a 80x80; premuto = la stessa scurita (decisione dell'utente, 15-10).
import private_tools  # noqa: E402  (local reference data folders, see private_tools.py)
_jp_sn = private_tools.local_path('jp_data', 'cocostudio', 'publish', 'SBurst_Icon1.png')
if os.path.exists(_jp_sn):
    _sn = Image.open(_jp_sn).convert('RGBA').resize((80, 80), Image.LANCZOS)
    save('SBurst_SN_but01.png', _sn)
    _r, _g, _b, _a = _sn.split()
    _dk = [c.point(lambda v: v * 6 // 10) for c in (_r, _g, _b)]
    save('SBurst_SN_but02.png', Image.merge('RGBA', _dk + [_a]))
else:
    print('SBurst_Icon1 JP assente: pulsante Supernova con la bussola originale')
