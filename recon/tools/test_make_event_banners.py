"""Test of make_event_banners.py and make_special_banners.py --section event: python -I recon/tools/test_make_event_banners.py"""
import io
import json
import os
import shutil
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image, ImageChops  # noqa: E402
import make_event_banners as meb  # noqa: E402
meb.CACHE = 'https://img.example/img/'   # stand-in for the private KHUX_NOTICE_IMG_BASE
import make_special_banners as msb  # noqa: E402

HDR = 'https://img.example/img/HEADER1'
# the shared header in 25 notices (a page header), then each notice's own banner; one key with a trailing blank
notices = [{'id': 1000 + i, 'imgs': [HDR]} for i in range(25)]
notices += [{'id': 51518, 'imgs': [HDR, 'https://img.example/img/9c3xN7ln4R ']},
            {'id': 51523, 'imgs': [HDR, 'https://img.example/img/9cbFN5Ie4', 'https://img.example/img/other']},
            {'id': 52000, 'imgs': [HDR]}]
assert meb.key_of('https://img.example/img/9c3xN7ln4R ') == '9c3xN7ln4R'
assert meb.key_of('https://example.com/x.png') is None
assert meb.shared_keys(notices) == {'HEADER1'}, meb.shared_keys(notices)
index = {'entries': [{'censusId': 'EV-A', 'evStageId': 20001, 'noticeIds': [51518]},
                     {'censusId': 'EV-B', 'evStageId': 20002, 'noticeIds': [51523]},
                     {'censusId': 'EV-C', 'evStageId': 20003, 'noticeIds': [52000]},
                     {'censusId': 'EV-D', 'evStageId': 20004, 'noticeIds': [99999]},
                     {'censusId': 'EV-E', 'evStageId': None, 'noticeIds': [51518]}]}
w = meb.wanted(index, notices)
assert w == [(20001, 51518, '9c3xN7ln4R'), (20002, 51523, '9cbFN5Ie4'), (20003, 52000, None), (20004, 99999, None)], w
assert meb.wanted(index, notices, {20002}) == [(20002, 51523, '9cbFN5Ie4')]


def png(size=(640, 140), color=(9, 8, 7)):
    b = io.BytesIO()
    Image.new('RGB', size, color).save(b, 'PNG')
    return b.getvalue()


t = tempfile.mkdtemp()
try:
    dest = os.path.join(t, 'dl')
    calls, sleeps = [], []

    def get_ok(url):
        calls.append(url)
        return png((1280, 280))
    f, c, fl, gu = meb.fetch(w, dest, get_ok, sleep=sleeps.append)
    assert f == ['51518_9c3xN7ln4R.png', '51523_9cbFN5Ie4.png'] and not c and not gu, (f, c, gu)
    assert [x[0] for x in fl] == [52000, 99999], fl
    assert calls == ['https://img.example/img/9c3xN7ln4R', 'https://img.example/img/9cbFN5Ie4'], calls
    assert sleeps == [meb.PAUSE], 'a pause between requests, none before the first'
    man = json.load(open(os.path.join(dest, 'sources.json'), encoding='utf-8'))
    assert [m['file'] for m in man] == f, man
    # cache: nothing fetched again
    calls.clear()
    f2, c2, _, _ = meb.fetch(w, dest, get_ok, sleep=sleeps.append)
    assert not f2 and c2 == f and not calls, (f2, c2, calls)
    # two failures in a row: give up, the rest not tried
    items = [(1, 1, 'k1'), (2, 2, 'k2'), (3, 3, 'k3')]
    calls.clear()

    def get_bad(url):
        calls.append(url)
        raise OSError('HTTP 429')
    f3, _, fl3, gu3 = meb.fetch(items, os.path.join(t, 'dl2'), get_bad, sleep=lambda s: None)
    assert gu3 and not f3 and len(calls) == 2 and fl3[2][2].startswith('not tried'), (calls, fl3)
    # not an image: a failure, nothing written
    f4, _, fl4, _ = meb.fetch([(1, 1, 'k1')], os.path.join(t, 'dl3'), lambda u: b'<html>', sleep=lambda s: None)
    assert not f4 and 'not a PNG' in fl4[0][2] and not os.path.exists(os.path.join(t, 'dl3', '1_k1.png'))
    # cards: 640x140 from the downloaded banner, entries without one reported
    out = os.path.join(t, 'event_img')
    done, missing = meb.build(index, notices, dest, out)
    assert done == {20001: '51518_9c3xN7ln4R.png', 20002: '51523_9cbFN5Ie4.png'}, done
    assert missing == [(20003, 'EV-C'), (20004, 'EV-D')], missing
    assert Image.open(os.path.join(out, '20001.png')).size == (640, 140), 'card scaled to 640x140'
    # extra: a banner found by hand fills an entry without one, and wins over the notice's own file
    open(os.path.join(dest, 'hand.png'), 'wb').write(png((320, 70), (1, 2, 3)))
    d2, m2 = meb.build(index, notices, dest, os.path.join(t, 'o3'), None, {'20003': 'hand.png', '20001': 'nofile.png'})
    assert d2[20003] == 'hand.png' and d2[20001] == '51518_9c3xN7ln4R.png' and m2 == [(20004, 'EV-D')], (d2, m2)
    assert Image.open(os.path.join(t, 'o3', '20003.png')).size == (640, 140)
    assert meb.build(index, notices, dest, os.path.join(t, 'o2'), {20002})[0] == {20002: '51523_9cbFN5Ie4.png'}
    # extra null (Part 4 Task 5): the notice's banner is not the event's own -> no card, reported missing
    d7, m7 = meb.build(index, notices, dest, os.path.join(t, 'o7'), None, {'20001': None})
    assert 20001 not in d7 and (20001, 'EV-A') in m7 and not os.path.exists(os.path.join(t, 'o7', '20001.png')), (d7, m7)
    # one card per original evStage row (Part 2 Task 5): each built row from its donor banner key (fetched as row_<key>.png, a
    # file of that key already in the folder or in notices_extra is reused); the row key wins over extra and the notice
    rindex = {'entries': [{'censusId': 'EV-R', 'evStageId': 20001, 'noticeIds': [51518], 'rows': [
        {'evStageId': 20001, 'bannerKey': 'rowK1', 'available': True}, {'evStageId': 20051, 'bannerKey': 'rowK2', 'available': True},
        {'evStageId': 20052, 'bannerKey': 'rowK3', 'available': False}, {'evStageId': 20053, 'bannerKey': None, 'available': True}]},
        {'censusId': 'EV-W', 'evStageId': 20003, 'noticeIds': [52000], 'rows': [{'evStageId': 20003, 'bannerKey': None, 'available': True}]}]}
    assert meb.card_ids(rindex) == [20001, 20051, 20053, 20003], meb.card_ids(rindex)
    # an announcement entry played only on the boards (noQuests 'board', EV-0579 / 20181) has no card, even with a notice banner
    bindex = {'entries': [{'censusId': 'EV-0579', 'evStageId': 20181, 'noticeIds': [51518], 'noQuests': 'board'},
                          {'censusId': 'EV-K', 'evStageId': 20015, 'noticeIds': [51518], 'noQuests': 'coin'}]}
    assert meb.card_ids(bindex) == [20015], meb.card_ids(bindex)
    db, mb = meb.build(bindex, notices, dest, os.path.join(t, 'ob'))
    assert 20181 not in db and not os.path.exists(os.path.join(t, 'ob', '20181.png')) and not mb, (db, mb)
    # an information notice of the challenge records (noQuests 'notice', Part 4) has no card either, and its notice is not fetched
    nindex = {'entries': [{'censusId': 'EV-0445', 'evStageId': 20300, 'noticeIds': [51518], 'noQuests': 'notice'}]}
    assert meb.card_ids(nindex) == [] and meb.wanted(nindex, notices) == [], 'notice: no card'
    # a second notice of an event (scheduleLineOf, Part 5 call 4: EV-0648 beside EV-0647) has no card: one card per event,
    # its row is the main event's; the main entry keeps its card
    sindex = {'entries': [{'censusId': 'EV-0647', 'evStageId': 20400, 'noticeIds': [51518],
                           'rows': [{'evStageId': 20400, 'bannerKey': 'rowK1', 'available': True}]},
                          {'censusId': 'EV-0648', 'evStageId': 20401, 'noticeIds': [51523], 'scheduleLineOf': 'EV-0647'}]}
    assert meb.card_ids(sindex, all_rows=True) == [20400], meb.card_ids(sindex, all_rows=True)
    assert meb.wanted(sindex, notices) == [(20400, 51518, '9c3xN7ln4R')], 'schedule line: its notice is not fetched'
    ds, ms = meb.build(sindex, notices, dest, os.path.join(t, 'os'), all_rows=True)
    assert 20401 not in ds and not ms and not os.path.exists(os.path.join(t, 'os', '20401.png')), (ds, ms)
    # all_rows (Part 4 Task 5): the rows not built yet get their card too (review ahead of the serve)
    assert meb.card_ids(rindex, all_rows=True) == [20001, 20051, 20052, 20053, 20003], meb.card_ids(rindex, all_rows=True)
    assert meb.wanted_rows(rindex, all_rows=True) == [(20001, None, 'rowK1'), (20051, None, 'rowK2'), (20052, None, 'rowK3')]
    wr = meb.wanted_rows(rindex)
    assert wr == [(20001, None, 'rowK1'), (20051, None, 'rowK2')], wr
    os.makedirs(os.path.join(dest, 'notices_extra'), exist_ok=True)
    open(os.path.join(dest, 'notices_extra', '777_rowK2.png'), 'wb').write(png((640, 140), (4, 5, 6)))
    calls.clear()
    fr, cr, flr, _ = meb.fetch(wr, dest, get_ok, sleep=lambda s: None)
    assert fr == ['row_rowK1.png'] and cr == ['notices_extra/777_rowK2.png'] and not flr, (fr, cr, flr)
    assert calls == ['https://img.example/img/rowK1'], calls
    d5, m5 = meb.build(rindex, notices, dest, os.path.join(t, 'o5'), None, {'20001': 'hand.png', '20053': 'hand.png', '20003': 'hand.png'})
    assert d5 == {20001: 'row_rowK1.png', 20051: 'notices_extra/777_rowK2.png', 20053: 'hand.png', 20003: 'hand.png'}, d5
    assert not m5 and not os.path.exists(os.path.join(t, 'o5', '20052.png')), m5
    d6, m6 = meb.build(rindex, notices, dest, os.path.join(t, 'o6'))
    assert 20053 not in d6 and (20053, 'EV-R') in m6, 'a new row without key or extra: no card (never the notice image of another row)'
    assert 20003 not in d6, 'no notice banner, no extra: no card'
    # --section event: the Event Catalog banner 20000 (own design) and a KEPT EVENT copy of every card
    assert msb.EVENT_KEPT_TEXT == 'KEPT EVENT' and msb.EVENT_CATALOG_TITLE == 'EVENT CATALOG'
    Image.new('RGB', (640, 140), (200, 0, 0)).save(os.path.join(out, '20000.png'))   # an old catalog banner
    Image.new('RGB', (640, 140), (0, 0, 200)).save(os.path.join(out, '29999.png'))   # a stray numeric png, no event
    assert [os.path.basename(p) for p in msb.event_cards(index, out)] == ['20001.png', '20002.png'], 'cards of events.json only'
    Image.new('RGB', (640, 140), (0, 200, 0)).save(os.path.join(out, '20051.png'))
    assert [os.path.basename(p) for p in msb.event_cards(rindex, out)] == ['20001.png', '20051.png'], 'the row cards too'
    coin = os.path.join(t, 'coin.png')
    Image.new('RGBA', (86, 86), (200, 200, 230, 255)).save(coin)
    red = Image.new('RGB', (640, 140), (230, 0, 0))
    red.save(os.path.join(out, '20002.png'))
    n = msb.build_event(index, 20000, out, 'full', coin, {'20002': 'right'})
    assert n == {'catalog': 1, 'kept': 2, 'missing': 2}, n
    for fn in ('20000.png', '20001-kept.png', '20002-kept.png'):
        assert Image.open(os.path.join(out, fn)).size == (640, 140), fn
    assert not os.path.exists(os.path.join(out, '20000-kept.png')), 'the catalogue banner is never kept'
    cat = Image.open(os.path.join(out, '20000.png')).convert('RGB')
    # no collage: no pixel of the (red) event card; cyan/green background (green and blue over red) where nothing is drawn
    px = [cat.getpixel((x, y)) for x in range(0, 640, 8) for y in range(0, 140, 8) if not (x > 520 and y < 50)]  # without the TRAINING sticker
    assert not any(r > 180 and g < 60 and b < 60 for r, g, b in px), 'no event card in the catalogue banner'
    bg = cat.getpixel((620, 125))
    assert bg[1] > bg[0] + 40 and bg[2] > bg[0], ('cyan/green background', bg)
    nocoin = msb.event_option('A', os.path.join(t, 'no_coin.png')).convert('RGB')
    assert ImageChops.difference(cat.crop((440, 10, 620, 130)), nocoin.crop((440, 10, 620, 130))).getbbox(), 'the coin emblem is drawn'
    # KEPT tab side: 20002 right (keptTab), 20001 left; the Event Catalog teal band (user 10-11, variant B)
    teal = lambda p: p[1] > p[0] + 60 and p[2] > p[0] + 40  # noqa: E731
    k2 = Image.open(os.path.join(out, '20002-kept.png')).convert('RGB')
    assert teal(k2.getpixel((636, 22))) and not teal(k2.getpixel((4, 22))), (k2.getpixel((636, 22)), k2.getpixel((4, 22)))
    k1 = Image.open(os.path.join(out, '20001-kept.png')).convert('RGB')
    assert teal(k1.getpixel((4, 22))), k1.getpixel((4, 22))
    try:
        msb.build_event(index, 0, out, 'full', coin, {'20001': 'middle'})
        raise AssertionError('a wrong keptTab side must stop')
    except ValueError:
        pass
    Image.new('RGB', (640, 140)).save(os.path.join(out, '0.png'))
    assert msb.build_event(index, 0, out, 'full', coin) == {'catalog': 0, 'kept': 4, 'missing': 0}, \
        'no catalog id: no catalogue banner; plate 0.png for the events without a card'
    # the real config: every KEPT EVENT tab at the top left (user 10-11: the Quiz card 20004 too)
    cfg = json.load(open(os.path.join(meb.REPO, 'server', 'event_config.json'), encoding='utf-8'))
    assert not cfg.get('keptTab'), cfg.get('keptTab')
finally:
    shutil.rmtree(t, ignore_errors=True)
print('OK: test_make_event_banners')
