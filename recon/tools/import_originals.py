"""Originali al posto delle nostre ricostruzioni (I-170, audit del 19-10: tmp\\gen_audit\\RESULT.md).

    python -I recon/tools/import_originals.py <elenco.tsv> <bundle2016/files> <jp_final_4.3.1> <uscita>
        [--served names_v4.tsv[,names_addnl.tsv]] [--i440 cartella] [--report f.json]

Gira in build-resources.ps1 DOPO i generatori (make_layouts, make_textures, make_quest_thumbs...): i file scritti
qui sostituiscono i nostri nel pacchetto generato. Elenco (recon/tools/originals.tsv), colonne separate da TAB:

    destinazione    fonti    [sorgente]    # nota

- destinazione: percorso nel pacchetto (es. img/wipe/wipe_2.png); con * e' un glob sui file della PRIMA fonte
  che li ha (es. img/adventure/stage/stage_select_ico_*.png); finita con / e' una cartella copiata per intero
  (LWF con le sue texture);
- fonti: b16 (pacchetto WW inglese del 2016), jp (dati JP 4.3.1, nomi <nome>.<8 cifre>.<ext>: vince la
  revisione piu' alta, il suffisso si toglie), i440 (file dell'IPA 4.4.0 WW gia' estratti con res_get.py in
  --i440, es. catalog\ipa440_extract), separate da virgola in ordine di preferenza;
- sorgente: percorso nella fonte se diverso dalla destinazione (stesso significato di glob e cartella).

--served: nomi gia' serviti dalle risorse WW (OBB 5.0.1, IPA 4.3.1; prima colonna dei TSV): con glob e cartelle si
saltano (gli originali riempiono i buchi, non cambiano cio' che il client WW ha gia'); una destinazione singola si
scrive sempre (scelta esplicita).
Ogni riga deve trovare almeno un file, altrimenti errore (un originale che sparisce non deve passare in silenzio).
Le texture JP sono PNG veri: btf_fix.py (dopo, in build-resources) le porta in BTF premoltiplicato.
"""
import fnmatch
import json
import os
import re
import shutil
import sys

REV = re.compile(r'^(?P<stem>.+?)\.(?P<rev>\d{8})(?P<ext>\.[^.]+)$')


def jp_listing(folder):
    """{nome senza revisione: percorso della revisione piu' alta} di una cartella JP"""
    best = {}
    if not os.path.isdir(folder):
        return {}
    for f in os.listdir(folder):
        p = os.path.join(folder, f)
        if not os.path.isfile(p):
            continue
        m = REV.match(f)
        name, rev = (m.group('stem') + m.group('ext'), int(m.group('rev'))) if m else (f, -1)
        if name not in best or rev > best[name][0]:
            best[name] = (rev, p)
    return {k: v[1] for k, v in best.items()}


def plain_listing(folder):
    if not os.path.isdir(folder):
        return {}
    return {f: os.path.join(folder, f) for f in os.listdir(folder) if os.path.isfile(os.path.join(folder, f))}


def resolve(src, roots):
    """[(nome relativo, percorso sorgente)] per un percorso di fonte (file, glob o cartella)"""
    root, kind = roots
    listing = jp_listing if kind == 'jp' else plain_listing
    if src.endswith('/'):
        return [(n, p) for n, p in sorted(listing(os.path.join(root, src)).items())]
    folder, leaf = os.path.split(src)
    files = listing(os.path.join(root, folder))
    return [(n, p) for n, p in sorted(files.items()) if fnmatch.fnmatchcase(n, leaf)]


def parse(lines):
    rows = []
    for ln in lines:
        ln = ln.split('#', 1)[0].rstrip()
        if not ln.strip():
            continue
        cols = [c.strip() for c in ln.split('\t') if c.strip()]
        if len(cols) < 2:
            raise SystemExit('riga incompleta: %r' % ln)
        rows.append({'dest': cols[0], 'sources': cols[1].split(','), 'src': cols[2] if len(cols) > 2 else cols[0]})
    return rows


def served_names(paths):
    names = set()
    for p in paths:
        for ln in open(p, encoding='utf8'):
            names.add(ln.split('	', 1)[0].strip())
    return names


def run(rows, b16, jp, out, served=frozenset(), i440=None):
    roots = {'b16': (b16, 'b16'), 'jp': (jp, 'jp'), 'i440': (i440 or '', 'i440')}
    report = []
    for r in rows:
        hits, used = [], None
        for s in r['sources']:
            hits = resolve(r['src'], roots[s])
            if hits:
                used = s
                break
        if not hits:
            raise SystemExit('nessun originale per %s (%s)' % (r['dest'], ','.join(r['sources'])))
        dest_dir = r['dest'] if r['dest'].endswith('/') else os.path.dirname(r['dest'])
        single = not r['dest'].endswith('/') and not any(c in r['dest'] for c in '*?[')
        skipped = 0
        for name, path in hits:
            rel = r['dest'] if single else (dest_dir.rstrip('/') + '/' + name)
            if not single and rel in served:
                skipped += 1
                continue
            target = os.path.join(out, rel)
            os.makedirs(os.path.dirname(target), exist_ok=True)
            shutil.copyfile(path, target)
        report.append({'dest': r['dest'], 'source': used, 'files': len(hits) - skipped, 'servedWW': skipped})
    return report


def main(argv):
    lst, b16, jp, out = argv[1:5]
    rows = parse(open(lst, encoding='utf8').read().split('\n'))
    served = served_names(argv[argv.index('--served') + 1].split(',')) if '--served' in argv else frozenset()
    i440 = argv[argv.index('--i440') + 1] if '--i440' in argv else None
    report = run(rows, b16, jp, out, served, i440)
    if '--report' in argv:
        json.dump(report, open(argv[argv.index('--report') + 1], 'w', encoding='utf8'), indent=1)
    print('originali: %d righe, %d file (%s)' % (len(report), sum(r['files'] for r in report),
          ', '.join('%s %d' % (k, sum(r['files'] for r in report if r['source'] == k)) for k in ('b16', 'jp', 'i440'))))


if __name__ == '__main__':
    main(sys.argv)
