"""Prova della tabella enemy di raw_master_old.py (I-207: campi spostati a 1076..1096):

    python -I recon/tools/test_raw_master_old.py

  * riga sintetica: dopo gli 8 buff vengono bufTurn, bufCount, statusAilments[2], statusAilmentsTurn,
    statusAilmentsCount; la riga vecchia non ha i buff Upright/Reversed (restano fuori, il master li mette a 0);
  * se ci sono i dati di thethiny (fuori dal repository): le 665 righe di enemy_raw.json decodificate danno gli stessi
    buff e stati iniziali di data/enemy.json di thethiny (nomi giusti), e White Rose 76 dorme (112).
"""
import json
import os
import struct
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import raw_master_old  # noqa: E402

errors = []


def check(ok, msg):
    if not ok:
        errors.append(msg)


KEYS = ['bufAttack', 'bufDefense', 'bufAttackPower', 'bufDefensePower', 'bufAttackSpeed', 'bufDefenseSpeed',
        'bufAttackMagic', 'bufDefenseMagic', 'bufTurn', 'bufCount', 'statusAilments', 'statusAilmentsTurn',
        'statusAilmentsCount']

b = bytearray(1100)
struct.pack_into('<i', b, 0, 76)
struct.pack_into('<8i', b, 1044, 1, 0, 0, 0, 0, 2, 0, 0)
struct.pack_into('<6i', b, 1076, 5, 0, 112, 0, 5, 0)
row = raw_master_old.decode('enemy', bytes(b))
want = {'bufAttack': 1, 'bufDefenseSpeed': 2, 'bufTurn': 5, 'bufCount': 0, 'statusAilments': [112, 0],
        'statusAilmentsTurn': 5, 'statusAilmentsCount': 0}
for k, v in want.items():
    check(row.get(k) == v, 'sintetica %s = %r, attesi %r' % (k, row.get(k), v))
for k in ('bufAttackUpright', 'bufDefenseUpright', 'bufAttackReverse', 'bufDefenseReverse'):
    check(k not in row, 'la riga vecchia non ha %s' % k)

EXT = os.environ.get('KHUX_THETHINY', r'D:\Progetto_Restauro_KH_UX\external')
raw_p = os.path.join(EXT, 'thethiny', 'enemy_raw.json')
ref_p = os.path.join(EXT, 'thethiny_2026-10-13', 'KHUx-Server', 'data', 'enemy.json')
if os.path.exists(raw_p) and os.path.exists(ref_p):
    raw = json.load(open(raw_p, encoding='utf-8'))
    ref = {r['enemyId']: r for r in json.load(open(ref_p, encoding='utf-8'))}
    rows = [raw_master_old.decode('enemy', bytes.fromhex(r['_raw'])) for r in raw]
    bad = [r['enemyId'] for r in rows if any(r.get(k) != ref.get(r['enemyId'], {}).get(k) for k in KEYS)]
    check(len(rows) == 665 and not bad, 'diverse da thethiny: %d/%d %s' % (len(bad), len(rows), bad[:5]))
    rose = next((r for r in rows if r['enemyId'] == 76), {})
    check(rose.get('statusAilments') == [112, 0], 'White Rose 76 statusAilments %r' % rose.get('statusAilments'))
else:
    print('dati di thethiny assenti: confronto saltato')

if errors:
    print('ERRORI (%d):\n  %s' % (len(errors), '\n  '.join(errors)))
    sys.exit(1)
print('OK: raw_master_old enemy')
