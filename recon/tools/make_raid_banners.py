"""Event cards of the raids (640x140 PNG): the original Weekly Raid Event banner of each raid's week.

    python -I recon/tools/make_raid_banners.py --wiki F --banners D [--notices F] [--index F] [--out D]
        -> server/game_data/raid_img/<evStageId>.png (git-ignored; served at /web/raid/img/<evStageId>.png)

--wiki: wikitext of khuxwiki «Weekly_Raid_Event» (api.php?action=parse&page=Weekly_Raid_Event&prop=wikitext&format=json,
saved locally); its tables list every banner file with its «Available» dates. --banners: those files, downloaded by
hand (local only, never in the repo, like reference\\special_banners). --index: server/game_data/raids.json.
An entry takes the banner whose dates hold its census row start (else the one whose dates overlap its row most); an
entry with no banner (rows outside the Weekly Raid Event and outside --notices) keeps 0.png, the plain plate.
--notices: JSON list [{"file", "from", "to", "notice"}] of raid cards taken from the official notices (SQUARE ENIX BRIDGE
notice id, cache.sqex-bridge.jp/img/<key>, archived copy): the weeks the wiki page does not list (the 5 pre-series raid
weeks 2018-09-03 to 10-01). "file" is relative to --banners, dates ISO; they are added after the wiki rows.
"""
import argparse
import datetime as dt
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
ROW = re.compile(r'\[\[File:([^|\]]+?)\|[^\]]*\]\]\s*\|\|\s*(\d\d/\d\d/\d\d)(?:\s*-\s*(\d\d/\d\d/\d\d))?')


def day(s):
    return dt.datetime.strptime(s, '%m/%d/%y').date()


def banner_rows(wikitext):
    """[(file name with underscores, start date, end date)] in page order"""
    out = []
    for f, a, b in ROW.findall(wikitext):
        out.append((f.strip().replace(' ', '_'), day(a), day(b or a)))
    return out


def notice_rows(items):
    """[(file, start date, end date)] of the --notices list"""
    return [(it['file'], dt.date.fromisoformat(it['from']), dt.date.fromisoformat(it.get('to') or it['from'])) for it in items]


def pick(rows, start, end):
    held = [r for r in rows if r[1] <= start <= r[2]]
    if held:
        return held[0]
    best, ov = None, 0
    for r in rows:
        o = (min(end, r[2]) - max(start, r[1])).days + 1
        if o > ov:
            best, ov = r, o
    return best


def build(index, rows, banners, out):
    from PIL import Image
    os.makedirs(out, exist_ok=True)
    done, missing = {}, []
    for e in index.get('entries', []):
        ev = e.get('evStageId')
        if not ev or ev in done or not e.get('start'):
            continue
        s = dt.date.fromisoformat(e['start'])
        en = dt.date.fromisoformat(e.get('end') or e['start'])
        r = pick(rows, s, en)
        if not r:
            missing.append((ev, e.get('censusId')))
            continue
        src = os.path.join(banners, r[0])
        if not os.path.exists(src):
            missing.append((ev, r[0]))
            continue
        im = Image.open(src).convert('RGB')
        if im.size != (640, 140):
            im = im.resize((640, 140), Image.LANCZOS)
        im.save(os.path.join(out, '%d.png' % ev), optimize=True)
        done[ev] = r[0]
    return done, missing


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--wiki', required=True)
    ap.add_argument('--banners', required=True)
    ap.add_argument('--notices', help='JSON list of raid cards from the official notices (weeks not on the wiki page)')
    ap.add_argument('--index', default=os.path.join(ROOT, 'server', 'game_data', 'raids.json'))
    ap.add_argument('--out', default=os.path.join(ROOT, 'server', 'game_data', 'raid_img'))
    a = ap.parse_args(argv)
    w = json.load(open(a.wiki, encoding='utf-8-sig'))
    text = w['parse']['wikitext']['*'] if 'parse' in w else w
    rows = banner_rows(text)
    if a.notices:
        rows += notice_rows(json.load(open(a.notices, encoding='utf-8-sig')))
    done, missing = build(json.load(open(a.index, encoding='utf-8')), rows, a.banners, a.out)
    print('raid banners: %d banner rows on the page, %d event cards written, %d without a banner (0.png): %s' % (
        len(rows), len(done), len(missing), missing[:12]))


if __name__ == '__main__':
    sys.exit(main())
