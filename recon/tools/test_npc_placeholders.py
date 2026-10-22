"""Prova offline di npc_placeholders.py con una cartella finta (mapfile sostituito).

    python -I recon/tools/test_npc_placeholders.py        -> «OK: ...» oppure «ERRORI (n)», uscita 1
"""
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mapfile  # noqa: E402
import npc_placeholders as p  # noqa: E402
import empty_lwf  # noqa: E402
import make_pet_motions as mpm  # noqa: E402
import struct  # noqa: E402

errori = []


def check(cond, msg):
    if not cond:
        errori.append(msg)


STAGES = {1: [[{'id': 11018}, {'raw': [0, 0, 2006]}], [{'id': 4001}]], 2: [[{'id': 11018}, {'id': 9}]], 3: None}
# stage 4: parti 0 e 1 senza STG (come il 1040): le MAP si leggono direttamente
PARTS_NO_STG = {(4, 0): [{'id': 777}], (4, 1): [{'id': 4001}, {'id': 778}]}
mapfile.iter_stage_files = lambda d: {**{(s, None): 'x' for s in STAGES}, **{k: k for k in PARTS_NO_STG}}
mapfile.parse_map = lambda b, part=0: {'npcs': PARTS_NO_STG[b]}
_open = open
p.open = lambda f, m='r', *a: type('F', (), {'read': lambda self: f})() if isinstance(f, tuple) else _open(f, m, *a)


def fake_load(files, sid):
    if STAGES[sid] is None:
        raise mapfile.FormatError('STG assente')
    return {}, [{'npcs': n} for n in STAGES[sid]]


mapfile.load_stage = fake_load
with tempfile.TemporaryDirectory() as t:
    os.makedirs(os.path.join(t, 'stage'))
    pre = os.path.join(t, 'lwf', 'character', 'npc', '9', 'wait')
    os.makedirs(pre)
    open(os.path.join(pre, 'wait.lwf'), 'wb').write(b'gia')
    r = p.run(t, {'lwf/character/npc/4001/wait/wait.lwf'})
    check(r['npc_ids'] == 6 and r['written'] == [777, 778, 2006, 11018], r)
    check(r['already_generated'] == [9] and r['served'] == [4001] and list(r['stage_errors']) == [3], r)
    f = os.path.join(t, 'lwf', 'character', 'npc', '11018', 'wait', 'wait.lwf')
    check(open(f, 'rb').read() == p.empty_lwf.build(), 'contenuto segnaposto')
    check(open(os.path.join(pre, 'wait.lwf'), 'rb').read() == b'gia', 'file presente non toccato')
    check(not os.path.exists(os.path.join(t, 'lwf', 'character', 'npc', '4001')), '4001 servito: niente file')
    check(p.run(t, {'lwf/character/npc/4001/wait/wait.lwf'})['written'] == [], 'idempotente')

# l'LWF vuoto generato: stessa struttura del segnaposto usato finora (2 movie _root/_empty,
# un fotogramma ciascuno, nessun controllo, nessuna grafica), deterministico
b = empty_lwf.build()
check(b[:8] == b'LWF\0\x12\x10\x10\0' and b == empty_lwf.build(), 'intestazione / deterministico')
sec = {n: struct.unpack_from('<2i', b, 0x20 + 8 * i) for i, n in enumerate(mpm.SECTIONS)}
counts = {n: c for n, (o, c) in sec.items() if c}
check(counts == {'stringBytes': 20, 'translate': 1, 'alphaTransform': 1, 'objectData': 2, 'instanceName': 1,
                 'frame': 2, 'movie': 2, 'movieLinkage': 2, 'stringData': 3}, counts)
check(struct.unpack_from('<i', b, 0x20 + 8 * len(mpm.SECTIONS))[0] == len(b), 'lunghezza totale')
check(all(o <= len(b) for o, c in sec.values()), 'offset nel file')

if errori:
    print('ERRORI (%d)' % len(errori))
    for e in errori:
        print(' -', e)
    sys.exit(1)
print('OK: npc_placeholders')
