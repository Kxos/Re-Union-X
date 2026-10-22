"""Scarica da khuxwiki il wikitesto delle pagine che usano un template, o di tutta la wiki.

    python -I recon/tools/wiki_dump.py <Template> <out.json> [--limit N]
    python -I recon/tools/wiki_dump.py --all <ns,ns,...> <out.json>

Es. `InfoQuestKHUX` (missioni: obiettivi, premi, nemici, tesori); `--all 0,10,14`
= articoli, template e categorie (circa 27.000 pagine in tutto, 10-15 minuti).
Usa l'API MediaWiki (list=embeddedin o list=allpages, poi prop=revisions a 50 titoli
per richiesta) con una pausa tra le richieste. I redirect restano come wikitesto
«#REDIRECT [[...]]». Uscita: {"<titolo>": "<wikitesto>"}. I dati sono della wiki:
vanno fuori dal repository (es. D:\\Progetto_Restauro_KH_UX\\wiki\\).
"""
import json
import sys
import time
import urllib.parse
import urllib.request

API = 'https://www.khuxwiki.com/w/api.php'
UA = 'KHUX-restoration-research/1.0 (private preservation server)'
template, out = sys.argv[1], sys.argv[2]
limit = int(sys.argv[sys.argv.index('--limit') + 1]) if '--limit' in sys.argv else None


def api(**params):
    params.update(format='json', formatversion='2')
    req = urllib.request.Request(API + '?' + urllib.parse.urlencode(params), headers={'User-Agent': UA})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                data = json.load(r)
            time.sleep(1.0)
            return data
        except Exception as e:  # noqa: BLE001 - rete: si riprova
            print('  riprovo:', e)
            time.sleep(5 * (attempt + 1))
    raise SystemExit('API non raggiungibile')


titles = []
if template == '--all':
    namespaces, out = sys.argv[2].split(','), sys.argv[3]
    for ns in namespaces:
        cont = {}
        while True:
            d = api(action='query', list='allpages', apnamespace=ns, aplimit='500', **cont)
            titles += [p['title'] for p in d['query']['allpages']]
            if 'continue' not in d:
                break
            cont = {'apcontinue': d['continue']['apcontinue']}
        print('namespace', ns, '->', len(titles), 'titoli finora')
else:
    cont = {}
    while True:
        d = api(action='query', list='embeddedin', eititle='Template:' + template, eilimit='500', einamespace='0', **cont)
        titles += [p['title'] for p in d['query']['embeddedin']]
        if 'continue' not in d or (limit and len(titles) >= limit):
            break
        cont = {'eicontinue': d['continue']['eicontinue']}
    titles = titles[:limit] if limit else titles
    print(len(titles), 'pagine con', template)

pages = {}
for i in range(0, len(titles), 50):
    d = api(action='query', prop='revisions', rvprop='content', rvslots='main', titles='|'.join(titles[i:i + 50]))
    for p in d['query']['pages']:
        if p.get('revisions'):
            pages[p['title']] = p['revisions'][0]['slots']['main']['content']
    print('  %d/%d' % (len(pages), len(titles)))

with open(out, 'w', encoding='utf-8') as f:
    json.dump(pages, f, ensure_ascii=False, indent=0)
print(len(pages), '->', out)
