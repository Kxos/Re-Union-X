"""Grafica della Stock Medal (medaglia master 1 «空き», album n. 0), I-075.

    python recon/tools/make_stock_medal.py <stock_medal.png> <cartella img/medal originali> <uscita>

Nell'originale uno slot vuoto del deck era occupato dalla Stock Medal, che giocava il suo turno
(reference\\empty_slot): medaglia grigia col cuore, senza personaggio. Il master 5.0.1 le da'
l'immagine 90041, che nelle risorse e' Qui (Dewey, la medaglia 90041): make-game-tables.js le
assegna 90000 e questo script scrive img/medal/Medal_L_90000.png e Medal_S_90000.png (BTF) con la
medaglia della khuxwiki (Stock_Medal_★_KHUX.png) sulla tela e nella posizione delle 90041
originali: cerchio allineato al loro riquadro (L 640x640: x 176, base 470, largo 295; S 190x190:
x 52, base 140, largo 89).
"""
import os
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import btf  # noqa: E402

src, orig_dir, out = sys.argv[1:4]
stock = Image.open(src).convert('RGBA')
stock = stock.crop(stock.getchannel('A').getbbox())

for kind in ('L', 'S'):
    tpl = btf.decode(open(os.path.join(orig_dir, 'Medal_%s_90041.png' % kind), 'rb').read())
    x0, _, x1, y1 = tpl.getchannel('A').getbbox()
    w = x1 - x0
    h = round(stock.height * w / stock.width)
    canvas = Image.new('RGBA', tpl.size, (0, 0, 0, 0))
    canvas.paste(stock.resize((w, h), Image.LANCZOS), (x0, y1 - h))
    p = os.path.join(out, 'img', 'medal', 'Medal_%s_90000.png' % kind)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, 'wb').write(btf.encode(canvas))
    print(p, canvas.size, (x0, y1 - h, w, h))
