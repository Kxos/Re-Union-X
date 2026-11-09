"""Tests of make_quiz_dramas.py (Events Part 4 Task 6). python -I recon/tools/test_make_quiz_dramas.py"""
import json
import os
import struct
import sys
import tempfile
import zlib

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import make_quiz_dramas as mq  # noqa: E402


def fake_template(root, picture=39101):
    """a 320-byte script of the quiz shape (80 ints): picture at int 13, hold picture 30300, music 501000810"""
    v = [0] * 80
    v[0:2] = [4000, 5005]
    v[5:10] = [4002, 5001, 0, 501000810, 0]
    v[10:15] = [4002, 5008, 0, picture, 2]
    v[20:25] = [4002, 5009, 0, 30300, 1]
    seq = os.path.join(root, 'img', 'light', 'SEQ')
    os.makedirs(seq)
    open(os.path.join(seq, '1900501.l'), 'wb').write(struct.pack('<80i', *v))
    open(os.path.join(seq, '1900501 (2).l'), 'wb').write(struct.pack('<80i', *v))
    return v


def main():
    with tempfile.TemporaryDirectory() as t:
        jp, boards, out = (os.path.join(t, x) for x in ('jp', 'boards', 'out'))
        v = fake_template(jp)
        os.makedirs(boards)
        man = {'740879': {'file': '740879_1.png', 'files': ['740879_1.png', '740879_2.png'], 'source': 'original_screenshot', 'record': ['EV-0910']},
               '724110': {'file': '724110.png', 'source': 'reconstructed', 'record': ['EV-0484']}}
        json.dump(man, open(os.path.join(boards, 'manifest.json'), 'w'))
        for f in ('724110.png', '740879_1.png', '740879_2.png'):
            open(os.path.join(boards, f), 'wb').write(b'board ' + f.encode())
        plan, lst = os.path.join(t, 'plan.json'), os.path.join(t, 'list.json')
        args = ['--out', out, '--plan', plan, '--boards', boards, '--jp', jp, '--list', lst]
        # plan_assigned_in_stage_order: ascending stage ids, consecutive ids, the 4-board stage keeps the manifest order
        assert mq.main(args + ['--assign']) == 0
        p = json.load(open(plan))['stages']
        assert p['724110']['boards'] == [{'drama': 1906101, 'picture': 39401, 'file': '724110.png'}], p
        assert [b['drama'] for b in p['740879']['boards']] == [1906102, 1906103]
        assert [b['file'] for b in p['740879']['boards']] == ['740879_1.png', '740879_2.png']
        assert p['740879']['source'] == 'original_screenshot' and p['740879']['records'] == ['EV-0910']
        # drama_points_at_its_board: only int 13 changes
        d = open(os.path.join(out, 'img', 'light', 'SEQ', '1906103.l'), 'rb').read()
        w = list(struct.unpack('<80i', d))
        assert w[13] == 39403 and w[:13] == v[:13] and w[14:] == v[14:], w
        assert open(os.path.join(out, 'img', 'light', 'NPC', '39403.png'), 'rb').read() == b'board 740879_2.png'
        # hold_picture_transparent: 426x480 RGBA, every byte of the pixels 0
        png = open(os.path.join(out, 'img', 'light', 'NPC', '30300.png'), 'rb').read()
        assert png[:8] == b'\x89PNG\r\n\x1a\n' and struct.unpack('>II', png[16:24]) == (426, 480) and png[24:26] == b'\x08\x06'
        idat = png[png.index(b'IDAT') + 4:png.index(b'IEND') - 8]
        assert set(zlib.decompress(idat)) == {0}
        assert json.load(open(lst)) == [1906101, 1906102, 1906103]
        # plan_append_only: a new stage gets the next ids, the old ones keep theirs
        man['731310'] = {'file': '731310.png', 'source': 'reconstructed', 'record': ['EV-0538']}
        json.dump(man, open(os.path.join(boards, 'manifest.json'), 'w'))
        open(os.path.join(boards, '731310.png'), 'wb').write(b'x')
        assert mq.main(args + ['--assign']) == 0
        p2 = json.load(open(plan))['stages']
        assert p2['724110'] == p['724110'] and p2['740879'] == p['740879']
        assert p2['731310']['boards'][0]['drama'] == 1906104 and p2['731310']['boards'][0]['picture'] == 39404
        # bad_template_stops: a script without the picture id stops the run
        open(os.path.join(jp, 'img', 'light', 'SEQ', '1900501.l'), 'wb').write(struct.pack('<80i', *([0] * 80)))
        try:
            mq.main(args)
            raise AssertionError('a wrong template must stop')
        except SystemExit as e:
            assert 'quiz script' in str(e)
        # missing_board_stops
        fake = os.path.join(t, 'jp2')
        fake_template(fake)
        os.remove(os.path.join(boards, '731310.png'))
        try:
            mq.main(['--out', out, '--plan', plan, '--boards', boards, '--jp', fake, '--list', lst])
            raise AssertionError('a missing board must stop')
        except SystemExit as e:
            assert 'board missing' in str(e)
    print('OK test_make_quiz_dramas')


if __name__ == '__main__':
    main()
