"""Event cards of the raids (640x140 PNG): the original Weekly Raid Event banner of each raid's week.

    python -I recon/tools/make_raid_banners.py --wiki F --banners D [--notices F] [--index F] [--out D]
    python -I recon/tools/make_raid_banners.py --jp F [--jp-variants] [--index F] [--out D]
        -> server/game_data/raid_img/<evStageId>.png (git-ignored; served at /web/raid/img/<evStageId>.png)

--wiki: wikitext of khuxwiki «Weekly_Raid_Event» (api.php?action=parse&page=Weekly_Raid_Event&prop=wikitext&format=json,
saved locally); its tables list every banner file with its «Available» dates. --banners: those files, downloaded by
hand (local only, never in the repo, like reference\\special_banners). --index: server/game_data/raids.json.
An entry takes the banner whose dates hold its census row start (else the one whose dates overlap its row most); an
entry with no banner (rows outside the Weekly Raid Event and outside --notices) keeps 0.png, the plain plate.
--notices: JSON list [{"file", "from", "to", "notice"}] of raid cards taken from the official notices (SQUARE ENIX BRIDGE
notice id, cache.sqex-bridge.jp/img/<key>, archived copy): the weeks the wiki page does not list (the 5 pre-series raid
weeks 2018-09-03 to 10-01). "file" is relative to --banners, dates ISO; they are added after the wiki rows. An item
with "evStageId" is bound to that id and never matched by date (the 62 older WW event raids 2016-05 to 2018-09, whose
one-off, weekend, monthly and daily runs overlap the weekly rows; card = the 640x140 image of the event's own notice).
--ids A-B,C: write only these evStageIds (e.g. --ids 8001-8062 --out <staging folder> for a review before serving).
--jp: the Japan-only rows (raids.json entries with jp: true, Raid Catalog only). JSON list [{"censusId", "file", "match",
"source", "evidence"}] of original JP raid banners (local only, D:\Progetto_Restauro_KH_UX\reference\raid_banners_jp\,
"file" relative to the list's folder), keyed by census id: the evStageId is looked up in --index at run time, so rows
added later get their card as soon as the list names them. "match": "exact" (the row's own banner: its notice, or the
boss / HP / time limit / dates printed on it) or "variant" (an original of the same boss, HP and time limit whose text
differs from the row, e.g. «土曜限定» on a two-day weekend): written only with --jp-variants. Rows not in the list, or
not matched, keep 0.png. Without --wiki only the JP cards are written; the WW cards stay as they are.
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
    """[(file, start date, end date)] of the --notices list, without the items bound to an evStageId"""
    return [(it['file'], dt.date.fromisoformat(it['from']), dt.date.fromisoformat(it.get('to') or it['from']))
            for it in items if not it.get('evStageId')]


def notice_by_id(items):
    """{evStageId: file} of the --notices items bound to an evStageId"""
    return {int(it['evStageId']): it['file'] for it in items if it.get('evStageId')}


def parse_ids(s):
    """'8001-8003,8070' -> {8001, 8002, 8003, 8070}"""
    out = set()
    for part in s.split(','):
        a, _, b = part.strip().partition('-')
        out.update(range(int(a), int(b or a) + 1))
    return out


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


def card(src, dst):
    """the original banner as a 640x140 RGB PNG (the size of every Events card)"""
    from PIL import Image
    im = Image.open(src).convert('RGB')
    if im.size != (640, 140):
        im = im.resize((640, 140), Image.LANCZOS)
    im.save(dst, optimize=True)


def jp_items(items, variants=False):
    """{censusId: item} of the --jp list; "variant" items only with variants=True; a census id named twice: error"""
    out = {}
    for it in items:
        if it.get('match', 'exact') == 'variant' and not variants:
            continue
        if it['censusId'] in out:
            raise ValueError('census id twice in the JP list: %s' % it['censusId'])
        out[it['censusId']] = it
    return out


def build_jp(index, items, banners, out, ids=None):
    """the cards of the JP rows (entries with jp: true) from items {censusId: item}; returns
    (done {evStageId: file}, missing [(evStageId, censusId)] of the JP rows without a card, unknown [census ids of the
    list that no JP row of the index has])"""
    os.makedirs(out, exist_ok=True)
    done, missing, seen = {}, [], set()
    for e in index.get('entries', []):
        ev, cid = e.get('evStageId'), e.get('censusId')
        if not e.get('jp') or not ev or ev in done or (ids is not None and ev not in ids):
            continue
        seen.add(cid)
        it = items.get(cid)
        src = it and os.path.join(banners, it['file'])
        if not it or not os.path.exists(src):
            if (ev, cid) not in missing:
                missing.append((ev, cid))
            continue
        card(src, os.path.join(out, '%d.png' % ev))
        done[ev] = it['file']
    missing = [m for m in missing if m[0] not in done]
    return done, missing, sorted(set(items) - seen)


def build(index, rows, banners, out, by_id=None, ids=None):
    """by_id: {evStageId: file} taken before the date rows; ids: only these evStageIds (None: all). JP rows are left to
    build_jp (their dates overlap the WW weeks)"""
    os.makedirs(out, exist_ok=True)
    done, missing = {}, []
    by_id = by_id or {}
    for e in index.get('entries', []):
        ev = e.get('evStageId')
        if not ev or ev in done or e.get('jp') or not e.get('start') or (ids is not None and ev not in ids):
            continue
        s = dt.date.fromisoformat(e['start'])
        en = dt.date.fromisoformat(e.get('end') or e['start'])
        r = (by_id[ev],) if ev in by_id else pick(rows, s, en)
        if not r:
            missing.append((ev, e.get('censusId')))
            continue
        src = os.path.join(banners, r[0])
        if not os.path.exists(src):
            missing.append((ev, r[0]))
            continue
        card(src, os.path.join(out, '%d.png' % ev))
        done[ev] = r[0]
    return done, missing


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--wiki', help='wikitext of khuxwiki Weekly_Raid_Event (WW cards); needs --banners')
    ap.add_argument('--banners')
    ap.add_argument('--jp', help='JSON list of the original JP raid banners, by census id (JP rows)')
    ap.add_argument('--jp-variants', action='store_true', help='also the "variant" items of --jp')
    ap.add_argument('--notices', help='JSON list of raid cards from the official notices (weeks not on the wiki page)')
    ap.add_argument('--ids', help='write only these evStageIds: A-B,C')
    ap.add_argument('--index', default=os.path.join(ROOT, 'server', 'game_data', 'raids.json'))
    ap.add_argument('--out', default=os.path.join(ROOT, 'server', 'game_data', 'raid_img'))
    a = ap.parse_args(argv)
    if not a.wiki and not a.jp:
        ap.error('--wiki (with --banners) or --jp is needed')
    index = json.load(open(a.index, encoding='utf-8'))
    ids = parse_ids(a.ids) if a.ids else None
    if a.jp:
        items = jp_items(json.load(open(a.jp, encoding='utf-8-sig')), a.jp_variants)
        done, missing, unknown = build_jp(index, items, os.path.dirname(os.path.abspath(a.jp)), a.out, ids)
        print('raid banners (JP): %d list items, %d JP cards written, %d JP rows without a card (0.png): %s%s' % (
            len(items), len(done), len(missing), [m[1] for m in missing[:12]],
            '; not JP rows of the index: %s' % unknown if unknown else ''))
    if not a.wiki:
        return
    if not a.banners:
        ap.error('--wiki needs --banners')
    w = json.load(open(a.wiki, encoding='utf-8-sig'))
    text = w['parse']['wikitext']['*'] if 'parse' in w else w
    rows, by_id = banner_rows(text), {}
    if a.notices:
        items = json.load(open(a.notices, encoding='utf-8-sig'))
        rows += notice_rows(items)
        by_id = notice_by_id(items)
    done, missing = build(index, rows, a.banners, a.out, by_id, ids)
    print('raid banners: %d banner rows on the page, %d event cards written, %d without a banner (0.png): %s' % (
        len(rows), len(done), len(missing), missing[:12]))


if __name__ == '__main__':
    sys.exit(main())
