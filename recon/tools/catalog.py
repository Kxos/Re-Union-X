"""Catalogo delle risorse dell'interfaccia: miniature, dimensioni, chi le usa.

    python recon/tools/catalog.py <cartella estratta> <libcocos2dcpp.so> <uscita>

<cartella estratta> = res_bulk.py su cocostudio/, img/, text/ui/ (es.
D:\\Progetto_Restauro_KH_UX\\catalog\\files). In <uscita> scrive:
  thumbs/...           miniature PNG (lato massimo 160 px) delle texture BTF
  index.html           pagina con ricerca: texture per cartella, layout che le usano
  textures.tsv         nome, cartella, tipo, tela, immagine, layout che la citano, nel binario
  layouts.tsv          layout/scene/armature, widget, texture usate, sotto-layout, nel binario
Pillow serve: lanciare senza -I.
"""
import html
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import btf  # noqa: E402

src, so, out = sys.argv[1:4]
binary = open(so, 'rb').read()
os.makedirs(os.path.join(out, 'thumbs'), exist_ok=True)


def in_binary(name):
    return name.encode() in binary


# --- layout, scene, armature: chi usa quali texture -------------------------------------
users = {}            # nome texture (basename) -> set di file json
layouts = []
pub = os.path.join(src, 'cocostudio')
for dp, _, fs in os.walk(pub):
    for f in fs:
        p = os.path.join(dp, f)
        rel = os.path.relpath(p, src).replace(os.sep, '/')
        if f.endswith(('.json', '.ExportJson')):
            try:
                d = json.load(open(p, encoding='utf-8-sig'))
            except Exception:
                continue
            tex, widgets, subs = set(), [], set()

            def walk(n):
                if isinstance(n, dict):
                    for k, v in n.items():
                        if k in ('path', 'name') and isinstance(v, str) and v.endswith('.png'):
                            tex.add(v.split('/')[-1])
                        elif k == 'path' and isinstance(v, str) and v.endswith('.json'):
                            subs.add(v)
                        elif k == 'options' and isinstance(v, dict) and v.get('name'):
                            widgets.append('%s:%s' % (n.get('classname', '?'), v['name']))
                        walk(v)
                elif isinstance(n, list):
                    for x in n:
                        walk(x)
            walk(d)
            for t in d.get('config_png_path', []) if isinstance(d, dict) else []:
                tex.add(t)
            for t in tex:
                users.setdefault(t, set()).add(f)
            kind = 'armatura' if f.endswith('.ExportJson') else (
                'scena' if isinstance(d, dict) and 'gameobjects' in d else 'layout')
            layouts.append((rel, kind, widgets, sorted(tex), sorted(subs), in_binary(rel)))
        elif f.endswith('.plist'):
            for t in re.findall(r'<key>([^<]+\.png)</key>', open(p, encoding='utf-8', errors='replace').read()):
                users.setdefault(t, set()).add(f)

# --- texture ------------------------------------------------------------------------------
rows = []
for dp, _, fs in os.walk(src):
    for f in sorted(fs):
        if not f.endswith('.png'):
            continue
        p = os.path.join(dp, f)
        rel = os.path.relpath(p, src).replace(os.sep, '/')
        d = open(p, 'rb').read()
        i = btf.info(d)
        thumb = ''
        if i and i['type'] in (8, 9):
            try:
                im = btf.decode(d)
                im.thumbnail((160, 160))
                thumb = 'thumbs/' + rel
                os.makedirs(os.path.dirname(os.path.join(out, *thumb.split('/'))), exist_ok=True)
                im.save(os.path.join(out, *thumb.split('/')))
            except Exception as e:
                print('miniatura fallita', rel, e)
        rows.append(dict(rel=rel, folder=os.path.dirname(rel), name=f, info=i, thumb=thumb,
                         users=sorted(users.get(f, ())), binary=in_binary(f) or in_binary(rel)))

with open(os.path.join(out, 'textures.tsv'), 'w', encoding='utf-8') as fh:
    fh.write('file\ttipo\ttela\timmagine\tlayout\tnel_binario\n')
    for r in rows:
        i = r['info'] or {}
        fh.write('%s\t%s\t%s\t%s\t%s\t%d\n' % (
            r['rel'], i.get('type', '-'), 'x'.join(map(str, i.get('canvas', ()))),
            'x'.join(map(str, i.get('size', ()))), ' '.join(r['users']), r['binary']))
with open(os.path.join(out, 'layouts.tsv'), 'w', encoding='utf-8') as fh:
    fh.write('file\ttipo\tnel_binario\ttexture\tsotto_layout\twidget\n')
    for rel, kind, widgets, tex, subs, b in sorted(layouts):
        fh.write('%s\t%s\t%d\t%s\t%s\t%s\n' % (rel, kind, b, ' '.join(tex), ' '.join(subs), ' '.join(widgets)))

# --- pagina -------------------------------------------------------------------------------
E = html.escape
parts = ["""<!doctype html><html lang="it"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Catalogo risorse KHUX</title>
<style>
:root{--bg:#10142a;--fg:#e8ecff;--mut:#9aa3c7;--card:#1b2147;--line:#2c3570;--acc:#ffb347}
body{margin:0;background:var(--bg);color:var(--fg);font:14px system-ui,sans-serif}
header{position:sticky;top:0;background:var(--bg);padding:12px 16px;border-bottom:1px solid var(--line);z-index:1}
input{width:100%;max-width:520px;padding:8px;border-radius:6px;border:1px solid var(--line);background:var(--card);color:var(--fg)}
h2{margin:24px 16px 8px;font-size:16px;color:var(--acc)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px;padding:0 16px}
.c{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:8px;overflow-wrap:anywhere}
.c img{display:block;margin:0 auto 6px;max-width:160px;max-height:160px;
background:repeating-conic-gradient(#333 0 25%,#555 0 50%) 0 0/16px 16px}
.n{font-weight:600}.m{color:var(--mut);font-size:12px}.b{color:#7fe07f}
table{border-collapse:collapse;margin:0 16px}td{border-bottom:1px solid var(--line);padding:4px 8px;vertical-align:top;font-size:12px}
</style></head><body><header><input id="q" placeholder="Cerca (nome, cartella, layout)..." oninput="f()">
<div class="m" id="cnt"></div></header>"""]
by_folder = {}
for r in rows:
    by_folder.setdefault(r['folder'], []).append(r)
for folder in sorted(by_folder):
    parts.append('<h2>%s (%d)</h2><div class="grid">' % (E(folder), len(by_folder[folder])))
    for r in by_folder[folder]:
        i = r['info'] or {}
        dims = 'x'.join(map(str, i.get('size', ()))) or '?'
        if i.get('canvas') and i['canvas'] != i.get('size'):
            dims += ' (tela %s)' % 'x'.join(map(str, i['canvas']))
        key = ' '.join([r['rel']] + r['users']).lower()
        parts.append('<div class="c" data-k="%s">%s<div class="n">%s</div><div class="m">%s · tipo %s%s</div>'
                     '<div class="m">%s</div></div>' % (
                         E(key), ('<img loading="lazy" src="%s">' % E(r['thumb'])) if r['thumb'] else '',
                         E(r['name']), dims, i.get('type', '-'),
                         ' · <span class="b">nel binario</span>' if r['binary'] else '',
                         E(', '.join(r['users'][:6]) + (' …' if len(r['users']) > 6 else ''))))
    parts.append('</div>')
parts.append('<h2>Layout, scene e armature (%d)</h2><table>' % len(layouts))
for rel, kind, widgets, tex, subs, b in sorted(layouts):
    parts.append('<tr class="c2" data-k="%s"><td>%s<br><span class="m">%s%s</span></td><td class="m">%s</td><td class="m">%s</td></tr>' % (
        E((rel + ' ' + ' '.join(tex) + ' ' + ' '.join(widgets)).lower()), E(rel), kind,
        ' · <span class="b">nel binario</span>' if b else '', E(' '.join(subs + tex)),
        E(' '.join(w.split(':', 1)[1] for w in widgets[:40]))))
parts.append("""</table><script>
function f(){const q=document.getElementById('q').value.toLowerCase().trim();let n=0;
document.querySelectorAll('[data-k]').forEach(e=>{const ok=!q||e.dataset.k.includes(q);e.style.display=ok?'':'none';if(ok)n++});
document.getElementById('cnt').textContent=n+' elementi'}f()</script></body></html>""")
open(os.path.join(out, 'index.html'), 'w', encoding='utf-8').write('\n'.join(parts))
print('texture', len(rows), 'layout', len(layouts), '->', out)
