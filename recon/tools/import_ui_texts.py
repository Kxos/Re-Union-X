"""Testi text/ui/<id>.txt che mancano nelle risorse servite, presi dal pacchetto misc
dell'IPA 4.4.0 (misc.mp4 + indice misc.png, nomi in names440misc.tsv).

    python -I recon/tools/import_ui_texts.py <nomi serviti.tsv> <names440misc.tsv> <cartella con misc.mp4> <uscita> [<testi serviti>]

Copia in <uscita>/text/ui/ tutti i testi ui dell'IPA 4.4.0 assenti dalle risorse servite
(non solo quelli citati con id costante: il client ne costruisce anche a runtime).
<testi serviti> = cartella con i text/ui/*.txt serviti estratti (res_get.py): quelli in
giapponese (es. 106180101 «取りはずし», Unequip) si prendono anch'essi dall'IPA e il
pacchetto generato li sostituisce (resource_merge.py --last-wins).
misc.mp4 si estrae dall'IPA (21 MB). Usa bgad_extract.py.
"""
import os
import re
import subprocess
import sys

here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, here)
import private_tools  # noqa: E402  (bgad_extract.py is kept outside the public repository)
served_tsv, ipa_tsv, datadir, out = sys.argv[1:5]
served = set()
for line in open(served_tsv, encoding='utf-8'):
    m = re.match(r'(text/ui/\d+\.txt)\t', line)
    if m:
        served.add(m.group(1))
if len(sys.argv) > 5:
    jp = re.compile('[぀-ヿ一-鿿]')
    for f in os.listdir(sys.argv[5]):
        if jp.search(open(os.path.join(sys.argv[5], f), 'rb').read().decode('utf-8', 'replace')):
            served.discard('text/ui/' + f)
# testi dell'IPA 4.4.0 il cui id ha cambiato significato: si scrivono questi
OVERRIDE = {
    'text/ui/106180101.txt': 'Unequip',   # 4.3.1 «取りはずし» (pulsante del dettaglio), 4.4.0 «Remove All»
    # filtro dei colpi e delle barre: sprintf con un numero,
    # 0x...C9/CB per i pulsanti, 0x...CA/CC per l'ultimo («o piu'»); nella 4.4.0 sono
    # segnaposto «[id]»
    'text/ui/106240201.txt': '%d', 'text/ui/106240202.txt': '%d+',
    'text/ui/106240203.txt': '%d', 'text/ui/106240204.txt': '%d+',
}
todo = []
for line in open(ipa_tsv, encoding='utf-8'):
    m = re.match(r'(text/ui/\d+\.txt)\t(\d+)', line)
    if m and m.group(1) not in served:
        todo.append((m.group(1), m.group(2)))
data = [os.path.join(datadir, f) for f in sorted(os.listdir(datadir))]
lib = os.path.join(here, '..', 'ext', 'ww431', 'libcocos2dcpp.so')
n = 0
for name, off in todo:
    dst = os.path.join(out, *name.split('/'))
    if name in OVERRIDE:
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        with open(dst, 'w', encoding='utf-8', newline='') as fh:
            fh.write(OVERRIDE[name])
        n += 1
        continue
    if os.path.exists(dst):
        n += 1
        continue
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    r = subprocess.run([sys.executable, '-I', private_tools.path('bgad_extract.py'), here, lib, off, dst] + data,
                       stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    if r.returncode == 0:
        n += 1
    else:
        print('errore', name, r.stderr.decode(errors='replace')[-200:])
print('testi ui importati: %d di %d mancanti' % (n, len(todo)))
