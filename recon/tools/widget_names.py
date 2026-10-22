"""Nomi di widget cercati da un C decompilato (khux_decomp.py): stringhe s_<Nome>_<ind> e "letterali".

    python -I recon/tools/widget_names.py <file.c> [--all]

Stampa, per funzione, i nomi in ordine di apparizione (senza ripetizioni). Senza --all
tiene solo quelli che sembrano nomi di widget (niente percorsi, formati, spazi).
"""
import re
import sys

sys.stdout.reconfigure(encoding='utf-8')
text = open(sys.argv[1], encoding='utf-8', errors='replace').read()
allnames = '--all' in sys.argv
for block in re.split(r'^// ===== ', text, flags=re.M)[1:]:
    head = block.split('\n', 1)[0]
    seen = []
    for m in re.finditer(r'\bs_([A-Za-z0-9_]+?)_[0-9a-f]{8}\b|"([^"\\]{2,64})"', block):
        n = m.group(1) or m.group(2)
        if not allnames and (('/' in n) or ('%' in n) or (' ' in n) or n.startswith('cocostudio')):
            continue
        if n not in seen:
            seen.append(n)
    print('==', head, len(seen))
    print('   ' + ' '.join(seen))
