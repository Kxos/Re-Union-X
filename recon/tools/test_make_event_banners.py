"""Test of make_event_banners.py and make_special_banners.py --section event: python -I recon/tools/test_make_event_banners.py"""
import io
import json
import os
import shutil
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image  # noqa: E402
import make_event_banners as meb  # noqa: E402
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
    assert meb.build(index, notices, dest, os.path.join(t, 'o2'), {20002})[0] == {20002: '51523_9cbFN5Ie4.png'}
    # --section event: catalog banner 20000 from the cards, a KEPT EVENT copy of every card
    assert msb.EVENT_KEPT_TEXT == 'KEPT EVENT' and msb.EVENT_CATALOG_TITLE == 'EVENT CATALOG'
    Image.new('RGB', (640, 140), (200, 0, 0)).save(os.path.join(out, '20000.png'))   # an old catalog banner: no strip
    assert [os.path.basename(p) for p in msb.event_cards(out, 20000)] == ['20001.png', '20002.png']
    n = msb.build_event(index, 20000, out, 'full', enemies=os.path.join(t, 'none'))
    assert n == {'catalog': 1, 'kept': 2, 'missing': 2}, n
    for fn in ('20000.png', '20001-kept.png', '20002-kept.png'):
        assert Image.open(os.path.join(out, fn)).size == (640, 140), fn
    assert not os.path.exists(os.path.join(out, '20000-kept.png')), 'the catalogue banner is never kept'
    assert [os.path.basename(p) for p in msb.event_cards(out, 20000)] == ['20001.png', '20002.png'], 'kept copies are no strips'
    Image.new('RGB', (640, 140)).save(os.path.join(out, '0.png'))
    assert msb.build_event(index, 0, out, 'full', enemies=os.path.join(t, 'none')) == {'catalog': 0, 'kept': 4, 'missing': 0}, \
        'no catalog id: no catalogue banner; plate 0.png for the events without a card'
finally:
    shutil.rmtree(t, ignore_errors=True)
print('OK: test_make_event_banners')
