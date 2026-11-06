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
    # notice cards bound to one evStageId (the 62 older event raids): matched by id, never by date
    items = [{'file': 'sqex/44001_k.png', 'from': '2016-05-02', 'to': '2016-05-16', 'notice': 17890, 'evStageId': 981010},
             {'file': 'sqex/44001_k.png', 'from': '2018-09-03', 'to': '2018-09-09', 'notice': 44001}]
    assert mrb.notice_rows(items) == [('sqex/44001_k.png', dt.date(2018, 9, 3), dt.date(2018, 9, 9))], 'id-bound items stay out of the date rows'
    assert mrb.notice_by_id(items) == {981010: 'sqex/44001_k.png'}, mrb.notice_by_id(items)
    idx3 = {'entries': [{'evStageId': 981010, 'start': '2016-05-02', 'end': '2016-05-16', 'censusId': 'E'},
                        {'evStageId': 981001, 'start': '2018-10-15', 'end': '2018-10-21', 'censusId': 'A'},
                        {'evStageId': 981011, 'start': '2018-10-15', 'end': '2018-10-21', 'censusId': 'F'}]}
    out3 = os.path.join(t, 'out3')
    d3, m3 = mrb.build(idx3, rows, t, out3, by_id={981010: 'sqex/44001_k.png', 981011: 'sqex/44001_k.png'})
    assert d3 == {981010: 'sqex/44001_k.png', 981001: 'Event_-_Weekly_Raid_Event_2_banner_KHUX.png', 981011: 'sqex/44001_k.png'}, d3
    assert Image.open(os.path.join(out3, '981010.png')).getpixel((0, 0)) == (4, 5, 6), 'id-bound card wins over the date'
    out4 = os.path.join(t, 'out4')
    d4, m4 = mrb.build(idx3, rows, t, out4, by_id={981010: 'sqex/44001_k.png'}, ids={981010})
    assert d4 == {981010: 'sqex/44001_k.png'} and not m4 and sorted(os.listdir(out4)) == ['981010.png'], (d4, m4)
    assert mrb.parse_ids('8001-8003,8070') == {8001, 8002, 8003, 8070}
    with Image.open(os.path.join(out4, '981010.png')) as im4:
        assert im4.mode == 'RGB'
    # JP rows: cards by census id from the --jp list, evStageId resolved from the index; never matched by date in build
    items = [{'censusId': 'JP-A', 'file': 'jp/a.png', 'match': 'exact'},
             {'censusId': 'JP-B', 'file': 'jp/b.png', 'match': 'variant'},
             {'censusId': 'JP-GONE', 'file': 'jp/a.png'}]
    os.makedirs(os.path.join(t, 'jp'))
    Image.new('RGB', (640, 140), (7, 8, 9)).save(os.path.join(t, 'jp', 'a.png'))
    Image.new('RGBA', (1280, 280), (9, 9, 9, 255)).save(os.path.join(t, 'jp', 'b.png'))
    idx5 = {'entries': [{'evStageId': 982001, 'start': '2016-01-17', 'end': '2016-01-24', 'censusId': 'JP-A', 'jp': True},
                        {'evStageId': 982001, 'start': '2016-01-17', 'end': '2016-01-24', 'censusId': 'JP-A', 'jp': True},
                        {'evStageId': 982002, 'start': '2016-08-19', 'end': '2016-08-21', 'censusId': 'JP-B', 'jp': True},
                        {'evStageId': 982003, 'start': '2018-10-15', 'end': '2018-10-21', 'censusId': 'JP-C', 'jp': True},
                        {'evStageId': 981001, 'start': '2018-10-15', 'end': '2018-10-21', 'censusId': 'A'}]}
    exact = mrb.jp_items(items)
    assert sorted(exact) == ['JP-A', 'JP-GONE'], exact
    assert sorted(mrb.jp_items(items, variants=True)) == ['JP-A', 'JP-B', 'JP-GONE']
    try:
        mrb.jp_items(items + [{'censusId': 'JP-A', 'file': 'x.png'}])
        raise AssertionError('a census id twice must fail')
    except ValueError:
        pass
    out5 = os.path.join(t, 'out5')
    d5, m5, u5 = mrb.build_jp(idx5, exact, t, out5)
    assert d5 == {982001: 'jp/a.png'} and m5 == [(982002, 'JP-B'), (982003, 'JP-C')] and u5 == ['JP-GONE'], (d5, m5, u5)
    assert sorted(os.listdir(out5)) == ['982001.png'], 'only JP rows, no WW card'
    d6, m6, _ = mrb.build_jp(idx5, mrb.jp_items(items, variants=True), t, out5, ids={982002})
    assert d6 == {982002: 'jp/b.png'} and not m6, (d6, m6)
    with Image.open(os.path.join(out5, '982002.png')) as im6:
        assert im6.size == (640, 140) and im6.mode == 'RGB', 'JP card processed as the WW cards'
    d7, m7 = mrb.build(idx5, rows, t, os.path.join(t, 'out7'))
    assert d7 == {981001: 'Event_-_Weekly_Raid_Event_2_banner_KHUX.png'} and not m7, 'the WW build leaves the JP rows alone'
finally:
    shutil.rmtree(t)
print('OK: make_raid_banners')
