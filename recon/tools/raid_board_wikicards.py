"""Raid Board card pictures of the Japan-only raids taken from the JP fan wiki (docs/notes/raid.md «jp-boards»).

    python -I recon/tools/raid_board_wikicards.py <jp_boards.json> <raid_ids.json> <wiki card folder> <Board_0005.png> <loc folder>

The private JP board list (raid_rewards/e_jp/jp_boards.json, make_jp_boards.js) gives a board `art: {wiki: <file>}` when its
original card is known only from the wikiwiki.jp/khux レイドボード page (reference/raid_banners_jp/jp_fansites/
wikiwiki_boardcards, untrusted fan upload, kept outside the repository) and no JP 4.3.1 file has the picture. The wiki card
(179 x 180 or 359 x 359, the lilac card with its picture) is scaled to 306 x 306 with Lanczos, like the cards cut from
screenshots by raid_board_screens.py, its corners take the alpha of the card background Board_0005, and it is written as
<loc>/img/sphere_incentive_ww/<board key>.png («:» written «_»). make-raid.js names the same file in
server/game_data/raid_board_art.tsv (source loc, label boardArtWiki); import_originals.py --loc serves it under the board id.

Board key: <census id>:jp<n>-<slug>, n = the board's place in the row's list (make-raid.js eventBoardDoc), read back from
raid_ids.json «boards» («<week>/<board key>»), so the slug never has to be recomputed here. A source line per card is printed.
"""
import json
import os
import sys

from PIL import Image

SIZE = 306


def file_name(key):
    return key.replace(':', '_')


def board_keys(ids):
    """census id -> {n: board key} from raid_ids.json boards."""
    out = {}
    for k in ids.get('boards', {}):
        key = k.split('/', 1)[1] if '/' in k else k
        row, _, rest = key.partition(':jp')
        num = rest.split('-', 1)[0]
        if rest and num.isdigit():
            out.setdefault(row, {})[int(num)] = key
    return out


def card(src, mask):
    im = Image.open(src).convert('RGBA').resize((SIZE, SIZE), Image.LANCZOS)
    im.putalpha(mask)
    return im


def run(boards, ids, wiki, board_png, loc):
    keys = board_keys(ids)
    mask = Image.open(board_png).convert('RGBA').resize((SIZE, SIZE)).getchannel('A')
    out = os.path.join(loc, 'img', 'sphere_incentive_ww')
    os.makedirs(out, exist_ok=True)
    done = []
    for row, spec in sorted(boards.get('rows', {}).items()):
        for i, b in enumerate(spec.get('boards', [])):
            w = (b.get('art') or {}).get('wiki')
            if not w:
                continue
            key = keys.get(row, {}).get(i + 1)
            if not key:
                raise SystemExit('no board id for %s board %d (%s): run make-raid.js first (raid_ids.json)' % (row, i + 1, b.get('name')))
            src = os.path.join(wiki, w)
            if not os.path.exists(src):
                raise SystemExit('wiki card missing: %s' % src)
            card(src, mask).save(os.path.join(out, file_name(key) + '.png'))
            done.append((key, w))
    return done


def main(argv):
    sys.stdout.reconfigure(encoding='utf-8')
    if len(argv) != 5:
        raise SystemExit(__doc__)
    boards = json.load(open(argv[0], encoding='utf-8'))
    ids = json.load(open(argv[1], encoding='utf-8'))
    done = run(boards, ids, argv[2], argv[3], argv[4])
    for key, w in done:
        print('%s\twikiwiki.jp/khux レイドボード %s' % (key, w))
    print('raid_board_wikicards: %d cards -> %s' % (len(done), os.path.join(argv[4], 'img', 'sphere_incentive_ww')))


if __name__ == '__main__':
    main(sys.argv[1:])
