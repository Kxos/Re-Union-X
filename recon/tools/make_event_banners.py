"""Event cards of the event quests (640x140 PNG): the banner image of each event's own original notice.

    python -I recon/tools/make_event_banners.py --fetch --notices F --banners D [--index F]
        downloads the banner image of every entry's notice into D (private, never in the repo)
    python -I recon/tools/make_event_banners.py --banners D [--index F] [--out D] [--ids A-B,C]
        -> server/game_data/event_img/<evStageId>.png (git-ignored; served at /web/event/img/v<N>/<evStageId>.png)
    then: python -I recon/tools/make_special_banners.py --section event   (Event Catalog banner 20000 + -kept copies)

--index: server/game_data/events.json (make-events.js); each entry names its SQUARE ENIX BRIDGE notice ids in `noticeIds`.
--notices: the notice list of reference\\banners\\notices.json ([{"id", "imgs": [url, ...]}]). A notice shows the shared
page header first (an image key present in many notices) and then its own banner; the banner is the first image key that
is not a shared header (HEADER_SHARE: in more than this many notices). The keys are fetched from cache.sqex-bridge.jp
(still live); the files are untrusted downloads: own folder, read only through Pillow.
--fetch is polite: one request every PAUSE seconds, files already in D are not fetched again, and after two failed
requests in a row the run gives up (the rest is reported, never retried in a loop). D/sources.json lists
{"noticeId", "key", "file", "url"} of every file fetched.
Cards: one per card id (card_ids: the entry's id and every built original evStage row of its `rows`, Part 2 Task 5), resized
to 640x140 (make_raid_banners.card) from, in order: the row's donor banner key (bannerKey of events.json, git-ignored; fetched
by --fetch as row_<key>.png, or any file *_<key>.png already in D or D/notices_extra), the --extra file of that id, and for the
entry's own id only its first notice whose banner file is in D. A card id with none keeps no card: the server then serves
0.png of event_img, or 404.
After a change of the cards bump imgVersion in server/event_config.json (EVENT_IMG_VERSION), then the master revision.
"""
import argparse
import json
import os
import re
import sys
import time
import urllib.request
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import make_raid_banners as mrb  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
CACHE = 'https://img.example/img/'
HEADER_SHARE = 20
PAUSE = 2.0
KEY = re.compile(r'/img/([A-Za-z0-9_-]+)\s*$')


def key_of(url):
    """'https://img.example/img/9c3xN7ln4R ' -> '9c3xN7ln4R' (trailing blanks of the list stripped); None if not one"""
    m = KEY.search((url or '').strip())
    return m.group(1) if m else None


def shared_keys(notices, share=HEADER_SHARE):
    """image keys present in more than `share` notices (the page headers)"""
    c = Counter()
    for n in notices:
        c.update({k for k in (key_of(u) for u in n.get('imgs') or []) if k})
    return {k for k, v in c.items() if v > share}


def banner_key(notice, shared):
    """the notice's own banner: its first image key that is not a shared header (None: none)"""
    for u in notice.get('imgs') or []:
        k = key_of(u)
        if k and k not in shared:
            return k
    return None


def wanted(index, notices, ids=None):
    """[(evStageId, noticeId, key)] of the entries of the index (every noticeId; key None when the notice is not in the
    list or shows no banner of its own)"""
    by_id = {int(n['id']): n for n in notices if str(n.get('id', '')).isdigit()}
    shared = shared_keys(notices)
    out = []
    for e in index.get('entries', []):
        ev = e.get('evStageId')
        if not ev or (ids is not None and ev not in ids):
            continue
        for nid in e.get('noticeIds') or []:
            n = by_id.get(int(nid))
            out.append((ev, int(nid), banner_key(n, shared) if n else None))
    return out


def file_name(nid, key):
    return 'row_%s.png' % key if nid is None else '%d_%s.png' % (nid, key)


def card_ids(index, ids=None):
    """the card ids of the index in order: each entry's id, then its built original evStage rows (rows, available)"""
    out = []
    for e in index.get('entries', []):
        for ev in [e.get('evStageId')] + [r.get('evStageId') for r in e.get('rows') or [] if r.get('available')]:
            if ev and ev not in out and (ids is None or ev in ids):
                out.append(ev)
    return out


def row_keys(index):
    """{card id: donor banner key} of the rows of the index (a row without a key is left out)"""
    out = {}
    for e in index.get('entries', []):
        for r in e.get('rows') or []:
            if r.get('evStageId') and r.get('bannerKey'):
                out.setdefault(r['evStageId'], r['bannerKey'])
    return out


def wanted_rows(index, ids=None):
    """[(card id, None, key)] of the card ids with a donor banner key (fetch() names them row_<key>.png)"""
    keys = row_keys(index)
    return [(ev, None, keys[ev]) for ev in card_ids(index, ids) if ev in keys]


def key_file(dest, key):
    """a file of that banner key already in dest or dest/notices_extra (name *_<key>.png), relative to dest; None if none"""
    for sub in ('', 'notices_extra'):
        d = os.path.join(dest, sub)
        if not os.path.isdir(d):
            continue
        for f in sorted(os.listdir(d)):
            if f.endswith('_%s.png' % key):
                return '%s/%s' % (sub, f) if sub else f
    return None


def fetch(items, dest, get=None, pause=PAUSE, sleep=time.sleep):
    """downloads the banners of items [(evStageId, noticeId, key)] to dest; get(url) -> bytes (default urllib).
    Returns (fetched [file], cached [file], failed [(noticeId, key, why)], gave_up bool)."""
    os.makedirs(dest, exist_ok=True)
    get = get or _get
    man_path = os.path.join(dest, 'sources.json')
    man = json.load(open(man_path, encoding='utf-8')) if os.path.exists(man_path) else []
    fetched, cached, failed, fails, gave_up = [], [], [], 0, False
    for _, nid, key in items:
        if not key:
            failed.append((nid, None, 'no banner key in the notice list'))
            continue
        f = file_name(nid, key)
        if os.path.exists(os.path.join(dest, f)):
            cached.append(f)
            continue
        if nid is None and key_file(dest, key):
            cached.append(key_file(dest, key))
            continue
        if gave_up:
            failed.append((nid, key, 'not tried: gave up after two failures'))
            continue
        if fetched or fails:
            sleep(pause)
        try:
            data = get(CACHE + key)
            if not data.startswith(b'\x89PNG') and not data.startswith(b'\xff\xd8'):
                raise ValueError('not a PNG/JPEG image')
        except Exception as ex:  # noqa: BLE001 - every failure counts toward giving up
            fails += 1
            failed.append((nid, key, str(ex)[:120]))
            if fails >= 2:
                gave_up = True
            continue
        fails = 0
        with open(os.path.join(dest, f), 'wb') as fh:
            fh.write(data)
        man = [m for m in man if m.get('file') != f] + [{'noticeId': nid, 'key': key, 'file': f, 'url': CACHE + key}]
        fetched.append(f)
    with open(man_path, 'w', encoding='utf-8') as fh:
        json.dump(man, fh, indent=1)
    return fetched, cached, failed, gave_up


def _get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (restoration archive; one request per 2 s)'})
    with urllib.request.urlopen(req, timeout=30) as r:
        if r.status != 200:
            raise ValueError('HTTP %d' % r.status)
        return r.read()


def build(index, notices, banners, out, ids=None, extra=None):
    """writes out/<card id>.png for every card id of the index (card_ids); returns (done {card id: file}, missing [(card id,
    censusId)]). The file: the row's donor banner key (row_keys, Part 2 Task 5), else extra {card id: file name in banners}
    (a banner found by hand: another notice of the event, a later run, a wiki file), else for the entry's own id the first
    notice of the entry whose banner file is in banners"""
    os.makedirs(out, exist_ok=True)
    files = {}
    for ev, nid, key in wanted(index, notices, ids):
        if key and ev not in files and os.path.exists(os.path.join(banners, file_name(nid, key))):
            files[ev] = file_name(nid, key)
    for ev, f in (extra or {}).items():
        if os.path.exists(os.path.join(banners, f)):
            files[int(ev)] = f
    for ev, key in row_keys(index).items():
        f = file_name(None, key) if os.path.exists(os.path.join(banners, file_name(None, key))) else key_file(banners, key)
        if f:
            files[ev] = f
    census = {}
    for e in index.get('entries', []):
        for ev in [e.get('evStageId')] + [r.get('evStageId') for r in e.get('rows') or []]:
            census.setdefault(ev, e.get('censusId'))
    done, missing = {}, []
    for ev in card_ids(index, ids):
        if ev not in files:
            missing.append((ev, census.get(ev)))
            continue
        mrb.card(os.path.join(banners, files[ev]), os.path.join(out, '%d.png' % ev))
        done[ev] = files[ev]
    return done, missing


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--fetch', action='store_true', help='download the notice banners into --banners (no cards)')
    ap.add_argument('--notices', default=os.path.join(os.path.dirname(os.path.dirname(REPO)), 'reference', 'banners', 'notices.json'))
    ap.add_argument('--banners', required=True, help='folder of the downloaded notice banners (private)')
    ap.add_argument('--index', default=os.path.join(REPO, 'server', 'game_data', 'events.json'))
    ap.add_argument('--out', default=os.path.join(REPO, 'server', 'game_data', 'event_img'))
    ap.add_argument('--extra', help='JSON {evStageId: file in --banners}: banners found by hand (private, never in the repo)')
    ap.add_argument('--ids', help='only these evStageIds: A-B,C')
    a = ap.parse_args(argv)
    index = json.load(open(a.index, encoding='utf-8'))
    notices = json.load(open(a.notices, encoding='utf-8-sig'))
    ids = mrb.parse_ids(a.ids) if a.ids else None
    if a.fetch:
        fetched, cached, failed, gave_up = fetch(wanted_rows(index, ids) + wanted(index, notices, ids), a.banners)
        print('event banners: %d fetched, %d already here, %d failed%s %s' % (
            len(fetched), len(cached), len(failed), ' (gave up after two failures)' if gave_up else '', failed[:12]))
        return 1 if failed else 0
    extra = json.load(open(a.extra, encoding='utf-8')) if a.extra else None
    done, missing = build(index, notices, a.banners, a.out, ids, extra)
    print('event banners: %d cards written, %d cards without a banner: %s -> %s' % (len(done), len(missing), missing[:40], a.out))
    return 0


if __name__ == '__main__':
    sys.exit(main())
