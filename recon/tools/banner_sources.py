"""Fonti dei banner originali: sotto-set datati, date delle medaglie, note complete delle righe Shop.

Fonti (khuxwiki): Category:English Set 1-59, Template:NASets, InfoMedal delle pagine delle
medaglie, righe di Shop/2016-2020. I dati letti (wiki, medal.json, TSV dei banner) restano fuori
dal repo: le funzioni li ricevono come argomenti e restituiscono strutture in memoria.

    python recon/tools/banner_sources.py --wiki WIKI.json --medals medal.json --banners banners_ww.tsv --out DIR
        -> scrive subsets.json, medal_release.json, wiki_shop_rows.json in DIR (per confronto manuale)
"""
import argparse
import bisect
import collections
import csv
import datetime as dt
import json
import os
import re

MON = {m: i + 1 for i, m in enumerate(['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
                                       'September', 'October', 'November', 'December'])}


def infomedals(w):
    out = []
    for k, s in w.items():
        for b in re.finditer(r'\{\{InfoMedal([\s\S]*?)\n\}\}', s):
            f = dict((a, v.strip()) for a, v in re.findall(r'^\|(\w+)=(.*)$', b.group(1), re.M))
            f['_page'] = k
            out.append(f)
    return out


def norm(s):
    return re.sub(r'\s+', ' ', s.replace(' ', ' ')).strip().lower()


def toks(s):
    """nomi delle medaglie citate in un frammento di wikitesto"""
    out = []
    for m in re.finditer(r'\[\[([^\]|]+)(?:\|([^\]]+))?\]\]|\{\{(KA|EX|b|B|n|N|SG|c|C)\|([^}]*)\}\}', s):
        if m.group(1):
            name = (m.group(2) or m.group(1)).replace('&nbsp;', ' ')
            name = re.sub(r'<[^>]+>', '', name)
            if name.startswith('Category:'):
                continue
            out.append(name.strip())
        else:
            t = m.group(3).lower()
            a = m.group(4).split('|')
            if t == 'ka':
                out.append(f'Key Art #{a[0]}' if a[0] not in ('16',) else 'Key Art #16 [EX+]')
            elif t == 'ex':
                out.append(f'{a[0]} [EX]' if len(a) == 1 else f'{a[0]} [EX {a[1]}]')
            elif t == 'b':
                out.append(f'{a[0]} [{a[1]}]')
            elif t == 'n':
                out.append(f'{a[0]} #{a[1]}')
            elif t == 'sg':
                out.append(f'SN++ - Stained Glass #{a[0]}' if a[0] in ('10', '11', '12', '13', '14') else f'Stained Glass #{a[0]} [EX+]')
            elif t == 'c':
                out.append(a[0])
    return out


def english_subsets(w):
    """Sotto-set inglesi: data e medaglie (Category:English Set N + Template:NASets)."""
    subsets = []
    extras = []
    for n in range(1, 60):
        txt = w.get(f'Category:English Set {n}', '')
        hm = re.search(r'released in (\w+) (\d{4})', txt)
        if not hm:
            continue
        smon, syear = MON[hm.group(1)], int(hm.group(2))
        for line in txt.split('\n'):
            if not line.startswith('*'):
                continue
            dm = re.search(r'(?:released|releasded|added|distributed)(?: to [^,]*?)? on (\w+)\.? (\d+)(?:,? (\d{4}))?', line)
            date = None
            if dm and dm.group(1) in MON:
                mo = MON[dm.group(1)]
                y = int(dm.group(3)) if dm.group(3) else (syear + 1 if mo < smon - 6 else syear)
                date = dt.date(y, mo, int(dm.group(2))).isoformat()
            sm = re.match(r"\*'''Medal Set ([\d.]+[a-z]?)'''", line)
            members = toks(line.split('consist', 1)[1]) if sm and 'consist' in line else toks(re.split(r' (?:was|were) ', line)[0])
            rec = {'set': n, 'id': sm.group(1) if sm else None, 'date': date, 'members': members,
                   'text': re.sub(r'\s+', ' ', line)[:200]}
            (subsets if sm else extras).append(rec)
    # Template:NASets: tutte le medaglie per set 1-59 con la classe (sup)
    t = w['Template:NASets']
    nasets = {}
    parts = re.split(r'^!.*?\|Medal Set (\d+) \(([^)]*)\)\s*$', t, flags=re.M)
    for i in range(1, len(parts), 3):
        n = int(parts[i])
        body = parts[i + 2]
        lst = []
        for m in re.finditer(r'\[\[([^\]|]+)\|(.*?)\]\](?:<sup>([^<]*)</sup>)?', body):
            disp = re.sub(r'<[^>]+>', '', m.group(2)).replace('&nbsp;', ' ').replace('<nowiki>', '').strip()
            lst.append({'page': m.group(1), 'name': disp, 'cls': m.group(3) or ''})
        nasets[str(n)] = {'label': parts[i + 1], 'medals': lst}
    return {'subsets': subsets, 'extras': extras, 'nasets': nasets}


def medal_release(S, w, M, rows):
    """Data d'uscita WW di ogni medaglia e di ogni sua rarita'.

    S = english_subsets(w); M = righe di medal.json; rows = righe del TSV dei banner."""
    im = infomedals(w)
    info = {}
    for f in im:
        if f.get('name'):
            info.setdefault(norm(f['name']), f)
    byname = collections.defaultdict(list)
    for r in M:
        byname[norm(r['name'])].append(r)
    nas = set(norm(e['name']) for v in S['nasets'].values() for e in v['medals'])
    for r in M:  # alias: righe thethiny «X Ver. A» / «Lexaeus» -> nomi wiki «X A» / «Lexaeus A»
        k = norm(r['name'])
        if k in nas:
            continue
        for c in (k.replace(' ver. ', ' '), k + ' a'):
            if c in nas:
                byname[c].append(r)
                break
    # sottoset di appartenenza
    where = {}
    for s in S['subsets']:
        for n in s['members']:
            where.setdefault(norm(n), (s['id'], s['date'] or '2016-04-07', 'subset'))
    for s in S['extras']:
        for n in s['members']:
            where.setdefault(norm(n), (f"{s['set']}.x", s['date'], 'extra'))
    # date di debutto dai banner (featured_medals) come ripiego per i set 41-59
    deb = {}
    for r in sorted(rows, key=lambda r: r['start_pt'] or '9'):
        if not r['start_pt']:
            continue
        for n in re.split(r';\s*', r['featured_medals']):
            if n:
                deb.setdefault(norm(n), r['start_pt'])
    MONABBR = {'Jan': 1, 'Feb': 2, 'Mar': 3, 'Apr': 4, 'May': 5, 'June': 6, 'July': 7, 'Aug': 8, 'Sep': 9, 'Oct': 10, 'Nov': 11, 'Dec': 12}
    out = []
    for n, v in S['nasets'].items():
        n = int(n)
        lm = re.match(r'(\w+)\.? (\d{4})', v['label'])
        m0 = f"{lm.group(2)}-{MONABBR[lm.group(1)]:02d}-01"
        for e in v['medals']:
            k = norm(e['name'])
            if k in where:
                sub, date, src = where[k]
            elif n == 1:
                sub, date, src = '1.1', '2016-04-07', 'subset'
            elif k in deb and deb[k] >= m0[:8] + '01' and deb[k] < f"{int(m0[:4]) + (1 if m0[5:7] == '12' else 0)}-{(int(m0[5:7]) % 12) + 1:02d}-28":
                sub, date, src = f'{n}.?', deb[k], 'debut banner'
            else:
                sub, date, src = f'{n}.?', m0, 'set month'
            f = info.get(k, {})
            out.append({'name': e['name'], 'set': n, 'subset': sub, 'date': date, 'date_src': src, 'cls': e['cls'],
                        'class1': f.get('class1', ''), 'class2': f.get('class2', ''),
                        'nano': {r: int(f[f'nano{r}']) for r in range(1, 8) if f.get(f'nano{r}', '').isdigit()},
                        'rows': [(r['medalId'], r['rare'], r['type'], r['validPack'], r['darklight']) for r in byname.get(k, [])]})
    # timeline numero NA -> data (ancore = numero della rarita' base delle medaglie datate da sottoset/extra)
    anch = sorted((min(o['nano'].values()), o['date']) for o in out if o['nano'] and o['date_src'] in ('subset', 'extra'))
    # monotona: data = max cumulativo
    nums = []
    dates = []
    best = ''
    for num, d in anch:
        best = max(best, d)
        nums.append(num)
        dates.append(best)

    def date_of(num):
        i = bisect.bisect_right(nums, num) - 1
        return dates[max(i, 0)]
    for o in out:
        o['rare_date'] = {}
        for r, num in o['nano'].items():
            d = date_of(num)
            o['rare_date'][r] = max(d, o['date'])
    return out


def redirects(w):
    """pagine #REDIRECT della wiki: titolo normalizzato -> destinazione normalizzata (es. «SN+ - KH III Demyx»
    -> «sn - kh iii demyx»; «SN++ - KH III Lingering Will» -> «sn++ - lingering will»)"""
    out = {}
    for k, s in w.items():
        m = re.match(r'\s*#REDIRECT\s*\[\[([^\]|#]+)', s, re.I)
        if m:
            out[norm(k)] = norm(m.group(1))
    return out


def norm_img(s):
    return re.sub(r'[\s_]+', ' ', s).strip().lower()


def wiki_shop_rows(w):
    """Note complete delle righe di Shop/2016-2020 (il TSV le tronca a 500 caratteri)."""
    out = []
    for k in ['Shop/2016', 'Shop/2017', 'Shop/2018', 'Shop/2019', 'Shop/2020', 'Shop']:
        s = w.get(k, '')
        for chunk in re.split(r'\n\|-\s*\n', s):
            if '[[File:' not in chunk:
                continue
            first = chunk.strip().lstrip('|').strip()
            cells = [c.strip() for c in re.split(r'\|\|', first)]
            m = re.search(r'\[\[File:([^|\]]+)', cells[0])
            nm = re.search(r"'''(.*?)'''", cells[0])
            if len(cells) < 9:
                continue
            out.append({'page': k, 'image': norm_img(m.group(1)) if m else '', 'name': nm.group(1) if nm else '',
                        'mix': cells[1:7], 'price': cells[7], 'duration': cells[8], 'notes': ' '.join(cells[9:]).strip()})
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--wiki', required=True)
    ap.add_argument('--medals', required=True)
    ap.add_argument('--banners', required=True)
    ap.add_argument('--out', required=True)
    a = ap.parse_args()
    w = json.load(open(a.wiki, encoding='utf-8'))
    M = json.load(open(a.medals, encoding='utf-8'))
    rows = list(csv.DictReader(open(a.banners, encoding='utf-8'), delimiter='\t'))
    os.makedirs(a.out, exist_ok=True)
    S = english_subsets(w)
    rel = medal_release(S, w, M, rows)
    shop = wiki_shop_rows(w)
    for name, data, ind in (('subsets.json', S, 1), ('medal_release.json', rel, 0), ('wiki_shop_rows.json', shop, 0)):
        with open(os.path.join(a.out, name), 'w', encoding='utf-8') as fo:
            json.dump(data, fo, ensure_ascii=False, indent=ind)
    print('sotto-set', len(S['subsets']), 'extra', len(S['extras']), 'medaglie', len(rel),
          'con righe', sum(1 for o in rel if o['rows']), 'righe Shop', len(shop))


if __name__ == '__main__':
    main()
