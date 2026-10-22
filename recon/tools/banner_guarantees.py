"""Riserve degli slot, pity e Tier dei banner originali (sotto-progetto 2b, spec 2026-10-17-shop-garanzie-2b-design.md 4.1).

Legge le frasi di garanzia delle note («Guarantees one Tier 4 or lower 7★ Medal.», «Guarantees one of the following
Medals: ...», «Guarantees one 6★ Prime - KH Cloud.», «Guarantees one Trait Medal #48.», «If bought 5 times, at least
one 7★ HD Axel is guaranteed.») e scrive il blocco `guarantee` del catalogo v3:

    slots[]   riserve in ordine di testo {kind, slot, count, star, names, tierMin, tierMax} (+ conflict se True)
    pity, pityNames, pityStar, pitySlot, pityGift, erratum, source
    list, count, slot   = prima riserva a lista (compatibilita' col sotto-progetto 2), every come prima

e il blocco `enhance` (enhance_of: guilt e pallini preimpostati, boosted, abilita' al livello massimo, notReproduced)
con pity_gift (pity su una medaglia di supporto del master -> regalo nel Present Box).

Regole dall'audit delle garanzie del 17-10 (tmp/sp2/audit-guarantees.md, sezione 4) e decisioni dell'utente
(tmp/sp2b/decisioni.md): 1 (liste sugli slot 6★ solo coi nomi con variante 6★), 2 (B0733 due liste),
3 («every Nth draw» resta pity: nessun pityMode), 4 (B0419/B0421 corretti, errore nei Details), 5 (pity «one 6★ X»
col 7★ in cima: primo 6★, altrimenti primo 5★). Usato da make_banner_catalog.build_catalog.
"""
import collections
import copy
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import banner_sources as bsrc  # noqa: E402
import make_banner_catalog as mbc  # noqa: E402

NUMS = {**mbc.NUM, 'oe': 1}  # «Guarantees oe of the following» (B0695, refuso della wiki)
NUMW = '|'.join(sorted(NUMS, key=len, reverse=True)) + r'|\d+'


# ---------- testo ----------
def clean_markup(text):
    """markup della wiki -> testo: {{EX|X}} -> «X [EX]», {{b|X|Y}} -> «X [Y]», {{KA|n}} -> «Key Art #n»,
    {{n|Trait Medal|48}} -> «Trait Medal #48», [[X]] / [[X|Y]] -> «X» / «Y»; via le <ref> e il grassetto"""
    t = re.sub(r'<ref[^>/]*>.*?</ref>|<ref[^>]*/>', '', text.replace("'''", ''), flags=re.S)
    t = re.sub(r'(\]\]|\}\})[ \t]+(?=\[\[|\{\{)', r'\1, ', t)  # «[[A]] [[B]]» senza virgola (B0692, I-150)
    return mbc.LINK.sub(lambda m: (bsrc.toks(m.group(0)) or [''])[0], t)


def sentences(text):
    """frasi del testo ripulito: fine al primo [.!|] fuori dalle abbreviazioni («Illus.», «Mr.», «Dr.», «Ver.»)
    e non dentro un numero («KH 0.2 Kairi»), come mbc._cut"""
    out = []
    while text:
        k = mbc._cut(text)
        out.append(text[:k].strip())
        text = text[k + 1:]
    return [s for s in out if s]


def _num(w):
    w = w.lower()
    return int(w) if w.isdigit() else NUMS[w]


# ---------- riserve ----------
PITY_SENT = re.compile(r'[Ii]f bought \d+ times|within \d+ draws')
LIST_RE = re.compile(r'(?:[Gg]uarantee[sd]?|guaranteed to (?:get|receive)) (?:at least )?(' + NUMW + r') '
                     r'(?:boosted versions? )?of (?:the )?following (?:(\d)★ )?(?:[Bb]oosted Ver )?[Mm]edals?\b([^:!]{0,160}?)(?:[:!]|$)\s*')
SNPLUS_RE = re.compile(r'[Gg]uarantees (' + NUMW + r') (?:boosted )?SN\+ or SN\+\+ Medals?')
TRAIT_RE = re.compile(r'^[Gg]uarantee[sd]? (' + NUMW + r') (?:(\d)★ )?Trait Medals?\b(?: #(\d+))?')
TIER_RE = re.compile(r'\b[Tt]ier (\d+)((?:,? (?:or )?(?:[Tt]ier )?\d+\b(?!★))*)(?: or (higher|lower|above))?')
SAB_RE = re.compile(r'(?:SAB|Special Attack Bonus Tier) of (\d+) or (higher|above)|Level (\d+) SAB')
TIER_COUNT = re.compile(r'(?:[Gg]uarantee[sd]?|guaranteed to (?:get|receive)) (?:either )?(?:at least )?(' + NUMW + r')\b')
NAMED_RE = re.compile(r'^[Gg]uarantee[sd]? (?:either (?:(?:a|an|one) )?|(?:a|an|one) )(?:(\d)★ )?(.*)$')
NAMED_CUT = re.compile(r'\s+(?:Has|Includes|When|Available|If)\b.*$')
NOT_NAMED = re.compile(r'Tier \d|Trait Medal|of (?:the )?following [Mm]edals|SN\+ or SN\+\+|\brandom\b|\bEpic\b|Imitation|'
                       r'Organization XIII|\bset \d', re.I)
GENERIC = re.compile(r'^(?:reversed|upright|copy|epic|random|organization|both)\b|\bmedals?\b|\bset \d|special attack|^\d+$|^(?:higher|lower|above)\b|'
                     r'^\d★|\btier \d', re.I)
SNPLUS = ['sn+ - ', 'sn++ - ', 'supernova+ - ']


def _res(kind, count, star, names=(), tmin=None, tmax=None, **extra):
    return {'kind': kind, 'count': count, 'star': star, 'names': list(names), 'tierMin': tmin, 'tierMax': tmax, **extra}


def _names(seg):
    """nomi di medaglia di un elenco, senza i resti generici («Medal», «Tier 4», «higher», «Copy Medal»)"""
    names = (re.sub(r'\s*\d★\s*', ' ', n).strip() for n in mbc.list_names(seg))  # «Stained Glass #7 [EX+] 7★»
    return [n for n in names if n and not GENERIC.search(n) and not mbc.non_medal(n, ())]


def _tier(s):
    """(tierMin, tierMax) della frase, o None. «Tier 4 or lower» -> (None, 4), «or higher/above» -> (4, None),
    «Tier 3 or 4» / «Tier 6, Tier 7, or Tier 8» -> min..max, «SAB of 3 or higher» / «Level 3 SAB» -> (3, None)
    (ricerca §3: il SAB del 2016 e' il Tier; per «Level 3 SAB» potrebbero essere 3 pallini, incerto)"""
    m = SAB_RE.search(s)
    if m:
        return int(m.group(1) or m.group(3)), None
    m = TIER_RE.search(s)
    if not m:
        return None
    nums = [int(m.group(1))] + [int(x) for x in re.findall(r'\d+', m.group(2) or '')]
    if m.group(3) == 'lower':
        return None, max(nums)
    if m.group(3) in ('higher', 'above'):
        return min(nums), None
    return min(nums), max(nums)


def _parse_one(s):
    """riserva di una frase, o None"""
    if PITY_SENT.search(s):
        return None
    m = LIST_RE.search(s)
    if m:
        star = m.group(2) or (re.search(r'\bat (\d)★', m.group(3) or '') or [None, None])[1]
        return _res('list', _num(m.group(1)), int(star) if star else None, mbc._dedup(mbc.list_names(s[m.end():])))
    m = SNPLUS_RE.search(s)
    if m:
        return _res('list', _num(m.group(1)), None, prefix=SNPLUS)
    m = TRAIT_RE.search(s)
    if m:
        # «Guarantees one Trait Medal #23» -> names ['trait medal #23'] (I-084 parte B: la riga c'e' se il numero e' noto)
        return _res('trait', _num(m.group(1)), int(m.group(2)) if m.group(2) else None,
                    ['trait medal #' + m.group(3)] if m.group(3) else [])
    c = TIER_COUNT.search(s)
    if (c or 'one of which is guaranteed' in s) and (TIER_RE.search(s) or SAB_RE.search(s)):
        tmin, tmax = _tier(s)
        # cinque 7★ di cui una garantita di Tier 4 (B0340): una
        count = _num(c.group(1)) if c else 1
        star = re.search(r'(\d)★', re.split(r'\s+with\b', s)[0])
        head = re.sub(r'^.*?guarantee[sd]? (?:to (?:get|receive) |to be )?(?:either )?(?:at least )?(?:' + NUMW + r')?\s*', '',
                      re.split(r'\s+with\b|\s+\(', s)[0], flags=re.I)
        return _res('tier', count, int(star.group(1)) if star else None, _names(head), tmin, tmax)
    m = NAMED_RE.match(s)
    if m and not NOT_NAMED.search(s):
        names = mbc._dedup(_names(NAMED_CUT.sub('', m.group(2))))
        if names:
            return _res('list', 1, int(m.group(1)) if m.group(1) else None, names)
    return None


def parse_reservations(text):
    """riserve del testo (note o colonna guarantees) in ordine di frase, senza `slot`:
    [{kind, count, star, names, tierMin, tierMax}] (`prefix` per «SN+ or SN++»: nomi risolti in guarantee_v3)"""
    return [r for r in (_parse_one(s) for s in sentences(clean_markup(text))) if r]


def assign_slots(reservations, mix):
    """slot (indice in slotRarities = mix espanso) di ogni riserva: prima quelle con stella, sui primi `count` slot
    liberi e consecutivi di quella stella; poi le altre, sui primi liberi consecutivi dall'alto (audit sezione 4).
    Una riserva che non trova posto prende i primi liberi dall'alto (o lo slot 0) e porta `conflict: True`.
    `star` = stella dello slot assegnato."""
    rar = [r for r, n in mix for _ in range(n)]
    used = set()
    out = [None] * len(reservations)

    def run(cnt, star=None):
        # dall'alto = dalla stella piu' alta (il mix del catalogo e' gia' decrescente; l'ordine vale anche se non lo e')
        for i in sorted(range(len(rar) - cnt + 1), key=lambda i: (-rar[i], i)):
            idx = range(i, i + cnt)
            if all(j not in used and (star is None or rar[j] == star) for j in idx):
                return i
        return None

    order = [i for i, r in enumerate(reservations) if r.get('star')] + [i for i, r in enumerate(reservations) if not r.get('star')]
    for i in order:
        r = dict(reservations[i])
        r['names'] = list(r.get('names') or [])
        cnt = max(1, r.get('count') or 1)
        at = run(cnt, r.get('star')) if r.get('star') else run(cnt)
        if at is None:
            # nessun blocco consecutivo: i primi `count` slot liberi uno per uno (dall'alto), mai uno gia' preso;
            # conflict True e slotsUsed = gli slot davvero usati (slot..slot+count-1 non vale piu'; vuoto se non ce n'e')
            free = sorted((j for j in range(len(rar)) if j not in used), key=lambda j: (-rar[j], j))[:cnt]
            at = free[0] if free else 0
            r['conflict'] = True
            r['slotsUsed'] = free
            used.update(free)
        else:
            used.update(range(at, at + cnt))
        r['slot'] = at
        r['star'] = rar[at] if rar else r.get('star')
        out[i] = {k: r[k] for k in ('kind', 'slot', 'count', 'star', 'names', 'tierMin', 'tierMax')} | \
            {k: v for k, v in r.items() if k in ('prefix', 'conflict', 'slotsUsed')}
    return out


def covered(s):
    """indici degli slot di una riserva: slotsUsed (conflitto) o slot..slot+count-1"""
    return list(s['slotsUsed']) if 'slotsUsed' in s else list(range(s['slot'], s['slot'] + max(1, s['count'])))


# ---------- pity ----------
def pity_slot(names, star, slots, mix):
    """(pitySlot, pityStar): la riserva che contiene un nome della pity; altrimenti, fra gli slot di `star` (default:
    la stella dello slot 0), il primo libero, poi il primo riservato a una Trait Medal (generico nel server: la lista
    e il Tier restano interi), poi il primo; senza slot di quella stella, la stella piu' alta sotto (decisione 5:
    «one 6★ X» col 7★ in cima -> primo 6★, altrimenti primo 5★); altrimenti 0"""
    rar = [r for r, n in mix for _ in range(n)]
    for s in slots:
        if set(s['names']) & set(names):
            return s['slot'], star or s['star']
    if not rar:
        return 0, star
    reserved = {j for s in slots for j in covered(s)}
    trait = {j for s in slots if s['kind'] == 'trait' for j in covered(s)}
    target = star or rar[0]
    if target not in rar:
        lower = [r for r in rar if r < target]
        if not lower:
            return 0, star or rar[0]
        target = max(lower)
    free = [j for j, r in enumerate(rar) if r == target and j not in reserved]
    tr = [j for j, r in enumerate(rar) if r == target and j in trait]
    return (free or tr or [rar.index(target)])[0], star or target


def _pity(text, featured, slots, mix):
    """(pity_of, stella scritta o None): la stella scritta serve a build_catalog per ricalcolare pitySlot/pityStar
    dopo la decisione 1 (senza stella scritta, pityStar = stella dello slot finale)"""
    t = clean_markup(text)
    g = mbc.guarantee_of({'guarantees': '', 'featured_medals': ''}, t)
    if not g['pity']:
        return {'pity': None, 'pityNames': [], 'pityStar': None, 'pitySlot': None}, None
    ss = sentences(t)
    sent = next((s for s in ss if re.search(r'[Ii]f bought \d+ times', s)), None) or next((s for s in ss if PITY_SENT.search(s)), '')
    # «As Trait Medal #2 is guaranteed within 5 draws» (B0267): via il «as» davanti
    names = [n for n in (re.sub(r'^as ', '', x) for x in g['featured']) if 'following' not in n]
    # frase «If bought» troncata dal TSV a 500 caratteri, senza «is guaranteed» («... at least one KH 0.2 Kair», B0169):
    # solo l'ultimo nome si completa col nome della vetrina che lo continua (la vetrina puo' contenere anche il troncato)
    if names and re.search(r'[Ii]f bought', sent) and not re.search(r'\b(?:is|are) (?:guaranteed|included)', sent):
        names[-1] = next((f for f in featured if f.startswith(names[-1]) and f != names[-1]), names[-1])
    names = mbc._dedup(names) or list(featured)
    star = re.search(r'(\d)★', re.split(r'\s+(?:is|are) (?:guaranteed|included)', sent)[0])
    star = int(star.group(1)) if star else None
    slot, pstar = pity_slot(names, star, slots, mix)
    return {'pity': g['pity'], 'pityNames': names, 'pityStar': pstar, 'pitySlot': slot}, star


def pity_of(text, featured, slots, mix):
    """{pity, pityNames, pityStar, pitySlot} dalla frase «If bought N times, at least one [S★] X is guaranteed» o
    «X is guaranteed within N draws»: pityNames = X (default `featured`), pityStar = S (default la stella di pitySlot).
    Le frasi «every Nth draw» restano pity (decisione 3)."""
    return _pity(text, featured, slots, mix)[0]


# ---------- potenziamenti per banner (blocco `enhance`, ricerca §3) ----------
# pallini: «strengthened N times» / «1 to 3 times» / «between 1 and 3 times», «pre-strengthened to 1, 2, or 3 ... dots», «3-Dot X»;
# guilt: «maximum Special Attack Bonus» / «Special Attack Bonus maxed» (pallini pieni insieme alla guilt, ricerca §3)
DOTS_RE = re.compile(r'(?<!pre-)strengthened (?:between )?(' + NUMW + r')(?: (?:to|and) (\d+))? times?\b')
PRE_RE = re.compile(r'pre-strengthened to ((?:\d+,? )*(?:or )?\d+) Special Attack dots')
NDOT_RE = re.compile(r'\b(\d+)-Dot (.+?)(?:\s+within\b|$)')
MAXSAB_RE = re.compile(r'maximum Special Attack Bonus|Special Attack Bonus maxed', re.I)
WHEN_RE = re.compile(r'[Ww]hen drawing (?:an? )?(.+?),?\s+(?:it|the [Mm]edal) comes\b')
PRONOUN = re.compile(r'^(?:\w+ )?(?:she|he|they|it)\b|\b(?:she|he) is (?:also )?guaranteed', re.I)
STAR_ON = re.compile(r'(?:\bthe|including a|\d+|\bone|\btwo|\bthree|\ba) (\d)★(?: Medals?)?\b')
# boosted: «small chance of drawing a boosted [version of] X with 1000 more base strength[ and defense][, or a boosted Y with ...]»;
# nel 2016-17 la wiki scrive «a special X» (18 banner, B0041-B0082: 2c/G5, 19-10)
SMALL_RE = re.compile(r'small chance of drawing a (?:boost(?:ed|er)|special) ')
CLAUSE_RE = re.compile(r'(?:,?\s*(?:or|and)\s+)?(?:an? )?(?:boost(?:ed|er) )?(?:version of )?(.+?)\s+with (\d+) more bases? strength'
                       r'( and d(?:efense|\w*$|$))?')
BOOST_RES = re.compile(r'boosted (?:versions? of|SN\+)|Boosted Ver\b')
COMES_BOOSTED = re.compile(r'comes boosted with (\d+) more bases? strength( and defense)?')
AFORE = re.compile(r'\b(?:aforementioned|these) [Mm]edals\b')
TIER_TARGET = re.compile(r'\bTier \d')
# abilita' al livello massimo: «with one of the following skills at max level: A, B», «with the X skill at max level»,
# «with one of the aforementioned skills at max level»
SKILLS_RE = re.compile(r'one of the following [Ss]kills at max level:\s*(.*)$')
SKILL1_RE = re.compile(r'\bthe (.+?) skill at max level')
SKILLS_AFORE = re.compile(r'one of the aforementioned skills at max level')
EPIC_RE = re.compile(r'[Gg]uarantee\w*\b[^|]*?\bEpic Medals?\b')
IMIT_RE = re.compile(r'\bImitation Medals?\b')


def enhance_text(notes, guarantees):
    """testo delle frasi per enhance_of: le note ripulite, piu' le frasi della colonna guarantees che le note non hanno
    (la stessa frase troncata dal TSV a 500 caratteri non conta due volte; se e' piu' lunga prende il posto di quella
    delle note)"""
    out = sentences(clean_markup(notes or ''))

    def same(a, b):
        k = 0
        while k < min(len(a), len(b)) and a[k] == b[k]:
            k += 1
        return k >= min(len(a), len(b), 60)
    for s in sentences(clean_markup(guarantees or '')):
        i = next((i for i, n in enumerate(out) if same(n, s)), None)
        if i is None:
            out.append(s)
        elif len(s) > len(out[i]):
            out[i] = s
    return ' | '.join(out)


def _dots(s):
    """[(valore, inizio, fine)] dei pallini della frase: intero, [min, max] o 'max'; 0 -> niente"""
    out = []
    for m in DOTS_RE.finditer(s):
        a = _num(m.group(1))
        v = [a, int(m.group(2))] if m.group(2) else a
        out.append((v, m.start(), m.end()))
    for m in PRE_RE.finditer(s):
        nums = [int(x) for x in re.findall(r'\d+', m.group(1))]
        out.append(([min(nums), max(nums)] if len(nums) > 1 else nums[0], m.start(), m.end()))
    m = NDOT_RE.search(s)
    if m:
        out.append((int(m.group(1)), m.start(), m.end()))
    m = MAXSAB_RE.search(s)
    if m:
        out.append(('max', m.start(), m.end()))
    return [x for x in sorted(out, key=lambda x: x[1]) if x[0] not in (0, [0, 0])]


# Trait Medal con la riga nel master (server/trait_medals.json, I-084 parte B): le altre restano non riproducibili
TRAIT_MEDALS = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'server', 'trait_medals.json')
KNOWN_TRAIT = {e['n'] for e in json.load(open(TRAIT_MEDALS, encoding='utf8'))} if os.path.exists(TRAIT_MEDALS) else set()


def trait_known(name):
    """«trait medal #N» con N nell'elenco delle Trait Medal del master"""
    m = re.match(r'trait medal #(\d+)$', name)
    return bool(m) and int(m.group(1)) in KNOWN_TRAIT


def _target_names(seg, trait):
    """nomi di medaglia di un elenco senza le Trait Medal (quelle senza riga: trait[0] = True; con la riga i preset su
    di loro, «strengthened 0 times», non servono) e senza i resti generici"""
    out = []
    for n in mbc.list_names(seg):
        n = re.sub(r'^(?:an?|version of) ', '', re.sub(r'\s*\d★\s*', ' ', n).strip())  # «The World Ends with You Art 2» resta
        if n.startswith('trait medal'):
            trait[0] = trait[0] or not trait_known(n)
        elif n and not GENERIC.search(n):
            out.append(n)
    return mbc._dedup(out)


def tier_boost(seg):
    """bersagli `on` di una boosted per Tier («a 7★ Tier 4, 5, 6, or 7 Medal (excluding Prime Medals)», «a 7★ Tier 4+ Medal»,
    «a Tier 4 or higher Medal»): [{star, tierMin, tierMax} (+ excludePrime: True)]; star None se la frase non la scrive.
    «(excluding Tier 4 Prime Medals)» esclude le Prime solo al Tier 4: l'intervallo si spezza (4 senza Prime, 5 con)"""
    excl = re.search(r'\(excluding (?:Tier (\d+) )?Prime Medals?\)', seg)
    body = re.sub(r'\(.*?\)', '', seg)
    star = re.search(r'(\d)★', body)
    star = int(star.group(1)) if star else None
    m = re.search(r'\bTier (\d+)\+', body)
    tmin, tmax = (int(m.group(1)), None) if m else _tier(body)
    if not excl:
        return [{'star': star, 'tierMin': tmin, 'tierMax': tmax}]
    if not excl.group(1):
        return [{'star': star, 'tierMin': tmin, 'tierMax': tmax, 'excludePrime': True}]
    x = int(excl.group(1))
    out = []
    if tmin < x:
        out.append({'star': star, 'tierMin': tmin, 'tierMax': x - 1})
    if tmin <= x and (tmax is None or x <= tmax):
        out.append({'star': star, 'tierMin': x, 'tierMax': x, 'excludePrime': True})
    if tmax is None or tmax > x:
        out.append({'star': star, 'tierMin': max(tmin, x + 1), 'tierMax': tmax})
    return out


def enhance_of(text, slots, featured, medal_rows, skill_rows, mix=None):
    """blocco `enhance` del catalogo v3 (contratto in global-constraints.md): {preset, boosted, maxSkill, notReproduced}.
    Bersaglio di ogni potenziamento: la riserva della stessa frase (`slots`, nell'ordine delle frasi come
    parse_reservations), altrimenti i nomi della frase («When drawing X»), «the N★ Medal» -> star, un pronome -> la
    vetrina (`featured`); «All [other] Medals» -> gli slot del mix (`mix`, facoltativo); boosted per Tier -> tier_boost. maxSkill: solo le abilita' di
    `skill_rows` (skill.json, nomi normalizzati), le altre -> 'skill'. notReproduced: 'trait' (Trait Medal e slot Trait),
    'imitation', 'epic', 'skill', 'traitSlots' («5 Trait Slots»); 'pity'
    (bersaglio assente) lo aggiunge build_catalog dopo la risoluzione dei nomi."""
    del medal_rows  # i nomi restano quelli delle note: li risolve build_catalog come quelli delle riserve
    known = {mbc.norm(r['name']) for r in skill_rows}
    rar = [r for r, n in (mix or []) for _ in range(n)]
    out = {'preset': [], 'boosted': [], 'maxSkill': [], 'notReproduced': []}
    nr = set()
    trait = [any((s['kind'] == 'trait' and not (s['names'] and all(trait_known(n) for n in s['names'])))
                 or any(n.startswith('trait medal') and not trait_known(n) for n in s['names']) for s in slots)]
    k = 0
    last_list, last_skills, last_res, done = [], [], None, set()

    def add(key, item):
        if item not in out[key]:
            out[key].append(item)

    for s in sentences(clean_markup(text)):
        res = _parse_one(s)
        slot = None
        if res is not None:
            if k < len(slots):
                slot = slots[k]
                last_res = slot
                if slot['names']:
                    last_list = slot['names']
            k += 1
        imit = bool(IMIT_RE.search(s) and re.search(r'[Gg]uarantee|boosted', s))  # Imitation: nessun bersaglio
        if imit:
            nr.add('imitation')
        if res is None and EPIC_RE.search(s) and not re.search(r'[Oo]nly draws Epic', s):
            nr.add('epic')
        when = WHEN_RE.search(s)
        when_names = _target_names(when.group(1), trait) if when else []
        pity = PITY_SENT.search(s)

        def target():
            """bersaglio della frase (None se non si capisce)"""
            m = re.search(r'including an? (\d)★', s)
            if m:
                return {'star': int(m.group(1))}
            if when:
                return {'names': when_names} if when_names else None
            if slot is not None:
                return {'slots': covered(slot)}
            if re.match(r'[Tt]he guaranteed\b', s) and last_res is not None:
                return {'slots': covered(last_res)}
            m = NDOT_RE.search(s)
            if m:
                return {'names': _target_names(m.group(2), trait) or list(featured)}
            if re.match(r'[Aa]ll (?:other )?[Mm]edals\b', s) and rar:
                idx = [i for i in range(len(rar)) if i not in done] if re.match(r'[Aa]ll other', s) else list(range(len(rar)))
                return {'slots': idx}
            m = STAR_ON.search(s)
            if m:
                return {'star': int(m.group(1))}
            if pity:
                names = [n for n in mbc.guarantee_of({'guarantees': '', 'featured_medals': ''}, s)['featured']]
                names = _target_names(', '.join(names), trait) if names else []
                return {'names': names or list(featured)} if (names or featured) else None
            if PRONOUN.search(s) and featured:
                return {'names': list(featured)}
            return None

        # pallini e guilt
        ds = [] if imit else _dots(s)
        if len({repr(d[0]) for d in ds}) > 1 and not MAXSAB_RE.search(s):
            # due valori nella stessa frase («A, B with ... 1 to 3 times, or C with ... 3 times»): i nomi davanti a ciascuno
            prev = 0
            for v, a, b in ds:
                seg = re.sub(r'^.*?(?:[Gg]uarantees (?:either )?|,?\s*or )', '', s[prev:a].split(' with ')[0], count=1)
                names = _target_names(seg, trait)
                if names:
                    add('preset', {'on': {'names': names}, 'dots': v, 'guilt': None})
                prev = b
        elif ds:
            v = ds[0][0]
            if isinstance(v, list) and re.search(r'\bhave a chance of\b', s):  # «All other medals have a chance of ... 1 and 3»
                v = [0, v[1]]
            on = target()
            if on:
                add('preset', {'on': on, 'dots': v, 'guilt': 'max' if v == 'max' else None})
                if 'slots' in on:
                    done.update(on['slots'])
                elif 'star' in on:
                    done.update(i for i, r in enumerate(rar) if r == on['star'])

        # boosted
        m = None if imit else COMES_BOOSTED.search(s)
        if m and when_names:
            st = int(m.group(1))
            add('boosted', {'on': {'names': when_names}, 'str': st, 'def': st if m.group(2) else 0, 'chance': 'guaranteed'})
        elif slot is not None and not imit and BOOST_RES.search(s):
            m = re.search(r'with (\d+) more bases? strength( and defense)?', s)
            st = int(m.group(1)) if m else 1000
            add('boosted', {'on': {'slots': covered(slot)}, 'str': st, 'def': st if (not m or m.group(2)) else 0, 'chance': 'guaranteed'})
        m = None if imit else SMALL_RE.search(s)
        if m:
            rest = s[m.end():]
            clauses = []
            while True:
                c = CLAUSE_RE.match(rest)
                if not c:
                    break
                st = int(c.group(2))
                clauses.append((c.group(1), st, st if c.group(3) else 0))
                rest = rest[c.end():]
            cut = not clauses
            if cut:  # «... a boosted version of a 7★ Tier 4 or Tier 5 Medal» o frase troncata dal TSV: 1000/1000
                clauses = [(rest, 1000, 1000)]
            elif re.search(r'[Tt]rait [Ss]lots?', rest):  # «, and 5 Trait Slots» / «an extra trait slot»
                nr.add('traitSlots')
            seen = []
            for seg, st, df in clauses:
                if TIER_TARGET.search(seg):
                    for on in tier_boost(seg):
                        add('boosted', {'on': on, 'str': st, 'def': df, 'chance': 'small'})
                    continue
                if AFORE.search(seg):
                    names = [n for n in (last_list or featured) if n not in seen] if 'other' in seg else list(last_list or featured)
                else:
                    names = _target_names(seg, trait)
                    if cut and names and names[-1] not in featured:
                        # senza «with N more» la frase e' troncata dal TSV a 500 caratteri («... a boosted Lord of the De»):
                        # l'ultimo nome si completa con l'unico nome della vetrina che lo continua, altrimenti si toglie
                        full = [f for f in featured if f.startswith(names[-1])]
                        names = names[:-1] + full if len(full) == 1 else names[:-1]
                seen += names
                if names:
                    add('boosted', {'on': {'names': names}, 'str': st, 'def': df, 'chance': 'small'})

        # abilita' al livello massimo
        m = SKILLS_RE.search(s)
        m1 = SKILL1_RE.search(s)
        skills = mbc._dedup(mbc.list_names(m.group(1))) if m else [mbc.norm(m1.group(1))] if m1 else \
            list(last_skills) if SKILLS_AFORE.search(s) else []
        if skills:
            last_skills = skills
            have = [x for x in skills if x in known]
            if len(have) < len(skills):
                nr.add('skill')
            on = None if imit else target()
            if have and on:
                add('maxSkill', {'on': on, 'skills': have})
    if trait[0]:
        nr.add('trait')
    out['notReproduced'] = sorted(nr)
    return out


def pity_gift(text, medal_rows):
    """[3, medalId, 1] se il bersaglio della pity e' una medaglia di supporto del master (type != 1: «If bought 10 times,
    one Dual Meow Wow [SAB LV 9] is included» -> 301684, va nel Present Box), altrimenti None"""
    p, _ = _pity(text, [], [], [])
    if not p['pity']:
        return None
    sup = {}
    for r in sorted(medal_rows, key=lambda r: r['medalId']):
        if r.get('type', 1) != 1 and not mbc.is_boosted(r):
            sup.setdefault(mbc.norm(r['name']), r['medalId'])
    return next(([3, sup[n], 1] for n in p['pityNames'] if n in sup), None)


# ---------- override scritti a mano (casi visti solo nelle immagini o nei notice) ----------
# Campi: count/star (prima riserva a lista), slots (riserve al posto di quelle lette), append (riserve in piu'),
# pityNames, erratum, source (sempre). `prefix` = nomi del master che iniziano cosi' (risolti in guarantee_v3).
KH3 = ['kh iii ']
WJE12 = ['sn++ - strike form sora', 'sn++ - master eraqus', 'sn++ - xemnas', 'sn++ - kh com ansem', 'sn++ - key art #23',
         'sn++ - kh iii sf sora', 'sn++ - kh iii vanitas', 'sn++ - xemnas b', 'sn++ - kh iii ansem the wise', 'sn++ - key art #24',
         'sn++ - kh iii gambler', 'sn++ - master xehanort']
WJE16 = WJE12 + ['sn++ - kh iii sora', 'sn++ - kh iii riku', 'sn++ - kh iii kairi', 'sn++ - illustrated zexion']


def _wje(names, notice):
    return {'slots': [_res('list', 1, 7, names)],
            'source': f'notice {notice} («one of the following Boosted Ver Medals», elenco solo nel notice)'}


ERRATUM = ('Due to a settings error in the original deal, {wrong} was guaranteed in this deal instead of {right} '
           '(official notice 47129). This deal guarantees {right} as intended.')
SLOT_OVERRIDES = {
    'B0049': {'count': 1, 'source': 'note «Guarantees at least one of the following medals» (audit D5)'},
    'B0055': {'count': 1, 'source': 'note «Guarantees at least one of the following medals» (audit D5; elenco troncato a 500 caratteri)'},
    'B0372': {'count': 1, 'star': 7, 'source': 'note «Guarantees one of the following 7★ Medals» (audit D5)'},
    'B0695': {'count': 1, 'source': 'note «Guarantees oe of the following Medals» (audit D5, refuso della wiki)'},
    'B0678': {'count': 1, 'source': 'image 10678 («KH III Medal ×1» + «5★+ ×4»; il testo «three» e\' un errore della wiki, audit D4)'},
    'B0733': {'count': 3, 'star': 7, 'append': [_res('list', 7, 6, prefix=KH3)],
              'source': 'image 10733 («SN+ Medal ×3» + «KH III Medal+ ×7», decisione 2): lista KH III = medaglie «KH III» del master'},
    'B0740': {'append': [_res('list', 5, 6, prefix=KH3)],
              'source': 'image 10740 («One of 3 Medals ×1» + «SN+ Medal ×3» + «KH III Medal+ ×5»): nomi KH III non nelle note, '
                        'lista = medaglie «KH III» del master come B0733'},
    'B0721': _wje(WJE12, 69545), 'B0725': _wje(WJE12, 69550), 'B0726': _wje(WJE12, 69551),
    'B0734': _wje(WJE16, 70068), 'B0739': _wje(WJE16, 70578),
    'B0419': {'pityNames': ['hd aced [ex+]'], 'erratum': ERRATUM.format(wrong='HD Gula [EX+]', right='HD Aced [EX+]'),
              'source': 'notice 47129 (scambio Gula/Aced, decisione 4)'},
    'B0421': {'pityNames': ['hd gula [ex+]'], 'erratum': ERRATUM.format(wrong='HD Aced [EX+]', right='HD Gula [EX+]'),
              'source': 'notice 47129 (scambio Gula/Aced, decisione 4)'},
}


def _master_names(medal_rows):
    """{nome normalizzato: {stelle}} delle medaglie d'attacco del master, senza le boosted"""
    out = collections.defaultdict(set)
    for r in sorted(medal_rows, key=lambda r: r['medalId']):
        if r.get('type', 1) == 1 and not mbc.is_boosted(r):
            out[mbc.norm(r['name'])].add(r['rare'])
    return out


def star_filter(names, star, rares_of):
    """decisione 1: in una lista su uno slot di stella S restano i nomi con una variante S (e quelli sconosciuti,
    rares_of -> None); se non ne resta nessuno la lista resta com'e' (lo slot da' la stella che c'e')"""
    keep = [n for n in names if rares_of(n) is None or star in rares_of(n)]
    return keep if keep else list(names)


def guarantee_v3(row, notes, mix, featured, medal_rows, rares_of=None, keep_prefix=False):
    """blocco `guarantee` del catalogo v3 (contratto in global-constraints.md): riserve dalle note (o dalla colonna
    guarantees se le note non ne hanno), slot, pity, decisione 1, override per ultimi. Decisione 1 con
    rares_of(nome) -> {stelle} o None (default: i nomi di medal_rows); build_catalog la rifa' sui nomi risolti
    del catalogo e qui passa `lambda n: None` (i nomi del master non sono quelli della wiki). keep_prefix: le riserve
    coi nomi presi dal master per prefisso tengono `prefix` (build_catalog le esclude dalle date del debutto: quei
    nomi non sono scritti nel banner, e lo toglie prima di scrivere il catalogo)."""
    ov = SLOT_OVERRIDES.get(row.get('row_id'), {})
    master = _master_names(medal_rows)
    res = parse_reservations(notes) or parse_reservations(row.get('guarantees') or '')
    if 'slots' in ov:
        res = copy.deepcopy(ov['slots'])
    first = next((r for r in res if r['kind'] == 'list'), None)
    for k in ('count', 'star'):
        if k in ov and first:
            first[k] = ov[k]
    res += copy.deepcopy(ov.get('append', []))
    for r in res:
        if 'prefix' in r:
            r['names'] = [n for n in master if n.startswith(tuple(r['prefix']))]
    slots = assign_slots(res, mix)
    for s in slots:
        if not keep_prefix:
            s.pop('prefix', None)
        if s['kind'] == 'list':
            s['names'] = star_filter(s['names'], s['star'], rares_of or master.get)
    old = mbc.guarantee_of({'guarantees': row.get('guarantees') or '', 'featured_medals': row.get('featured_medals') or ''}, notes)
    p, written = _pity(notes + ' | ' + (row.get('guarantees') or ''), featured, slots, mix)
    if 'pityNames' in ov and p['pity']:
        p['pityNames'] = list(ov['pityNames'])
        p['pitySlot'], p['pityStar'] = pity_slot(p['pityNames'], written, slots, mix)
    lst = next((s for s in slots if s['kind'] == 'list'), None)
    out = {'list': list(lst['names']) if lst else [], 'count': lst['count'] if lst else 0, 'slot': lst['slot'] if lst else 0,
           'pity': p['pity'], 'every': old['every'], 'slots': slots,
           'pityNames': p['pityNames'], 'pityStar': p['pityStar'], 'pitySlot': p['pitySlot'], 'pityGift': None,
           'erratum': ov.get('erratum'), 'source': ov.get('source')}
    if keep_prefix:  # per build_catalog: stella scritta della pity (tolta prima di scrivere il catalogo)
        out['_pityStarWritten'] = written
    return out
