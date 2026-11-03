"""Test of make_raid_banners.py: python -I recon/tools/test_make_raid_banners.py"""
import datetime as dt
import os
import shutil
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import make_raid_banners as mrb  # noqa: E402

WIKI = ('|[[File:Event - Weekly Raid Event 2 banner KHUX.png|300px]]||10/15/18 - 10/21/18||x\n'
        '|[[File:Event - Weekly Raid Event 3 banner KHUX.png|300px]]||10/22/18 - 10/31/18||x\n'
        '|[[File:Event - Weekly Raid Event 99 banner KHUX.png|300px]]||11/01/20||x\n')
rows = mrb.banner_rows(WIKI)
assert [r[0] for r in rows] == ['Event_-_Weekly_Raid_Event_2_banner_KHUX.png', 'Event_-_Weekly_Raid_Event_3_banner_KHUX.png',
                                'Event_-_Weekly_Raid_Event_99_banner_KHUX.png'], rows
assert rows[2][1] == rows[2][2] == dt.date(2020, 11, 1), 'single day'
assert mrb.pick(rows, dt.date(2018, 10, 22), dt.date(2018, 10, 28))[0].endswith('_3_banner_KHUX.png'), 'start held'
assert mrb.pick(rows, dt.date(2018, 10, 14), dt.date(2018, 10, 20))[0].endswith('_2_banner_KHUX.png'), 'largest overlap'
assert mrb.pick(rows, dt.date(2017, 1, 1), dt.date(2017, 1, 7)) is None, 'no overlap'
nrows = mrb.notice_rows([{'file': 'sqex/44001_k.png', 'from': '2018-09-03', 'to': '2018-09-09', 'notice': 44001}])
assert nrows == [('sqex/44001_k.png', dt.date(2018, 9, 3), dt.date(2018, 9, 9))], nrows
assert mrb.pick(rows + nrows, dt.date(2018, 9, 3), dt.date(2018, 9, 9))[0] == 'sqex/44001_k.png', 'notice card'
t = tempfile.mkdtemp()
try:
    from PIL import Image
    Image.new('RGB', (640, 140), (1, 2, 3)).save(os.path.join(t, 'Event_-_Weekly_Raid_Event_2_banner_KHUX.png'))
    os.makedirs(os.path.join(t, 'sqex'))
    Image.new('RGB', (1280, 280), (4, 5, 6)).save(os.path.join(t, 'sqex', '44001_k.png'))
    d2, m2 = mrb.build({'entries': [{'evStageId': 981003, 'start': '2018-09-03', 'end': '2018-09-09', 'censusId': 'C'}]},
                       rows + nrows, t, os.path.join(t, 'out'))
    assert d2 == {981003: 'sqex/44001_k.png'} and not m2, (d2, m2)
    assert Image.open(os.path.join(t, 'out', '981003.png')).size == (640, 140), 'notice card scaled to 640x140'
    idx = {'entries': [{'evStageId': 981001, 'start': '2018-10-15', 'end': '2018-10-21', 'censusId': 'A'},
                       {'evStageId': 981001, 'start': '2018-10-15', 'end': '2018-10-21', 'censusId': 'A'},
                       {'evStageId': 981002, 'start': '2016-05-02', 'end': '2016-05-08', 'censusId': 'B'}]}
    done, missing = mrb.build(idx, rows, t, os.path.join(t, 'out'))
    assert list(done) == [981001] and missing == [(981002, 'B')], (done, missing)
    assert Image.open(os.path.join(t, 'out', '981001.png')).size == (640, 140)
finally:
    shutil.rmtree(t)
print('OK: make_raid_banners')
