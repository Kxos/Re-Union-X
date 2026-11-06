"""Pictures of the Medal Gallery web page (I-242, server/medal-gallery.js; docs/notes/medaglie.md#medal-gallery).

    python recon/tools/make_medal_gallery_images.py <master medal.json> <server\\game_data> [--medals D] [--art D]
    (Pillow: without -I)

Writes into <game_data>/medal_img (git-ignored: pictures of the user's own game data, never in the repo):
  <thumbId>.png       the Medal picture of every gallery Medal (rows with medal.bgm or imageCategory 2, boosted copies
                      included), from the client's img/medal/Medal_S_<thumbId>.png (190x190, BTF or PNG) of the local
                      medal_gen pack (--medals, default <work folder>/medal_gen/files/img/medal), resized to 128x128;
  art_<artId>.jpg     the full artwork (img/art/Art_<artId>.png, 640x960) as a 160x240 thumbnail, and
  art_<artId>-l.jpg   the same at 480x720 (opened on a tap), from the JP 4.3.1 reference data (--art, default the local
                      path jp_data + img/art of private_tools.local_path).
Served by server.js as /web/medals/img/v<N>/<thumbId>.png and /web/medals/art/v<N>/<artId>[-l].jpg (N = IMG_VERSION of
medal-gallery.js: raise it when the pictures change). Missing sources are listed with a WARNING; the page then shows an
empty square of fixed size. Run again after a master regeneration that adds BGM or Art Medals.
"""
import json
import os
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import btf  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(HERE))))
MEDALS = os.path.join(ROOT, 'medal_gen', 'files', 'img', 'medal')
IMAGE_CATEGORY_ART = 2
MEDAL_SIZE = 128
ART_SMALL, ART_LARGE = (160, 240), (480, 720)


def gallery_ids(medals):
    """(thumbIds, artIds) of the gallery rows: medal.bgm or imageCategory 2"""
    thumbs, arts = set(), set()
    for m in medals:
        if m.get('bgm') or m.get('imageCategory') == IMAGE_CATEGORY_ART:
            thumbs.add(m.get('thumbId') or m.get('imageId') or m['medalId'])
        if m.get('imageCategory') == IMAGE_CATEGORY_ART and m.get('artId'):
            arts.add(m['artId'])
    return sorted(thumbs), sorted(arts)


def load(p):
    """RGBA of a client picture (BTF or PNG); None when missing"""
    if not os.path.exists(p):
        return None
    with open(p, 'rb') as f:
        b = f.read()
    return (Image.open(p) if b[:4] == b'\x89PNG' else btf.decode(b)).convert('RGBA')


def medal_png(im):
    return im.resize((MEDAL_SIZE, MEDAL_SIZE), Image.LANCZOS)


def art_jpg(im, size):
    """the artwork fitted in size on the page colour (no alpha in a JPEG)"""
    im = im.copy()
    im.thumbnail(size, Image.LANCZOS)
    bg = Image.new('RGB', im.size, (4, 54, 84))
    bg.paste(im, mask=im.getchannel('A'))
    return bg


def main(argv):
    args = [a for a in argv if not a.startswith('--')]
    opt = {argv[i]: argv[i + 1] for i in range(len(argv) - 1) if argv[i].startswith('--')}
    args = [a for a in args if a not in opt.values()]
    if len(args) != 2:
        print(__doc__)
        return 2
    master, game_data = args
    medals_dir = opt.get('--medals', MEDALS)
    if '--art' in opt:
        art_dir = opt['--art']
    else:
        import private_tools
        art_dir = private_tools.local_path('jp_data', 'img', 'art')
    out = os.path.join(game_data, 'medal_img')
    os.makedirs(out, exist_ok=True)
    with open(master, encoding='utf-8') as f:
        thumbs, arts = gallery_ids(json.load(f))
    miss = []
    for t in thumbs:
        im = load(os.path.join(medals_dir, 'Medal_S_%d.png' % t))
        if im is None:
            miss.append('Medal_S_%d' % t)
            continue
        medal_png(im).save(os.path.join(out, '%d.png' % t), optimize=True)
    for a in arts:
        im = load(os.path.join(art_dir, 'Art_%d.png' % a))
        if im is None:
            miss.append('Art_%d' % a)
            continue
        art_jpg(im, ART_SMALL).save(os.path.join(out, 'art_%d.jpg' % a), quality=82, optimize=True)
        art_jpg(im, ART_LARGE).save(os.path.join(out, 'art_%d-l.jpg' % a), quality=85, optimize=True)
    if miss:
        print('WARNING: %d pictures missing: %s' % (len(miss), ' '.join(miss)), file=sys.stderr)
    print('medal gallery pictures: %d Medals, %d artworks in %s' % (len(thumbs) - sum(m.startswith('Medal') for m in miss),
                                                                  len(arts) - sum(m.startswith('Art') for m in miss), out))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
