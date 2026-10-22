"""Prova offline di banner_guarantees.py (riserve degli slot, pity, Tier) sulle frasi reali dei banner.

    python recon/tools/test_banner_guarantees.py        -> «OK: ...» oppure «ERRORI (n)», uscita 1

Le frasi lunghe dei deal (testi dei notice e della wiki: non nostri) non stanno nel repository: TXT['kN'] le legge
dal file locale test_banner_guarantees_texts.json nella cartella privata (recon/tools/private_tools.py). Senza quel
file la prova si salta (uscita 0).
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import banner_guarantees as g  # noqa: E402
import private_tools  # noqa: E402

_TXT = os.path.join(private_tools.root(), 'recon', 'tools', 'test_banner_guarantees_texts.json')
if not os.path.isfile(_TXT):
    print('SKIP: test_banner_guarantees (testi dei deal locali assenti: %s)' % _TXT)
    sys.exit(0)
with open(_TXT, encoding='utf-8') as _f:
    TXT = json.load(_f)

try:
    sys.stdout.reconfigure(encoding='utf-8')
except AttributeError:
    pass

errori = []


def check(cond, msg):
    if not cond:
        errori.append(msg)


M3 = [[7, 1], [6, 1], [5, 8]]

# --- D1: Tier sul 7★, lista sul 6★, pity sul 7★ (B0306)
B0306 = (TXT['k1'])
s = g.assign_slots(g.parse_reservations(B0306), M3)
check(s[0] == {'kind': 'tier', 'slot': 0, 'count': 1, 'star': 7, 'names': [], 'tierMin': None, 'tierMax': 4}, f'B0306 tier {s[0]}')
check(s[1]['kind'] == 'list' and s[1]['slot'] == 1 and s[1]['star'] == 6 and len(s[1]['names']) == 8
      and 'yuna & rikku & paine' in s[1]['names'], f'B0306 lista sul 6 {s[1]}')
p = g.pity_of(B0306, ['hd axel'], s, M3)
check(p == {'pity': 5, 'pityNames': ['hd axel'], 'pityStar': 7, 'pitySlot': 0}, f'B0306 pity {p}')
# lo stesso testo col markup della wiki (note complete)
W0306 = (TXT['k2'])
s = g.assign_slots(g.parse_reservations(W0306), M3)
check([x['kind'] for x in s] == ['tier', 'list'] and s[1]['names'][:2] == ['illustrated kairi [ex]', 'illustrated xion [ex]'],
      f'B0306 col markup {s}')

# --- D7: medaglia nominata, pity sulla riserva che la contiene (B0321)
B0321 = TXT['k3']
s = g.assign_slots(g.parse_reservations(B0321), M3)
check(s[0]['tierMin'] == 4 and s[0]['tierMax'] == 4 and s[1]['names'] == ['prime - illustrated axel'] and s[1]['slot'] == 1, f'B0321 {s}')
check(g.pity_of(B0321, ['prime - illustrated axel'], s, M3)['pitySlot'] == 1, 'B0321 pity sulla riserva')

# --- D7 + Trait + D9: pity 7★ su un mix 6★/5★ (B0397)
B0397 = TXT['k4']
s = g.assign_slots(g.parse_reservations(B0397), [[6, 2], [5, 8]])
check([x['kind'] for x in s] == ['list', 'trait'] and [x['slot'] for x in s] == [0, 1], f'B0397 {s}')
check(g.pity_of(B0397, ['supernova - sephiroth', 'prime - kh cloud'], s, [[6, 2], [5, 8]]) ==
      {'pity': 5, 'pityNames': ['prime - kh cloud'], 'pityStar': 7, 'pitySlot': 0}, 'B0397 pity 7 sulla lista')

# --- D3: due liste (B0629)
B0629 = (TXT['k5'])
s = g.assign_slots(g.parse_reservations(B0629), [[7, 1], [6, 3], [5, 6]])
check([(x['kind'], x['slot'], x['count'], x['star']) for x in s] == [('list', 0, 1, 7), ('list', 1, 3, 6)], f'B0629 {s}')
check(len(s[0]['names']) == 5 and 'key art #20' in s[1]['names'], f'B0629 nomi {s}')
check(g.pity_of(B0629, ['sn++ - rock troll'], s, [[7, 1], [6, 3], [5, 6]])['pitySlot'] == 0, 'B0629 pity sulla prima lista')

# --- Tier: SAB del 2016 (ricerca §3: «SAB of N» e «Level N SAB» = filtro del Tier)
s = g.assign_slots(g.parse_reservations(TXT['k6']),
                   [[5, 3], [4, 7]])
check(len(s) == 1 and {k: s[0][k] for k in ('kind', 'count', 'tierMin', 'tierMax', 'slot')} ==
      {'kind': 'tier', 'count': 3, 'tierMin': 3, 'tierMax': None, 'slot': 0}, f'B0051 SAB of 3 {s}')
# B0046: «(with Level 3 SAB)» letto come Tier >= 3 come B0051; potrebbe voler dire 3 pallini (ricerca §3, incerto)
s = g.parse_reservations(TXT['k7'])
check(len(s) == 1 and s[0]['kind'] == 'tier' and s[0]['count'] == 5 and s[0]['tierMin'] == 3 and s[0]['tierMax'] is None, f'B0046 {s}')
s = g.parse_reservations(TXT['k8'])
check(len(s) == 1 and (s[0]['kind'], s[0]['count'], s[0]['star'], s[0]['tierMin']) == ('tier', 2, 6, 3), f'B0079 {s}')

# --- Tier: intervalli, elenchi, nomi alternativi
s = g.parse_reservations(TXT['k9'])
check((s[0]['tierMin'], s[0]['tierMax'], s[0]['star']) == (3, 4, 7), f'B0355 {s}')
s = g.parse_reservations(TXT['k10'])
check((s[0]['tierMin'], s[0]['tierMax'], s[0]['star'], s[0]['names']) == (6, 8, 7, []), f'B0419 tier {s}')
s = g.parse_reservations(TXT['k11'])
check(s[0]['kind'] == 'tier' and s[0]['tierMin'] == 7 and s[0]['tierMax'] == 7
      and s[0]['names'] == ['supernova - hd terra', 'supernova - hd ventus', 'supernova - hd aqua'], f'B0442 nomi alternativi {s}')
s = g.parse_reservations(TXT['k12'])
check(s[0]['kind'] == 'tier' and s[0]['tierMin'] == 7 and len(s[0]['names']) == 3, f'B0502 tier in fondo {s}')
s = g.parse_reservations(TXT['k13'])
check(s[0]['names'] == ['final boss xion'] and s[0]['tierMax'] == 4, f'B0375 {s}')
s = g.parse_reservations(TXT['k14'])
check((s[0]['tierMin'], s[0]['tierMax'], s[0]['star'], s[0]['names']) == (4, None, None, []), f'or higher {s}')
s = g.parse_reservations('Guarantees seven Tier 5 or higher Medals.')
check(s[0]['count'] == 7, f'seven {s}')
s = g.parse_reservations(TXT['k15'])
check(len(s) == 1 and s[0]['tierMin'] == 5 and s[0]['tierMax'] == 5 and s[0]['names'] == [], f'B0153 {s}')
s = g.parse_reservations(TXT['k16'])
check(len(s) == 1 and (s[0]['count'], s[0]['star'], s[0]['tierMin'], s[0]['tierMax']) == (1, 7, 4, 4), f'B0340 {s}')

# --- SN+ o SN++: lista dei nomi del pool risolta in guarantee_v3
s = g.parse_reservations(TXT['k17'])
check(s[0]['kind'] == 'list' and s[0]['count'] == 2 and s[0]['names'] == [] and s[1]['count'] == 1, f'B0750 {s}')

# --- liste: «at least», «oe», «7★ Medals», «at 7★», boosted
s = g.parse_reservations(TXT['k18'])
check(s[0]['count'] == 1 and s[0]['names'] == ['black coat king mickey', 'zack', 'mr. smee'], f'B0049 {s}')
s = g.parse_reservations(TXT['k19'])
check(s[0]['count'] == 1 and s[0]['names'] == ['key art #24', 'sn++ - fiend'], f'B0695 {s}')
s = g.parse_reservations(TXT['k20'])
check(s[0]['star'] == 7, f'B0372 {s}')
s = g.parse_reservations(TXT['k21'])
check(s[0]['star'] == 7 and s[0]['count'] == 2, f'at 7 {s}')
s = g.parse_reservations(TXT['k22'])
check(s[0]['count'] == 3 and len(s[0]['names']) == 2, f'boosted {s}')
s = g.parse_reservations(TXT['k23'])
check([x['names'] for x in s] == [['kh 0.2 kairi'], ['key art "sky"', 'key art "bonds"']], f'B0241 KH 0.2 {s}')
s = g.parse_reservations(TXT['k24'])
check(s[0]['names'] == ['sn++ - halloween goofy b', 'sn++ - illus. halloween sora', 'sn++ - halloween donald b'], f'B0740 nominate {s}')
s = g.parse_reservations(TXT['k25'])
check(s and s[0]['names'] == ['key art #16 [ex+]'], f'nome senza punto {s}')
# frasi che non sono riserve
for t in ('Guarantees one 6★ Medal.', 'Guarantees one 5★ Reversed Medal.', 'Guarantees at least one Epic Medal.',
          TXT['k26'], 'Guarantees one 7★ .', TXT['k27'],
          TXT['k28']):
    check(g.parse_reservations(t) == [], f'non riserva: {t} -> {g.parse_reservations(t)}')
s = g.parse_reservations('Guarantees two Trait Medal #302.')
check(s == [{'kind': 'trait', 'count': 2, 'star': None, 'names': ['trait medal #302'], 'tierMin': None, 'tierMax': None}], f'trait {s}')
s = g.parse_reservations('Guarantees one Trait Medal.')
check(s and s[0]['names'] == [], f'trait senza numero {s}')

# --- assegnazione: riserve con stella prima, poi le altre dall'alto; conflitti
s = g.assign_slots([{'kind': 'list', 'count': 3, 'star': None, 'names': ['a'], 'tierMin': None, 'tierMax': None},
                    {'kind': 'tier', 'count': 1, 'star': 6, 'names': [], 'tierMin': 5, 'tierMax': None}], [[7, 3], [6, 7]])
check([(x['slot'], x['star']) for x in s] == [(0, 7), (3, 6)] and not any('conflict' in x for x in s), f'stella prima {s}')
s = g.assign_slots([{'kind': 'tier', 'count': 1, 'star': 7, 'names': [], 'tierMin': 4, 'tierMax': None},
                    {'kind': 'tier', 'count': 1, 'star': 7, 'names': [], 'tierMin': 6, 'tierMax': None}], [[7, 1], [6, 1], [5, 8]])
check(s[0]['slot'] == 0 and 'conflict' not in s[0] and s[1]['slot'] == 1 and s[1].get('conflict') is True, f'conflitto {s}')
s = g.assign_slots([{'kind': 'list', 'count': 4, 'star': None, 'names': ['a'], 'tierMin': None, 'tierMax': None}], [[6, 1], [5, 2]])
check(s[0]['slot'] == 0 and s[0].get('conflict') is True and s[0]['slotsUsed'] == [0, 1, 2], f'conflitto: piu slot del lotto {s}')
# fix 1, punto 7: liberi non consecutivi -> uno per uno, mai uno slot gia' preso, slotsUsed esplicito
s = g.assign_slots([{'kind': 'tier', 'count': 1, 'star': 6, 'names': [], 'tierMin': 5, 'tierMax': None},
                    {'kind': 'list', 'count': 3, 'star': 7, 'names': ['a'], 'tierMin': None, 'tierMax': None}], [[7, 1], [6, 2], [5, 2]])
check(s[0]['slot'] == 1 and s[1].get('conflict') is True and s[1]['slotsUsed'] == [0, 2, 3] and s[1]['slot'] == 0,
      f'conflitto con liberi non consecutivi {s}')
check('slotsUsed' not in s[0] and g.covered(s[1]) == [0, 2, 3] and g.covered(s[0]) == [1], 'covered')

# --- pity: decisione 5 (B0319: «one 6★ X» con slot 0 a 7★ -> primo 6★, altrimenti primo 5★)
B0319 = (TXT['k29'])
s = g.assign_slots(g.parse_reservations(B0319), [[7, 1], [5, 9]])
p = g.pity_of(B0319, ['illustrated kairi [ex]'], s, [[7, 1], [5, 9]])
check(p == {'pity': 5, 'pityNames': ['illustrated kairi [ex]'], 'pityStar': 6, 'pitySlot': 1}, f'B0319 primo 5★ {p}')
s = g.assign_slots(g.parse_reservations(B0319), [[7, 1], [6, 2], [5, 7]])
check(g.pity_of(B0319, ['illustrated kairi [ex]'], s, [[7, 1], [6, 2], [5, 7]])['pitySlot'] == 1, 'B0319 primo 6★')
# pity senza stella: stella dello slot 0, primo slot libero (la lista non perde lo slot, D11)
T = TXT['k30']
s = g.assign_slots(g.parse_reservations(T), [[6, 3], [5, 7]])
check(g.pity_of(T, ['c'], s, [[6, 3], [5, 7]]) == {'pity': 3, 'pityNames': ['c'], 'pityStar': 6, 'pitySlot': 2}, 'pity sullo slot libero')
# tutti gli slot della stella riservati (B0528: lista x2 + Trait sui tre 6★): la pity prende lo slot della Trait
T = TXT['k31']
s = g.assign_slots(g.parse_reservations(T), [[6, 3], [5, 7]])
check(g.pity_of(T, ['c'], s, [[6, 3], [5, 7]])['pitySlot'] == 2, 'pity sullo slot della Trait, la lista resta intera')
# bersaglio non scritto («at least one 7★ is guaranteed», B0419): la vetrina
p = g.pity_of('If bought 5 times, at least one 7★ is guaranteed.', ['hd aced [ex+]', 'hd gula [ex+]'], [], M3)
check(p['pityNames'] == ['hd aced [ex+]', 'hd gula [ex+]'] and p['pityStar'] == 7, f'pity senza nome {p}')
p = g.pity_of(TXT['k32'], [], [], [[7, 1], [5, 9]])
check(p['pity'] == 10 and p['pityNames'] == ['sn - kh iii dark riku'], f'within {p}')
p = g.pity_of('If bought 5 times, at least one KH 0.2 Kair', ['kh 0.2 kairi', 'kh 0.2 kair'], [], [[6, 1], [5, 9]])
check(p['pityNames'] == ['kh 0.2 kairi'], f'B0169 nome troncato dal TSV {p}')
# fix 1, punto 2: un nome intero non si «completa» con un nome della vetrina piu' lungo
p = g.pity_of(TXT['k33'], ['hd axel [ex]'], [], M3)
check(p['pityNames'] == ['hd axel'], f'nome intero non completato {p}')
p = g.pity_of(TXT['k34'],
              ['sn++ - kh iii terra-xehanort', 'sn++ - kh iii terra', 'sn++ - fiend'], [], [[6, 3], [5, 7]])
check(p['pityNames'] == ['sn++ - kh iii terra-xehanort', 'sn++ - kh iii terra', 'sn++ - fiend'], f'B0637 terra resta {p}')
p = g.pity_of(TXT['k35'],
              ['sn++ - kh iii terra-xehanort'], [], [[6, 3], [5, 7]])
check(p['pityNames'] == ['sn++ - kh iii terra', 'sn++ - fiend'], f'nome non nella vetrina, frase intera {p}')
check(g.pity_of('Guarantees one of the following Medals: A.', [], [], M3) ==
      {'pity': None, 'pityNames': [], 'pityStar': None, 'pitySlot': None}, 'senza pity')

# --- guarantee_v3: decisione 1, SN+/SN++, compatibilita', override
COLS = ['row_id', 'name', 'start_pt', 'guarantees', 'featured_medals', 'rarity_mix']
R = lambda **k: {**{c: '' for c in COLS}, **k}  # noqa: E731
MR = [{'medalId': 1, 'name': 'KH III Pooh', 'rare': 6, 'type': 1}, {'medalId': 2, 'name': 'KH III Pooh', 'rare': 7, 'type': 1},
      {'medalId': 3, 'name': 'SN++ - Fiend', 'rare': 7, 'type': 1}, {'medalId': 4, 'name': 'SN+ - Flood', 'rare': 7, 'type': 1},
      {'medalId': 5, 'name': 'Supernova+ - Ira', 'rare': 7, 'type': 1}, {'medalId': 6, 'name': 'SN - Angelic Amber', 'rare': 7, 'type': 1},
      {'medalId': 7, 'name': 'KH III Goofy', 'rare': 6, 'type': 1},
      {'medalId': 1000003, 'name': 'SN++ - Fiend', 'rare': 7, 'type': 1, 'groupId': 3}]  # boosted: mai nelle liste
gv = g.guarantee_v3(R(row_id='BX'), TXT['k36'],
                    [[6, 3], [5, 7]], ['kh iii pooh'], MR)
check(gv['slots'][0]['names'] == ['kh iii pooh', 'alice'], f'decisione 1: solo i nomi con variante 6★ (o sconosciuti) {gv["slots"]}')
check((gv['list'], gv['count'], gv['slot']) == (['kh iii pooh', 'alice'], 2, 0), f'compatibilita list/count/slot {gv}')
check(gv['pitySlot'] == 0 and gv['pityStar'] == 6 and gv['pityGift'] is None and gv['erratum'] is None and gv['source'] is None
      and gv['every'] is None and gv['pity'] == 3, f'campi v3 {gv}')
gv = g.guarantee_v3(R(row_id='BX'), TXT['k37'], [[6, 1], [5, 9]], [], MR)
check(gv['slots'][0]['names'] == ['sn++ - fiend'], 'decisione 1: lista che resterebbe vuota intatta')
gv = g.guarantee_v3(R(row_id='BX'), 'Guarantees two SN+ or SN++ Medals.', [[7, 3], [6, 7]], [], MR)
check(gv['slots'][0]['names'] == ['sn++ - fiend', 'sn+ - flood', 'supernova+ - ira'] and 'prefix' not in gv['slots'][0],
      f'SN+ o SN++ dal master {gv["slots"]}')
gv = g.guarantee_v3(R(row_id='BX'), 'Draws from sets 1.1.', [[6, 1], [5, 9]], [], MR)
check(gv['slots'] == [] and (gv['list'], gv['count'], gv['slot'], gv['pity']) == ([], 0, 0, None), f'nessuna garanzia {gv}')
gv = g.guarantee_v3(R(row_id='BX', guarantees='Guarantees one 6★ Prime - KH Cloud.'), 'Draws from sets 1.1.', [[6, 1], [5, 9]], [], MR)
check(gv['slots'] and gv['slots'][0]['names'] == ['prime - kh cloud'], f'note senza garanzie: colonna guarantees {gv}')

# fix 1, punto 8: la stella scritta della pity arriva a build_catalog (None se non scritta), mai nel blocco pubblico
T = TXT['k38']
gv = g.guarantee_v3(R(row_id='BX'), T, [[6, 3], [5, 7]], [], MR, keep_prefix=True)
check(gv['_pityStarWritten'] is None and '_pityStarWritten' not in g.guarantee_v3(R(row_id='BX'), T, [[6, 3], [5, 7]], [], MR),
      f'stella della pity non scritta {gv}')
gv = g.guarantee_v3(R(row_id='BX'), B0306, M3, ['hd axel'], MR, keep_prefix=True)
check(gv['_pityStarWritten'] == 7, 'stella della pity scritta')

# override: ogni voce ha la fonte
O = g.SLOT_OVERRIDES
for rid in ('B0678', 'B0733', 'B0740', 'B0049', 'B0055', 'B0372', 'B0695', 'B0721', 'B0725', 'B0726', 'B0734', 'B0739', 'B0419', 'B0421'):
    check(rid in O and O[rid].get('source'), f'override {rid}')
check(O['B0678']['count'] == 1 and 'image 10678' in O['B0678']['source'], 'B0678 count 1')
check(O['B0419']['pityNames'] == ['hd aced [ex+]'] and O['B0421']['pityNames'] == ['hd gula [ex+]']
      and O['B0419']['erratum'] and O['B0421']['erratum'], 'B0419/B0421 erratum')
gv = g.guarantee_v3(R(row_id='B0678'), TXT['k39'],
                    [[6, 1], [5, 4]], [], MR)
check(gv['count'] == 1 and gv['slots'][0]['count'] == 1 and gv['source'] == O['B0678']['source'], f'B0678 applicato {gv}')
T33 = TXT['k40']
gv = g.guarantee_v3(R(row_id='B0733'), T33, [[7, 3], [6, 7]], [], MR)
check([(x['kind'], x['slot'], x['count'], x['star']) for x in gv['slots']] == [('list', 0, 3, 7), ('list', 3, 7, 6)]
      and gv['slots'][0]['names'] == ['sn++ - fiend', 'sn+ - flood', 'supernova+ - ira']
      and gv['slots'][1]['names'] == ['kh iii pooh', 'kh iii goofy'], f'B0733 due liste {gv["slots"]}')
T40 = (TXT['k41'])
gv = g.guarantee_v3(R(row_id='B0740'), T40, [[7, 4], [6, 6]], [], MR)
check([(x['slot'], x['count'], x['star']) for x in gv['slots']] == [(0, 1, 7), (1, 3, 7), (4, 5, 6)], f'B0740 {gv["slots"]}')
gv = g.guarantee_v3(R(row_id='B0721'), TXT['k42'], [[7, 1], [5, 9]], [], MR)
check(gv['slots'][0]['slot'] == 0 and gv['slots'][0]['star'] == 7 and len(gv['slots'][0]['names']) == 12
      and 'sn++ - master eraqus' in gv['slots'][0]['names'] and 'notice 69545' in gv['source'], f'B0721 dal notice {gv["slots"]}')
gv = g.guarantee_v3(R(row_id='B0419'), TXT['k43'], M3, ['hd aced [ex+]', 'hd gula [ex+]'], MR)
check(gv['pityNames'] == ['hd aced [ex+]'] and gv['pityStar'] == 7 and gv['pitySlot'] == 0 and gv['erratum']
      and [x['kind'] for x in gv['slots']] == ['tier', 'trait'], f'B0419 {gv}')

# ---------- Task 2: potenziamenti per banner (enhance) e regalo della pity (ricerca §3) ----------
# M: righe del master (medaglie di supporto per pityGift); S: righe di skill.json con i nomi delle frasi
M = MR + [{'medalId': 301684, 'name': 'Dual Meow Wow [SAB LV 9]', 'rare': 6, 'type': 6},
          {'medalId': 301502, 'name': 'Blue Fairy [SA Bonus LV 8]', 'rare': 6, 'type': 6}]
SK7 = ['Attack Boost VI Max', 'Defense Boost I Max', 'Defense Boost II Max', 'Defense Boost III Max', 'ATK B V Max & GA 1',
       'ATK B V Max & Lux+', 'Triple Threat II']
S = [{'skillId': 2000 + i, 'name': n, 'maxLv': 10} for i, n in enumerate(SK7 + ['Paralysis+ II Max'])]

e = g.enhance_of(TXT['k44'], [], [], M, S)
check(e['preset'] == [{'on': {'star': 7}, 'dots': 'max', 'guilt': 'max'}], f'B0310 {e}')
check(set(e) == {'preset', 'boosted', 'maxSkill', 'notReproduced'} and e['boosted'] == [] and e['maxSkill'] == [] and e['notReproduced'] == [],
      f'blocco enhance completo {e}')
s = g.assign_slots(g.parse_reservations(TXT['k45']), [[6, 1], [5, 9]])
check(g.enhance_of(TXT['k46'], s, [], M, S)['preset']
      == [{'on': {'slots': [0]}, 'dots': [1, 3], 'guilt': None}], 'B0131')
check(g.enhance_of(TXT['k47'], [], [], M, S)['preset']
      == [{'on': {'names': ['hd terra [ex]']}, 'dots': 5, 'guilt': None}], 'B0243')
check(g.enhance_of(TXT['k48'], [], ['hd naminé'], M, S)['preset']
      == [{'on': {'names': ['hd naminé']}, 'dots': 3, 'guilt': None}], 'B0166 pronome = vetrina')
check(g.enhance_of(TXT['k49'], [], [], M, S)['preset'] == [], 'B0280')
check(g.enhance_of(TXT['k50'], [], [], M, S)['preset'] == [], 'B0051 solo Tier')
b = g.enhance_of(TXT['k51'], [], [], M, S)['boosted']
check(b == [{'on': {'names': ['iago', 'monstro']}, 'str': 1000, 'def': 0, 'chance': 'small'},
            {'on': {'names': ['illustrated kh ii kairi', 'illustrated kh ii sora']}, 'str': 1000, 'def': 1000, 'chance': 'small'}], f'B0106 {b}')
# B0106 vero: la frase del TSV e' troncata a «... and d»
b = g.enhance_of(TXT['k52'], [], [], M, S)['boosted']
check(b[1]['def'] == 1000, f'B0106 troncata {b}')
b = g.enhance_of(TXT['k53'], [], [], M, S)['boosted']
check(b == [{'on': {'names': ['dark riku', 'world of chaos']}, 'str': 1000, 'def': 1000, 'chance': 'small'}], f'B0104 {b}')
T14 = (TXT['k54'])
s = g.assign_slots(g.parse_reservations(T14), [[7, 2], [6, 1], [5, 7]])
b = g.enhance_of(T14, s, [], M, S)['boosted']
check(b == [{'on': {'names': ['sn - blitz form sora']}, 'str': 2000, 'def': 2000, 'chance': 'small'},
            {'on': {'names': ['sn - kh iii anti-aqua', 'key art #20']}, 'str': 1000, 'def': 1000, 'chance': 'small'}], f'B0514 {b}')
T31 = TXT['k55']
s = g.assign_slots(g.parse_reservations(T31), [[7, 1]])
b = g.enhance_of(T31, s, [], M, S)['boosted']
check(b == [{'on': {'slots': [0]}, 'str': 1000, 'def': 1000, 'chance': 'guaranteed'}], f'B0631 {b}')
s = g.assign_slots(g.parse_reservations('Guarantees ten boosted SN+ or SN++ Medals.'), [[7, 10]])
check(g.enhance_of('Guarantees ten boosted SN+ or SN++ Medals.', s, [], M, S)['boosted'][0]['on'] == {'slots': list(range(10))}, 'B0730 dieci boosted')
b = g.enhance_of(TXT['k56'],
                 [], [], M, S)
check(b['boosted'] == [{'on': {'names': ['illustrated xion [ex]']}, 'str': 1000, 'def': 1000, 'chance': 'guaranteed'}]
      and b['preset'] == [{'on': {'names': ['illustrated xion [ex]']}, 'dots': 3, 'guilt': None}], f'B0282 boosted e pallini {b}')
b = g.enhance_of(TXT['k57'], [], [], M, S)
check(b['boosted'][0]['on'] == {'names': ['prime - illustrated axel', 'key art #17']}, f'stelle davanti ai nomi {b}')
# boosted per Tier (ruling del coordinatore: on {star, tierMin, tierMax} + excludePrime; 1000/1000 come le boosted del video)
TB = lambda on: [{'on': on, 'str': 1000, 'def': 1000, 'chance': 'small'}]  # noqa: E731
b = g.enhance_of(TXT['k58'], [], [], M, S)
check(b['boosted'] == TB({'star': 7, 'tierMin': 4, 'tierMax': 7, 'excludePrime': True}) and b['notReproduced'] == [], f'B0455 Tier 4-7 senza Prime {b}')
b = g.enhance_of(TXT['k59'], [], [], M, S)['boosted']
check(b == TB({'star': 7, 'tierMin': 4, 'tierMax': 5}), f'Tier 4 o 5 {b}')
b = g.enhance_of(TXT['k60'], [], [], M, S)['boosted']
check(b == TB({'star': 7, 'tierMin': 4, 'tierMax': 4, 'excludePrime': True}) + TB({'star': 7, 'tierMin': 5, 'tierMax': 5}), f'Prime esclusi solo al Tier 4 {b}')
b = g.enhance_of(TXT['k61'], [], [], M, S)['boosted']
check(b == TB({'star': 7, 'tierMin': 4, 'tierMax': None}), f'Tier 4+ {b}')
b = g.enhance_of(TXT['k62'], [], [], M, S)['boosted']
check(b == TB({'star': 7, 'tierMin': 8, 'tierMax': 8}), f'Tier 8 {b}')
b = g.enhance_of(TXT['k63'], [], [], M, S)['boosted']
check(b == TB({'star': None, 'tierMin': 4, 'tierMax': None, 'excludePrime': True}), f'Tier 4 o piu senza stella {b}')
T55 = (TXT['k64'])
s = g.assign_slots(g.parse_reservations(T55), [[7, 2], [5, 8]])
b = g.enhance_of(T55, s, [], M, S)['boosted']
check(b == [{'on': {'names': ['kh iii goofy', 'kh iii donald']}, 'str': 1000, 'def': 1000, 'chance': 'small'}]
      + TB({'star': 7, 'tierMin': 4, 'tierMax': 7, 'excludePrime': True}), f'B0455 nomi + Tier {b}')
b = g.enhance_of(TXT['k65'], [], [], M, S)
check(b['boosted'] == [] and b['notReproduced'] == ['imitation'], f'Imitation {b}')
b = g.enhance_of(TXT['k66'], [], [], M, S)
check(b['boosted'] == [{'on': {'names': ['xion [ex+]']}, 'str': 2000, 'def': 2000, 'chance': 'small'}] and b['notReproduced'] == ['traitSlots'], f'5 Trait Slots {b}')
b = g.enhance_of(TXT['k67'], [], [], M, S)
check([x['on']['names'] for x in b['boosted']] == [['tyro', 'dr. mog', 'ulala'], ['ffrk terra']] and b['boosted'][1]['def'] == 1000, f'«booster» {b}')

# frase troncata dal TSV (senza «with N more»): l'ultimo nome si completa dalla vetrina o si toglie; «The World ...» resta intero
b = g.enhance_of(TXT['k68'], [], ['hd ventus', 'sp ansem'], M, S)['boosted']
check(b == [{'on': {'names': ['hd ventus', 'sp ansem']}, 'str': 1000, 'def': 1000, 'chance': 'small'}], f'troncata completata {b}')
b = g.enhance_of('Has a small chance of drawing a boosted K', [], ['kh 0.2 kairi', 'key art #8'], M, S)['boosted']
check(b == [], f'troncata ambigua tolta {b}')
b = g.enhance_of(TXT['k69'], [], [], M, S)['boosted']
check(b[0]['on'] == {'names': ['the world ends with you art 2']}, f'«The» nel nome {b}')

# maxSkill: solo le abilita' presenti in skill.json; le altre -> notReproduced 'skill'; Trait Medal ignorata ->
# 'trait' solo se il numero non ha la riga nel master (I-084 parte B: #18 c'e', #999 no)
e = g.enhance_of(TXT['k70'], [], [], M, S)
check(e['maxSkill'] == [{'on': {'names': ['zexion [+]']}, 'skills': ['paralysis+ ii max']}] and e['notReproduced'] == [], f'B0324 {e}')
e = g.enhance_of(TXT['k71'], [], [], M, S)
check(e['notReproduced'] == ['trait'], f'Trait Medal sconosciuta {e}')
T48 = (TXT['k72'])
s = g.assign_slots(g.parse_reservations(T48), [[7, 1], [5, 9]])
e = g.enhance_of(T48, s, [], M, S)
check(e['maxSkill'] == [{'on': {'slots': [0]}, 'skills': [x.lower() for x in SK7]}] and e['notReproduced'] == [], f'B0348 {e}')
e = g.enhance_of(T48, s, [], M, S[:2])
check(e['maxSkill'] == [{'on': {'slots': [0]}, 'skills': ['attack boost vi max', 'defense boost i max']}] and e['notReproduced'] == ['skill'],
      f'B0348 coperta in parte {e}')
e = g.enhance_of(T48, s, [], M, [])
check(e['maxSkill'] == [] and e['notReproduced'] == ['skill'], f'B0348 senza abilita {e}')
e = g.enhance_of(T48 + TXT['k73'], s, [], M, S)
check(e['maxSkill'][1] == {'on': {'names': ['hd ava [ex+]']}, 'skills': [x.lower() for x in SK7]}, f'«aforementioned skills» {e}')
T60 = (TXT['k74'])
s = g.assign_slots(g.parse_reservations(T60), [[7, 5]])
check(g.enhance_of(T60, s, [], M, S)['maxSkill'] == [{'on': {'slots': [0]}, 'skills': ['attack boost vi max', 'triple threat ii']}], 'B0460 «The guaranteed»')

# pallini: le altre forme delle note
e = g.enhance_of('★ Get 3-Dot HD Naminé within 5 Draws!', [], ['hd naminé'], M, S)
check(e['preset'] == [{'on': {'names': ['hd naminé']}, 'dots': 3, 'guilt': None}], f'«3-Dot X» {e}')
s = g.assign_slots(g.parse_reservations(TXT['k75']), [[6, 2], [5, 8]])
check(g.enhance_of(TXT['k76'], s, [], M, S)['preset']
      == [{'on': {'slots': [0]}, 'dots': [1, 3], 'guilt': None}], 'B0153 «1, 2, or 3» dots')
check(g.enhance_of(TXT['k77'], [], [], M, S)['preset']
      == [{'on': {'star': 6}, 'dots': 3, 'guilt': None}], 'due 6★ (non riserva) -> stella')
T31b = (TXT['k78'])
e = g.enhance_of(T31b, [], [], M, S, mix=[[6, 2], [4, 5], [3, 3]])
check(e['preset'] == [{'on': {'star': 6}, 'dots': 3, 'guilt': None}, {'on': {'slots': list(range(2, 10))}, 'dots': [0, 3], 'guilt': None}], f'B0031 {e}')
check(g.enhance_of(TXT['k79'], [], [], M, S, mix=[[6, 10]])['preset']
      == [{'on': {'slots': list(range(10))}, 'dots': 3, 'guilt': None}], 'B0119 tutte')
T00 = (TXT['k80'])
s = g.assign_slots(g.parse_reservations(T00), [[6, 1], [5, 9]])
check(g.enhance_of(T00, s, [], M, S)['preset'] == [
    {'on': {'names': ['hd valor form sora', 'hd master form sora', 'hd limit form sora']}, 'dots': [1, 3], 'guilt': None},
    {'on': {'names': ['hd antiform sora', 'sora art [ex]']}, 'dots': 3, 'guilt': None}], 'due pallini nella stessa frase -> nomi')
T49 = (TXT['k81'])
s = g.assign_slots(g.parse_reservations(T49), [[5, 3], [4, 7]])
check(g.enhance_of(T49, s, [], M, S)['preset'] == [{'on': {'slots': [0]}, 'dots': 3, 'guilt': None}], 'B0049 lista')
check(g.enhance_of(TXT['k82'], [], [], M, S)['preset']
      == [{'on': {'names': ['illustrated kh ii kairi']}, 'dots': 3, 'guilt': None}], 'pity coi pallini')
check(g.enhance_of(TXT['k83'], [], [], M, S)['preset'] == [],
      'frase troncata senza numero')
check(g.enhance_of(TXT['k84'], [], [], M, S)['preset'] == [],
      'Special Attack Bonus senza preset')
# frasi doppie (note + colonna guarantees troncata): una voce sola
e = g.enhance_of(TXT['k85'], [], [], M, S)
check(len(e['preset']) == 1, f'voci doppie {e}')
# Trait: slot riservati a una Trait Medal senza riga nel master (o senza numero) -> notReproduced 'trait'
s = g.assign_slots(g.parse_reservations('Guarantees one Trait Medal #48.'), [[6, 2], [5, 8]])
check(g.enhance_of('Guarantees one Trait Medal #48.', s, [], M, S)['notReproduced'] == [], 'slot Trait #48 (riga nel master)')
s = g.assign_slots(g.parse_reservations('Guarantees one Trait Medal #999.'), [[6, 2], [5, 8]])
check(g.enhance_of('Guarantees one Trait Medal #999.', s, [], M, S)['notReproduced'] == ['trait'], 'slot Trait #999 (sconosciuta)')
check(g.enhance_of('Guarantees at least one Epic Medal.', [], [], M, S)['notReproduced'] == ['epic'], 'Epic')
check(g.enhance_text(TXT['k86'],
                     TXT['k87'])
      == TXT['k88'],
      f"enhance_text: note + frasi nuove della colonna {g.enhance_text('A. When drawing an HD Terra [EX], it comes with its special attack strengthened 5 times.', 'When drawing an HD Terra [EX], it comes with its spec. If bought 5 times, one X is guaranteed.')}")

# regalo della pity: medaglia di supporto del master -> Present Box
check(g.pity_gift(TXT['k89'], M) == [3, 301684, 1], 'B0472 pityGift')
check(g.pity_gift(TXT['k90'], M) == [3, 301502, 1], 'B0370 pityGift')
check(g.pity_gift(TXT['k91'], M) is None, 'medaglia d attacco: nessun regalo')
check(g.pity_gift(TXT['k92'], M) is None, 'Trait: nessun regalo')
check(g.pity_gift("Guarantees one of the following Medals: A.", M) is None, 'senza pity')

if errori:
    print(f'ERRORI ({len(errori)})')
    for e in errori:
        print(' -', e)
    sys.exit(1)
print(TXT['k93'])
