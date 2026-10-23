"""Prova di make_banner_catalog.py (ricette dei banner originali) su righe sintetiche del TSV.

    python recon/tools/test_make_banner_catalog.py        -> «OK: ...» oppure «ERRORI (n)», uscita 1

L'ultimo controllo (catalogo completo) gira solo se esistono la wiki e il TSV veri.
Le frasi lunghe dei deal (testi dei notice e della wiki: non nostri) non stanno nel repository: TXT['kN'] le legge
dal file locale test_make_banner_catalog_texts.json nella cartella privata (recon/tools/private_tools.py). Senza quel
file la prova si salta (uscita 0).
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import make_banner_catalog as m  # noqa: E402
import private_tools  # noqa: E402

_TXT = os.path.join(private_tools.root(), 'recon', 'tools', 'test_make_banner_catalog_texts.json')
if not os.path.isfile(_TXT):
    print('SKIP: test_make_banner_catalog (testi dei deal locali assenti: %s)' % _TXT)
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


COLS = ['row_id', 'name', 'start_pt', 'end_pt', 'status', 'currency', 'price', 'draw_size', 'rarity_mix',
        'featured_medals', 'guarantees', 'notes', 'image_file', 'image_size', 'seasonal', 'event_tie_in',
        'source_url', 'confidence']
R = lambda **k: {**{c: '' for c in COLS}, **k}  # noqa: E731

# --- classify
check(m.classify(R(name='Spirit Blind Box'), '') == 'X_BLINDBOX', 'blind box')
check(m.classify(R(name='Platinum Ticket Draw', currency='Platinum Ticket'), '') == 'T_EVOLVE', 'evolve')
check(m.classify(R(name='Spooky Cookies Deal', currency='Spooky Cookie'), '') == 'T_TICKET', 'spooky')
check(m.classify(R(name='Free Deal (VIP)', currency='Free, VIP only'), '') == 'FREE', 'free vip')
check(m.classify(R(name='Supernova - Sephiroth'), '') == 'SN', 'sn')
check(m.classify(R(name='DAILY DEAL!'), '') == 'DAILY', 'daily')

# --- prezzi e valute
check(m.parse_price('1st: Free, 2nd+: 3000') == [0, 3000], 'first free')
check(m.parse_price('1900, 3000, 2500, 2200') == [3000, 2500, 2200, 1900], 'scalini')
check(m.parse_price('VIP Only Free') == [0], 'gratis')
check(m.unusable([600], 3, []) and not m.unusable([600], 3, [[4, 1]]) and m.unusable([], 3, [[4, 1]]) and m.unusable([600], None, [[4, 1]]), 'senza composizione degli slot: INCOMPLETE')
check(m.currency_of(R(currency='Spooky Cookie'), 'T_TICKET') == (8, 'spooky'), 'valuta spooky')
check(m.currency_of(R(currency='Holiday Draw Ticket'), 'T_TICKET') == (8, 'holiday'), 'valuta holiday')
check(m.currency_of(R(currency='Free, VIP only'), 'FREE') == (1, 'jewel'), 'gratis in jewel')
check(m.currency_of(R(currency='Gold Ticket'), 'T_EVOLVE') == (6, 'gold'), 'gold')
check(m.currency_of(R(row_id='B0787', currency='Holiday Draw Ticket'), 'T_TICKET') == (8, 'draw'), 'B0787 errore del TSV')

# --- sblocco con la storia
STORY = [[1, 200, '2016-04-07'], [201, 250, '2016-04-21'], [251, 300, '2016-05-12']]
# prima quest della tranche in corso alla data del banner, meno 1 (decisione dell'utente del 17-10)
check(m.unlock_quest('2016-04-20', STORY) == 0, 'sblocco nel lancio')
check(m.unlock_quest('2016-04-21', STORY) == 200, 'sblocco tranche 201-250')
check(m.unlock_quest('2016-05-12', STORY) == 250, 'sblocco tranche 251-300')
# righe con la stessa data = una tranche (716-725 e 726-730 il 2018-01-11): la prima, come storyDay del server (I-084)
TIED = [[706, 715, '2017-12-14'], [716, 725, '2018-01-11'], [726, 730, '2018-01-11'], [731, 735, '2018-03-14']]
check(m.unlock_quest('2018-03-13', TIED) == 715, 'sblocco tranche con due righe alla stessa data: 715')
check(m.unlock_quest('2018-03-14', TIED) == 730, 'sblocco tranche 731-735')

# --- limite giornaliero
check(m.day_limit('You may draw ONCE per day', 'FEATURED') == 1 and m.day_limit('Top-Drawer 3 times per day', 'DAILY') == 3,
      'limite giornaliero')
check(m.day_limit('Draw three times per day', 'DAILY') == 3 and m.day_limit('', 'STANDARD') == 0, 'limite tre / nessuno')

# --- garanzie
g = m.guarantee_of(R(guarantees=TXT['k1']), '')
check(g == {'list': [], 'count': 0, 'pity': 10, 'every': None, 'featured': ['illustrated cloud']}, f'pity {g}')
g = m.guarantee_of(R(), TXT['k2'])
check(g['list'] == ['sn++ - fiend', 'key art #22'] and g['count'] == 3, f'lista {g}')
g = m.guarantee_of(R(), TXT['k3'])
check(g['every'] == 3, 'every 3rd')
g = m.guarantee_of(R(featured_medals='Sephiroth [EX+]'), 'Get him within 5 draws from this EX Medal Deal!')
check(g['pity'] == 5 and g['featured'] == ['sephiroth [ex+]'], f'within {g}')
g = m.guarantee_of(R(), TXT['k4'])
check(g['list'] == ['sn++ - illus. kh iii sora', 'key art #22', 'alice'] and g['count'] == 4, f'lista con link {g}')
g = m.guarantee_of(R(), TXT['k5'])
check(g['pity'] == 3 and g['featured'] == ['supernova - sephiroth', 'key art #19', 'sn - kh iii xion', 'huey, dewey & louie'],
      f'pity misto {g}')
g = m.guarantee_of(R(), TXT['k6'])
check(g['featured'] == ['sn+ - kh iii naminé', 'alice'], f'pity con lista {g}')
p = m.pool_recipe(R(featured_medals=TXT['k7']),
                  '', 'FEATURED', [], {})
check(p['featured'] == ['hd axel', 'illustrated aqua a', 'illustrated ventus', 'illustrated kairi'], f'vetrina {p["featured"]}')

# --- gemelli VIP
twins = m.vip_twins([R(row_id='B1', name='Supernova Deal', start_pt='2019-03-01', currency='Jewels'),
                     R(row_id='B2', name='Supernova Deal (VIP)', start_pt='2019-03-01', currency='Jewels, VIP only'),
                     R(row_id='B3', name='Free Deal (VIP)', start_pt='2020-05-01', currency='Free, VIP only')])
check(twins == {'B2'}, f'gemelli VIP {twins}')

# --- bonus
MEDALS = [{'medalId': 90156, 'name': 'Magic Mirror', 'rare': 6, 'type': 4},
          {'medalId': 300948, 'name': 'Magic Broom', 'rare': 5, 'type': 6},
          {'medalId': 1001, 'name': 'Sora', 'rare': 3, 'type': 1, 'validPack': 0}]
MATERIALS = [{'materialId': 48, 'name': 'Power Gem'}, {'materialId': 49, 'name': 'Speed Gem'}]
check(m.bonus_of(TXT['k8'], MEDALS, MATERIALS) == [[3, 90156, 3]], 'bonus mirror')
check(m.bonus_of('Includes two bonus [[Power Gem]]s.', MEDALS, MATERIALS) == [[5, 48, 2]], 'bonus gemma')
check(m.bonus_of('Includes one bonus Trait Medal #302.', MEDALS, MATERIALS) == [], 'bonus non trovato saltato')
MEDALS2 = MEDALS + [{'medalId': 33015, 'name': 'Donald Ver. B', 'rare': 5, 'type': 1}, {'medalId': 31056, 'name': 'Black Coat King Mickey', 'rare': 6, 'type': 1},
                    {'medalId': 31055, 'name': 'Black Coat King Mickey', 'rare': 5, 'type': 1}, {'medalId': 2006, 'name': 'Chip', 'rare': 6, 'type': 1}]
check(m.bonus_of('Includes one bonus 5★ Donald Ver. B Medal. Next.', MEDALS2, MATERIALS) == [[3, 33015, 1]], 'bonus con abbreviazione')
b = m.bonus_of('Includes one bonus 5★ Black Coat King Mickey and 6★ Chip medal.', MEDALS2, MATERIALS)
check(b == [[3, 31055, 1], [3, 2006, 1]], f'bonus doppio {b}')

# --- date di fine
check(m.end_of(R(name='X', start_pt='2017-01-01', end_pt='2017-01-07'), 'STANDARD', [], {}) == ('2017-01-07', 'original'), 'fine originale')
check(m.end_of(R(name='Draw Points Deal!', start_pt='2021-02-01'), 'T_POINTS', [], {})[0] == '2021-06-29', 'fine draw points')
check(m.end_of(R(name='Supernova Deal', start_pt='2019-03-01'), 'SN', [], {})[0] == '2019-03-01', 'fine 1 giorno di serie')
NOT = {123: {'id': 123, 'title': 'SN+ Falling Price Deal (12/3)',
             'text': 'Period: Dec. 3, 2020 12:00 a.m. to Dec. 5, 2020 11:59 p.m. (PT)'}}
e = m.end_of(R(name='Gold Rush Deal', start_pt='2020-12-03', source_url='https://x/detail/123?lang=en'), 'SN', [], NOT)
check(e == ('2020-12-05', 'notice 123 (weak title match)'), f'fine da notice {e}')
e = m.end_of(R(name="Beginner's Draw (12/6)", start_pt='2019-12-06'), 'BEGINNER', [], {})
check(e[0] == '2020-10-11', f'beginner 2019 {e}')

# --- pool
SUB = {'1.1': ['sora'], '1.2': ['alice'], '24.3a': ['x'], '24.3b': ['y']}
p = m.pool_recipe(R(start_pt='2018-01-01'), 'Draws from sets 1.1, 1.2, and 24.3.', 'STANDARD', [], SUB)
check(p['mode'] == 'sets' and p['sets'] == ['1.1', '1.2', '24.3a', '24.3b'], f'pool sets {p}')
p = m.pool_recipe(R(start_pt='2018-01-01'), TXT['k9'], 'ITEM', [], SUB)
check(p['mode'] == 'list' and p['names'] == ['sora', 'alice', 'hades'], f'pool list {p}')
p = m.pool_recipe(R(start_pt='2016-04-07', status='permanent'), 'Available once per day.', 'DAILY', [('2016-04-01', ['1.1'], [], 'DAILY')], SUB)
check(p['mode'] == 'released', f'pool released {p}')
p = m.pool_recipe(R(start_pt='2016-05-01'), 'Guarantees one of [[Alice]].', 'DAILY',
                  [('2016-04-07', ['1.1'], [], 'DAILY'), ('2016-04-20', ['1.2'], [], 'STANDARD')], SUB)
check(p['mode'] == 'inherit' and p['sets'] == ['1.1'] and p['inheritAfter'] == '2016-04-07' and p['names'] == ['alice'],
      f'pool inherit {p}')
EV = [{'medalId': 301495 + i, 'name': f'Blue Fairy [SA Bonus LV {i + 1}]', 'type': 6} for i in range(8)]
p = m.pool_recipe(R(start_pt='2018-05-25', currency='Bronze Ticket'), '', 'T_EVOLVE', [], SUB, medal_rows=EV)
check(p['mode'] == 'evolve' and p['evolve'] == [[301495, 1], [301496, 2], [301497, 3]], f'pool evolve {p}')
p = m.pool_recipe(R(start_pt='2018-05-25', currency='Silver Ticket'), '', 'T_EVOLVE', [], SUB, medal_rows=EV)
check([lv for _, lv in p['evolve']] == [3, 4, 5, 6, 7, 8], 'silver prima del 14/09/2018')

# --- fix round 1: stella davanti al nome, filtri dei set, alias, completamento senza VIP
p = m.pool_recipe(R(featured_medals='7★ Prime - KH Cloud'), '', 'SEVEN', [], {})
check(p['featured'] == ['prime - kh cloud'], f'vetrina senza stella {p["featured"]}')
p = m.pool_recipe(R(start_pt='2016-04-20'), TXT['k10'], 'STANDARD', [], SUB)
check(p['mode'] == 'sets' and p['sets'] == ['1.1', '1.2'] and p['filter'] == ['disney'], f'filtro disney {p}')
check(m.set_filter(TXT['k11']) == ['ffkh'], 'filtro ffkh')
check(m.set_filter('Draws from Power Medals in sets 1.1, 1.2.') == ['power'], 'filtro power')
check(m.set_filter('Draws from sets 1.1 and 1.2.') == [], 'nessun filtro')
check(m.pool_recipe(R(), '', 'STANDARD', [], {})['filter'] == [], 'filter sempre presente')
check(m.medal_origin('[[Category:Hercules Characters]]') == 'disney', 'origine disney')
check(m.medal_origin('[[Category:KINGDOM HEARTS II Characters]] [[Category:Final Fantasy Characters]]') == 'ffkh', 'origine ffkh')
check(m.medal_origin('[[Category:Kingdom Hearts Characters]] [[Category:Steamboat Willie Characters]]') == 'disney', 'origine mista')
check(m.medal_origin('') == '', 'origine ignota')
g = m.guarantee_of(R(), TXT['k12'])
check(g['list'] == ['hd pete', 'hercules b'] and g['count'] == 1, f'lista con qualifica {g}')
MED = {'supernova - key art #20': {'date': '2018-12-01'}, 'supernova+ - key art #20': {'date': '2019-09-01'},
       'sn++ - key art #20': {'date': '2019-11-08'}, 'sn++ - lingering will': {'date': '2020-01-01'},
       'prime - mrs. incredible': {'date': '2019-01-01'}, 'illustrated xion [ex]': {'date': '2018-01-01'}}
RD = {'sn++ - kh iii lingering will': 'sn++ - lingering will'}
check(m.resolve_name('key art #20', '2019-10-01', MED, RD) == 'supernova+ - key art #20', 'key art SN+')
check(m.resolve_name('key art #20', '2020-02-01', MED, RD) == 'sn++ - key art #20', 'key art SN++')
check(m.resolve_name('key art #20', '2018-12-10', MED, RD) == 'supernova - key art #20', 'key art SN')
check(m.resolve_name('sn++ - kh iii lingering will', '2020-02-01', MED, RD) == 'sn++ - lingering will', 'redirect')
check(m.resolve_name('prime mrs. incredible', '2019-02-01', MED, RD) == 'prime - mrs. incredible', 'prime senza trattino')
check(m.resolve_name('boosted illustrated xion (ex)', '2019-02-01', MED, RD) == 'illustrated xion [ex]', 'boosted e (ex)')
check(m.resolve_name('attack boost vi max', '2019-02-01', MED, RD) is None, 'skill non risolta')
check(m.non_medal('attack boost vi max', set()) and m.non_medal('power gem', {'power gem'}) and m.non_medal('limited vip coin', set())
      and not m.non_medal('sn+ - kh iii foo', set()), 'non medaglie')
c = m.complete_row(R(name='[WJE] Monday Only Free Deal! (9/14)'),
                   R(name='Free Deal', currency='Free, VIP only', price='Free VIP only', draw_size='x10', rarity_mix='7★:1 5★:9'))
check(c['currency'] == '' and c['price'] == 'Free' and c['draw_size'] == 'x10' and not m.is_vip(c), f'completamento senza VIP {c}')

# --- fix round 3: L-SR std, class2 Rare, alias dei sotto-set
MS = {'phantom': {'cls': 'L-SR', 'class2': 'Attack', 'ids': [[1, 6, 'x']], 'date': '2017-01-01'},
      'vanitas': {'cls': 'SR', 'class2': 'Super Rare', 'ids': [[2, 6, 'x']], 'date': '2017-01-01'},
      'chip': {'cls': '', 'class2': 'Boost', 'ids': [[3, 6, 'x']], 'date': '2016-01-01'},
      'xion a': {'cls': '', 'class2': 'Attack', 'ids': [[4, 5, 'x']], 'date': '2016-11-25'},
      'xion b': {'cls': 'E', 'class2': 'Attack', 'ids': [[5, 5, 'x']], 'date': '2017-12-13'},
      'prime - key art #17': {'cls': '', 'class2': 'Attack', 'ids': [[6, 7, 'x']], 'date': '2018-06-15'}}
m.mark_std(MS)
check(MS['phantom']['std'] and MS['vanitas']['std'] and not MS['chip']['std'] and not MS['prime - key art #17']['std'],
      f'std L-SR / Super Rare / Boost / Prime {[(k, v["std"]) for k, v in MS.items()]}')
check(m.resolve_name('xion', '2016-11-25', MS, {}) == 'xion a', 'alias xion -> xion a')
check(m.resolve_name('key art #17', '2018-06-15', MS, {}) == 'prime - key art #17', 'alias key art #17 -> prime')

# elenco «every Nth draw» solo nel testo del notice (B0742/B0765)
NT = {70907: {'text': TXT['k13']}}
nl_ = m.notice_list(R(source_url='https://x/detail/46740 https://x/detail/70907'), NT)
check(nl_ == ['sn++ - key art #24', 'sn++ - illus. kh iii sora'], f'notice_list {nl_}')
check(m.notice_list(R(source_url='nulla'), NT) == [], 'notice_list senza notice')

# --- correzione finale A: varianti di vetrina/lista datate dopo l'inizio del banner del debutto
FR = {'3': '2016-04-07', '4': '2016-04-07', '5': '2016-04-07', '6': '2016-07-15', '7': '2018-05-25'}
MD = {'sephiroth': {'date': '2016-10-13', 'ids': [[1, 6, '2016-10-20'], [2, 7, '2018-05-14']]},
      'ira': {'date': '2017-11-24', 'ids': [[3, 6, '2017-11-24']]},
      'cloud': {'date': '2016-07-08', 'ids': [[4, 6, '2016-07-20']]},
      'riku': {'date': '2016-10-01', 'ids': [[5, 5, '2016-10-30']]},  # non in vetrina: data intatta
      'kairi': {'date': '2018-06-01', 'ids': [[6, 6, '2018-06-01'], [7, 7, '2018-06-09']]}}
BN = [{'rowId': 'B1', 'start': '2016-10-14', 'rarityMix': [[5, 3], [4, 7]], 'catalogOnly': None,
       'pool': {'featured': ['sephiroth']}, 'guarantee': {'list': []}},
      {'rowId': 'B2', 'start': '2017-11-17', 'rarityMix': [[6, 1], [5, 9]], 'catalogOnly': None,  # debutto: la medaglia e' datata dopo
       'pool': {'featured': ['ira']}, 'guarantee': {'list': []}},
      {'rowId': 'B3', 'start': '2016-07-08', 'rarityMix': [[5, 2], [4, 8]], 'catalogOnly': None,  # 6★ prima del 15/07/2016: mai
       'pool': {'featured': ['cloud']}, 'guarantee': {'list': []}},
      {'rowId': 'B4', 'start': '2018-06-01', 'rarityMix': [[6, 1], [5, 9]], 'catalogOnly': None,
       'pool': {'featured': []}, 'guarantee': {'list': ['kairi']}},
      {'rowId': 'B5', 'start': '2017-12-01', 'rarityMix': [[6, 1], [5, 9]], 'catalogOnly': None,  # ira gia' uscita: niente da fare
       'pool': {'featured': ['ira']}, 'guarantee': {'list': []}}]
n_al = m.align_debut_dates(BN, MD, FR)
check(MD['sephiroth']['ids'] == [[1, 6, '2016-10-14'], [2, 7, '2018-05-14']], f'debutto: 6★ alla data del banner, 7★ intatta {MD["sephiroth"]}')
check(MD['ira']['ids'] == [[3, 6, '2017-11-17']], f'debutto: medaglia datata dopo il primo banner che la nomina {MD["ira"]}')
check(MD['cloud']['ids'] == [[4, 6, '2016-07-20']], 'debutto: nessuna 6★ prima del 15/07/2016')
check(MD['riku']['ids'] == [[5, 5, '2016-10-30']], 'debutto: medaglie fuori da vetrina/lista intatte')
check(MD['kairi']['ids'] == [[6, 6, '2018-06-01'], [7, 7, '2018-06-01']], f'debutto: lista e stella sopra dopo il 25/05/2018 {MD["kairi"]}')
check(n_al == 3, f'varianti spostate {n_al}')

# --- correzione finale B: «Available once.» (formulazione reale delle note: B0510, B0511, B0604, SN 7★ del 2020)
check(m.total_limit(TXT['k14']) == 1, 'Available once -> 1')
check(m.total_limit('This deal can only be drawn once.') == 1, 'can only be drawn once -> 1')
check(m.total_limit('Available once per day.') == 0 and m.total_limit('Available once a day') == 0 and m.total_limit('') == 0,
      'once per day non e un limite totale')
check(m.free_day_limit('FREE', [0], 0, 0, False) == 1, 'FREE senza limiti -> una al giorno')
check(m.free_day_limit('FREE', [0], 0, 1, False) == 0 and m.free_day_limit('FREE', [0], 0, 0, True) == 0
      and m.free_day_limit('FREE', [0], 3, 0, False) == 3, 'FREE con totalLimit, vipFree o dayLimit: invariato')
check(m.free_day_limit('SN', [0], 0, 0, False) == 1 and m.free_day_limit('SN', [0, 3000], 0, 0, False) == 0
      and m.free_day_limit('SN', [3000], 0, 0, False) == 0, 'prezzo 0: una al giorno; FIRST_FREE e a pagamento no')

# --- correzione finale C (sotto-progetto 2b): slot della lista da banner_guarantees (riserve in ordine di testo);
# guarantee.slot = slot della prima riserva a lista (compatibilita' col sotto-progetto 2)
import banner_guarantees as bg  # noqa: E402


def _slot(text, mix):
    return bg.guarantee_v3(R(row_id='BT'), text, mix, [], [])['slot']


GT = TXT['k15']
check(_slot(GT, [[7, 1], [6, 1], [5, 8]]) == 1, 'B0306: lista nello slot 6★')

# --- override del preset (banner_overrides.tsv, campo preset: B0306-B0308 dal testo di B0310)
enh = {'preset': [], 'boosted': [], 'maxSkill': [], 'notReproduced': []}
m.apply_enhance_overrides(enh, {'preset': 'slots=0;dots=max;guilt=max'})
check(enh['preset'] == [{'on': {'slots': [0]}, 'dots': 'max', 'guilt': 'max'}], f'override preset {enh["preset"]}')
m.apply_enhance_overrides(enh, {'preset': 'slots=0;dots=max;guilt=max'})
check(len(enh['preset']) == 1, 'override preset idempotente')
enh2 = {'preset': [], 'boosted': [], 'maxSkill': [], 'notReproduced': []}
m.apply_enhance_overrides(enh2, {'preset': 'star=7;dots=3;guilt=none'})
check(enh2['preset'] == [{'on': {'star': 7}, 'dots': 3, 'guilt': None}], f'override preset star {enh2["preset"]}')
m.apply_enhance_overrides(enh2, {})
check(len(enh2['preset']) == 1, 'nessun override: invariato')
# --- I-153: categoria della pity (banner_overrides.tsv, campo pity_label)
check(m.apply_pity_label({}, {'pity_label': ' SN or higher Medal '})['pityLabel'] == 'SN or higher Medal', 'pity_label letto')
check(m.apply_pity_label({}, None)['pityLabel'] is None and m.apply_pity_label({}, {'pity_label': ''})['pityLabel'] is None,
      'senza pity_label: None')
check(_slot(TXT['k16'], [[7, 1], [6, 1], [5, 2]]) == 1, 'B0355')
check(_slot(TXT['k17'], [[7, 2], [6, 1], [5, 7]]) == 0, 'lista sola: slot 0')
check(_slot(TXT['k18'], [[7, 1], [6, 1], [5, 8]]) == 1,
      'garanzia di stella dopo la lista: le riserve con stella prima, la lista sul primo slot libero')
check(_slot('Guarantees one Tier 4 7★ Medal.', [[7, 1], [6, 1], [5, 8]]) == 0, 'senza lista: slot 0')
check(_slot(GT, [[5, 8], [7, 1], [6, 1]]) == 9, 'indice nell ordine del mix del catalogo')

# --- sotto-progetto 2b: Tier come 4° campo, righe boosted escluse, data d'inizio dal notice
MB = [{'medalId': 2001, 'name': 'Chip', 'rare': 6, 'type': 1, 'validPack': 0, 'groupId': 0},
      {'medalId': 1002001, 'name': 'Chip', 'rare': 6, 'type': 1, 'validPack': 0, 'groupId': 2001}]
check(m.is_boosted(MB[1]) and not m.is_boosted(MB[0]) and m.is_boosted({'medalId': 1000001, 'name': 'X'}), 'is_boosted')
med_x = {}
m.extend_medals(med_x, [{'medalId': 301899, 'name': 'SN+ - Second Form Sora', 'rare': 7, 'type': 1, 'validPack': 0, 'guiltValue': 9},
                        {'medalId': 1301899, 'name': 'SN+ - Second Form Sora', 'rare': 7, 'type': 1, 'validPack': 0, 'groupId': 301899, 'guiltValue': 9}],
                {}, {'sn+ - second form sora': '2019-09-10'})
check(med_x.get('sn+ - second form sora', {}).get('ids') == [[301899, 7, '2019-09-10', 9]], f'extend_medals: Tier e niente boosted {med_x}')
check(m.bonus_of('Includes one bonus 6★ [[Chip]] Medal.', MB, []) == [[3, 2001, 1]], 'bonus: mai la boosted')

# --- Organizzazione XIII (piano 2026-10-18-orgxiii-mapping, Task 3): «Axel» del master = «Axel A», mai SN++ - Axel
MO = {'axel a': {'date': '2016-09-01', 'cls': '', 'class2': 'Attack', 'att': 'speed', 'origin': 'ffkh',
                 'ids': [[300642, 7, '2018-05-14', 3], [32235, 5, '2016-09-16', 3], [32236, 6, '2016-09-16', 3]]},
      'sn++ - axel': {'date': '2020-10-19', 'cls': 'L-SR', 'class2': 'Attack', 'att': 'power', 'origin': 'ffkh',
                      'ids': [[302038, 7, '2020-10-19', 10]]},
      'axel [+]': {'date': '2018-08-13', 'cls': 'L-SR', 'class2': 'Attack', 'att': 'power', 'origin': 'ffkh',
                   'ids': [[301563, 6, '2018-08-13', 8], [301564, 7, '2018-08-13', 8]]}}
m.extend_medals(MO, [{'medalId': 32235, 'name': 'Axel', 'rare': 5, 'type': 1, 'validPack': 0, 'guiltValue': 3},
                     {'medalId': 32236, 'name': 'Axel', 'rare': 6, 'type': 1, 'validPack': 0, 'guiltValue': 3}], {}, {})
check(MO.get('axel', {}).get('alias') != 'sn++ - axel', f"extend_medals: «axel» alias di SN++ {MO.get('axel')}")
check(m.resolve_name('axel', '2016-09-16', MO, {}) == 'axel a', f"6.2: axel -> {m.resolve_name('axel', '2016-09-16', MO, {})}")
check(m.resolve_name('axel', '2017-01-23', MO, {}) == 'axel a', 'B0083: axel -> axel a')
check(m.resolve_name('key art #20', '2020-02-01', MED, RD) == 'sn++ - key art #20', 'famiglia uscita: resta SN++')
# 7★ [+] mai prima del lancio delle 7★ (firstRarity[7]); le altre voci non cambiano
MP = {'vexen [+]': {'date': '2018-04-13', 'ids': [[301446, 6, '2018-04-13', 8], [301447, 7, '2018-05-14', 8]]},
      'axel a': {'date': '2016-09-01', 'ids': [[300642, 7, '2018-05-14', 3]]}}
check(m.clamp_plus_dates(MP, {'6': '2016-07-15', '7': '2018-05-25'}) == 1, 'clamp_plus_dates: una data')
check(MP['vexen [+]']['ids'] == [[301446, 6, '2018-04-13', 8], [301447, 7, '2018-05-25', 8]]
      and MP['axel a']['ids'] == [[300642, 7, '2018-05-14', 3]], f'clamp_plus_dates {MP}')
# data di uscita di una medaglia da banner_overrides.tsv (campo medal_date: data = inizio del banner della riga)
MD = {'sn++ - axel b': {'date': '2020-12-01', 'ids': [[302074, 7, '2020-12-01', 10]]}}
n_md = m.apply_medal_dates(MD, [{'row_id': 'B0774', 'field': 'medal_date', 'value': 'SN++ - Axel B', 'source': 'notice 72833'},
                                {'row_id': 'B0774', 'field': 'price', 'value': '3000', 'source': 'x'}], {'B0774': '2021-01-01'})
check(n_md == 1 and MD['sn++ - axel b'] == {'date': '2021-01-01', 'ids': [[302074, 7, '2021-01-01', 10]]}, f'apply_medal_dates {MD}')

# --- integrazione sui dati veri
WIKI = os.environ.get('KHUX_WIKI_JSON', m.DEFAULTS['wiki'])
TSV = os.environ.get('KHUX_BANNERS_TSV', m.DEFAULTS['banners'])
if os.path.exists(WIKI) and os.path.exists(TSV):
    TIER_BANNERS = 182  # + B0267 (D3); audit delle garanzie, appendice A (178) + 5 frasi SAB del 2016 - 3 a lista dal notice (2c/G4) + B0204 (2c/G9)
    cat = m.build_catalog(m.default_inputs())
    bs = cat['banners']
    check(len(bs) == 807, f'banner {len(bs)}')  # 2c: B0507 doppione di B0500 (campo exclude)
    from collections import Counter
    t = Counter(b['type'] for b in bs)
    check(t == Counter({'SN': 213, 'FEATURED': 168, 'FALLING': 129, 'SKILL': 69, 'DAILY': 64, 'SEVEN': 48, 'FREE': 36,
                        'STANDARD': 23, 'T_TICKET': 21, 'ITEM': 19, 'T_POINTS': 7, 'BEGINNER': 5, 'T_EVOLVE': 5}), f'tipi {t}')
    # 85 = 78 della regola vecchia + i 7 banner della tranche 526-540 (12-01-2017 .. 08-02-2017, B0079-B0085),
    # che ora si sbloccano a 525; i 6 del lancio (B0001-B0006) passano da 200 a 0
    ub = sum(1 for b in bs if b['unlockQuest'] <= 525)
    check(ub == 85, f'sbloccati a 525: {ub}')
    check([b['rowId'] for b in bs if b['unlockQuest'] == 0] == ['B0001', 'B0002', 'B0003', 'B0004', 'B0005', 'B0006'], 'banner del lancio a 0')
    # 39 righe VIP con gemello (la ricerca e la spec 9.5 dicono 41: contavano le coppie, e B0552/B0554
    # «KH III Falling Price Deal» VIP hanno ciascuna due gemelli normali, B0551 e B0553)
    vt = sum(1 for b in bs if b['catalogOnly'] == 'VIP_TWIN')
    check(vt == 39, f'gemelli VIP {vt}')
    check(all(b['end'] for b in bs), 'tutte le date di fine')
    inc = sum(1 for b in bs if b['catalogOnly'] == 'INCOMPLETE')  # 31 prima degli override dei notice (Task 4)
    check(inc == 24, f'righe INCOMPLETE {inc}')
    for rid in ('B0742', 'B0765'):
        bg = next(b for b in bs if b['rowId'] == rid)['guarantee']
        check(bg['every'] == 3 and len(bg['list']) >= 15, f'{rid} garanzia every {bg}')
    b11 = next(b for b in bs if b['rowId'] == 'B0011')
    check(b11['pool']['sets'] == ['1.1', '1.2', '1.3', '2.1'] and b11['epicBoost'], 'B0011 senza 2.2 e Epic')
    check(cat['firstRarity'].get('6') == '2016-07-15' and cat['firstRarity'].get('7') == '2018-05-25', 'firstRarity')
    b456 = next(b for b in bs if b['rowId'] == 'B0456')
    check(b456['pool']['mode'] == 'evolve' and [lv for _, lv in b456['pool']['evolve']] == [7, 8, 9], 'B0456 Dual Meow Wow')
    med = cat['medals']
    mats = {m.norm(x['name']) for x in m.default_inputs()['materials']}
    bad = [b['rowId'] for b in bs if b['type'] == 'SN' and not b['catalogOnly']
           and any(not m.non_medal(n, mats) for n in b['pool']['featured'])
           and not any(n in med for n in b['pool']['featured'])]
    check(not bad, f'SN attivi con vetrina irrisolta {bad}')
    check(sum(1 for b in bs if b['vipFree']) == 17, f'vipFree {sum(1 for b in bs if b["vipFree"])}')
    b5 = next(b for b in bs if b['rowId'] == 'B0005')
    check(b5['pool']['filter'] == ['disney'] and med['stitch']['origin'] == 'disney' and med['kh ii cloud']['origin'] == 'ffkh'
          and med['kh ii cloud']['att'] in ('power', 'speed', 'magic'), 'B0005 filtro e campi medaglia')
    from collections import Counter as _C
    dup = [i for i, n in _C(i[0] for v in med.values() if v['std'] for i in v['ids']).items() if n > 1]
    check(not dup, f'medalId in due voci std {dup[:5]}')
    bad = [k for k, v in med.items() if v['std'] and re.match(r'(sn|supernova|prime)\b', k)]
    check(not bad, f'voci std SN/Prime {bad[:5]}')
    check(all(not v['std'] for v in med.values() if 'alias' in v), 'alias non std')
    check(all('std' in v for v in med.values()), 'std sempre presente')
    check(med['world of ff sora']['std'], 'world of ff sora std')
    import json as _json
    dump = _json.dumps(cat, ensure_ascii=False)
    check('�' not in dump and 'saïx' in dump and 'lumière' in dump, 'nomi UTF-8 corretti')
    miss = sorted({n for s in cat['subsets'].values() for n in s['names'] if n not in med and not n.startswith('trait medal')})
    check(not miss, f'nomi dei sotto-set senza voce {miss}')  # «moogle & sora» -> redirect «sora & moogle»

    # A: vetrina e lista non vuote alla data del banner (come expandPool in server/gacha-data.js a asOf(b, start))
    first = cat['firstRarity']

    def rarities(b, at):
        r = {s for s, _ in b['rarityMix'] if not (first.get(str(s)) and first[str(s)] > at)}
        return r | {s + 1 for s, _ in b['rarityMix'] if first.get(str(s + 1)) and first[str(s + 1)] <= at}

    def named(b, names):
        at, rs = b['start'], rarities(b, b['start'])
        assert not ((6 in rs and at < '2016-07-15') or (7 in rs and at < '2018-05-25')), b['rowId']
        return [n for n in names if any(i[1] in rs and i[2] <= at for i in med.get(n, {}).get('ids', []))]
    drawn = [b for b in bs if not b['catalogOnly'] and b['pool']['mode'] != 'evolve']
    # eccezioni: la stella della medaglia non e' nel mix (ne' la stella sopra) alla data del banner:
    # 6★ prima del 15/07/2016 (B0023, B0029) (B0280 Vexen [+] e B0303 Lexaeus [+] non piu': la 6★ [+] esiste, piano
    # 2026-10-18-orgxiii-mapping), SN++ solo 7★ sui banner [[5,10]] dei biglietti (B0663, B0732, B0746, B0759, B0787, B0801);
    # i nomi senza varianti d'attacco (Cid, Chip, Moogle, Blue Fairy, Magic Mirror...) non sono medaglie vere
    STAR_OUT = {'B0023', 'B0029', 'B0663', 'B0732', 'B0746', 'B0759', 'B0787', 'B0801'}
    empty_f = sorted(b['rowId'] for b in drawn if [n for n in b['pool']['featured'] if med.get(n, {}).get('ids')]
                     and not named(b, b['pool']['featured']))
    check(set(empty_f) == STAR_OUT, f'vetrina vuota alla data del banner: {sorted(set(empty_f) ^ STAR_OUT)}')
    empty_l = sorted(b['rowId'] for b in drawn if [n for n in b['guarantee']['list'] if med.get(n, {}).get('ids')]
                     and not named(b, b['guarantee']['list']))
    check(not empty_l, f'lista vuota alla data del banner: {empty_l}')
    FIX15 = ['B0054', 'B0068', 'B0084', 'B0086', 'B0089', 'B0106', 'B0176', 'B0184', 'B0199', 'B0200', 'B0201', 'B0202',
             'B0203', 'B0230', 'B0246']
    byid = {b['rowId']: b for b in bs}
    check(all(named(byid[r], byid[r]['pool']['featured']) for r in FIX15), 'i 15 banner del debutto hanno la vetrina')
    check(all(named(byid[r], byid[r]['guarantee']['list']) for r in ('B0230', 'B0246')), 'B0230/B0246 hanno la lista')

    # B: limite totale e gratuite senza limite (Ruling 28)
    check(byid['B0511']['totalLimit'] == 1 and byid['B0604']['totalLimit'] == 1, 'B0511/B0604 Available once')
    check(all(b.get('totalLimit', None) is not None for b in bs), 'totalLimit sempre presente')
    for r in ('B0417', 'B0437', 'B0521', 'B0721', 'B0725', 'B0726', 'B0734', 'B0739'):
        check(byid[r]['dayLimit'] == 1, f'{r} gratuita: una al giorno')
    nolim = [b['rowId'] for b in bs if (b['type'] == 'FREE' or (b['prices'] and not any(b['prices'])))
             and not (b['dayLimit'] or b['totalLimit'] or b['vipFree'])]
    check(not nolim, f'gratuite senza limite {nolim}')

    # C: guarantee.slot = slot della prima riserva a lista; != 0 solo sotto una riserva di stella esplicita
    # (Tier 7★, medaglia nominata o lista precedente): B0306-B0308, B0355 sul 6★ e le liste dopo una nominata (D2/D7)
    for r in ('B0306', 'B0307', 'B0308', 'B0355'):
        check(byid[r]['guarantee']['slot'] == 1, f'guarantee.slot {r}')
    check(all(b['guarantee']['slot'] == next((s['slot'] for s in b['guarantee']['slots'] if s['kind'] == 'list'), 0) for b in bs),
          'guarantee.slot = prima riserva a lista')

    # sotto-progetto 2b: riserve, pity, Tier (audit delle garanzie del 17-10)
    B = byid
    check(cat['version'] == 3 and all(len(i) == 4 for v in cat['medals'].values() for i in v['ids']), 'Tier nelle medaglie')
    check(not any(1000000 <= i[0] < 9000000 for v in cat['medals'].values() for i in v['ids']), 'nessuna boosted nel catalogo')
    # Trait Medal (I-084 parte B): voci «trait medal #N» con id 9000000 + N, fuori dai pool standard
    tmv = {k: v for k, v in cat['medals'].items() if k.startswith('trait medal #')}
    check(len(tmv) == 313 and all(v['ids'][0][0] == 9000000 + int(k.split('#')[1]) and v['ids'][0][1] == 6 and not v['std']
                                  for k, v in tmv.items()), f'voci delle Trait Medal {len(tmv)}')
    # Tier sui banner estraibili, come l'audit: i 178 dell'appendice A (tutti presenti) + 5 del 2016 col SAB
    # (B0046/B0047 «Level 3 SAB», B0051/B0052 «SAB of 3 or higher», B0079 «Special Attack Bonus Tier of 3»: ricerca §3)
    # = 183 (180 dopo G4); su tutti gli 808 banner 201 (+12 VIP_TWIN delle serie Tier 7, +6 INCOMPLETE con la frase solo nel notice)
    live = [b for b in cat['banners'] if not b['catalogOnly']]
    n_tier = sum(1 for b in live if any(s['kind'] == 'tier' for s in b['guarantee']['slots']))
    check(n_tier == TIER_BANNERS, f'banner con Tier {n_tier}')
    # 2c/G4 (19-10, banner_overrides.tsv campo «slot»/«boosted»): B0046/B0047 = le 10 Organizzazione XIII del notice
    # 20865 (5 e 2 copie, versione rara +1000 STR «small»), B0154 = i 17 «recent Tier 5» del notice 31346, Tier
    # massimo dal notice su B0120/B0139/B0141/B0146 (4-5) e B0170/B0181 (5-6); quindi 183 - 3 = 180
    org = ['xaldin a', 'saïx a', 'xigbar a', 'demyx a', 'luxord a', 'lexaeus a', 'marluxia a', 'larxene a', 'vexen a', 'zexion a']
    for r, n in (('B0046', 5), ('B0047', 2)):
        s0 = B[r]['guarantee']['slots'][0]
        check(s0['kind'] == 'list' and s0['count'] == n and s0['names'] == org, f'{r} Organizzazione XIII dal notice')
        check({'on': {'slots': [0]}, 'str': 1000, 'def': 0, 'chance': 'small'} in B[r]['enhance']['boosted'], f'{r} versione rara')
    # mix della grafica originale del banner (6★ x2, 5★ x3, 3★+ x5 + bonus; = wiki): le 5 Organizzazione XIII stanno
    # nelle posizioni 6★ e 5★ (decisione dell'utente 19-10, dopo lo screenshot del banner)
    check(B['B0046']['rarityMix'] == [[6, 2], [5, 3], [3, 5]] and B['B0047']['rarityMix'] == [[6, 1], [5, 1], [3, 3]],
          'B0046/B0047 mix della grafica originale')
    check(B['B0154']['guarantee']['slots'][0]['kind'] == 'list' and len(B['B0154']['guarantee']['slots'][0]['names']) == 17,
          'B0154 17 recent Tier 5')
    check(all((B[r]['guarantee']['slots'][0]['tierMin'], B[r]['guarantee']['slots'][0]['tierMax']) == t
              for r, t in (('B0120', (4, 5)), ('B0139', (4, 5)), ('B0141', (4, 5)), ('B0146', (4, 5)), ('B0170', (5, 6)),
                           ('B0181', (5, 6)))), 'Tier massimo dal notice (G4)')
    # 2c/G5 (19-10): «at least one of the new Medals» = riserva a lista sulla prima posizione 5★ (le due 6★ con 3 pallini
    # restano casuali), WoFF sulla 6★ x1 della grafica e pallini solo sulle altre due; date d'uscita dal notice
    for r, pos, star, names in (('B0066', 2, 5, ['isa', 'lea', 'xion a']), ('B0068', 2, 5, ['terra', 'ventus', 'aqua']),
                                ('B0079', 2, 5, ['atlantica sora', 'atlantica donald', 'atlantica goofy']),
                                ('B0084', 2, 5, ['seifer', 'fuu', 'rai'])):
        sl = [x for x in B[r]['guarantee']['slots'] if x['kind'] == 'list']
        check(len(sl) == 1 and (sl[0]['slot'], sl[0]['star'], sl[0]['names']) == (pos, star, names)
              and B[r]['guarantee']['slot'] == pos, f'{r} medaglia nuova garantita (G5)')
    s82 = B['B0082']['guarantee']['slots']
    check(len(s82) == 1 and s82[0]['slot'] == 0 and s82[0]['star'] == 6 and len(s82[0]['names']) == 7
          and B['B0082']['enhance']['preset'] == [{'on': {'slots': [1, 2]}, 'dots': 3, 'guilt': None}], 'B0082 WoFF + due 6★ con pallini')
    check({'on': {'names': ['world of ff sora']}, 'str': 1000, 'def': 1000, 'chance': 'small'} in B['B0082']['enhance']['boosted'],
          'B0082 WoFF Sora +1000/+1000')
    check(B['B0079']['rarityMix'] == [[6, 2], [5, 1], [4, 7]], 'B0079 mix della grafica (5★+ x3, 4★+ x7)')
    # 2c/G6: «Includes 3 Power Gems» senza «bonus» (Gem Deal 2017, notice 30125 «three Power Gems ... in each pull»)
    # 2c/G7: Magic Broom per estrazione solo nel notice 35138 (B0212); B0270 non ha regali (il notice 38660 e' di B0271)
    check(B['B0212']['bonus'] == [[3, 300948, 1]] and B['B0270']['bonus'] == [] and B['B0271']['bonus'] == [[3, 300948, 1]],
          'Magic Broom (G7)')
    # 2c/G8: limiti dal notice e «N times a day» / «Available N times» dalla wiki; B0242 resta 1 (le 3 sono le campagne)
    lim = {r: (B[r]['dayLimit'], B[r]['totalLimit']) for r in ('B0035', 'B0080', 'B0242', 'B0255', 'B0304', 'B0334', 'B0339',
                                                               'B0413', 'B0651', 'B0683')}
    check(lim == {'B0035': (3, 0), 'B0080': (3, 0), 'B0242': (1, 0), 'B0255': (3, 0), 'B0304': (1, 0), 'B0334': (3, 0),
                  'B0339': (1, 0), 'B0413': (5, 0), 'B0651': (0, 3), 'B0683': (0, 3)}, f'limiti (G8) {lim}')
    # 2c/G9: «If you receive the following Medals ... 3 dots» = preset per nome in testa (vince sullo slot 1-3)
    for r in ('B0145', 'B0157', 'B0184', 'B0190', 'B0195', 'B0199', 'B0203', 'B0207', 'B0212'):
        p0 = B[r]['enhance']['preset'][0]
        check('names' in p0['on'] and p0['dots'] == 3, f'{r} 3 pallini per nome (G9)')
    b204 = B['B0204']
    check(b204['guarantee']['slots'][0]['kind'] == 'tier' and b204['guarantee']['slots'][0]['tierMin'] == 4
          and b204['pool']['featured'] == ['illustrated kairi [ex]']
          and {'on': {'slots': [0]}, 'dots': [1, 3], 'guilt': None} in b204['enhance']['preset'], 'B0204 dal notice 34471 (G9)')
    # Scrooge con la skill (70 banner Skills to Thrill 2016-18, segnalazione dell'utente 19-10)
    scr = [b['rowId'] for b in bs if any(x[:3] == [3, 90126, 1] and len(x) == 4 and x[3] for x in b['bonus'])]
    check(len(scr) == 70 and B['B0080']['bonus'] == [[3, 90126, 1, 1115]] and B['B0087']['bonus'] == [[3, 90126, 1, 1117]],
          f'Scrooge con skill {len(scr)}')
    # 2c/G10: «0 Special Attack Dots» (Foretellers [EX] gen 2018, EX+ apr 2018) in testa, vince sui 1-3 dello slot
    for r in ('B0223', 'B0227', 'B0273', 'B0279', 'B0284', 'B0288'):
        p0 = B[r]['enhance']['preset'][0]
        check('names' in p0['on'] and p0['dots'] == 0, f'{r} 0 pallini (G10)')
    gem = {r: B[r]['bonus'] for r in ('B0142', 'B0143', 'B0144', 'B0234')}
    check(gem == {'B0142': [[5, 48, 3]], 'B0143': [[5, 49, 3]], 'B0144': [[5, 50, 3]], 'B0234': [[5, 50, 3]]}, f'Gem Deal 2017 (G6) {gem}')
    dates = {i[2] for k in ('terra', 'atlantica sora', 'seifer') for i in cat['medals'][k]['ids'] if i[1] < 7}
    check(dates == {'2016-12-09', '2017-01-12', '2017-01-28'}, f'date d uscita dal notice (G5) {dates}')
    check(all(B[r]['enhance']['boosted'] for r in ('B0041', 'B0052', 'B0066', 'B0068', 'B0071', 'B0082')),
          'versione «special» +1000 STR letta dalla wiki (18 banner 2016-17)')
    # conflitti solo fra i banner di solo catalogo: 6 INCOMPLETE senza rarity_mix, B0473 (VIP_TWIN, «two ... at 7★» su un
    # mix con un 7★ solo); fra gli estraibili nessuno
    check(not [b['rowId'] for b in live if any(s.get('conflict') for s in b['guarantee']['slots'])], 'nessun conflitto')
    check(B['B0199']['start'] == '2017-11-24' and B['B0199']['guarantee']['pity'] == 20, 'B0199 data dal notice')
    check(B['B0629']['guarantee']['slots'][1]['count'] == 3 and B['B0678']['guarantee']['slots'][0]['count'] == 1, 'D3/D4')
    check(all(B[r]['guarantee']['pityStar'] == 7 for r in ['B0365', 'B0397', 'B0411', 'B0425', 'B0426', 'B0427', 'B0459']), 'D9 a 7')
    check(B['B0230']['guarantee']['slots'] and B['B0246']['guarantee']['slots'], 'D6 liste piene alla data')
    check(all(B[r]['guarantee']['pitySlot'] == 1 and B[r]['guarantee']['pityStar'] == 6 for r in ('B0319', 'B0402', 'B0403', 'B0412')),
          'decisione 5: pity 6★ sul primo 6★ o 5★')
    check(B['B0321']['guarantee']['pitySlot'] == 1 and B['B0306']['guarantee']['pitySlot'] == 0, 'pity sullo slot giusto')
    check(B['B0419']['guarantee']['pityNames'] == ['hd aced [ex+]'] and B['B0421']['guarantee']['pityNames'] == ['hd gula [ex+]'],
          'decisione 4')
    ks = {'kind', 'slot', 'count', 'star', 'names', 'tierMin', 'tierMax'}
    check(all(ks <= set(s) <= ks | {'conflict', 'slotsUsed', 'up'} for b in bs for s in b['guarantee']['slots']), 'campi delle riserve')
    check(not any(k.startswith('_') for b in bs for k in b['guarantee']), 'nessun campo privato nel catalogo')
    # fix 1, punto 1: liste prese dal master per prefisso («SN+ or SN++», «KH III Medal+») solo coi nomi del pool alla data
    sub_m = {k: v['names'] for k, v in cat['subsets'].items()}
    sub_d = {k: v['date'] for k, v in cat['subsets'].items()}
    for r, i in (('B0750', 0), ('B0733', 1), ('B0740', 2), ('B0803', 0)):
        pn = m.pool_names_at(B[r], med, sub_m, sub_d, cat['firstRarity'])
        names = B[r]['guarantee']['slots'][i]['names']
        check(names and set(names) <= pn, f'{r} lista per prefisso fuori dal pool {sorted(set(names) - pn)[:5]} ({len(names)})')
        check(all(any(x[2] <= B[r]['start'] for x in med[n]['ids']) for n in names), f'{r} nomi datati dopo l inizio')
    check(B['B0750']['guarantee']['list'] == B['B0750']['guarantee']['slots'][0]['names'], 'B0750 lista di compatibilita')
    # fix 1, punto 2: i nomi interi della pity non diventano un nome piu' lungo della vetrina
    for r in ('B0637', 'B0638', 'B0646', 'B0663'):
        check('sn++ - kh iii terra' in B[r]['guarantee']['pityNames'], f'{r} pity senza sn++ - kh iii terra')
    check(B['B0169']['guarantee']['pityNames'] == ['kh 0.2 kairi'], 'B0169 nome troncato completato')
    # fix 1, punto 6: date dal notice -> fine originale, fonte in datesSource
    check(all(B[r]['endSource'] == 'original' and B[r]['end'] == '2017-12-04' and 'notice 34475' in B[r]['datesSource']
              for r in ('B0199', 'B0200', 'B0201', 'B0202', 'B0203')), 'B0199-B0203 fine originale dal notice')
    check(sum(1 for b in bs if b['datesSource']) == 8, 'datesSource solo per le date lette dai notice')  # + B0704-B0706 (2c)
    # fix 1, punto 8: senza stella scritta, pityStar = stella dello slot finale
    import banner_guarantees as _bgm  # `bg` qui sopra e' una garanzia
    PITY_OV = {o['row_id'] for o in m.default_inputs()['overrides'] if o.get('field') == 'pity'}  # stella dal notice
    bad = []
    for b in bs:
        gq = b['guarantee']
        rr = [x for x, n in b['rarityMix'] for _ in range(n)]
        if gq['pity'] and not gq['pityGift'] and b['rowId'] not in PITY_OV and rr and _bgm._pity(b['notes'] + ' | ' + b['guaranteesText'], b['pool']['featured'], [], b['rarityMix'])[1] is None \
                and gq['pityStar'] != rr[gq['pitySlot']]:
            bad.append(b['rowId'])
    check(not bad, f'pityStar non scritta diversa dallo slot finale {bad[:8]}')
    # decisione 1: nessun nome di una lista su uno slot 6★ senza variante 6★ (se la lista ne ha almeno uno)
    bad = [b['rowId'] for b in bs for s in b['guarantee']['slots'] if s['kind'] == 'list' and s['star'] == 6 and not s.get('up')
           and any(n in med for n in s['names']) and any(n in med and 6 not in {i[1] for i in med[n]['ids']} for n in s['names'])
           and any(n in med and 6 in {i[1] for i in med[n]['ids']} for n in s['names'])]
    check(not bad, f'decisione 1 {bad[:5]}')
    check(all('slot' in b['guarantee'] for b in bs), 'guarantee.slot sempre presente')

    # Task 2: potenziamenti per banner (enhance) e regalo della pity
    ek = {'preset', 'boosted', 'maxSkill', 'notReproduced'}
    check(all(set(b['enhance']) == ek and all(isinstance(b['enhance'][k], list) for k in ek) for b in bs), 'enhance sempre presente')
    check(B['B0310']['enhance']['preset'] == [{'on': {'star': 7}, 'dots': 'max', 'guilt': 'max'}], f"B0310 {B['B0310']['enhance']}")
    check({'on': {'slots': [0]}, 'dots': [1, 3], 'guilt': None} in B['B0131']['enhance']['preset'], f"B0131 {B['B0131']['enhance']}")
    check({'on': {'names': ['hd terra [ex]']}, 'dots': 5, 'guilt': None} in B['B0243']['enhance']['preset'], f"B0243 {B['B0243']['enhance']}")
    check(B['B0166']['enhance']['preset'] == [{'on': {'names': ['hd naminé']}, 'dots': 3, 'guilt': None}], f"B0166 {B['B0166']['enhance']}")
    check(B['B0104']['enhance']['boosted'] == [{'on': {'names': ['dark riku', 'world of chaos']}, 'str': 1000, 'def': 1000, 'chance': 'small'}],
          f"B0104 {B['B0104']['enhance']['boosted']}")
    check(any(x['str'] == 2000 and x['def'] == 2000 and x['on'] == {'names': ['sn - blitz form sora']} for x in B['B0514']['enhance']['boosted']), 'B0514 2000')
    check(B['B0631']['enhance']['boosted'] == [{'on': {'slots': [0]}, 'str': 1000, 'def': 1000, 'chance': 'guaranteed'}], 'B0631 guaranteed')
    # boosted per Tier: forma {star, tierMin, tierMax} (+ excludePrime), mai piu' 'boosted' fra i non riprodotti
    check(not [b['rowId'] for b in bs if 'boosted' in b['enhance']['notReproduced']], 'boosted per Tier riprodotte')
    check({'on': {'star': 7, 'tierMin': 4, 'tierMax': 7, 'excludePrime': True}, 'str': 1000, 'def': 1000, 'chance': 'small'}
          in B['B0455']['enhance']['boosted'], f"B0455 {B['B0455']['enhance']['boosted']}")
    tb = [x['on'] for b in bs for x in b['enhance']['boosted'] if 'tierMin' in x['on']]
    check(len({id(o) for o in tb}) >= 344 and all(set(o) <= {'star', 'tierMin', 'tierMax', 'excludePrime'} and o['tierMin']
                                                  and (o['tierMax'] is None or o['tierMax'] >= o['tierMin']) for o in tb), f'forma Tier {len(tb)}')
    check(all(x['chance'] in ('small', 'guaranteed') and (x['str'], x['def']) in ((1000, 0), (1000, 1000), (2000, 2000))
              for b in bs for x in b['enhance']['boosted']), 'boosted: chance e varianti del contratto')
    # nomi dei bersagli = chiavi del catalogo dove si risolvono; mai una Trait Medal
    check(not [b['rowId'] for b in bs for k in ('preset', 'boosted', 'maxSkill') for x in b['enhance'][k]
               if any(n.startswith('trait medal') for n in x['on'].get('names', []))], 'nessuna Trait Medal fra i bersagli')
    check({'on': {'names': ['illustrated kh ii kairi', 'illustrated kh ii sora']}, 'str': 1000, 'def': 1000, 'chance': 'small'}
          in B['B0106']['enhance']['boosted'], f"B0106 {B['B0106']['enhance']['boosted']}")
    check(not any('trait' in B[r]['enhance']['notReproduced'] for r in ('B0324', 'B0280')), 'Trait #18 e #6 riprodotte')
    check('trait medal #18' in B['B0324']['guarantee']['slots'][0]['names'], 'B0324: Trait Medal #18 nella lista')
    check(B['B0353']['guarantee']['slots'][0] == {'kind': 'trait', 'slot': 1, 'count': 1, 'star': 6, 'names': ['trait medal #23'],
                                                   'tierMin': None, 'tierMax': None}, f"B0353 slot Trait {B['B0353']['guarantee']['slots'][0]}")
    check(B['B0543']['guarantee']['slots'][0]['names'] == ['trait medal #123'], 'B0543: cinque Trait Medal #123')
    # 'trait' resta solo dove il testo nomina una Trait Medal senza riga nel master (o senza numero)
    tk = sys.modules['banner_guarantees'].trait_known
    tnum = lambda b: re.findall(r'Trait Medal(?:\|| #)(\d+)', b['notes'] + ' ' + (b['guaranteesText'] or ''))
    unk = [b['rowId'] for b in bs if 'trait' in b['enhance']['notReproduced']]
    # dal 19-10 (#189-#313 dalle pagine della khuxwiki) nessun numero e' sconosciuto: 'trait' non resta su nessun banner
    check(not unk and all(not tnum(B[r]) or any(not tk('trait medal #' + n) for n in tnum(B[r])) for r in unk),
          f'Trait non riprodotte solo coi numeri sconosciuti {[r for r in unk if tnum(B[r]) and all(tk("trait medal #" + n) for n in tnum(B[r]))][:5]}')
    # pity su una medaglia di supporto del master -> regalo nel Present Box (D11 B0472/B0481); senza bersaglio -> pity null
    for r in ('B0472', 'B0481', 'B0485', 'B0521'):
        gq = B[r]['guarantee']
        check(gq['pityGift'] == [3, 301684, 1] and gq['pity'] in (5, 10) and gq['pitySlot'] is None, f'{r} pityGift {gq["pityGift"]} {gq["pitySlot"]}')
    check(B['B0370']['guarantee']['pityGift'] == [3, 301502, 1], 'B0370 Blue Fairy LV 8 in regalo')
    # pity «Trait Medal #N within 5 draws» (B0267): riprodotte ora che la riga esiste (I-084 parte B)
    for r in ('B0259', 'B0266', 'B0267', 'B0269', 'B0278', 'B0283', 'B0292'):
        gq, en = B[r]['guarantee'], B[r]['enhance']
        check(gq['pity'] in (3, 5) and gq['pityStar'] == 6 and gq['pityNames'][0].startswith('trait medal #')
              and 'pity' not in en['notReproduced'] and 'trait' not in en['notReproduced'], f'{r} pity su una Trait Medal {gq["pity"]} {en}')
    check(not [b['rowId'] for b in bs if b['guarantee']['pity'] and not b['guarantee']['pityGift']
               and not any(n in med for n in b['guarantee']['pityNames'])], 'ogni pity ha un bersaglio nel catalogo o un regalo')
    check(sum(1 for b in bs if b['guarantee']['pityGift']) == 9, f"pityGift {[b['rowId'] for b in bs if b['guarantee']['pityGift']]}")

    # G: B0306-B0308 (i tre 7★ Medal Deal annunciati da B0310): 7★ con pallini e Special Attack Bonus al massimo
    for r in ('B0306', 'B0307', 'B0308'):
        check({'on': {'slots': [0]}, 'dots': 'max', 'guilt': 'max'} in B[r]['enhance']['preset'], f'{r}: preset guilt max')
    # I-153: categorie della pity dei banner con la lista dei nomi oltre il limite del client
    check(B['B0637']['guarantee']['pityLabel'] == 'SN or higher Medal', f"B0637 pityLabel {B['B0637']['guarantee'].get('pityLabel')}")
    check(B['B0797']['guarantee']['pityLabel'] == 'boosted SN++ Medal', 'B0797 pityLabel')
    check(B['B0306']['guarantee']['pityLabel'] is None, 'B0306 senza pityLabel')
    check(sum(1 for b in bs if b['guarantee'].get('pityLabel')) == 16, 'pityLabel su 16 banner')
    # F: nessuna medaglia del catalogo con darklight 3 (la scena del risultato va in crash: docs/notes/shop.md)
    dl3 = {r['medalId'] for r in m.default_inputs()['medals'] if r.get('darklight') == 3}
    cat_ids = {i[0] for v in med.values() for i in v['ids']} | {e[0] for b in bs for e in (b['pool'].get('evolve') or [])}
    check(not (cat_ids & dl3), f'medaglie darklight 3 nel catalogo {sorted(cat_ids & dl3)[:5]}')

    # Organizzazione XIII (piano 2026-10-18-orgxiii-mapping, Task 3): «X A» Tier 3, 6★ [+] alla data EN del notice
    PLUS = {'vexen': (301446, '2018-04-13'), 'lexaeus': (301491, '2018-05-13'), 'zexion': (301511, '2018-06-13'),
            'saïx': (301531, '2018-07-13'), 'axel': (301563, '2018-08-13'), 'demyx': (301595, '2018-09-13'),
            'xaldin': (301601, '2018-09-24'), 'luxord': (301616, '2018-10-13'), 'marluxia': (301634, '2018-11-13'),
            'larxene': (301658, '2018-12-13'), 'xemnas': (301680, '2019-01-13'), 'xigbar': (301745, '2019-02-13'),
            'roxas': (301782, '2019-03-13')}
    for x, (i6, d) in PLUS.items():
        ids = med.get(x + ' [+]', {}).get('ids', [])
        check([i6, 6, d, 8] in ids, f'{x} [+]: 6★ {i6} alla data {d} {ids}')
        check(all(i[2] >= cat['firstRarity']['7'] for i in ids if i[1] == 7), f'{x} [+]: 7★ prima del 25/05/2018 {ids}')
    SE = [31176, 31196, 31206, 31226, 32186, 32196, 32216, 32236, 33176, 33186, 33206, 33216, 33236]
    tier_of = {i[0]: i[3] for v in med.values() for i in v['ids']}
    check(all(tier_of.get(i) == 3 for i in SE), f'Tier dei 13 id SE {[(i, tier_of.get(i)) for i in SE if tier_of.get(i) != 3]}')
    # 2c/G4 (19-10): le 10 rare originali 131xxx (+1000 STR, notice 20865) sono boosted, non varianti del catalogo:
    # escono solo col tiro «small» della voce boosted (prima uscivano una volta su due al posto della normale)
    RARE = [131176, 131196, 131206, 132186, 132196, 132216, 133176, 133186, 133206, 133216]
    check(not any(i in tier_of for i in RARE), f'rare originali fuori dal catalogo {[i for i in RARE if i in tier_of]}')
    DUP = {300443, 300483, 300486, 300638, 300446, 300449, 300489, 300641, 300452, 300455, 300492, 300495, 300644}
    check(not (set(tier_of) & DUP), f'doppioni 3004xx nel catalogo {sorted(set(tier_of) & DUP)}')
    check('axel' not in med or med['axel'].get('alias') not in ('sn++ - axel',), f"alias axel {med.get('axel')}")
    check('roxas' not in med or med['roxas'].get('alias') not in ('sn++ - roxas',), f"alias roxas {med.get('roxas')}")
    s62 = cat['subsets']['6.2']['names']
    check('axel a' in s62 and 'roxas a' in s62, f'6.2 {s62}')
    check([32236, 6, '2016-09-16', 3] in med['axel a']['ids'] and [33236, 6, '2016-09-16', 3] in med['roxas a']['ids'],
          f"axel a / roxas a {med['axel a']['ids']} {med['roxas a']['ids']}")
    for n, i in (('sn++ - axel b', 302074), ('sn++ - roxas', 302075)):
        check(med[n]['date'] == '2021-01-01' and med[n]['ids'][0][:3] == [i, 7, '2021-01-01'], f'{n} {med[n]}')
    # pool dei banner (expandPool di server/gacha-data.js alla data d'inizio)
    import json as _json
    import subprocess
    import tempfile
    tmpd = tempfile.mkdtemp()
    cp = os.path.join(tmpd, 'cat.json')
    with open(cp, 'w', encoding='utf-8') as f:
        _json.dump(cat, f, ensure_ascii=False)
    gd = os.path.join(m.REPO, 'server', 'gacha-data.js').replace('\\', '/')
    js = ("const g=require(process.argv[2]);const c=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));"
          "const plus=JSON.parse(process.argv[3]);const out={bad:[],p6:{}};"
          "for(const b of c.banners){const ex=g.expandPool(b,c,b.start);"
          "if(b.rowId==='B0280'||b.rowId==='B0303')out.p6[b.rowId]=ex.pool[6]||[];"
          "for(const [id,t] of ex.tiers){if(t!==8)continue;const n=ex.medalInfo.get(id).name;"
          "const x=Object.keys(plus).find(k=>n===k||n.startsWith(k+' '));"
          "if(x&&b.start<plus[x])out.bad.push(b.rowId+' '+n+' '+id);}}"
          "console.log(JSON.stringify(out));")
    pr = subprocess.run(['node', '-e', js, cp, gd, _json.dumps({k: v[1] for k, v in PLUS.items()})],
                        capture_output=True, text=True, encoding='utf-8')
    res = _json.loads(pr.stdout) if pr.returncode == 0 else {'bad': [pr.stderr[:300]], 'p6': {}}
    check(301446 in res['p6'].get('B0280', []), f"B0280 senza Vexen [+] 6★ {res['p6'].get('B0280')}")
    check(301491 in res['p6'].get('B0303', []), f"B0303 senza Lexaeus [+] 6★ {res['p6'].get('B0303')}")
    check(not res['bad'], f"Tier 8 dell'Organizzazione prima della sua [+]: {len(res['bad'])} {res['bad'][:5]}")
    # --- 2c, casi singoli (19-10): campi pity, max_skill, exclude e selettore «pity» dei preset
    B = {b['rowId']: b for b in bs}
    check('B0507' not in B and B['B0500']['dayLimit'] == 1, 'B0507 doppione escluso, B0500 col limite giornaliero')
    for r in ('B0353', 'B0374'):
        g = B[r]['guarantee']
        check(g['pity'] == 5 and g['pityStar'] == 6 and g['pitySlot'] == 2, f'{r} pity 6★ sullo slot 2')
        check(B[r]['enhance']['preset'][0] == {'on': {'pity': True}, 'dots': 5, 'guilt': None}, f'{r} 5 pallini sulla copia della pity')
    check({'on': {'slots': [0]}, 'dots': 'max', 'guilt': 'max'} in B['B0374']['enhance']['preset'], 'B0374 G1 sulla 7★ Tier 5')
    for r in ('B0435', 'B0452'):
        g, e = B[r]['guarantee'], B[r]['enhance']
        check(g['pity'] == 5 and g['pityNames'] == ['prime - chernabog'] and g['pityStar'] == 7 and g['pitySlot'] == 2, f'{r} pity 7★ Chernabog')
        check(e['maxSkill'] and e['maxSkill'][0]['on'] == {'pity': True} and len(e['maxSkill'][0]['skills']) == 7, f'{r} abilita al massimo sulla pity')
    check(B['B0447']['guarantee']['pity'] == 5 and B['B0645']['guarantee']['pity'] == 5, 'B0447/B0645 pity dal notice')
    check(B['B0584']['guarantee'].get('pityMode') == 'every' and B['B0584']['guarantee']['pity'] == 5, 'B0584 pity every 5')
    check(B['B0770']['guarantee'].get('pityMode') == 'every' and B['B0770']['guarantee']['pity'] == 10, 'B0770 every 10th')
    check(B['B0579']['guarantee'].get('pityMode') is None, 'B0579 (VIP) pity che si azzera')
    check(all(B[r]['end'] == '2020-09-01' for r in ('B0704', 'B0705', 'B0706')), 'B0704-B0706 ritirati il 01-09-2020')
    check(B['B0083']['enhance']['preset'] == [{'on': {'slots': [0, 1]}, 'dots': 3, 'guilt': None}], 'B0083 TWO copie con 3 pallini')
    # 2c/G2: abilita' al massimo scritte solo nel notice (campo max_skill)
    for r, on in (('B0319', {'slots': [0]}), ('B0490', {'slots': [0, 1]}), ('B0491', {'slots': [0, 1, 2, 3]}), ('B0494', {'slots': [0, 1]}),
                  ('B0498', {'slots': [0, 1]}), ('B0502', {'names': ['supernova - hd terra', 'supernova - hd ventus', 'supernova - hd aqua']})):
        ms = B[r]['enhance']['maxSkill']
        check(ms and ms[0]['on'] == on and len(ms[0]['skills']) == 7 and 'skill' not in B[r]['enhance']['notReproduced'], f'{r} G2 abilita al massimo')
    check('sn - kh iii kairi a' in B['B0508']['enhance']['maxSkill'][0]['on']['names'], 'B0508 G2 nomi risolti')
    # 2c, dubbi D3 e D5 (scelte dell'utente 19-10)
    b = B['B0126']
    check(b['rarityMix'] == [[6, 1], [5, 9]] and b['guarantee']['slots'][0]['names'] == ['illustrated cloud'] and b['bonus'] == [[3, 90156, 5]]
          and b['dayLimit'] == 3 and 'epic' in b['enhance']['notReproduced'], 'D3 B0126 dal notice 28251')
    b = B['B0267']
    check(b['rarityMix'] == [[6, 1], [5, 9]] and b['guarantee']['slots'][0]['tierMin'] == 6 and b['bonus'] == [[3, 90156, 3]]
          and b['enhance']['preset'][0]['on'] == {'names': ['sephiroth [ex+]']}, 'D3 B0267 dal notice 38258')
    for r in ('B0430', 'B0431'):
        s0 = B[r]['guarantee']['slots'][0]
        check(s0.get('up') and 'supernova - elsa' in s0['names'] and s0['star'] == 6, f'D5 {r} Frozen 6★ con salita')
    # I-150: nessun nome guasto nel catalogo vero
    dump = _json.dumps({"banners": bs}, ensure_ascii=False)
    check('�' not in dump, 'I-150 niente U+FFFD')
    for brutto in ('mcquakc', 'vanderquakc', '"axel [ex]"', '"kairi [ex+]"', 'master eraqus supernova+'):
        check(brutto not in dump, f'I-150 nome guasto {brutto}')
    check(all('of the following' not in ' '.join(b['pool']['featured']) for b in cat['banners']), 'I-150 pool.featured senza «of the following»')
    integr = ', integrazione'
else:
    integr = ' (integrazione saltata: dati veri assenti)'

# --- I-150 (Shop sp3, spec 7.3): nomi guasti del catalogo
MT = {'launchpad mcquack': {'date': '2018-01-01'}, 'webby vanderquack': {'date': '2018-01-01'},
      'axel art [ex]': {'date': '2017-01-01'}, 'kh ii kairi [ex+]': {'date': '2018-07-01'}, 'axel a': {'date': '2016-01-01'}}
for sbagliato, giusto in (('launchpad mcquakc', 'launchpad mcquack'), ('webby vanderquakc', 'webby vanderquack'),
                          ('axel [ex]', 'axel art [ex]'), ('kairi [ex+]', 'kh ii kairi [ex+]')):
    check(m.resolve_name(sbagliato, '2018-08-01', MT, {}) == giusto, f'I-150 {sbagliato} -> {giusto}')
check(m.list_names('[[SN++ - Master Eraqus]] [[Supernova+ - Ava]], [[SN+ - X]].') == ['sn++ - master eraqus', 'supernova+ - ava', 'sn+ - x'],
      f"I-150 nome fuso {m.list_names('[[SN++ - Master Eraqus]] [[Supernova+ - Ava]], [[SN+ - X]].')}")
check(m.featured_col(R(featured_medals='of the following Medals')) == [], 'I-150 featured «of the following»')
check(m.featured_col(R(featured_medals='SN+ - Ava; of the following Medals')) == ['sn+ - ava'], 'I-150 featured misto')

if errori:
    print(f'ERRORI ({len(errori)})')
    for e in errori:
        print(' -', e)
    sys.exit(1)
print('OK: classify, prezzi, valute, sblocco, limite, garanzie, gemelli VIP, bonus, fine, pool' + integr)

