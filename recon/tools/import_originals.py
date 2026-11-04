"""Originali al posto delle nostre ricostruzioni (I-170, audit del 19-10: tmp\\gen_audit\\RESULT.md).

    python -I recon/tools/import_originals.py <elenco.tsv> <bundle2016/files> <jp_final_4.3.1> <uscita>
        [--served names_v4.tsv[,names_addnl.tsv]] [--i440 cartella] [--report f.json] [--skip-prefix prefisso]...

Gira in build-resources.ps1 DOPO i generatori (make_layouts, make_textures, make_quest_thumbs...): i file scritti
qui sostituiscono i nostri nel pacchetto generato. Elenco (recon/tools/originals.tsv), colonne separate da TAB:

    destinazione    fonti    [sorgente]    # nota

- destinazione: percorso nel pacchetto (es. img/wipe/wipe_2.png); con * e' un glob sui file della PRIMA fonte
  che li ha (es. img/adventure/stage/stage_select_ico_*.png); finita con / e' una cartella copiata per intero
  (LWF con le sue texture);
- fonti: b16 (pacchetto WW inglese del 2016), jp (dati JP 4.3.1, nomi <nome>.<8 cifre>.<ext>: vince la
  revisione piu' alta, il suffisso si toglie), i440 (file dell'IPA 4.4.0 WW gia' estratti con res_get.py in
  --i440, es. catalog\ipa440_extract), jp501 (estratto dell'OBB JP 5.0.1 in --jp501, tmp/jp501/x: NPC della
  sezione 45, I-197), loc (files generated from originals outside the repo, in --loc, e.g. D:\Progetto_Restauro_KH_UX\raid_loc:
  the raid demos with the English subtitle of raid_demo_english.py), separate da virgola in ordine di preferenza;
- sorgente: percorso nella fonte se diverso dalla destinazione (stesso significato di glob e cartella); `=percorso`
  is that exact file, with no revision choice (an older JP revision name.<8 digits>.ext, or the plain name).

--served: nomi gia' serviti dalle risorse WW (OBB 5.0.1, IPA 4.3.1; prima colonna dei TSV): con glob e cartelle si
saltano (gli originali riempiono i buchi, non cambiano cio' che il client WW ha gia'); una destinazione singola si
scrive sempre (scelta esplicita).
Ogni riga deve trovare almeno un file, altrimenti errore (un originale che sparisce non deve passare in silenzio).
Le texture JP sono PNG veri: btf_fix.py (dopo, in build-resources) le porta in BTF premoltiplicato.

--skip-prefix <prefisso> (ripetibile): le destinazioni che cominciano cosi' non si copiano (le righe si risolvono lo stesso,
quindi un originale che sparisce da' ancora errore). Lo usa build-resources.ps1 -Quick per i modelli dei boss raid
(lwf/character/raid/, lwf/raid/demo/) quando la versione installata li ha nel pacchetto statico raid_gen: lo script li
toglierebbe dal pacchetto generato subito dopo, e copiarli (37 mila file, ~70% degli originali) costava ~5 minuti.

Speed (4 Nov 2026): every row is resolved first (a vanished original stops the run before anything is written), then each
destination is written once (the last row naming it wins, as before): a destination that already holds the same bytes is
not rewritten, the others are copied by ORIG_WORKERS threads (default 8; copying waits on the disk, not on Python).
"""
import fnmatch
import functools
import json
import os
import re
import shutil
import sys
from concurrent.futures import ThreadPoolExecutor

REV = re.compile(r'^(?P<stem>.+?)\.(?P<rev>\d{8})(?P<ext>\.[^.]+)$')


@functools.lru_cache(maxsize=None)
def jp_listing(folder):
    """{nome senza revisione: percorso della revisione piu' alta} di una cartella JP.
    In cache per cartella: le sorgenti sono di sola lettura e ~15 mila righe rileggevano le stesse cartelle (migliaia di
    file, un stat ciascuno, su HDD): 8 minuti; scandir non fa stat in piu'."""
    best = {}
    if not os.path.isdir(folder):
        return {}
    with os.scandir(folder) as it:
        for e in it:
            if not e.is_file():
                continue
            f = e.name
            m = REV.match(f)
            name, rev = (m.group('stem') + m.group('ext'), int(m.group('rev'))) if m else (f, -1)
            if name not in best or rev > best[name][0]:
                best[name] = (rev, e.path)
    return {k: v[1] for k, v in best.items()}


@functools.lru_cache(maxsize=None)
def plain_listing(folder):
    if not os.path.isdir(folder):
        return {}
    with os.scandir(folder) as it:
        return {e.name: e.path for e in it if e.is_file()}


def resolve(src, roots):
    """[(nome relativo, percorso sorgente)] per un percorso di fonte (file, glob o cartella)"""
    root, kind = roots
    if src.startswith('='):
        # '=path': that exact file, no revision choice (JP keeps older revisions as name.<8 digits>.ext and the plain
        # name may be another version: the weekly-era spider LWFs of I-221 need a given one)
        p = os.path.join(root, src[1:])
        return [(os.path.basename(src[1:]), p)] if os.path.isfile(p) else []
    listing = jp_listing if kind == 'jp' else plain_listing
    if src.endswith('/'):
        return [(n, p) for n, p in sorted(listing(os.path.join(root, src)).items())]
    folder, leaf = os.path.split(src)
    files = listing(os.path.join(root, folder))
    if not any(c in leaf for c in '*?['):
        # a plain name matches only itself (fnmatchcase without wildcards): a lookup instead of sorting and matching the
        # whole folder (~17k single-file rows in folders of hundreds of files)
        return [(leaf, files[leaf])] if leaf in files else []
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


def same_file(src, target):
    """True when target already holds exactly the bytes of src (size first, bytes only when the sizes match)."""
    try:
        st = os.stat(target)
    except OSError:
        return False
    if st.st_size != os.stat(src).st_size:
        return False
    with open(src, 'rb') as a, open(target, 'rb') as b:
        while True:
            x, y = a.read(1 << 20), b.read(1 << 20)
            if x != y:
                return False
            if not x:
                return True


def copy_plan(plan, out, workers=None):
    """Writes {relative destination: source} into out; returns (copied, unchanged).
    A destination that already has the same bytes is left alone (no write: most non-raid files of a rebuild); the others are
    copied by a few threads (copying is I/O, the threads overlap the waits on the disk and the antivirus scan of each new
    file). Each destination appears once in the plan (the last row naming it wins, as with the serial copies before)."""
    workers = workers or max(1, int(os.environ.get('ORIG_WORKERS', '8')))
    for d in sorted({os.path.dirname(os.path.join(out, rel)) for rel in plan}):
        os.makedirs(d, exist_ok=True)

    def one(item):
        rel, src = item
        target = os.path.join(out, rel)
        if same_file(src, target):
            return 0
        shutil.copyfile(src, target)
        return 1
    items = sorted(plan.items())
    if workers == 1:
        copied = sum(map(one, items))
    else:
        with ThreadPoolExecutor(workers) as ex:
            copied = sum(ex.map(one, items))
    return copied, len(items) - copied


def run(rows, b16, jp, out, served=frozenset(), i440=None, jp501=None, loc=None, skip_prefixes=(), stats=None):
    roots = {'b16': (b16, 'b16'), 'jp': (jp, 'jp'), 'i440': (i440 or '', 'i440'), 'jp501': (jp501 or '', 'jp501'),
             'loc': (loc or '', 'loc')}
    report = []
    plan = {}
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
        skipped_prefix = 0
        for name, path in hits:
            rel = r['dest'] if single else (dest_dir.rstrip('/') + '/' + name)
            if not single and rel in served:
                skipped += 1
                continue
            if skip_prefixes and rel.startswith(tuple(skip_prefixes)):
                skipped_prefix += 1
                continue
            plan.pop(rel, None)          # a later row naming the same destination wins (and keeps the serial order)
            plan[rel] = path
        report.append({'dest': r['dest'], 'source': used, 'files': len(hits) - skipped - skipped_prefix, 'servedWW': skipped,
                       'skippedPrefix': skipped_prefix})
    # every row is resolved before anything is written: a vanished original stops the run with the output untouched
    copied, unchanged = copy_plan(plan, out)
    if stats is not None:
        stats.update(copied=copied, unchanged=unchanged)
    return report


def main(argv):
    lst, b16, jp, out = argv[1:5]
    rows = parse(open(lst, encoding='utf8').read().split('\n'))
    served = served_names(argv[argv.index('--served') + 1].split(',')) if '--served' in argv else frozenset()
    i440 = argv[argv.index('--i440') + 1] if '--i440' in argv else None
    jp501 = argv[argv.index('--jp501') + 1] if '--jp501' in argv else None
    loc = argv[argv.index('--loc') + 1] if '--loc' in argv else None
    skip = [argv[i + 1] for i, a in enumerate(argv) if a == '--skip-prefix']
    stats = {}
    report = run(rows, b16, jp, out, served, i440, jp501, loc, skip, stats)
    if '--report' in argv:
        json.dump(report, open(argv[argv.index('--report') + 1], 'w', encoding='utf8'), indent=1)
    print('originali: %d righe, %d file (%s)%s' % (len(report), sum(r['files'] for r in report),
          ', '.join('%s %d' % (k, sum(r['files'] for r in report if r['source'] == k)) for k in ('b16', 'jp', 'i440', 'jp501', 'loc')),
          ', %d saltati (--skip-prefix)' % sum(r['skippedPrefix'] for r in report) if skip else ''))
    print('originals: %d destinations copied, %d already identical (not rewritten)' % (stats['copied'], stats['unchanged']))


if __name__ == '__main__':
    main(sys.argv)
