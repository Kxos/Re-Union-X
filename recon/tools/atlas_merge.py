"""Merge the frames of a JP armature atlas into a served (WW) cocos2d plist atlas (I-222).

The JP armatures of import_jp_coco.py's JP_ARM must sit on a served plist name (new plist names are
not loaded, docs/notes/risorse_layout.md#regole). Overwriting the served plist/texture erased the
original frames (the home WARNING bar of MyPageAnime lost Home_Warning_*.png): merge() keeps every
served frame and its rect unchanged and packs the added frames into free space of the served
texture, doubling the canvas (power of two) only when nothing fits.

Only plist format 0 (x, y, width, height keys, no rotation), the format of every atlas concerned.
Pixels are copied in the premultiplied space of the BTF textures (btf.decode_premultiplied), so the
served pixels stay byte-identical.

    python recon/tools/atlas_merge.py <served.plist> <served.png BTF> <add.plist> <add.png> <out_dir> <texture name>
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import btf  # noqa: E402

PAD = 2                                   # spacing of the original atlases (Ticker_Warning_Logo2 y 0 h 40, Logo1 y 42)
FRAME = re.compile(r'([ \t]*)<key>([^<]+)</key>(\s*)<dict>(.*?)</dict>', re.S)
INT = re.compile(r'<key>(\w+)</key>\s*<(?:integer|real)>([^<]*)</(?:integer|real)>')


def _frames_section(text):
    """(start, end) of the inner text of the top-level <key>frames</key><dict> ... </dict>."""
    m = re.search(r'<key>frames</key>\s*<dict>', text)
    if not m:
        raise ValueError('plist without frames')
    end = text.index('<key>metadata</key>', m.end())
    end = text.rindex('</dict>', m.end(), end)
    return m.end(), end


def frames(text):
    """[(name, x, y, w, h, block text)] of a format 0 plist."""
    fm = re.search(r'<key>format</key>\s*<integer>(\d+)</integer>', text)
    if fm and fm.group(1) != '0':
        raise ValueError('plist format %s, only 0 is supported' % fm.group(1))
    a, b = _frames_section(text)
    out = []
    for m in FRAME.finditer(text, a, b):
        v = {k: float(x) for k, x in INT.findall(m.group(4))}
        out.append((m.group(2), int(v['x']), int(v['y']), int(v['width']), int(v['height']), m.group(0)))
    return out


def _free(rects, x, y, w, h, cw, ch):
    if x + w > cw or y + h > ch:
        return False
    for rx, ry, rw, rh in rects:
        if x < rx + rw + PAD and rx < x + w + PAD and y < ry + rh + PAD and ry < y + h + PAD:
            return False
    return True


def place(rects, w, h, cw, ch):
    """First free (x, y) for a w x h frame (top-left candidates next to the used rects), or None."""
    xs = sorted({0} | {rx + rw + PAD for rx, _, rw, _ in rects})
    ys = sorted({0} | {ry + rh + PAD for _, ry, _, rh in rects})
    for y in ys:
        for x in xs:
            if _free(rects, x, y, w, h, cw, ch):
                return x, y
    return None


def merge(base_plist, base_tex, add_plist, add_img):
    """base_plist: served plist text; base_tex: served BTF bytes; add_plist: JP plist text; add_img: PIL image of
    the JP texture (straight alpha). Returns (plist text, BTF bytes, report dict)."""
    from PIL import Image
    base = frames(base_plist)
    names = {f[0] for f in base}
    rects = [f[1:5] for f in base]
    tex = btf.decode_premultiplied(base_tex)
    cw, ch = tex.size
    add_img = btf._premultiply(add_img.convert('RGBA'))
    placed, skipped, blocks = [], [], []
    for name, x, y, w, h, block in frames(add_plist):
        if name in names:                               # served frame of the same name: the served one wins
            skipped.append(name)
            continue
        pos = place(rects, w, h, cw, ch)
        while pos is None:
            if cw <= ch:
                cw *= 2
            else:
                ch *= 2
            pos = place(rects, w, h, cw, ch)
        if (cw, ch) != tex.size:
            big = Image.new('RGBA', (cw, ch))
            big.paste(tex, (0, 0))
            tex = big
        tex.paste(add_img.crop((x, y, x + w, y + h)), pos)
        rects.append((pos[0], pos[1], w, h))
        names.add(name)
        placed.append((name, pos[0], pos[1], w, h))
        nb = re.sub(r'(<key>x</key>\s*<integer>)\d+', r'\g<1>%d' % pos[0], block, 1)
        nb = re.sub(r'(<key>y</key>\s*<integer>)\d+', r'\g<1>%d' % pos[1], nb, 1)
        blocks.append(nb)
    a, b = _frames_section(base_plist)
    p = len(base_plist[:b].rstrip(' \t'))              # start of the line that closes the frames dict
    nl = '\r\n' if '\r\n' in base_plist else '\n'
    text = base_plist[:p] + ''.join(blk.strip('\r\n') + nl for blk in blocks) + base_plist[p:]
    if (cw, ch) != btf.info(base_tex)['canvas']:
        text = re.sub(r'(<key>size</key>\s*<string>)\{\d+,\d+\}', r'\g<1>{%d,%d}' % (cw, ch), text, 1)
        tx = text.index('<key>texture</key>')
        text = text[:tx] + re.sub(r'(<key>width</key>\s*<integer>)\d+', r'\g<1>%d' % cw,
                                  re.sub(r'(<key>height</key>\s*<integer>)\d+', r'\g<1>%d' % ch, text[tx:], 1), 1)
    return text, btf.encode(tex, premultiplied=True), dict(placed=placed, skipped=skipped, canvas=(cw, ch))


def read_text(p):
    return open(p, encoding='utf-8-sig', newline='').read()


if __name__ == '__main__':
    from PIL import Image
    bp, bt, ap, at, out, tname = sys.argv[1:7]
    text, data, rep = merge(read_text(bp), open(bt, 'rb').read(), read_text(ap), Image.open(at))
    os.makedirs(out, exist_ok=True)
    open(os.path.join(out, tname + '.plist'), 'w', encoding='utf-8-sig', newline='').write(text)
    open(os.path.join(out, tname + '.png'), 'wb').write(data)
    print(rep)
