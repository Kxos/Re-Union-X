"""Prova di import_originals.py:  python recon/tools/test_import_originals.py"""
import os
import shutil
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import import_originals as io  # noqa: E402

t = tempfile.mkdtemp()
try:
    b16, jp, out = (os.path.join(t, d) for d in ('b16', 'jp', 'out'))

    def put(root, rel, data):
        p = os.path.join(root, rel)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        open(p, 'w').write(data)

    put(b16, 'img/stage/ico_1.png', 'b1')
    put(b16, 'img/stage/ico_2.png', 'b2')
    put(jp, 'img/ui/g.00100000.png', 'old')
    put(jp, 'img/ui/g.00200000.png', 'new')
    put(jp, 'img/ui/h.png', 'plain')
    put(jp, 'lwf/mog/mog.00300000.lwf', 'L')
    put(jp, 'lwf/mog/mog_0.00300000.png', 'T')
    put(jp, 'pub/X9.00100000.png', 'x9')
    rows = io.parse(['img/stage/ico_*.png\tb16,jp  # glob', 'img/ui/g.png\tjp', 'img/ui/h.png\tb16,jp',
                     'lwf/mog/\tjp', 'img/ui/X9.png\tjp\tpub/X9.png', '', '# commento'])
    rep = io.run(rows, b16, jp, out)
    rd = lambda rel: open(os.path.join(out, rel)).read()
    assert rd('img/stage/ico_1.png') == 'b1' and rd('img/stage/ico_2.png') == 'b2', 'glob dal 2016'
    assert rd('img/ui/g.png') == 'new', 'revisione JP piu alta, suffisso tolto'
    assert rd('img/ui/h.png') == 'plain', 'ripiego sulla seconda fonte'
    assert rd('lwf/mog/mog.lwf') == 'L' and rd('lwf/mog/mog_0.png') == 'T', 'cartella intera'
    assert rd('img/ui/X9.png') == 'x9', 'sorgente diversa dalla destinazione'
    assert [r['source'] for r in rep] == ['b16', 'jp', 'jp', 'jp', 'jp'], rep
    # nomi gia' serviti dal WW: saltati nei glob, scritti se la destinazione e' esplicita
    shutil.rmtree(out)
    rep = io.run(io.parse(['img/stage/ico_*.png' + chr(9) + 'b16', 'img/ui/h.png' + chr(9) + 'jp']), b16, jp, out, {'img/stage/ico_2.png', 'img/ui/h.png'})
    assert os.path.exists(os.path.join(out, 'img/stage/ico_1.png')) and not os.path.exists(os.path.join(out, 'img/stage/ico_2.png')), 'glob: servito saltato'
    assert rd('img/ui/h.png') == 'plain' and rep[0]['servedWW'] == 1, 'destinazione esplicita scritta'
    # glob con parentesi quadre (I-196): ogni file col proprio nome, mai un file letterale con '['
    shutil.rmtree(out)
    for k in (11, 12, 3):
        put(jp, 'img/wipe/wipe_%d.00100000.png' % k, 'w%d' % k)
    io.run(io.parse(['img/wipe/wipe_1[1-4].png' + chr(9) + 'jp', 'img/wipe/wipe_[2-8].png' + chr(9) + 'jp']), b16, jp, out)
    assert rd('img/wipe/wipe_11.png') == 'w11' and rd('img/wipe/wipe_12.png') == 'w12' and rd('img/wipe/wipe_3.png') == 'w3', 'glob [..]'
    assert not [f for f in os.listdir(os.path.join(out, 'img/wipe')) if '[' in f], 'file letterale con ['
    # IPA 4.4.0 gia' estratta
    i440 = os.path.join(t, 'i440')
    put(i440, 'img/union/Union_01.png', 'u1')
    io.run(io.parse(['img/union/Union_0*.png' + chr(9) + 'i440']), b16, jp, out, set(), i440)
    assert rd('img/union/Union_01.png') == 'u1', 'fonte i440'
    try:
        io.run(io.parse(['img/none.png\tb16,jp']), b16, jp, out)
        raise AssertionError('riga senza originale accettata')
    except SystemExit:
        pass
finally:
    shutil.rmtree(t)
print('OK: import_originals')
