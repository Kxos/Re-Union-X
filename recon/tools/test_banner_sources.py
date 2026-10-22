"""Prova offline di banner_sources.py (sotto-set, date delle medaglie, note Shop) su una wiki sintetica.

    python recon/tools/test_banner_sources.py        -> «OK: ...» oppure «ERRORI (n)», uscita 1
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import banner_sources as m  # noqa: E402

errori = []


def check(cond, msg):
    if not cond:
        errori.append(msg)


WIKI = {
    'Category:English Set 1': "Set 1 was released in April 2016.\n"
        "*'''Medal Set 1.2''' was released on April 21 and consists of [[Alice]] and [[Hades|Hades]].\n"
        "*[[Moogle Medal]] was distributed on May 2.\n",
    'Category:English Set 2': "Set 2 was released in May 2016.\n"
        "*'''Medal Set 2.1''' was released on May 13 and consists of {{KA|1}} and [[Sephiroth]].\n",
    'Template:NASets': "! colspan=2 |Medal Set 1 (Apr. 2016)\n|[[Sora|Sora]] [[Alice|Alice]]<sup>SR</sup> [[Hades|Hades]]\n"
        "! colspan=2 |Medal Set 2 (May 2016)\n|[[Key Art 1|Key Art #1]] [[Sephiroth|Sephiroth]]\n",
    'Sora': "{{InfoMedal\n|name=Sora\n|class1=\n|class2=Attack\n|nano3=10\n|nano4=11\n|nano7=1500\n}}",
    'Sephiroth': "{{InfoMedal\n|name=Sephiroth\n|class2=Attack\n|nano5=200\n}}",
}

# --- norm
check(m.norm('Hades  A') == 'hades a', 'norm: spazi e maiuscole')

# --- infomedals
im = m.infomedals(WIKI)
check(sorted(f['name'] for f in im) == ['Sephiroth', 'Sora'], 'infomedals: nomi')
check(all('_page' in f for f in im), 'infomedals: _page')

# --- english_subsets
S = m.english_subsets(WIKI)
ss = S['subsets']
check(any(s['set'] == 1 and s['id'] == '1.2' and s['date'] == '2016-04-21' and s['members'] == ['Alice', 'Hades'] for s in ss),
      'subsets: 1.2')
check(any(s['set'] == 2 and s['id'] == '2.1' and s['date'] == '2016-05-13' and s['members'] == ['Key Art #1', 'Sephiroth'] for s in ss),
      'subsets: 2.1')
check(any(e['set'] == 1 and e['members'] == ['Moogle Medal'] and e['date'] == '2016-05-02' for e in S['extras']),
      'extras: Moogle Medal')
al = [e for e in S['nasets']['1']['medals'] if e['name'] == 'Alice']
check(len(al) == 1 and al[0]['cls'] == 'SR', 'nasets: Alice SR')

# --- medal_release
rows = [{'medalId': 1001, 'name': 'Sora', 'rare': 3, 'type': 1, 'validPack': 0, 'darklight': 1},
        {'medalId': 301001, 'name': 'Sora', 'rare': 7, 'type': 1, 'validPack': 0, 'darklight': 1}]
rel = m.medal_release(S, WIKI, rows, [])
sora = [o for o in rel if o['name'] == 'Sora']
check(len(sora) == 1, 'release: Sora presente')
if sora:
    o = sora[0]
    check(o['subset'] == '1.1' and o['date'] == '2016-04-07', 'release: Sora sotto-set e data')
    check([r[0] for r in o['rows']] == [1001, 301001], 'release: Sora righe')

# --- wiki_shop_rows (riga Shop sintetica)
SHOP = {'Shop/2016': "{|\n|-\n| [[File:Banner_One.png|x]] '''Name One'''||a||b||c||d||e||f||100||7 days||note one||more\n|-\n"
        "| [[File:Short.png]] ||only||few\n"}
sr = m.wiki_shop_rows(SHOP)
check(len(sr) == 1, 'shop: una riga valida')
if sr:
    check(sr[0]['image'] == 'banner one.png' and sr[0]['name'] == 'Name One' and sr[0]['mix'] == list('abcdef')
          and sr[0]['price'] == '100' and sr[0]['duration'] == '7 days' and sr[0]['notes'] == 'note one more',
          'shop: campi ' + repr(sr[0]))

# --- redirects (pagine #REDIRECT della wiki, nomi normalizzati)
RD = m.redirects({'SN+ - KH III Demyx': '#REDIRECT[[SN - KH III Demyx]]', 'X': '#REDIRECT [[Y|y]] ', 'Sora': 'text'})
check(RD == {'sn+ - kh iii demyx': 'sn - kh iii demyx', 'x': 'y'}, f'redirects {RD}')

if errori:
    print(f'ERRORI ({len(errori)})')
    for e in errori:
        print(' -', e)
    sys.exit(1)
print('OK: norm, infomedals, english_subsets, medal_release, wiki_shop_rows, redirects')
