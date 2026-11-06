"""Pictures and music of the Medal Gallery web page (I-242, server/medal-gallery.js; docs/notes/medaglie.md#medal-gallery).

    python recon/tools/make_medal_gallery_images.py <master medal.json> <server\\game_data> [--medals D] [--art D] [--audio D]
    (Pillow: without -I)

Writes into <game_data> (git-ignored: pictures and sounds of the user's own game data, never in the repo):
  medal_img/<thumbId>.png      the Medal picture of every gallery Medal (rows with medal.bgm or imageCategory 2, boosted
                               copies included), from the client's img/medal/Medal_S_<thumbId>.png (190x190, BTF or PNG)
                               of the local medal_gen pack (--medals, default <work folder>/medal_gen/files/img/medal),
                               resized to 128x128;
  medal_img/<thumbId>-l.png    the same Medal's Medal_L_<thumbId>.png at 320x320 (detail view of the page, loaded on a tap);
  medal_img/art_<artId>.jpg    the full artwork (img/art/Art_<artId>.png, 640x960) as a 160x240 thumbnail, and
  medal_img/art_<artId>-l.jpg  the same at 480x720 (opened on a tap), from the JP 4.3.1 reference data (--art, default
                               the local path jp_data + img/art of private_tools.local_path);
  medal_bgm/<soundId>.ogg      the music of the BGM Medals (every distinct medal.bgm): audio/<soundId>.akb of the JP 4.3.1
                               reference data (--audio, default jp_data + audio) is an SQEX AKB v2 bank whose sound is a
                               plain Ogg Vorbis stream; it is cut from the first «OggS» page to the end, without decoding
                               or re-encoding (all 23 tracks decode cleanly with ffmpeg, 06-11). A bank without an Ogg
                               stream is listed with a WARNING and skipped.
Served by server.js as /web/medals/img/v<N>/<thumbId>[-l].png, /web/medals/art/v<N>/<artId>[-l].jpg and
/web/medals/bgm/v<N>/<soundId>.ogg (N = IMG_VERSION of medal-gallery.js: raise it when the files change). Missing sources
are listed with a WARNING; the page then shows an empty square of fixed size, or «Music not available». Run again after a
master regeneration that adds BGM or Art Medals.
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
MEDAL_SIZE, MEDAL_LARGE = 128, 320
ART_SMALL, ART_LARGE = (160, 240), (480, 720)


def gallery_ids(medals):
    """(thumbIds, artIds, soundIds) of the gallery rows: medal.bgm or imageCategory 2"""
    thumbs, arts, sounds = set(), set(), set()
    for m in medals:
        if m.get('bgm') or m.get('imageCategory') == IMAGE_CATEGORY_ART:
            thumbs.add(m.get('thumbId') or m.get('imageId') or m['medalId'])
        if m.get('imageCategory') == IMAGE_CATEGORY_ART and m.get('artId'):
            arts.add(m['artId'])
        if m.get('bgm'):
            sounds.add(m['bgm'])
    return sorted(thumbs), sorted(arts), sorted(sounds)


def load(p):
    """RGBA of a client picture (BTF or PNG); None when missing"""
    if not os.path.exists(p):
        return None
    with open(p, 'rb') as f:
        b = f.read()
    return (Image.open(p) if b[:4] == b'\x89PNG' else btf.decode(b)).convert('RGBA')


def medal_png(im, size=MEDAL_SIZE):
    return im.resize((size, size), Image.LANCZOS)


def art_jpg(im, size):
    """the artwork fitted in size on the page colour (no alpha in a JPEG)"""
    im = im.copy()
    im.thumbnail(size, Image.LANCZOS)
    bg = Image.new('RGB', im.size, (4, 54, 84))
    bg.paste(im, mask=im.getchannel('A'))
    return bg


def akb_ogg(data):
    """the Ogg Vorbis stream of an AKB bank (bytes from the first OggS page), None when there is none"""
    if data[:4] != b'AKB ':
        return None
    i = data.find(b'OggS')
    return data[i:] if i >= 0 else None


def main(argv):
    opt = {argv[i]: argv[i + 1] for i in range(len(argv) - 1) if argv[i].startswith('--')}
    args = [a for a in argv if not a.startswith('--') and a not in opt.values()]
    if len(args) != 2:
        print(__doc__)
        return 2
    master, game_data = args
    medals_dir = opt.get('--medals', MEDALS)
    if '--art' in opt and '--audio' in opt:
        art_dir, audio_dir = opt['--art'], opt['--audio']
    else:
        import private_tools
        art_dir = opt.get('--art') or private_tools.local_path('jp_data', 'img', 'art')
        audio_dir = opt.get('--audio') or private_tools.local_path('jp_data', 'audio')
    out, out_bgm = os.path.join(game_data, 'medal_img'), os.path.join(game_data, 'medal_bgm')
    os.makedirs(out, exist_ok=True)
    os.makedirs(out_bgm, exist_ok=True)
    with open(master, encoding='utf-8') as f:
        thumbs, arts, sounds = gallery_ids(json.load(f))
    miss, n = [], {'medal': 0, 'art': 0, 'bgm': 0}
    for t in thumbs:
        im = load(os.path.join(medals_dir, 'Medal_S_%d.png' % t))
        if im is None:
            miss.append('Medal_S_%d' % t)
        else:
            medal_png(im).save(os.path.join(out, '%d.png' % t), optimize=True)
            n['medal'] += 1
        im = load(os.path.join(medals_dir, 'Medal_L_%d.png' % t))
        if im is None:
            miss.append('Medal_L_%d' % t)
        else:
            medal_png(im, MEDAL_LARGE).save(os.path.join(out, '%d-l.png' % t), optimize=True)
    for a in arts:
        im = load(os.path.join(art_dir, 'Art_%d.png' % a))
        if im is None:
            miss.append('Art_%d' % a)
            continue
        art_jpg(im, ART_SMALL).save(os.path.join(out, 'art_%d.jpg' % a), quality=82, optimize=True)
        art_jpg(im, ART_LARGE).save(os.path.join(out, 'art_%d-l.jpg' % a), quality=85, optimize=True)
        n['art'] += 1
    for s in sounds:
        p = os.path.join(audio_dir, '%09d.akb' % s)
        ogg = None
        if os.path.exists(p):
            with open(p, 'rb') as f:
                ogg = akb_ogg(f.read())
        if ogg is None:
            miss.append('audio %09d' % s)
            continue
        with open(os.path.join(out_bgm, '%d.ogg' % s), 'wb') as f:
            f.write(ogg)
        n['bgm'] += 1
    if miss:
        print('WARNING: %d files missing: %s' % (len(miss), ' '.join(miss)), file=sys.stderr)
    print('medal gallery: %d Medal pictures, %d artworks in %s; %d tracks in %s' % (n['medal'], n['art'], out, n['bgm'], out_bgm))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
