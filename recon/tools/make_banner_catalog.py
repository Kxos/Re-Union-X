"""Catalogo dei banner originali: una «ricetta» per banner (spec 2026-10-16-shop-banner-design.md, sezione 9).

    python recon/tools/make_banner_catalog.py
        -> server/game_data/gacha_catalog.json (ignorato da git), letto da server/gacha*.js

Fonti fuori dal repo (sola lettura; percorsi di default dalla radice <repo>/../..):
  KHUX_WIKI_JSON     wiki/wiki_all.json                     (sotto-set, InfoMedal, righe Shop complete)
  KHUX_BANNERS_TSV   reference/banners/banners_ww.tsv       (813 righe dei banner WW)
  KHUX_STORY_TSV     reference/story/story_release_ww.tsv   (tranche della storia WW)
  KHUX_NOTICES_JSON  reference/banners/notices.json         (notice in cache: periodi dei banner senza fine)
  server/master_data/medal.json, server/master_data/material.json
  recon/tools/banner_overrides.tsv (nel repo: numeri letti dai notice, con la fonte; vincono su tutto)

Porta di tmp/sp2/scripts/analyze.py e incomplete.py (ricerca del sotto-progetto 2) senza variabili
globali: i dati passano come argomenti. Le probabilita' non sono qui: le ricostruisce il server (9.2).
"""
import collections
import csv
import datetime as dt
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import banner_sources as bsrc  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
ROOT = os.path.dirname(os.path.dirname(REPO))
DEFAULTS = {
    'wiki': os.path.join(ROOT, 'wiki', 'wiki_all.json'),
    'banners': os.path.join(ROOT, 'reference', 'banners', 'banners_ww.tsv'),
    'story': os.path.join(ROOT, 'reference', 'story', 'story_release_ww.tsv'),
    'notices': os.path.join(ROOT, 'reference', 'banners', 'notices.json'),
    'medals': os.path.join(REPO, 'server', 'master_data', 'medal.json'),
    'materials': os.path.join(REPO, 'server', 'master_data', 'material.json'),
    'skills': os.path.join(REPO, 'server', 'master_data', 'skill.json'),
    'overrides': os.path.join(HERE, 'banner_overrides.tsv'),
    'out': os.path.join(REPO, 'server', 'game_data', 'gacha_catalog.json'),
}
ENV = {'wiki': 'KHUX_WIKI_JSON', 'banners': 'KHUX_BANNERS_TSV', 'story': 'KHUX_STORY_TSV', 'notices': 'KHUX_NOTICES_JSON'}

norm = bsrc.norm
D = dt.date.fromisoformat
FIRST_DAY = '2016-04-07'
SKILL72415_FROM = '2020-12-17'  # data del notice 72415 (prima tabella delle abilita' SN+/SN++/7★ in notices.json)
DRAW_CLS = {'', 'SR', 'L-SR', 'L'}
NUM = {'a': 1, 'an': 1, 'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6, 'seven': 7, 'eight': 8,
       'nine': 9, 'ten': 10}


# ---------- note complete dalla wiki (il TSV tronca a 500 caratteri) ----------
def wiki_start(d):
    m = re.match(r'(\d\d)/(\d\d)/(\d\d)', d or '')
    return f'20{m.group(3)}-{m.group(1)}-{m.group(2)}' if m else ''


def shop_index(shop):
    wsx = collections.defaultdict(list)
    for o in shop:
        wsx[re.sub(r'\(\d+\)(?=\.png)', '', o['image'])].append(o)
    return wsx


def full_notes(r, wsx):
    img = re.sub(r'\(\d+\)(?=\.png)', '', bsrc.norm_img(r['image_file'].split(' ')[0])) if r['image_file'] else ''
    best = None
    for o in wsx.get(img, []):
        ws = wiki_start(o['duration'])
        if ws and r['start_pt'] and abs((D(ws) - D(r['start_pt'])).days) <= 2:
            best = o
            break
        if not ws and best is None:
            best = o
    if best and len(best['notes']) >= len(r['notes']) - 5:
        return best['notes'], 'wiki'
    return r['notes'], 'tsv'


# ---------- classificazione ----------
TICKETS = {'Bronze Ticket': 4, 'Silver Ticket': 5, 'Gold Ticket': 6, 'Platinum Ticket': 7, 'Draw Ticket': 8,
           'Holiday Draw Ticket': 8, 'Spooky Cookie': 8, 'Moogle Point': 8, 'Draw Point': 9}
CURRENCY = {'Bronze Ticket': (4, 'bronze'), 'Silver Ticket': (5, 'silver'), 'Gold Ticket': (6, 'gold'),
            'Platinum Ticket': (7, 'platinum'), 'Draw Ticket': (8, 'draw'), 'Holiday Draw Ticket': (8, 'holiday'),
            'Spooky Cookie': (8, 'spooky'), 'Moogle Point': (8, 'moogle'), 'Draw Point': (9, 'points')}


def classify(r, notes):
    n = r['name'].lower()
    c = r['currency']
    p = r['price']
    mix = r['rarity_mix']
    if 'blind box' in n:
        return 'X_BLINDBOX'
    if r['row_id'] == 'B0813' or 'strengthen your equipment' in n:
        return 'X_TUTORIAL'
    if c in TICKETS:
        if c == 'Draw Point':
            return 'T_POINTS'
        if c in ('Bronze Ticket', 'Silver Ticket', 'Gold Ticket', 'Platinum Ticket'):
            return 'T_EVOLVE'
        return 'T_TICKET'
    if 'free' in n or (c.startswith('Free') and 'Jewels' not in c) or r['row_id'] in ('B0497',):
        return 'FREE'
    if re.search(r'beginner|newcomer|starter', n):
        return 'BEGINNER'
    if re.search(r'falling price', n) or len(re.findall(r'\d(?:st|nd|rd|th):', p)) >= 3 or re.match(r'^\d{4}, \d{4}, ', p):
        return 'FALLING'
    if re.search(r'skill', n):
        return 'SKILL'
    if re.search(r'imitation|trait medal|blue fairy|meow wow|magic mirror', n):
        return 'ITEM'
    if re.search(r'supernova|^sn[ +]|sn\+|^sn -|\bsn deal', n) or re.match(r'(SN|Supernova)', r['featured_medals']):
        return 'SN'
    stars = re.findall(r'(\d)★', mix)
    if '7★' in n or 'prime' in n or (stars and set(stars) == {'7'}):
        return 'SEVEN'
    if re.search(r'daily|top-drawer|gem deal|one-day', n) or re.search(r'once (per|a) day|times per day|each day', notes, re.I):
        return 'DAILY'
    if r['featured_medals'] or re.search(r'if bought|within \d+ draws|guarantees? (one|two|three|four|a) of the following',
                                         notes + ' ' + r['guarantees'], re.I):
        return 'FEATURED'
    return 'STANDARD'


# ---------- prezzi e valute ----------
def parse_price(p):
    p = p.replace(',', '') if re.match(r'^\d{1,3},\d{3}$', p) else p
    steps = re.findall(r'(\d+)(?:st|nd|rd|th)\+?: (Free|\d+)', p)
    if steps:
        return [0 if v == 'Free' else int(v) for _, v in steps]
    if re.match(r'^\d{4}(, \d{4})+$', p):
        return sorted([int(x) for x in p.split(', ')], reverse=True)
    if re.search(r'^\s*(VIP Only )?Free', p):
        return [0]
    m = re.search(r'(\d+)', p)
    return [int(m.group(1))] if m else []


def currency_of(row, typ):
    """(payType, currency): Jewels, Free e valuta vuota -> (1, 'jewel')."""
    if row.get('row_id') == 'B0787':  # «Ticket Draw x10» 2021-01: «Holiday» nel TSV e' un errore (research.md §2)
        return (8, 'draw')
    cur = row['currency'].replace(', VIP only', '').replace('Free, ', '')
    return CURRENCY.get(cur, (1, 'jewel'))


def rarity_mix(mix):
    return [[int(s), int(n)] for s, n in re.findall(r'(\d)★:(\d+)', mix)]


def unusable(prices, lot, mix):
    """senza prezzo, dimensione o composizione degli slot un banner non si puo' estrarre (spec 9.1): solo catalogo"""
    return not prices or not lot or not mix


def first_rarity(rows):
    out = {}
    for r in rows:
        for k in re.findall(r'(\d)★', r['rarity_mix']):
            if r['start_pt'] and (k not in out or r['start_pt'] < out[k]):
                out[k] = r['start_pt']
    return dict(sorted(out.items()))


# ---------- date di fine mancanti (spec 9.8) ----------
def series_key(name):
    k = re.sub(r'\(\d+/\d+\)|returns!?|is back!?|pt\.? ?\d|!', '', name.lower())
    return re.sub(r'\s+', ' ', k).strip()


MONS = {m: i + 1 for i, m in enumerate(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'])}
PERIOD = re.compile(r'([A-Z][a-z]{2})[a-z]*\.? (\d+), (\d{4}) 12:00 a\.m\. to (?:([A-Z][a-z]{2})[a-z]*\.? (\d+), (\d{4}) )?'
                    r'11:59 p\.m\. \(PT\)')


def notice_end(r, notices):
    """(punteggio del titolo, fine, id) del notice citato dalla riga il cui periodo parte il giorno d'inizio."""
    best = None
    words = set(re.findall(r'[a-z0-9+]+', series_key(r['name']))) - {'deal', 'the', 'medal'}
    for i in [int(i) for i in re.findall(r'detail/(\d+)', r['source_url'])]:
        x = notices.get(i)
        if not x:
            continue
        title = x['title'].lower()
        score = len(words & set(re.findall(r'[a-z0-9+]+', title)))
        if 'one day only' in title:
            score += 1
        if series_key(r['name']).replace('!', '') in re.sub(r'[!＋]', lambda m: '+' if m.group(0) == '＋' else '', title):
            score += 5
        for m in PERIOD.finditer(x['text']):
            if m.group(1) not in MONS or (m.group(4) and m.group(4) not in MONS):
                continue
            st = dt.date(int(m.group(3)), MONS[m.group(1)], int(m.group(2)))
            if st.isoformat() != r['start_pt']:
                continue
            en = dt.date(int(m.group(6)), MONS[m.group(4)], int(m.group(5))) if m.group(4) else st
            if best is None or score > best[0]:
                best = (score, en.isoformat(), i)
            break
    return best


def end_of(row, typ, rows, notices):
    """(fine, fonte). Ordine della spec 9.8; le regole smentite dai notice (giorno prima del successivo
    della serie, Supernova Deal settimanali di 7 giorni, 1° del mese -> fine mese) non ci sono piu'."""
    if row['end_pt']:
        return row['end_pt'], 'original'
    s = row['start_pt']
    k = series_key(row['name'])
    if 'draw points' in k:
        return '2021-06-29', 'permanent to end of service (README)'
    ne = notice_end(row, notices)
    if ne and ne[0] >= 5:
        return ne[1], f'notice {ne[2]}'
    if re.search(r'supernova deal|gem deal|free deal|sn\+ falling price|ffbe campaign', k):
        return s, '1 day (series rule)'
    if ne:
        return ne[1], f'notice {ne[2]} (weak title match)'
    if 'beginner' in k and s[:4] == '2019':
        return '2020-10-11', 'Beginner 2019 -> 11 Oct 2020 (notice 70063)'
    if 'beginner' in k:
        return '2021-02-24', 'Beginner 2020 -> end of jewel sales 24 Feb 2021'
    return s, '1 day (default)'


# ---------- sblocco con la storia ----------
def unlock_quest(start, story):
    """«Superata la quest N»: N = first_quest - 1 della tranche WW in corso all'inizio del banner,
    cioe' l'ultima riga con data <= start (decisione dell'utente del 17-10: al lancio WW le quest
    1-200 uscirono insieme e i banner del lancio erano estraibili dal primo giorno)."""
    cur = None
    for first, last, date in story:
        if date <= start and (cur is None or date >= cur[1]):
            cur = (int(first), date)
    return cur[0] - 1 if cur else 0


def day_limit(notes, typ):
    # «3 times a day» (B0080/B0081, 2c/G8) come «3 times per day»
    m = re.search(r'\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten) times (?:per|a|each) day|(3)×/day', notes, re.I)
    if m:
        v = (m.group(1) or m.group(2)).lower()
        return int(v) if v.isdigit() else NUM[v]
    if re.search(r'once (per|a) day', notes, re.I) or typ == 'DAILY':
        return 1
    return 0


# formulazione reale delle note: «Available once.» (B0510, B0511, B0604 e le SN 7★ del 2020); «can only be drawn
# once» non compare nelle note ne' nei notice in cache, ma e' la stessa regola
ONCE = re.compile(r'\b(?:available|can only be (?:drawn|pulled|purchased)) once\b(?!\s*(?:per|a|each) day)', re.I)


# «Available three times.» (B0651, B0660, B0683, B0696; notice 66862 «Up to 3 times only!», 2c/G8)
TIMES = re.compile(r'\bavailable (\d+|two|three|four|five) times\b(?!\s*(?:per|a|each) day)', re.I)


def total_limit(notes):
    """estrazioni in tutto (Ruling 28): 1 per «Available once», N per «Available N times», 0 = nessun limite"""
    m = TIMES.search(notes)
    if m:
        v = m.group(1).lower()
        return int(v) if v.isdigit() else NUM[v]
    return 1 if ONCE.search(notes) else 0


def free_day_limit(typ, prices, day, total, vip):
    """Ruling 28: una gratuita (FREE o prezzo sempre 0) senza dayLimit, totalLimit ne' vipFree diventa una al
    giorno: il server la porta a 1 Jewel e senza limite si estrarrebbe all'infinito"""
    free = typ == 'FREE' or (bool(prices) and not any(prices))
    return 1 if free and not (day or total or vip) else day


# ---------- liste di medaglie nelle note ----------
LINK = re.compile(r'\[\[[^\]]*\]\]|\{\{[^}]*\}\}')
STOP = re.compile(r'(?<!\bIllus)(?<!\bIll)(?<!\bVer)(?<!\bJr)(?<!\bMr)(?<!\bMrs)(?<!\bDr)[.!|](?=\s|$|\*)|\|')


def _cut(seg):
    """posizione della prima fine di frase fuori da [[...]] e {{...}} (non dopo «Illus.», «Ver.» ...)"""
    masked = LINK.sub(lambda m: 'L' * len(m.group(0)), seg)
    mm = STOP.search(masked)
    return mm.start() if mm else len(seg)


KEEP_COMMA = re.compile(r'huey, dewey|terra, ven, aqua', re.I)  # nomi di medaglie con la virgola
TAIL = re.compile(r'\s+(?:with (?:its|one|a)\b|pre-strengthened\b|at \d★|medals?$|is guaranteed\b).*$', re.I)


def list_names(seg, keep_star=False):
    """nomi normalizzati di un elenco «A, [[B]], or {{KA|22}}.» (link e template resi come banner_sources.toks);
    la stella davanti («7★ Prime - KH Cloud») si toglie, salvo keep_star (bonus: sceglie la rarita')"""
    seg = seg[:_cut(seg)]
    seg = re.split(r',?\s+with (?:its|one|a|their)\b', seg)[0]  # «..., or [[X]], with one of the following skills: ...»
    seg = re.sub(r'(\]\]|\}\})[ \t]+(?=\[\[|\{\{)', r'\1, ', seg)  # «[[A]] [[B]]» senza virgola nel testo (B0692): due nomi
    seg = LINK.sub(lambda m: (bsrc.toks(m.group(0)) or [' '])[0], seg)
    seg = KEEP_COMMA.sub(lambda m: m.group(0).replace(',', '§'), seg)
    parts = re.split(r',\s*(?:or |and )?|\s+(?:or|and)\s+', seg)
    out = (norm(TAIL.sub('', p.replace('§', ','))) for p in parts)
    if not keep_star:
        out = (re.sub(r'^\d★\s*', '', n) for n in out)
    return [n for n in out if n]


def featured_col(row):
    """medaglie della colonna featured_medals (voci «;», a volte elenchi «A, B, and C»)"""
    return [n for x in re.split(r';\s*', row['featured_medals']) if x.strip() for n in list_names(x)
            if not n.startswith('of the following')]  # B0637/B0638/B0646: la colonna del TSV ha solo «of the following Medals»


SET_FILTERS = [('disney', r'disney'), ('ffkh', r'final fantasy|kingdom hearts'), ('power', r'\bpower\b'),
               ('speed', r'\bspeed\b'), ('magic', r'\bmagic\b')]


def set_filter(notes):
    """filtri di «Draws from <X> Medals in sets ...»: disney (origin), ffkh (origin), power/speed/magic (att)"""
    m = re.search(r'[Dd]raws from ([^.]*?) Medals in sets? \d', notes)
    if not m:
        return []
    return [k for k, rx in SET_FILTERS if re.search(rx, m.group(1), re.I)]


def setrefs(notes):
    m = re.search(r'[Dd]raws from (?:[^.]*? Medals in )?sets? ((?:\d+\.\d+[a-z]?|,|and|\s)+)', notes)
    return re.findall(r'\d+\.\d+[a-z]?', m.group(1)) if m else []


def names_listed(notes):
    m = re.search(r'[Dd]raws from the following [Mm]edals[^:]*: ', notes)
    return list_names(notes[m.end():]) if m else []


def _dedup(xs):
    return list(dict.fromkeys(xs))


# ---------- garanzie ----------
LISTRE = re.compile(r'(?:[Gg]uarantees?|guaranteed to (?:get|receive)) (a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+) '
                    r'(?:boosted versions? )?of the following [Mm]edals(?:([^:!|.]{0,120}?)[:!]|)\s*')
NOT_A_NAME = re.compile(r'\b(she|he|him|her|they|these|this|it|you)\b', re.I)


def guarantee_of(row, notes):
    """{list, count, pity, every, featured}: slot a lista («N of the following»), pity «If bought N times»
    o «within N draws», «every Nth draw»; featured = medaglie della pity (normalizzate)."""
    text = (notes + ' | ' + row['guarantees']).replace("'''", '')
    g = {'list': [], 'count': 0, 'pity': None, 'every': None, 'featured': []}
    m = LISTRE.search(text)
    if m:
        v = m.group(1).lower()
        g['count'] = int(v) if v.isdigit() else NUM[v]
        g['list'] = _dedup(list_names(text[m.end():]))
        e = re.search(r'every (\d+)(?:st|nd|rd|th) draw', m.group(2) or '')
        if e:  # «... Medals every 3rd draw! [[A]] ...»
            g['every'] = int(e.group(1))
    if g['every'] is None:
        e = re.search(r'every (\d+)(?:st|nd|rd|th) draw', text)
        if e:
            g['every'] = int(e.group(1))
    p = re.search(r'[Ii]f bought (\d+) times?,?\s*', text)
    if p:
        g['pity'] = int(p.group(1))
        rest = text[p.end():]
        e = re.search(r'\s+(?:is|are) (?:guaranteed|included)', rest)
        cut = _cut(rest)
        seg = rest[:e.start()] if e and e.start() < cut else rest
        lst = re.match(r'(?:at least )?(?:one )?of the following [Mm]edals (?:is|are) (?:guaranteed|included)[:!]?\s*', rest)
        if lst:  # «If bought 3 times, one of the following Medals is guaranteed: [[A]], [[B]] ...»
            seg = rest[lst.end():]
        seg = re.sub(r'^(?:guarantees (?:a|one) (?:boosted version of )?|at least one |one |an? )', '', seg, flags=re.I)
        g['featured'] = _dedup(list_names(seg))
        return g
    w = re.search(r'within (\d+) draws', text, re.I)
    if w:
        g['pity'] = int(w.group(1))
        feat = featured_col(row)
        if not feat:  # righe dai notice: «SN - KH III Dark Riku  is guaranteed within 10 draws.»
            f = re.search(r'(?:^|[|.!]\s*)([^|.!]+?)\s+(?:is |are )?guaranteed within \d+', text)
            if f and not NOT_A_NAME.search(f.group(1)):
                feat = list_names(f.group(1))
        g['featured'] = _dedup(feat)
    return g


def guarantee_names(g):
    """nomi garantiti scritti nel banner: lista, nomi delle riserve (slots[].names, salvo quelle prese dal master per
    prefisso, «SN+ or SN++» e «KH III Medal+») e bersagli della pity; `list` (= prima riserva a lista) solo senza slots"""
    sl = g.get('slots') or []
    return ([n for s in sl if 'prefix' not in s for n in s['names']] if sl else g['list']) + g.get('pityNames', [])


def pool_names_at(b, medals, sub_members, sub_date, first):
    """nomi del pool del banner alla sua data d'inizio, come expandPool in server/gacha-data.js (senza
    guarantee.list): pool.names, vetrina, sotto-set usciti (col filtro origin/att), std released/inherit; solo i nomi
    con una variante alle stelle del mix (o alla stella sopra, se gia' uscite) datata entro l'inizio"""
    p, at = b['pool'], b['start'] or FIRST_DAY
    names = set(p['names']) | set(p['featured'])
    flt = p.get('filter') or []
    for s in p['sets']:
        if sub_date.get(s, FIRST_DAY) <= at:
            names |= {n for n in sub_members.get(s, []) if n in medals
                      and (not flt or medals[n].get('origin') in flt or medals[n].get('att') in flt)}
    if p['mode'] in ('released', 'inherit'):
        after = p['inheritAfter'] or '' if p['mode'] == 'inherit' else ''
        names |= {n for n, v in medals.items() if v.get('std') and after < v['date'] <= at}
    stars = {r for r, _ in b['rarityMix'] if not (first.get(str(r)) and first[str(r)] > at)}
    stars |= {r + 1 for r, _ in b['rarityMix'] if first.get(str(r + 1)) and first[str(r + 1)] <= at}
    return {n for n in names if any(i[1] in stars and i[2] <= at for i in medals.get(n, {}).get('ids', []))}


def align_debut_dates(banners, medals, first):
    """Vetrina e lista alla data del banner (correzione finale A). La data di una variante (rare_date di
    banner_sources.medal_release) e' interpolata dal numero NA e cade a volte 3-11 giorni dopo l'inizio del banner
    che ha introdotto la medaglia: per ogni nome di pool.featured, guarantee.list, guarantee.slots[].names o
    guarantee.pityNames di un banner estraibile con inizio S, se la medaglia e' uscita entro S (o S e' il primo
    banner estraibile che la nomina), le varianti datate dopo S prendono S, ma solo alle stelle del mix (gia' uscite)
    e alla stella sopra se gia' uscita (le stesse di expandPool in server/gacha-data.js: mai 6★ prima del 15/07/2016
    ne' 7★ prima del 25/05/2018). Le altre medaglie non cambiano. Restituisce il numero di varianti spostate."""
    live = sorted((b for b in banners if not b['catalogOnly'] and b['start']), key=lambda b: b['start'])
    debut = {}
    for b in live:
        for n in b['pool']['featured'] + guarantee_names(b['guarantee']):
            debut.setdefault(n, b['start'])
    moved = 0
    for b in live:
        s = b['start']
        stars = {r for r, _ in b['rarityMix'] if not (first.get(str(r)) and first[str(r)] > s)}
        stars |= {r + 1 for r, _ in b['rarityMix'] if first.get(str(r + 1)) and first[str(r + 1)] <= s}
        for n in _dedup(b['pool']['featured'] + guarantee_names(b['guarantee'])):
            v = medals.get(n)
            if not v or not (v['date'] <= s or debut.get(n) == s):
                continue
            for i in v['ids']:
                if i[1] in stars and i[2] > s:
                    i[2] = s
                    moved += 1
    return moved


def notice_list(r, notices):
    """nomi dell'elenco «... one of the following Medals every 3rd draw!» che il TSV non ha (le righe 'notice'):
    nel testo del notice sono una per riga dopo la frase, fino alla prima riga '■', '*' o vuota."""
    for i in [int(i) for i in re.findall(r'detail/(\d+)', r['source_url'])]:
        x = notices.get(i)
        if not x:
            continue
        lines = x['text'].split('\n')
        for k, ln in enumerate(lines):
            if re.search(r'of the following [Mm]edals', ln):
                names = []
                for nx in lines[k + 1:]:
                    nx = nx.strip()
                    if not nx or nx[0] in '■*★':
                        break
                    names.append(nx)
                return _dedup(n for q in names for n in list_names(q))
    return []


# ---------- gemelli VIP (spec 9.5) ----------
def is_vip(r):
    return 'VIP' in r['currency'] or 'VIP' in r['price']


def vip_twins(rows):
    """row_id delle righe VIP con una riga non VIP della stessa data e della stessa serie."""
    def key(r):
        return (r['start_pt'], series_key(re.sub(r'\(VIP\)|VIP:', '', r['name'])))
    normal = {key(r) for r in rows if not is_vip(r)}
    return {r['row_id'] for r in rows if is_vip(r) and key(r) in normal}


# ---------- righe boosted del master (sotto-progetto 2b, Task 3) ----------
ORIG_BOOSTED = set()  # rare originali SE (id + 100000), riempito da build_catalog


def orig_boosted_ids(rows):
    """Versioni rare originali SE (2c/G4, 19-10): id 1xxxxx = medaglia id-100000 con stesso nome e stella e STR piu'
    alta (le 17 Organizzazione XIII «even rarer version ... 1,000 more base strength», notice 20865). Sono boosted
    (medal-boost.boostedIndex): escono solo col tiro «small» della voce boosted, mai come variante normale."""
    by = {r['medalId']: r for r in rows}
    return {i for i, r in by.items() if 100000 <= i < 200000 and (b := by.get(i - 100000))
            and b['name'] == r['name'] and b['rare'] == r['rare'] and (r.get('attack') or 0) > (b.get('attack') or 0)}


def is_boosted(r):
    """riga boosted di medal.json (groupId = medaglia normale, medalId >= 1000000 o rara originale SE): non entra in
    nessuna tabella per nome del catalogo (medaglie, bonus, evoluzione, liste), che darebbe la boosted al posto della
    normale"""
    return bool(r.get('groupId')) or r['medalId'] >= 1000000 or r['medalId'] in ORIG_BOOSTED


# ---------- bonus (note «Includes N bonus ...») ----------
# senza «bonus» solo le Gem: «Includes 3 Power Gems» delle Gem Deal 2017 (2c/G6, 18 banner B0142-B0234; notice 30125
# : tre Gem Power, Speed o Magic a ogni estrazione)
BONUS = re.compile(r'[Ii]ncludes? (a|one|two|three|five|\d+) (?:bonus |(?=(?:\[\[)?(?:Power|Speed|Magic|Sun|Moon) Gem))')


# Scrooge in regalo con la sua skill (70 banner Skills to Thrill e simili 2016-18: «Includes a bonus 6★ Scrooge Medal
# with the Attack Boost III Skill»; segnalazione dell'utente 19-10, mai consegnato): voce [3, Scrooge alla stella,
# 1, skillId]. Nomi della wiki scritti diversamente da skill.json:
SCROOGE_RE = re.compile(r'Includes a bonus (\d)★ (?:\[\[)?Scrooge(?:\]\])? Medal with the (?:\[\[)?(.+?)(?:\]\])? Skill\b')
SKILL_ALIAS = {'atk boost ii & atk prize+': 'atk prize+ & atk boost ii', 'sp attack gauge 1': 'sp attack gauge i',
               'atk b iii max & sp ga ii': 'atk b iii max & sp ga 2'}


def scrooge_bonus(notes, medal_rows, skill_rows):
    """([3, Scrooge, 1, skillId] o None, nome non trovato o None) per «Includes a bonus N★ Scrooge Medal with the X Skill»."""
    m = SCROOGE_RE.search(notes.replace("'''", ''))
    if not m:
        return None, None
    star, name = int(m.group(1)), norm(m.group(2))
    sid = {norm(s['name']): s['skillId'] for s in skill_rows}.get(SKILL_ALIAS.get(name, name))
    mid = next((r['medalId'] for r in medal_rows if r['name'] == 'Scrooge' and r['rare'] == star), None)
    return ([3, mid, 1, sid] if sid and mid else None), (None if sid and mid else m.group(2))


def _bonus(notes, medal_rows, material_rows):
    """([[3|5, id, numero], ...], nomi non trovati): la frase finisce al primo punto fuori da link e
    abbreviazioni («Donald Ver. B»); «5★ A and 6★ B medal» = due oggetti."""
    found, skipped = [], []
    mats = {norm(x['name']): x['materialId'] for x in material_rows}
    meds = collections.defaultdict(list)
    for x in medal_rows:
        if not is_boosted(x):
            meds[norm(x['name'])].append(x)
    text = notes.replace("'''", '')
    for m in BONUS.finditer(text):
        v = m.group(1).lower()
        n = int(v) if v.isdigit() else NUM[v]
        for part in list_names(text[m.end():], keep_star=True):
            star = re.match(r'(\d)★\s*', part)
            name = part[star.end():] if star else part
            keys = [name] + ([name[:-1]] if name.endswith('s') else [])  # «[[Power Gem]]s»
            k = next((k for k in keys if k in mats or k in meds), None)
            if k in mats:
                found.append([5, mats[k], n])
                continue
            cand = sorted(meds.get(k, []), key=lambda x: x['medalId'])
            if star and any(x['rare'] == int(star.group(1)) for x in cand):
                cand = [x for x in cand if x['rare'] == int(star.group(1))]
            if cand:
                found.append([3, cand[0]['medalId'], n])
            else:
                skipped.append(name)
    return found, skipped


def bonus_of(notes, medal_rows, material_rows):
    return _bonus(notes, medal_rows, material_rows)[0]


# ---------- pool (spec 9.3) ----------
def expand_refs(refs, sub_members, rel, start):
    """sotto-set citati -> (sotto-set, nomi): «24.3» -> 24.3a + 24.3b; set senza sotto-set nella wiki
    (27.6, 40.6, 41.x) -> medaglie di quel set uscite entro l'inizio."""
    sets, names = [], []
    for s in refs:
        if s in sub_members:
            sets.append(s)
            continue
        alts = sorted(k for k in sub_members if re.fullmatch(re.escape(s) + r'[a-z]', k))
        if alts:
            sets += alts
            continue
        n = int(s.split('.')[0])
        names += [norm(o['name']) for o in rel if o['set'] == n and o['date'] <= start and o['cls'] in DRAW_CLS]
    return _dedup(sets), _dedup(names)


def evolve_of(row, medal_rows):
    """T_EVOLVE: [[medalId, livello], ...] delle medaglie d'evoluzione del biglietto (spec 9.2)."""
    cur = row['currency']
    if 'Platinum' in cur:
        fmt, levels = 'Dual Meow Wow [SAB LV {}]', range(7, 10)
    elif 'Bronze' in cur:
        fmt, levels = 'Blue Fairy [SA Bonus LV {}]', range(1, 4)
    elif 'Silver' in cur:
        fmt, levels = 'Blue Fairy [SA Bonus LV {}]', range(4, 9) if row['start_pt'] >= '2018-09-14' else range(3, 9)
    else:  # Gold
        fmt, levels = 'Blue Fairy [SA Bonus LV {}]', range(5, 9)
    by = {x['name']: x['medalId'] for x in medal_rows if not is_boosted(x)}
    return [[by[fmt.format(lv)], lv] for lv in levels if fmt.format(lv) in by]


def pool_recipe(row, notes, typ, docs, sub_members, rel=(), medal_rows=()):
    """docs = [(inizio, sotto-set, nomi, tipo)] dei banner con «Draws from sets» precedenti."""
    start = row['start_pt'] or FIRST_DAY
    p = {'mode': 'released', 'sets': [], 'names': [], 'featured': [], 'filter': [], 'inheritAfter': None, 'evolve': None}
    refs = setrefs(notes)
    listed = names_listed(notes)
    if typ == 'T_EVOLVE':
        p['mode'] = 'evolve'
        p['evolve'] = evolve_of(row, medal_rows)
    elif refs:
        p['mode'] = 'sets'
        p['sets'], p['names'] = expand_refs(refs, sub_members, rel, start)
        p['filter'] = set_filter(notes)
    elif listed:
        p['mode'] = 'list'
        p['names'] = _dedup(listed)
    else:
        prevd = [d for d in docs if d[0] <= start]
        same = [d for d in prevd if d[3] == typ]
        if row['status'].startswith('permanent') or not prevd:
            p['mode'] = 'released'
        else:
            d0 = (same or prevd)[-1]
            p['mode'] = 'inherit'
            p['sets'] = list(d0[1])
            p['inheritAfter'] = d0[0]
            p['names'] = _dedup(list(d0[2]) + [norm(x) for x in bsrc.toks(notes)])
    p['featured'] = _dedup(featured_col(row) + guarantee_of(row, notes)['featured'])
    return p


def epic_boost(notes):
    return bool(re.search(r'higher chances? of (being|the other \d+ being) Epic|chance to obtain Epic', notes))


def skill_of(typ, start):
    if typ == 'SKILL':
        return {'table': '50106', 'slots': 'first'}
    if typ in ('SN', 'SEVEN') and start >= SKILL72415_FROM:
        return {'table': '72415', 'slots': 'all'}
    return None


# ---------- medaglie: origine, attributo, alias dei nomi di vetrina e garanzia ----------
FF_KH = re.compile(r'kingdom hearts|final fantasy|the world ends with you', re.I)


def medal_origin(page):
    """'disney' se la pagina della medaglia ha una categoria «<film Disney> Characters», 'ffkh' se solo
    KINGDOM HEARTS / Final Fantasy, '' se nessuna (filtri «Disney-based» / «Final Fantasy- and Kingdom Hearts-based»)"""
    cats = re.findall(r'\[\[Category:([^\]|]+?) Characters\s*(?:\|[^\]]*)?\]\]', page)
    if any(not FF_KH.search(c) for c in cats):
        return 'disney'
    return 'ffkh' if cats else ''


FAMILIES = [('sn++ - ', '2019-11-08'), ('supernova+ - ', '2019-09-01'), ('sn+ - ', '2019-09-01'),
            ('supernova - ', '2018-10-05'), ('sn - ', '2018-10-05'), ('prime - ', '2018-06-01'), ('', '')]
FAMILY_RE = re.compile(r'^(sn\+\+|supernova\+|sn\+|supernova|sn|prime) - ')
NON_MEDAL = re.compile(r'\b(boost|atk|def|attack|defense|lux\+*|gauge|triple threat|second chance|poison\+?|paralysis\+?|'
                       r'sleep\+?|prize\+?|coins?|gems?|tickets?|jewels?|avatars?|trait medal|imitation|following|skills?|'
                       r'tier)\b|^with |:|^blue fairy \[|^dual meow wow \[', re.I)  # ultime due: medaglie oggetto (type 6)


def family_of(n):
    m = FAMILY_RE.match(n)
    p = m.group(0) if m else ''
    return p, next(d for f, d in FAMILIES if f == p)


def clean_name(n):
    n = re.sub(r'^\d★\s*|^boosted (?:versions? of )?', '', n)
    n = re.sub(r'\((ex\+?|\+)\)', r'[\1]', n)
    n = re.sub(r'^[\[\]\s]+', '', n)
    if n.endswith(']') and '[' not in n:
        n = n[:-1]
    n = re.sub(r'^prime (?!- )', 'prime - ', n.strip())
    return n


# refusi della wiki nei nomi delle medaglie boosted (I-150): la medaglia vera e' una sola
WIKI_TYPOS = {'launchpad mcquakc': 'launchpad mcquack', 'webby vanderquakc': 'webby vanderquack',
              'axel [ex]': 'axel art [ex]',  # B0238: «{{EX|Axel Art}}» in garanzia, «Axel [EX]» nella frase boosted
              'kairi [ex+]': 'kh ii kairi [ex+]'}  # B0362/B0363: «{{b|Kairi|EX+}}», il nome della medaglia e' KH II Kairi


def resolve_name(name, start, medals, rd):
    """chiave di `medals` per un nome di vetrina/garanzia, o None. Ordine: nome esatto, nome ripulito
    («7★ », «boosted », «(EX+)»), redirect della wiki, poi le varianti SN/SN+/SN++/Supernova dello stesso
    nome: la famiglia piu' alta gia' uscita all'inizio del banner (es. {{KA|20}} -> SN++ dal 08/11/2019)."""
    name = WIKI_TYPOS.get(name, name)
    for n in _dedup([name, clean_name(name)]):
        for _ in range(3):
            if n in medals:
                return n
            n = rd.get(n)
            if not n:
                break
    bare = FAMILY_RE.sub('', clean_name(name))
    cands = []
    for f, _ in FAMILIES:
        k = f + bare
        k = k if k in medals else rd.get(k)
        if k in medals and k not in cands:
            cands.append(k)
    if not cands:  # «Key Art #16» -> «key art #16 [ex+]», «Zack» -> «zack a»: solo se l'alternativa e' unica
        alt = [bare + s for s in (' a', ' [ex]', ' [ex+]', ' [+]') if bare + s in medals]
        if len(alt) > 1 and bare + ' a' in alt:  # «Xion» (8.2, 2016) = «Xion A»: le B/[EX+] escono dopo
            return bare + ' a'
        return alt[0] if len(alt) == 1 else None
    ok =[k for k in cands if medals[k]['date'] <= start]
    if not ok and bare == clean_name(name) and medals.get(bare + ' a', {}).get('date', '9999') <= start:
        return bare + ' a'  # «Axel» in 6.2 (2016) e B0083 = «Axel A», non «SN++ - Axel» (19/10/2020) non ancora uscita
    return ok[0] if ok else min(cands, key=lambda k: medals[k]['date'])


def non_medal(name, material_names):
    """nomi delle liste che non sono medaglie: abilita', gemme, monete, avatar, Trait/Imitation, residui del testo"""
    return name in material_names or bool(NON_MEDAL.search(name))


def extend_medals(medals, M, rd, debut):
    """aggiunge a `medals` le righe di medal.json (type 1, validPack != 1) che la wiki non elenca in NASets
    (varianti SN+/Supernova+/SN++ come «SN+ - KH III Demyx», redirect nella wiki). Data = primo banner che
    le nomina (`debut`), altrimenti l'uscita della famiglia (SN 05/10/2018, SN+ 01/09/2019, SN++ 08/11/2019),
    mai prima della medaglia base; cls/class2/att/origin dalla base. Senza base e senza debutto: saltate
    (nessuna data inventata). Senza base ma nominate: cls 'LIST' (solo dalle liste esplicite).
    ids = [medalId, rarita', data, Tier (guiltValue)]; le righe boosted restano fuori."""
    rows = collections.defaultdict(list)
    for r in M:
        if r['type'] == 1 and r.get('validPack') != 1 and not is_boosted(r):
            rows[norm(r['name'])].append(r)
    added = 0
    for n, rs in sorted(rows.items()):
        if n in medals or not re.search(r'[a-z0-9]', n):
            continue
        fam, epoch = family_of(n)
        bare = n[len(fam):]
        base = rd.get(n) if rd.get(n) in medals else None
        own = medals.get(bare + ' a', {})
        if not fam and not base and {r['medalId'] for r in rs} <= {i[0] for i in own.get('ids', [])}:
            continue  # «Axel», «Roxas», «Vexen» del master = righe di «X A»: niente alias verso un'altra famiglia (SN++)
        if not base:
            base = next((f + bare for f, _ in reversed(FAMILIES) if f + bare in medals and f + bare != n), None)
        b = medals.get(base)
        if n in debut:
            date = max(debut[n], b['date']) if b else debut[n]
        elif b:
            date = max(epoch or b['date'], b['date'])
        else:
            continue
        medals[n] = {'date': date, 'cls': b['cls'] if b else 'LIST', 'class2': b['class2'] if b else 'Attack',
                     'att': b['att'] if b else '', 'origin': b['origin'] if b else '',
                     'ids': [[r['medalId'], r['rare'], date, r.get('guiltValue') or 0] for r in sorted(rs, key=lambda r: r['medalId'])],
                     'alias': base}
        added += 1
    return added


TRAIT_MEDAL_DATE = '2018-03-13'  # notice 38128: introduzione delle Trait Medal


def add_trait_medals(medals, entries):
    """voci «trait medal #N» per le Trait Medal del master (server/trait_medals.json, id 9000000 + N, 6★, I-084 parte
    B): cls 'LIST', fuori dai pool standard, entrano solo dove un banner le nomina (slot Trait, liste, pity)"""
    for e in entries:
        medals['trait medal #%d' % e['n']] = {'date': TRAIT_MEDAL_DATE, 'cls': 'LIST', 'class2': 'Trait', 'att': '',
                                              'origin': '', 'ids': [[9000000 + e['n'], 6, TRAIT_MEDAL_DATE, 0]]}
    return len(entries)


def clamp_plus_dates(medals, first):
    """7★ delle voci «X [+]» mai prima del lancio delle 7★ (firstRarity[7], 25/05/2018): la rare_date della wiki
    (14/05/2018) precede la 6★ [+] di Vexen (13/04) e Lexaeus (13/05/2018). Le altre 7★ del 14/05/2018 restano
    (il pool le filtra comunque con firstRarity). Restituisce il numero di date spostate."""
    moved = 0
    for k, v in medals.items():
        if not k.endswith(' [+]'):
            continue
        for i in v['ids']:
            f = first.get(str(i[1]))
            if f and i[2] < f:
                i[2] = f
                moved += 1
    return moved


def apply_medal_dates(medals, overrides, starts):
    """Data d'uscita EN di una medaglia da banner_overrides.tsv (campo medal_date, valore = nome della medaglia,
    row_id = banner del notice che la introduce): voce e varianti prendono l'inizio di quel banner (SN++ - Axel B e
    SN++ - Roxas: New Year Deal B0774 del 01/01/2021, notice 72833; la wiki dice 01/12/2020). Restituisce il numero
    di voci cambiate."""
    n = 0
    for o in overrides:
        v = medals.get(norm(o.get('value') or '')) if o.get('field') == 'medal_date' else None
        d = starts.get(o['row_id'])
        if v and d:
            old = v['date']
            v['date'] = d
            for i in v['ids']:
                # solo le varianti uscite con la voce: le stelle venute dopo (7★ del 14/05/2018) restano alla loro data
                # (2c/G5: Terra/Ventus/Aqua, Atlantica, Seifer/Fuu/Rai)
                if i[2] == old or d < i[2] <= old:
                    i[2] = d
            n += 1
    return n


STD_CLS = {'', 'SR', 'L-SR', 'L'}  # = DRAW_CLS
STD_CLASS2 = {'Attack', '', 'Rare', 'Super Rare'}  # 'Rare'/'Super Rare': class2 scritto male nella wiki (vanitas, ...)


def mark_std(medals):
    """medals[n]['std'] = True solo per le medaglie standard dei pool released/inherit (spec 9.3): voce della
    wiki (non alias), non SN/Supernova/SN+/SN++/Prime, cls '', SR o L, class2 Attack o ''. Ogni medalId
    sta in una sola voce std (la prima in ordine di nome)."""
    seen = set()
    for k in sorted(medals):
        v = medals[k]
        ids = {i[0] for i in v['ids']}
        std = ('alias' not in v and not FAMILY_RE.match(k) and not k.startswith('prime - ')
               and v['cls'] in STD_CLS and v['class2'] in STD_CLASS2 and not (ids & seen))
        v['std'] = std
        if std:
            seen |= ids
    return sum(1 for v in medals.values() if v['std'])


def apply_enhance_overrides(enh, ov_row):
    """Override del blocco enhance da banner_overrides.tsv (campo «preset»: «slots=0;dots=max;guilt=max»,
    «star=7;dots=3;guilt=none»): aggiunge la voce preset se non c'e' gia'. Serve quando la frase sta in un
    altro banner (B0306-B0308: «the 7★ Medal you receive ... maximum Special Attack Bonus» e' nel testo di
    B0310, che annuncia i tre deal). Piu' voci separate da « || »; «dots=1-3» = da 1 a 3. Una voce per nome va
    in testa (2c/G9: il server applica la prima voce che corrisponde, e «If you receive the following Medals ...
    3 dots» deve vincere sui 1-3 pallini dello slot Tier, anche per la copia della pity sullo slot 0)."""
    v = (ov_row or {}).get('preset')
    if not v:
        return enh
    for one in v.split(' || '):
        kv = dict(x.split('=', 1) for x in one.split(';') if '=' in x)
        if 'replace' in one.split(';'):  # «replace;slots=1,2;dots=3» (2c/G5, B0082): toglie i preset letti dal testo
            enh['preset'] = []
        if 'pity' in one.split(';'):  # «pity;dots=5» (2c, B0353): solo la copia data dalla pity
            on = {'pity': True}
        elif 'slots' in kv:
            on = {'slots': [int(x) for x in kv['slots'].split(',')]}
        elif 'star' in kv:
            on = {'star': int(kv['star'])}
        else:
            on = {'names': [x.strip() for x in kv.get('names', '').split(',') if x.strip()]}
        dots = kv.get('dots', 'max')
        dots = dots if dots == 'max' else [int(x) for x in dots.split('-')] if '-' in dots else int(dots)
        guilt = 'max' if kv.get('guilt') == 'max' else None
        item = {'on': on, 'dots': dots, 'guilt': guilt}
        if item not in enh['preset']:
            if 'names' in on or 'pity' in on:
                enh['preset'].insert(0, item)
            else:
                enh['preset'].append(item)
    return enh


def apply_slot_override(g, ov_row):
    """2c/G4: riserva di uno slot dal notice (campo «slot» di banner_overrides.tsv), prima della risoluzione dei nomi.
    «0:tier=5-6» -> Tier minimo e massimo dello slot 0 (B0170: «one Tier 5 or Tier 6 Medal»); «0:names=a|b|c» ->
    lo slot 0 diventa una lista di quei nomi (B0154: i 17 «recent Tier 5» del notice 31346; B0046/B0047: le 10
    Organizzazione XIII del notice 20865). Lo slot deve esistere: un override senza bersaglio e' un errore."""
    v = ((ov_row or {}).get('slot') or '').strip()
    if not v:
        return g
    # «...;up» (D5, B0430/B0431 «Two 6 or 7★ Frozen Medals»): lo slot a lista sale di una stella come uno slot normale
    up = v.endswith(';up')
    v = v[:-3] if up else v
    # «new@2x1/5:names=a|b» (2c/G5): riserva a lista nuova dalla posizione 2, 1 medaglia, stella 5 (B0066: «you will
    # be guaranteed at least one of the new Medals», sulla prima posizione 5★: le due 6★ restano casuali)
    # «new@0x1/6:tier=4-» (2c/G9, B0204): riserva Tier nuova, Tier minimo 4 senza massimo
    m = re.fullmatch(r'new@(\d+)x(\d+)/(\d):(names|tier)=(.+)', v)
    if m:
        pos, n = int(m.group(1)), int(m.group(2))
        if any(set(range(pos, pos + n)) & set(range(s['slot'], s['slot'] + max(1, s['count'] or 1))) for s in g['slots']):
            raise SystemExit(f'override slot {v!r}: posizioni gia\' riservate')
        if m.group(4) == 'tier':
            lo, _, hi = m.group(5).partition('-')
            g['slots'].append({'kind': 'tier', 'slot': pos, 'count': n, 'star': int(m.group(3)), 'names': [],
                               'tierMin': int(lo), 'tierMax': int(hi) if hi else None})
        else:
            g['slots'].append({'kind': 'list', 'slot': pos, 'count': n, 'star': int(m.group(3)),
                               'names': [x.strip() for x in m.group(5).split('|') if x.strip()], 'tierMin': None, 'tierMax': None})
        g['slots'].sort(key=lambda s: s['slot'])
        g['slot'] = next((s['slot'] for s in g['slots'] if s['kind'] == 'list'), 0)  # = prima riserva a lista
        return g
    idx, _, spec = v.partition(':')
    key, _, val = spec.partition('=')
    s = next((x for x in g['slots'] if x['slot'] == int(idx)), None)
    if s is None:
        raise SystemExit(f'override slot {v!r}: nessuno slot {idx}')
    if key == 'tier':
        lo, _, hi = val.partition('-')
        s['tierMin'], s['tierMax'] = int(lo), int(hi or lo)
    elif key == 'names':
        s.update(kind='list', names=[x.strip() for x in val.split('|') if x.strip()], tierMin=None, tierMax=None)
    else:
        raise SystemExit(f'override slot {v!r}: atteso tier= o names=')
    if up:
        s['up'] = True
    return g


def apply_boosted_override(enh, ov_row):
    """2c/G4: versione boosted promessa dal notice ma assente dal testo del banner (campo «boosted»:
    «slots=0;str=1000;def=0;chance=small», B0046/B0047 notice 20865: piccola probabilita' di una versione
    piu' rara di una medaglia dell'Organizzazione XIII con 1.000 di forza base in piu'). Aggiunge la voce se non c'e'."""
    v = ((ov_row or {}).get('boosted') or '').strip()
    if not v:
        return enh
    kv = dict(x.split('=', 1) for x in v.split(';') if '=' in x)
    # «names=a|b;...» (2c/G5, B0082: WORLD OF FF Sora +1000 STR e DEF dal notice 24593, frase troncata nel TSV)
    on = ({'slots': [int(x) for x in kv['slots'].split(',')]} if 'slots' in kv
          else {'names': [x.strip() for x in kv['names'].split('|') if x.strip()]})
    item = {'on': on, 'str': int(kv.get('str', 0)),
            'def': int(kv.get('def', 0)), 'chance': kv.get('chance', 'small')}
    if item not in enh['boosted']:
        enh['boosted'].append(item)
    return enh


def apply_pity_label(g, ov_row):
    """I-153: guarantee.pityLabel = categoria dei bersagli della pity (campo «pity_label» di banner_overrides.tsv,
    dal notice del banner o, se il notice non la dice, dai pityNames: la fonte e' nel TSV). La legge
    server/make-banners.js per la striscia di categoria quando la lista dei nomi supera il limite del client;
    None senza override."""
    g['pityLabel'] = ((ov_row or {}).get('pity_label') or '').strip() or None
    return g


def apply_pity_override(g, ov_row):
    """2c, casi singoli: pity scritta solo nel notice o diversa dal testo del banner (campo «pity» di
    banner_overrides.tsv): «5;names=a|b;star=6;slot=2;mode=every». N = estrazioni; names = bersagli (se mancano
    restano quelli letti); star = stella promessa; slot = posizione sostituita (senza: pity_slot); mode=every =
    contatore che non si azzera quando il bersaglio esce da solo (B0584 notice 56838, B0770 «every 10th draw»)."""
    v = ((ov_row or {}).get('pity') or '').strip()
    if not v:
        return g
    n, *rest = v.split(';')
    kv = dict(x.split('=', 1) for x in rest if '=' in x)
    g['pity'] = int(n)
    if 'names' in kv:
        g['pityNames'] = [x.strip() for x in kv['names'].split('|') if x.strip()]
    if 'star' in kv:
        g['_pityStarWritten'] = int(kv['star'])
    if 'slot' in kv:
        g['_pitySlotWritten'] = int(kv['slot'])
    if kv.get('mode') == 'every':
        g['pityMode'] = 'every'
    return g


def apply_max_skill_override(enh, ov_row, skill_rows):
    """2c/G2: abilita' al massimo promesse solo dal notice (campo «max_skill»: «pity;skills=a|b|c», B0435
    notice 48299: il 7★ Prime - Chernabog garantito arriva con una delle abilita' elencate al
    livello massimo). Selettore come i preset (pity, slots=, names=); le abilita' assenti da skill.json -> notReproduced."""
    v = ((ov_row or {}).get('max_skill') or '').strip()
    if not v:
        return enh
    parts = v.split(';')
    kv = dict(x.split('=', 1) for x in parts if '=' in x)
    on = ({'pity': True} if 'pity' in parts else {'slots': [int(x) for x in kv['slots'].split(',')]} if 'slots' in kv
          else {'names': [x.strip() for x in kv['names'].split('|') if x.strip()]})
    known = {norm(r['name']) for r in skill_rows}
    skills = [norm(x) for x in kv['skills'].split('|') if x.strip()]
    have = [x for x in skills if x in known]
    if len(have) < len(skills):
        enh['notReproduced'] = sorted(set(enh['notReproduced']) | {'skill'})
    item = {'on': on, 'skills': have}
    if have and item not in enh['maxSkill']:
        enh['maxSkill'].insert(0, item)
    return enh


# ---------- righe incomplete: fratello di serie (porta di incomplete.py) e override ----------
def sib_key(n):
    return re.sub(r'\s+', ' ', re.sub(r'\(\d+/\d+\)|returns!?|is back!?|limited time:|!|\(ex\+?\)|\[ex\+?\]', '', n.lower())).strip()


def missing(r):
    return not r['draw_size'] or not r['price']


def complete_row(row, sib):
    """copia dal fratello solo prezzo, dimensione e rarity_mix mancanti (non la valuta ne' «VIP only»)"""
    r = dict(row)
    for f in ('price', 'draw_size', 'rarity_mix'):
        if not r[f]:
            r[f] = re.sub(r'\s*VIP [Oo]nly\s*', ' ', sib[f]).strip() if f == 'price' else sib[f]
    return r


def sibling_of(x, rows, types):
    """riga completa della stessa serie piu' vicina per data (o la Free Deal per le «Monday Only Free Deal»)"""
    sib = [y for y in rows if y is not x and not missing(y) and not types[y['row_id']].startswith('X_')
           and (sib_key(y['name']) == sib_key(x['name'])
                or (types[x['row_id']] == types[y['row_id']] == 'FREE' and 'monday' in x['name'].lower() and y['name'] == 'Free Deal'))]
    sib.sort(key=lambda y: abs((D(y['start_pt']) - D(x['start_pt'])).days) if y['start_pt'] and x['start_pt'] else 9999)
    return sib[0] if sib else None


def image_of(r, rows):
    """(file, rowId della riga da cui viene): la propria, altrimenti la piu' vicina della stessa serie."""
    if r['image_file']:
        return r['image_file'].split(' ')[0], r['row_id']
    def key(n):  # «Supernova+ - Aced Deal Returns!» = «Supernova+ - Aced»
        return re.sub(r' deal$', '', series_key(n))
    k = key(r['name'])
    sib = [y for y in rows if y['image_file'] and key(y['name']) == k]
    sib.sort(key=lambda y: (abs((D(y['start_pt']) - D(r['start_pt'])).days), y['row_id']))
    return (sib[0]['image_file'].split(' ')[0], sib[0]['row_id']) if sib else (None, None)


def read_tsv(path):
    with open(path, encoding='utf-8', newline='') as f:
        return list(csv.DictReader(f, delimiter='\t'))


def default_inputs():
    p = {k: os.environ.get(ENV[k], v) if k in ENV else v for k, v in DEFAULTS.items()}

    def load(path):
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    story = [[int(t['first_quest']), int(t['last_quest']), t['ww_release_date']] for t in read_tsv(p['story'])]
    return {'wiki': load(p['wiki']), 'rows': read_tsv(p['banners']), 'story': story,
            'notices': {x['id']: x for x in load(p['notices'])}, 'medals': load(p['medals']),
            'materials': load(p['materials']),
            'skills': load(p['skills']) if os.path.exists(p['skills']) else [],
            'overrides': read_tsv(p['overrides']) if os.path.exists(p['overrides']) else [], 'out': p['out']}


def build_catalog(inputs):
    import banner_guarantees as bg  # qui dentro: banner_guarantees importa questo modulo (import circolare)
    wiki, rows, story, notices = inputs['wiki'], inputs['rows'], inputs['story'], inputs['notices']
    ORIG_BOOSTED.clear()
    ORIG_BOOSTED.update(orig_boosted_ids(inputs['medals']))
    M = [r for r in inputs['medals'] if not is_boosted(r)]  # le boosted (Task 3) non hanno voce nel catalogo
    MAT = inputs['materials']
    tier = {r['medalId']: r.get('guiltValue') or 0 for r in M}  # Tier = guiltValue (audit delle garanzie, sezione 5)
    S = bsrc.english_subsets(wiki)
    rel = bsrc.medal_release(S, wiki, M, rows)
    wsx = shop_index(bsrc.wiki_shop_rows(wiki))

    # sotto-set: 1.1 = medaglie del set 1 fuori dagli altri sotto-set 1.x e dalle extra del set 1
    sub_members = {s['id']: [norm(n) for n in s['members']] for s in S['subsets']}
    sub_date = {s['id']: (s['date'] or FIRST_DAY) for s in S['subsets']}
    other1 = set(n for k, v in sub_members.items() if k.startswith('1.') for n in v) | \
        set(norm(n) for e in S['extras'] if e['set'] == 1 for n in e['members'])
    sub_members['1.1'] = [n for n in (norm(e['name']) for e in S['nasets']['1']['medals']) if n not in other1]
    sub_date['1.1'] = FIRST_DAY

    medals = {}
    for o in rel:
        ids = []
        for (mid, rare, typ, vp, dl) in o['rows']:
            if typ != 1 or vp == 1 or mid in ORIG_BOOSTED:
                continue
            rd = o['rare_date'].get(rare) or o['rare_date'].get(str(rare)) or o['date']
            ids.append([mid, rare, max(rd, o['date']), tier.get(mid, 0)])
        medals[norm(o['name'])] = {'date': o['date'], 'cls': o['cls'], 'class2': o['class2'], 'ids': ids}
    # attributo (att) e origine (origin) per i filtri dei set: InfoMedal e categorie della pagina della medaglia
    info = {}
    for f in bsrc.infomedals(wiki):
        if f.get('name') and not f['_page'].startswith('Template:'):
            info.setdefault(norm(f['name']), f)
    pages = {norm(k): v for k, v in wiki.items() if '{{InfoMedal' in v}
    attnum = collections.Counter()
    for r in M:
        f = info.get(norm(r['name']))
        if f and f.get('att'):
            attnum[(r['attribute'], f['att'].lower())] += 1
    att_of = {}
    for (a, v), _ in attnum.most_common():
        att_of.setdefault(a, v)
    by_name = collections.defaultdict(list)
    for r in M:
        by_name[norm(r['name'])].append(r)
    for k, v in medals.items():
        f = info.get(k)
        v['att'] = ((f or {}).get('att') or '').lower() or next((att_of.get(r['attribute'], '') for r in by_name.get(k, [])), '')
        v['origin'] = medal_origin(wiki.get(f['_page'], '') if f else pages.get(k, ''))
    rd = bsrc.redirects(wiki)

    notes_of = {r['row_id']: full_notes(r, wsx) for r in rows}
    types = {r['row_id']: classify(r, notes_of[r['row_id']][0]) for r in rows}
    # 2c: righe doppie (campo «exclude»: B0507 = B0500, stesso notice 52345 e stesso periodo)
    excl = {o['row_id'] for o in inputs['overrides'] if o.get('field') == 'exclude'}
    incl = [r for r in rows if not types[r['row_id']].startswith('X_') and r['row_id'] not in excl]
    twins = vip_twins(incl)
    ov = collections.defaultdict(dict)
    ov_src = collections.defaultdict(dict)
    labels = collections.defaultdict(dict)  # pity_label (I-153): fuori da `ov`, che si fonde nella riga del TSV
    for o in inputs['overrides']:
        if o.get('field') == 'pity_label':
            labels[o['row_id']]['pity_label'] = o['value']
        elif o.get('field') in ('price', 'draw_size', 'rarity_mix', 'start_pt', 'end_pt', 'preset', 'slot', 'boosted', 'bonus', 'day_limit', 'total_limit', 'featured', 'pity', 'max_skill', 'not_reproduced'):
            ov[o['row_id']][o['field']] = o['value']
            ov_src[o['row_id']][o['field']] = o.get('source') or 'override'

    out, docs, skipped = [], [], []
    for r0 in sorted(incl, key=lambda r: (r['start_pt'] or '9999', r['row_id'])):
        rid = r0['row_id']
        notes, nsrc = notes_of[rid]
        typ = types[rid]
        r = dict(r0)
        completed = None
        if missing(r0):
            s = sibling_of(r0, incl, types)
            if s:
                r = complete_row(r0, s)
                completed = s['row_id']
        if rid in ov:
            r.update(ov[rid])
            if set(ov[rid]) & {'price', 'draw_size', 'rarity_mix'}:
                completed = 'override'
        flags = []
        if r['status'].startswith('permanent'):
            flags.append('PERMANENT')
        # 2c/G8: limite giornaliero che sta solo nel notice (campo day_limit di banner_overrides.tsv)
        day_ov = int((ov.get(rid) or {}).get('day_limit') or 0)
        if day_ov or day_limit(notes, typ) or re.search(r'once (per|a) day', notes, re.I):
            flags.append('DAY_LIMITED')
        if is_vip(r):
            flags.append('VIP')
        if r['currency'].startswith('Free, Jewels') or re.match(r'.*1st: Free', r['price']):
            flags.append('FIRST_FREE')
        if r['seasonal']:
            flags.append('SEASONAL')
        if r['event_tie_in']:
            flags.append('EVENT')
        if missing(r0):
            flags.append('INCOMPLETE')
        pay, cur = currency_of(r, typ)
        prices = parse_price(r['price'])
        lot = int(r['draw_size'][1:]) if re.fullmatch(r'x\d+', r['draw_size']) else None
        end, end_src = end_of(r, typ, incl, notices)
        # date lette da un notice (override start_pt/end_pt): la fine e' originale (non ricostruita, gacha.js);
        # la fonte resta in datesSource per i Details
        dates_src = '; '.join(_dedup(ov_src[rid][f] for f in ('start_pt', 'end_pt') if f in ov.get(rid, {}))) or None
        if 'end_pt' in ov.get(rid, {}):
            end_src = 'original'
        refs = setrefs(notes)
        pool = pool_recipe(r, notes, typ, docs, sub_members, rel, M)
        # 2c/G9: vetrina che sta solo nel notice (campo «featured», nomi separati da |; B0204 Illustrated Kairi [EX])
        for n in [x.strip() for x in ((ov.get(rid) or {}).get('featured') or '').split('|') if x.strip()]:
            if n not in pool['featured']:
                pool['featured'].append(n)
        if refs:
            docs.append((r['start_pt'] or FIRST_DAY, pool['sets'], pool['names'], typ))
        # riserve degli slot, pity e Tier (sotto-progetto 2b): guarantee.list/count/slot = prima riserva a lista
        g = bg.guarantee_v3(r, notes, rarity_mix(r['rarity_mix']), pool['featured'], M, rares_of=lambda n: None, keep_prefix=True)
        if g['every'] and not g['list']:  # l'elenco sta solo nel testo del notice (B0742, B0765)
            g['list'] = notice_list(r, notices)
            lst = next((s for s in g['slots'] if s['kind'] == 'list' and not s['names']), None)
            if lst:
                lst['names'] = list(g['list'])
        apply_pity_label(g, labels.get(rid))
        apply_slot_override(g, ov.get(rid))
        apply_pity_override(g, ov.get(rid))
        # potenziamenti per banner (guilt, pallini, boosted, abilita' al massimo): nomi risolti piu' sotto
        enh = bg.enhance_of(bg.enhance_text(notes, r['guarantees']), g['slots'], pool['featured'], M, inputs.get('skills') or [],
                            mix=rarity_mix(r['rarity_mix']))
        apply_enhance_overrides(enh, ov.get(rid))
        apply_boosted_override(enh, ov.get(rid))
        apply_max_skill_override(enh, ov.get(rid), inputs.get('skills') or [])
        # promesse non riproducibili scritte solo nel notice (campo «not_reproduced», chiavi separate da virgola: B0126 epic)
        nr_ov = [x.strip() for x in ((ov.get(rid) or {}).get('not_reproduced') or '').split(',') if x.strip()]
        if nr_ov:
            enh['notReproduced'] = sorted(set(enh['notReproduced']) | set(nr_ov))
        total = int((ov.get(rid) or {}).get('total_limit') or 0) or total_limit(notes)
        vip_free = typ == 'FREE' and 'VIP' in flags
        day = free_day_limit(typ, prices, day_ov or day_limit(notes, typ), total, vip_free)
        found, sk = _bonus(notes, M, MAT)
        scr, scr_miss = scrooge_bonus(notes, M, inputs.get('skills') or [])
        if scr:
            found.append(scr)
            sk = [x for x in sk if 'scrooge' not in x]  # la frase generica non trovava «Scrooge Medal with the X Skill»
        elif scr_miss:
            sk.append(scr_miss)
        # 2c/G7: regalo che sta solo nel notice (campo «bonus» = «tipo,id,numero», B0212 Magic Broom, notice 35138)
        for v in [x for x in ((ov.get(rid) or {}).get('bonus') or '').split(';') if x.strip()]:
            item = [int(x) for x in v.split(',')]
            if item not in found:
                found.append(item)
        skipped += [(rid, x) for x in sk]
        if rid in twins:
            only = 'VIP_TWIN'
        elif pay in (4, 5, 6):
            only = 'PVP_TICKETS'
        elif pay == 9:
            only = 'DRAW_POINTS'
        elif unusable(prices, lot, rarity_mix(r['rarity_mix'])):
            only = 'INCOMPLETE'
        else:
            only = None
        img, img_from = image_of(r0, incl)
        out.append({
            'rowId': rid, 'drawMedalTypeId': 10000 + int(rid[1:]), 'name': r['name'], 'type': typ, 'flags': flags,
            'start': r['start_pt'], 'end': end, 'endSource': end_src, 'datesSource': dates_src,
            'unlockQuest': unlock_quest(r['start_pt'], story), 'payType': pay, 'currency': cur,
            'prices': prices, 'lotCount': lot, 'rarityMix': rarity_mix(r['rarity_mix']), 'epicBoost': epic_boost(notes),
            'dayLimit': day, 'totalLimit': total, 'vipFree': vip_free,
            'pool': pool, 'guarantee': g, 'enhance': enh, 'skill': skill_of(typ, r['start_pt']), 'bonus': found,
            'catalogOnly': only, 'completedFrom': completed, 'image': img, 'imageFrom': img_from,
            'notes': notes, 'guaranteesText': r['guarantees'], 'notesSource': nsrc,
        })
    # nomi di vetrina e garanzia -> chiavi di `medals` (alias, redirect, famiglie SN)
    debut = {}
    for b in sorted(out, key=lambda b: b['start'] or '9999'):
        for n in guarantee_names(b['guarantee']) + b['pool']['featured']:
            debut.setdefault(clean_name(n), b['start'] or FIRST_DAY)
    apply_medal_dates(medals, inputs['overrides'], {b['rowId']: b['start'] for b in out})
    added = extend_medals(medals, M, rd, debut)
    add_trait_medals(medals, json.load(open(bg.TRAIT_MEDALS, encoding='utf8')) if os.path.exists(bg.TRAIT_MEDALS) else [])
    mark_std(medals)
    # nomi dei sotto-set -> chiavi di `medals` alla data del sotto-set ({{KA|19}} 31.5a -> supernova - key art #19,
    # «Xion» 8.2 -> xion a, «SN - KH III Xion» -> redirect sn - kh iii xion a); gli irrisolti restano come sono
    for k, v in sub_members.items():
        sub_members[k] = _dedup(resolve_name(n, sub_date.get(k, FIRST_DAY), medals, rd) or n for n in v)
    mats = {norm(x['name']) for x in MAT}
    unresolved = collections.Counter()
    for b in out:
        st = b['start'] or FIRST_DAY
        # banner col nome di una medaglia («Supernova - Key Art #19», «SN++ - MoM Sora Deal Returns!»): e' la vetrina
        own = resolve_name(re.sub(r'\s+deal$', '', series_key(b['name'])), st, medals, rd)
        if own:
            b['pool']['featured'] = _dedup([own] + b['pool']['featured'])
        g = b['guarantee']
        targets = [x['on'] for k in ('preset', 'boosted', 'maxSkill') for x in b['enhance'][k] if 'names' in x['on']]
        for lst, key, count in ([(g, 'pityNames', True), (b['pool'], 'featured', True), (b['pool'], 'names', False)]
                                + [(s, 'names', 'prefix' not in s) for s in g['slots']] + [(on, 'names', False) for on in targets]):
            res = []
            for n in lst[key]:
                k = resolve_name(n, st, medals, rd)
                res.append(k or n)
                if not k and count and not b['catalogOnly']:
                    unresolved['non medaglia' if non_medal(n, mats) else 'medaglia probabile'] += 1
            lst[key] = _dedup(k for k in res if k in medals or 'prefix' not in lst)  # nomi del master: solo quelli del catalogo
        # Trait Medal fra i bersagli («a boosted Trait Medal #85», B0464): nessuna riga boosted ne' pallini da dare
        for on in targets:
            on['names'] = [n for n in on['names'] if not n.startswith('trait medal')]
        for k in ('preset', 'boosted', 'maxSkill'):
            b['enhance'][k] = [x for x in b['enhance'][k] if 'names' not in x['on'] or x['on']['names']]
        first = next((s for s in g['slots'] if s['kind'] == 'list'), None)
        g['list'] = list(first['names']) if first else _dedup(resolve_name(n, st, medals, rd) or n for n in g['list'])
    aligned = align_debut_dates(out, medals, first_rarity(rows))
    clamp_plus_dates(medals, first_rarity(rows))
    # decisione 1 sui nomi risolti (redirect, alias, famiglie SN: i nomi del master non bastano, «Illustrated Sora A»
    # 6★ e' «Illustrated Sora»), dopo le date del debutto, che contano tutti i nomi scritti; poi lista e pitySlot
    rares = {k: {i[1] for i in v['ids']} for k, v in medals.items()}
    first_r = first_rarity(rows)
    for b in out:
        g = b['guarantee']
        for s in g['slots']:
            if 'prefix' in s:  # «SN+ or SN++», «KH III Medal+»: solo i nomi del pool del banner alla sua data
                pool = pool_names_at(b, medals, sub_members, sub_date, first_r)
                s['names'] = [n for n in s['names'] if n in pool]
            s.pop('prefix', None)
            if s['kind'] == 'list':  # con «up» restano anche i nomi che hanno solo la stella sopra (Supernova - Elsa 7★)
                keep = bg.star_filter(s['names'], s['star'], rares.get)
                s['names'] = [n for n in s['names'] if n in keep or (s.get('up') and s['star'] + 1 in (rares.get(n) or ()))]
        first = next((s for s in g['slots'] if s['kind'] == 'list'), None)
        if first:
            g['list'] = list(first['names'])
        written = g.pop('_pityStarWritten', None)
        slot_w = g.pop('_pitySlotWritten', None)
        if g['pity']:  # senza stella scritta, pityStar = stella dello slot finale (dopo la decisione 1)
            g['pitySlot'], g['pityStar'] = bg.pity_slot(g['pityNames'], written, g['slots'], b['rarityMix'])
            if slot_w is not None:
                g['pitySlot'] = slot_w
        if g['pity'] and not any(n in medals for n in g['pityNames']):
            # bersaglio fuori dal catalogo: medaglia di supporto del master -> regalo nel Present Box (nessuno slot
            # sostituito, D11 B0472/B0481); altrimenti (Trait Medal senza riga, nomi del notice) pity non riprodotta
            gift = bg.pity_gift(b['notes'] + ' | ' + (b['guaranteesText'] or ''), inputs['medals'])
            g['pitySlot'] = g['pityStar'] = None
            nr = set(b['enhance']['notReproduced'])
            if gift:
                g['pityGift'] = gift
            else:
                g['pity'] = None
                nr.add('pity')
                if any(n.startswith('trait medal') for n in g['pityNames']):
                    nr.add('trait')
            b['enhance']['notReproduced'] = sorted(nr)
    out.sort(key=lambda b: b['rowId'])
    return {
        'version': 3,
        'firstRarity': first_rarity(rows),
        'story': story,
        'subsets': {k: {'date': sub_date.get(k, FIRST_DAY), 'names': v} for k, v in sorted(sub_members.items())},
        'medals': medals,
        'banners': out,
        '_skippedBonus': skipped,
        '_stats': {'medaglie aggiunte da medal.json': added, 'irrisolti (vetrina+garanzie, banner attivi)': dict(unresolved),
                   'varianti di vetrina/lista alla data del debutto': aligned},
    }


def main():
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except AttributeError:
        pass
    inp = default_inputs()
    cat = build_catalog(inp)
    skipped = cat.pop('_skippedBonus')
    stats = cat.pop('_stats')
    bs = cat['banners']
    os.makedirs(os.path.dirname(inp['out']), exist_ok=True)
    with open(inp['out'], 'w', encoding='utf-8') as f:
        json.dump(cat, f, ensure_ascii=False, separators=(',', ':'))
    C = collections.Counter
    print('banner', len(bs))
    print('tipi', dict(C(b['type'] for b in bs).most_common()))
    print('catalogOnly', dict(C(b['catalogOnly'] for b in bs if b['catalogOnly']).most_common()))
    print('sbloccati a 525', sum(1 for b in bs if b['unlockQuest'] <= 525))
    print('pool', dict(C(b['pool']['mode'] for b in bs).most_common()))
    print('completate', sum(1 for b in bs if b['completedFrom']), 'fine ricostruita', sum(1 for b in bs if b['endSource'] != 'original'))
    print('bonus', sum(len(b['bonus']) for b in bs), 'bonus saltati', len(skipped))
    print('medaglie', len(cat['medals']), 'std', sum(1 for v in cat['medals'].values() if v['std']), stats)
    live = [b for b in bs if not b['catalogOnly']]
    for lab, xs in (('estraibili', live), ('tutti', bs)):
        gs = [b['guarantee'] for b in xs]
        print(f'garanzie ({lab})', 'con slots', sum(1 for g in gs if g['slots']),
              'con Tier', sum(1 for g in gs if any(s['kind'] == 'tier' for s in g['slots'])),
              'riserve', dict(C(s['kind'] for g in gs for s in g['slots'])),
              'pity per stella', dict(C(g['pityStar'] for g in gs if g['pity'])),
              'conflitti', sum(1 for g in gs if any(s.get('conflict') for s in g['slots'])),
              'override', sum(1 for g in gs if g['source']))
        es = [b['enhance'] for b in xs]
        skill_b = [b for b in xs if re.search(r'[Ss]kills? at max level', b['notes'] + ' ' + (b['guaranteesText'] or ''))]
        full = sum(1 for b in skill_b if b['enhance']['maxSkill'] and 'skill' not in b['enhance']['notReproduced'])
        part = sum(1 for b in skill_b if b['enhance']['maxSkill'] and 'skill' in b['enhance']['notReproduced'])
        print(f'potenziamenti ({lab})', 'con preset', sum(1 for e in es if e['preset']),
              'con boosted', sum(1 for e in es if e['boosted']),
              'boosted per chance', dict(C(x['chance'] for e in es for x in e['boosted'])),
              'maxSkill', len(skill_b), 'coperti del tutto', full, 'in parte', part, 'nessuno', len(skill_b) - full - part,
              'con pityGift', sum(1 for g in gs if g['pityGift']),
              'notReproduced', dict(C(k for e in es for k in e['notReproduced']).most_common()))
    for lab, (cat_p, master_p) in boost_pairs(cat['medals'], inp['medals'], bs).items():
        print(f'coppie boosted (medaglia, str, def) {lab}: catalogo {len(cat_p)} medal.json {len(master_p)}')
    print('scritto', inp['out'], os.path.getsize(inp['out']), 'byte')


def _tier_ok(on, rare, tier, name):
    return ((on.get('star') is None or rare == on['star']) and tier >= on['tierMin']
            and (on.get('tierMax') is None or tier <= on['tierMax']) and not (on.get('excludePrime') and name.startswith('prime - ')))


def boost_pairs(medals, medal_rows, banners):
    """coppie distinte (medalId, str, def) che le voci boosted implicano (righe da creare nel Task 3):
    {'per Tier': (catalogo, medal.json), 'per nome': (...)}. Catalogo: varianti in `medals` uscite entro la fine
    del banner; medal.json: righe d'attacco non boosted, senza date (per Tier: rare, guiltValue, Prime per nome)."""
    rows = [r for r in medal_rows if r.get('type', 1) == 1 and not is_boosted(r)]
    out = {'per Tier': (set(), set()), 'per nome': (set(), set())}
    for b in banners:
        at = b['end'] or b['start'] or '9999'
        for x in b['enhance']['boosted']:
            on, sd = x['on'], (x['str'], x['def'])
            if 'tierMin' in on:
                cp, mp = out['per Tier']
                cp.update((i[0],) + sd for n, v in medals.items() for i in v['ids'] if i[2] <= at and _tier_ok(on, i[1], i[3], n))
                mp.update((r['medalId'],) + sd for r in rows if _tier_ok(on, r['rare'], r.get('guiltValue') or 0, norm(r['name'])))
            elif 'names' in on:
                cp, mp = out['per nome']
                names = set(on['names'])
                cp.update((i[0],) + sd for n in names for i in medals.get(n, {}).get('ids', []))
                mp.update((r['medalId'],) + sd for r in rows if norm(r['name']) in names)
    return out


if __name__ == '__main__':
    main()
