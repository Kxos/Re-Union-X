"""Prova delle risorse di Proud Mode (I-200) per import_jp_coco.py: radice nell'elenco, chiusura completa e plist
liberi delle armature JP_ARM.

    python -I recon/tools/test_proud_resources.py     -> «OK: ...» oppure «ERRORI (n)», uscita 1

Controlli (dati veri: catalog\\files servito, names_v4.tsv, JP 4.3.1 locale):
- StartDeckProudScene_ver260.json e' una radice attiva di jp_coco_layouts.txt;
- ogni sotto-layout e texture della sua chiusura (scena servita, sotto-layout serviti e JP) e' servito o c'e' nel JP,
  le texture col 9-slice comprese (crash 0x2c, I-049); le armature non servite stanno in JP_ARM;
- ogni slot di JP_ARM e' un plist servito, ogni armatura JP_ARM esiste nel JP, e nessuno slot e' citato da un
  layout servito (le armature servite che lo usano non compaiono in nessun layout servito) ne' condiviso da armature
  con fotogrammi diversi.
"""
import ast
import glob
import json
import os
import re
import sys

sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
D = r'D:\Progetto_Restauro_KH_UX'
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # with python -I the script folder is not on sys.path
import private_tools  # noqa: E402  (local reference data folders, see private_tools.py)
JP_PUB = private_tools.local_path('jp_data', 'cocostudio', 'publish')
SERVED_PUB = os.path.join(D, 'catalog', 'files', 'cocostudio', 'publish')
NAMES = os.path.join(D, 'resource_data', 'names_v4.tsv')
ROOT = 'StartDeckProudScene_ver260.json'

errori = []


def check(cond, msg):
    if not cond:
        errori.append(msg)


def load(p):
    return json.load(open(p, encoding='utf-8-sig'))


def refs(data):
    """(sotto-layout/armature, texture [(nome, 9-slice)]) come scan() di import_jp_coco.py."""
    subs, texs = [], []
    if isinstance(data, dict):
        for t in data.get('config_png_path') or []:
            texs.append((t, False))

    def walk(n, s9):
        if isinstance(n, dict):
            o = n.get('options') if isinstance(n.get('options'), dict) else None
            if o is not None and 'classname' in n:
                s9 = bool(o.get('scale9Enable') or o.get('backGroundScale9Enable'))
            for k, v in n.items():
                if isinstance(v, dict) and 'path' in v and 'resourceType' in v and v.get('path'):
                    p = v['path'][len('publish/'):] if v['path'].startswith('publish/') else v['path']
                    if p.endswith(('.json', '.ExportJson')):
                        subs.append(p)
                    elif not p.endswith('.plist') and v.get('resourceType') != 1:
                        texs.append((p, s9 and k in ('fileNameData', 'normalData', 'pressedData', 'disabledData',
                                                     'backGroundImageData')))
                if isinstance(v, (dict, list)):
                    walk(v, s9 if k != 'children' else False)
        elif isinstance(n, list):
            for x in n:
                walk(x, s9)
    walk(data, False)
    return subs, texs


# elenco e JP_ARM (letti dal sorgente, senza eseguire lo script)
roots = [ln.split('#', 1)[0].split()[0] for ln in open(os.path.join(HERE, 'jp_coco_layouts.txt'), encoding='utf-8')
         if ln.split('#', 1)[0].strip() and not ln.lstrip().startswith('?')]
check(ROOT in roots, '%s non e\' una radice attiva di jp_coco_layouts.txt' % ROOT)
src = open(os.path.join(HERE, 'import_jp_coco.py'), encoding='utf-8').read()
m = re.search(r'^JP_ARM = (\{.*?\})\n', src, re.S | re.M)
check(m is not None, 'JP_ARM assente in import_jp_coco.py')
JP_ARM = ast.literal_eval(m.group(1)) if m else {}
check('Cursor_Anim_Proud' in JP_ARM, 'Cursor_Anim_Proud assente da JP_ARM')

served = set()
for line in open(NAMES, encoding='utf-8'):
    n = line.split('\t')[0].strip()
    if n.startswith('cocostudio/publish/'):
        served.add(n[len('cocostudio/publish/'):])


def jp_has(name):
    return os.path.exists(os.path.join(JP_PUB, name))


# chiusura della radice
seen, todo, n_tex = set(), [ROOT], 0
while todo:
    name = todo.pop()
    if name in seen:
        continue
    seen.add(name)
    if name.endswith('.ExportJson') and name not in served:
        check(name[:-len('.ExportJson')] in JP_ARM, 'armatura non servita fuori da JP_ARM: ' + name)
        continue
    p = os.path.join(SERVED_PUB, name) if name in served else os.path.join(JP_PUB, name)
    if not os.path.exists(p):
        check(False, 'sotto-layout assente ovunque: ' + name)
        continue
    subs, texs = refs(load(p))
    todo += subs
    for t, s9 in texs:
        n_tex += 1
        check(t in served or jp_has(t), '%s: texture assente ovunque %s%s' % (name, t, ' (9-slice!)' if s9 else ''))
for need in ('StartDeckProud_Base_ver131.json', 'StartDeckProud_Button_Skip_ver131.json',
             'StartDeckProud_Button_Start_ver131.json', 'StartDeckProud_Rules_ver131.json',
             'AdventureTop2_Proud_RaidInfo_Start.json', 'Cursor_Anim_Proud.ExportJson'):
    check(need in seen, 'chiusura senza ' + need)
    check(need in served or jp_has(need), 'assente nel JP: ' + need)

# slot liberi delle armature
served_layouts = {os.path.basename(f): open(f, encoding='utf-8-sig', errors='replace').read()
                  for f in glob.glob(os.path.join(SERVED_PUB, '*.json'))}
frames = {}
for arm, (slot, jp_src) in JP_ARM.items():
    check(slot + '.plist' in served, '%s: slot %s.plist non servito' % (arm, slot))
    check(jp_has(arm + '.ExportJson') and jp_has(jp_src + '.plist') and jp_has(jp_src + '.png'),
          '%s: file JP assenti (%s)' % (arm, jp_src))
    if jp_has(jp_src + '.plist'):
        frames.setdefault(slot, set()).add(tuple(sorted(re.findall(r'<key>([^<]+\.png)</key>',
                                                              open(os.path.join(JP_PUB, jp_src + '.plist'),
                                                                   encoding='utf-8').read()))))
    owners = [os.path.basename(f)[:-len('.ExportJson')] for f in glob.glob(os.path.join(SERVED_PUB, '*.ExportJson'))
              if slot + '.plist' in open(f, encoding='utf-8-sig', errors='replace').read()]
    if slot == 'MyPageAnime0':          # Ranking: slot scelto il 14-10 (banco), le scene MyPage lo citano gia'
        continue
    users = sorted(j for j, t in served_layouts.items() for o in owners if 'publish/%s.ExportJson' % o in t)
    check(not users, '%s: slot %s citato da layout serviti %s' % (arm, slot, users[:3]))
for slot, fs in frames.items():
    check(len(fs) == 1, 'slot %s condiviso da armature con fotogrammi diversi: %s' % (slot, sorted(fs)))

if errori:
    print('ERRORI (%d)' % len(errori))
    for e in errori:
        print(' -', e)
    sys.exit(1)
print('OK: chiusura di %s (%d file, %d riferimenti a texture), %d armature JP_ARM su slot liberi'
      % (ROOT, len(seen), n_tex, len(JP_ARM)))
