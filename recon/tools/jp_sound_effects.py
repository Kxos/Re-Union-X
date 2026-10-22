"""Effetti sonori originali citati dai LWF serviti o generati e assenti dalle risorse: dal JP 4.3.1.

Il client suona gli eventi dei LWF (AudioLWFNode): `se_<nome>` (e
`playBGM_<nome>`) -> id = (testo `text/audio/<nome>`), se 0
`atoi(<nome>)` carica `audio/%09d.akb`; senza file non suona nulla. L'estrazione x10
(`se_ui2_se_000039` in raidgacha_result_display_10) e il popup del Nova (`se_ui2_se_000074` in
GuiltBonus_BurstLvup) erano muti: gli AKB 509000390/509000740 mancano da OBB 5.0.1 + addnl.

Per ogni LWF effettivamente servito (indice names_v4.tsv, poi i pacchetti generati, che vincono a
nome ripetuto) si leggono gli eventi della sezione eventName, si risolve l'id come il client e, se
`audio/%09d.akb` non e' servito ne' gia' in un pacchetto generato, lo si copia dalla radice JP (la
revisione piu' alta), come le BGM Medals in import_jp_coco.py. Se manca anche `text/audio/<nome>`
servito, si copia anche quello dal JP (senza testo l'id sarebbe 0). Deterministico (ordine dei nomi).

Usato da import_jp_coco.py (scrive nel pacchetto generato, manifest e pulizia come gli altri file
JP). Da solo e' un resoconto che non scrive nulla:
    python -I recon/tools/jp_sound_effects.py [--out <stage_gen\\files>] [--json <rapporto.json>]
Chiave dei record serviti: BGAD_KEY (esadecimale) o la chiave letta dalla libreria WW 4.3.1.
docs/notes/risorse_layout.md#suoni-jp, ISSUES I-152.
"""
import argparse
import bisect
import json
import os
import re
import struct
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
D = r'D:\Progetto_Restauro_KH_UX'
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # with python -I the script folder is not on sys.path
import private_tools  # noqa: E402  (local reference data folders, see private_tools.py)
JP_ROOT = private_tools.local_path('jp_data')
STATIC_PACKS = ('medal_gen', 'rooms_gen', 'enemy_gen', 'raisedraw_gen')
RESERVE = 176 * 1024 * 1024        # riserva del pacchetto generato (build-resources.ps1 $dataSize, versioni complete)
# playSE_<nome>: eventi delle LWF della ruota del trait (Kakusei_Get1/2: playSE_ui2_se_000075/76, AKB 509000750/760
# assenti dalle risorse WW; il client ha il gestore «playSE», banco 19-10: animazione muta)
PREFIXES = ('se_', 'playBGM_', 'playSE_')
# indici delle sezioni nell'intestazione LWF (stesso ordine di make_pet_motions.SECTIONS)
SEC_STRING_BYTES, SEC_EVENT_NAME, SEC_STRING_DATA = 0, 25, 35
REV = re.compile(r'^(.+?)\.(\d{8})(\.[A-Za-z0-9]+)?$')


def lwf_events(data):
    """Nomi degli eventi (sezione eventName: un id di stringa per evento) di un LWF; [] se non e' un LWF."""
    if len(data) < 32 + 8 * 36 or data[:3] != b'LWF':
        return []
    sec = [struct.unpack_from('<2i', data, 32 + 8 * i) for i in range(36)]
    sb = sec[SEC_STRING_BYTES][0]
    so, sn = sec[SEC_STRING_DATA]
    eo, en = sec[SEC_EVENT_NAME]
    out = []
    try:
        for k in range(en):
            sid = struct.unpack_from('<i', data, eo + 4 * k)[0]
            if not 0 <= sid < sn:
                continue
            a, b = struct.unpack_from('<2i', data, so + 8 * sid)
            out.append(data[sb + a:sb + a + b].decode('utf-8', 'replace'))
    except struct.error:
        return []
    return out


def sound_names(events):
    """Nomi audio degli eventi `se_<nome>` / `playBGM_<nome>` / `playSE_<nome>`, ordinati."""
    return sorted({e[len(p):] for e in events for p in PREFIXES if e.startswith(p) and len(e) > len(p)})


def c_atoi(s):
    """atoi() del C: spazi iniziali, segno, cifre; 0 se non inizia con un numero."""
    m = re.match(r'\s*([+-]?\d+)', s)
    return int(m.group(1)) if m else 0


def resolve(name, text):
    """id come atoi del testo text/audio/<nome> (None = assente), se 0 atoi del nome."""
    return (c_atoi(text) if text is not None else 0) or c_atoi(name)


def akb_name(sid):
    return 'audio/%09d.akb' % sid


def latest(dirpath):
    """{nome logico: percorso} di una cartella JP, revisione piu' alta (`x.<8 cifre>[.ext]`; senza = -1)."""
    best = {}
    if not os.path.isdir(dirpath):
        return {}
    for f in sorted(os.listdir(dirpath)):
        m = REV.match(f)
        base, r = (m.group(1) + (m.group(3) or ''), int(m.group(2))) if m else (f, -1)
        if base not in best or best[base][0] < r:
            best[base] = (r, os.path.join(dirpath, f))
    return {k: v[1] for k, v in best.items()}


def read_text(blob):
    return blob.decode('utf-8-sig', 'replace')


def plan(lwf_sounds, served_text, gen_text, jp_text, have, jp_audio):
    """Piano deterministico.

    lwf_sounds  {lwf: [nomi audio]} dei LWF effettivi
    served_text {nome: testo} di text/audio servito; gen_text idem del pacchetto generato (vince)
    jp_text     {nome: percorso} text/audio JP; jp_audio {'%09d.akb': percorso}
    have        nomi gia' disponibili (serviti o in un pacchetto generato)
    -> dict(add={audio/...: src}, texts={text/audio/...: src}, ids, refs={id: [lwf]}, missing_jp, unresolved)
    """
    refs, add, texts, missing, unresolved = {}, {}, {}, {}, {}
    for lwf in sorted(lwf_sounds):
        for n in lwf_sounds[lwf]:
            txt = gen_text.get(n, served_text.get(n))
            text_src = None
            if txt is None and n in jp_text:
                with open(jp_text[n], 'rb') as fh:
                    txt = read_text(fh.read())
                text_src = jp_text[n]
            sid = resolve(n, txt)
            if not sid:
                unresolved.setdefault(n, []).append(lwf)
                continue
            name = akb_name(sid)
            if name in have:
                continue
            refs.setdefault(sid, []).append(lwf)
            src = jp_audio.get('%09d.akb' % sid)
            if not src:
                missing.setdefault(sid, n)
                continue
            add[name] = src
            if text_src and ('text/audio/' + n) not in have:
                texts['text/audio/' + n] = text_src
    ids = sorted(int(k[6:15]) for k in add)
    return dict(add=dict(sorted(add.items())), texts=dict(sorted(texts.items())), ids=ids,
                refs={k: sorted(set(v)) for k, v in sorted(refs.items())},
                missing_jp=dict(sorted(missing.items())), unresolved={k: sorted(set(v)) for k, v in sorted(unresolved.items())})


# ---- risorse servite ------------------------------------------------------------------------
class Served:
    """Lettura per nome dalle risorse servite (indice nome<TAB>offset, pezzi d0000.. concatenati)."""

    def __init__(self, tsv, datadir, key=None):
        self.tsv, self.datadir = tsv, datadir
        self.off = {}
        with open(tsv, encoding='utf-8') as fh:
            for line in fh:
                n, _, o = line.rstrip('\n').partition('\t')
                if o.isdigit() and n != 'revision':
                    self.off[n] = int(o)
        self._key = key
        self.pieces, self.starts, total = [], [], 0
        if os.path.isdir(datadir):
            for f in sorted(os.listdir(datadir)):
                self.pieces.append(os.path.join(datadir, f))
                self.starts.append(total)
                total += os.path.getsize(self.pieces[-1])
        else:
            print('jp_se: ATTENZIONE, dati delle risorse servite assenti (%s): LWF e testi serviti non letti, '
                  'suoni dei soli LWF generati' % datadir)
        self._fh = {}

    def key(self):
        if self._key is None:
            sys.path.insert(0, HERE)
            import bgad
            self._key = (bytes.fromhex(os.environ['BGAD_KEY']) if os.environ.get('BGAD_KEY') else
                         bgad.lib_key(os.path.join(HERE, '..', 'ext', 'ww431', 'libcocos2dcpp.so')))
        return self._key

    def read(self, name):
        sys.path.insert(0, HERE)
        import bgad
        off = self.off.get(name)
        if off is None or not self.pieces:
            return None
        h = bgad.parse(self._read_at(off, bgad.HDR.size))
        buf = self._read_at(off, h['hsize'] + h['nlen'] + h['size'])
        return bgad.decode(buf, bgad.parse(buf), self.key())

    def _read_at(self, off, n):
        """n byte all'offset della concatenazione dei pezzi (un record puo' stare a cavallo di due)."""
        out = b''
        i = bisect.bisect_right(self.starts, off) - 1
        while n > 0 and 0 <= i < len(self.pieces):
            fh = self._fh.get(i) or self._fh.setdefault(i, open(self.pieces[i], 'rb'))
            fh.seek(off - self.starts[i])
            b = fh.read(n)
            out, off, n, i = out + b, off + len(b), n - len(b), i + 1
        return out

    def close(self):
        for fh in self._fh.values():
            fh.close()
        self._fh = {}

    def stamp(self):
        st = os.stat(self.tsv)
        return '%s|%d|%d|%d' % (os.path.basename(self.tsv), st.st_size, st.st_mtime_ns, sum(map(os.path.getsize, self.pieces)))


def served_lwf_sounds(served, cache_path=None, save_cache=True):
    """{lwf servito: [nomi audio]} (solo i LWF con suoni), con cache su disco (impronta di indice e dati;
    save_cache=False la legge soltanto, per --check).

    names_v4.tsv e' l'indice unito della versione 7 (OBB 5.0.1 + addnl 4.3.1, a parita' di nome vince
    l'OBB): tutti i 19.806 nomi dell'addnl ci sono, 13.148 con l'offset della copia OBB e gli altri con
    quello della copia addnl (175 LWF). Leggere names_v4 da' quindi proprio la copia che il client carica;
    le copie addnl perdenti (654 LWF) non si caricano mai, e le due che servono (wait, win_levelup) le
    mette prefer_addnl.py in stage_gen, letto come generato."""
    stamp = served.stamp()
    if cache_path and os.path.exists(cache_path):
        try:
            c = json.load(open(cache_path, encoding='utf-8'))
            if c.get('stamp') == stamp:
                return c['sounds']
        except (ValueError, KeyError):
            pass
    out = {}
    for name in sorted((n for n in served.off if n.endswith('.lwf')), key=served.off.get):
        try:
            s = sound_names(lwf_events(served.read(name) or b''))
        except Exception as e:                  # record illeggibile: segnalato, non blocca
            print('jp_se: LWF servito illeggibile %s (%s)' % (name, e))
            continue
        if s:
            out[name] = s
    out = dict(sorted(out.items()))
    if cache_path and save_cache:
        os.makedirs(os.path.dirname(os.path.abspath(cache_path)), exist_ok=True)
        with open(cache_path, 'w', encoding='utf-8') as fh:
            json.dump(dict(stamp=stamp, sounds=out), fh, indent=0)
    return out


def walk_names(root):
    """{nome con /: percorso} dei file di una cartella."""
    out = {}
    for dp, _, fs in os.walk(root):
        for f in fs:
            p = os.path.join(dp, f)
            out[os.path.relpath(p, root).replace(os.sep, '/')] = p
    return out


def collect(out, served_names, writes=None, owned=(), jp_root=JP_ROOT, served=None, static_roots=None,
            cache_path=None, save_cache=True):
    """Piano per il pacchetto generato <out> (stage_gen\\files).

    served_names  nomi serviti (names_v4 + addnl)
    writes        {nome: ('jp', src, data)} gia' decisi da import_jp_coco (LWF JP in arrivo, BGM)
    owned         nomi in <out> scritti dalla corsa precedente dell'import (manifest): non contano
                  come «gia' nel pacchetto», altrimenti la pulizia li toglierebbe
    static_roots  cartelle files\ dei pacchetti statici davvero nell'indice (predefinite: tutte e quattro;
                  import_jp_coco toglie quelle escluse con --no-static)
    """
    writes = writes or {}
    if static_roots is None:
        static_roots = static_dirs()
    # LWF effettivi: serviti < pacchetti statici < generato su disco < scritture di questa corsa
    lwf_src = {}
    for root in [r for r in static_roots if os.path.isdir(r)] + [out]:
        for n, p in walk_names(root).items():
            if n.endswith('.lwf'):
                lwf_src[n] = p
    for n, w in writes.items():
        if n.endswith('.lwf') and w[0] == 'jp':
            lwf_src[n] = w[2] if isinstance(w[2], bytes) else w[1]
    sounds = {}
    if served is not None:
        sounds.update({n: s for n, s in served_lwf_sounds(served, cache_path, save_cache).items() if n not in lwf_src})
    for n, p in sorted(lwf_src.items()):
        data = p if isinstance(p, bytes) else open(p, 'rb').read()
        s = sound_names(lwf_events(data))
        if s:
            sounds[n] = s
    # nomi gia' disponibili: serviti, pacchetti statici, file del generato non scritti dall'import
    have = set(served_names) | {n for n, w in writes.items() if w[0] != 'delete'}
    for root in [r for r in static_roots if os.path.isdir(r)]:
        have.update('audio/' + k for k in walk_names(os.path.join(root, 'audio')))
        have.update('text/audio/' + k for k in walk_names(os.path.join(root, 'text', 'audio')))
    gen_audio = walk_names(os.path.join(out, 'audio'))
    have.update('audio/' + k for k in gen_audio if 'audio/' + k not in owned)
    gen_text = {}
    for k, p in walk_names(os.path.join(out, 'text', 'audio')).items():
        if 'text/audio/' + k not in owned:
            have.add('text/audio/' + k)
            gen_text[k] = read_text(open(p, 'rb').read())
    needed = sorted({n for s in sounds.values() for n in s})
    served_text = {}
    if served is not None:
        for n in needed:
            if n not in gen_text and 'text/audio/' + n in served.off:
                served_text[n] = read_text(served.read('text/audio/' + n) or b'')
    p = plan(sounds, served_text, gen_text, latest(os.path.join(jp_root, 'text', 'audio')),
             have, latest(os.path.join(jp_root, 'audio')))
    p['bytes'] = sum(os.path.getsize(s) for s in list(p['add'].values()) + list(p['texts'].values()))
    p['lwf_with_sounds'] = len(sounds)
    p['sound_names'] = len(needed)
    return p


def static_dirs(skip=()):
    """Cartelle files\ dei pacchetti statici, senza quelli esclusi."""
    return [os.path.join(D, p, 'files') for p in STATIC_PACKS if p not in skip]


def summary(p):
    return ('suoni JP: %d AKB aggiunti (%d byte), %d testi text/audio, %d LWF con suoni, %d nomi; '
            'assenti anche nel JP: %d, non risolti: %d' % (
                len(p['add']), p['bytes'], len(p['texts']), p['lwf_with_sounds'], p['sound_names'],
                len(p['missing_jp']), len(p['unresolved'])))


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--out', default=os.path.join(D, 'stage_gen', 'files'))
    ap.add_argument('--jp', default=JP_ROOT)
    ap.add_argument('--served', default=os.path.join(D, 'resource_data', 'names_v4.tsv'))
    ap.add_argument('--addnl', default=os.path.join(D, 'ipa431', 'names_addnl.tsv'))
    ap.add_argument('--data', default=os.path.join(D, 'resource_data', '7', 'data'))
    ap.add_argument('--manifest', default=None, help='manifest di import_jp_coco (predefinito: <out>/../jp_import)')
    ap.add_argument('--cache', default=None)
    ap.add_argument('--json', default=None, help='rapporto completo')
    ap.add_argument('--no-static', action='append', default=[], choices=STATIC_PACKS,
                    help="pacchetto statico non nell'indice (-NoRooms/-NoEnemies/-NoRaisedraw)")
    ap.add_argument('--apply', action='store_true',
                    help="copia in --out gli AKB e i testi mancanti (build-resources, dopo import_originals.py: "
                         "i LWF originali importati dopo import_jp_coco hanno suoni propri)")
    a = ap.parse_args(argv)
    rep_dir = os.path.join(os.path.dirname(os.path.abspath(a.out)), 'jp_import')
    man = a.manifest or os.path.join(rep_dir, 'manifest.json')
    owned = set(json.load(open(man, encoding='utf-8'))) if os.path.exists(man) else set()
    names = set()
    for t in (a.served, a.addnl):
        if os.path.exists(t):
            names.update(line.split('\t')[0] for line in open(t, encoding='utf-8'))
    served = Served(a.served, a.data)
    # musica delle BGM Medals: la scrive import_jp_coco.py (stessa radice JP), non conta come aggiunta
    bgm = json.load(open(os.path.join(HERE, '..', '..', 'server', 'medal_bgm.json'), encoding='utf-8'))['medals']
    writes = {akb_name(i): ('jp', None, None) for i in set(bgm.values())}
    p = collect(a.out, names, writes=writes, owned=owned, jp_root=a.jp, served=served,
                static_roots=static_dirs(a.no_static),
                cache_path=a.cache or os.path.join(rep_dir, 'served_lwf_sounds.json'))
    # file gia' nel generato, senza quelli che il piano riscrive (corsa precedente dell'import)
    gen = sum(os.path.getsize(f) for n, f in walk_names(a.out).items() if n not in p['add'] and n not in p['texts'])
    print(summary(p))
    print('id: ' + ' '.join(str(i) for i in p['ids']))
    print('pacchetto generato stimato (file, senza intestazioni): %d + %d = %d byte su %d di riserva (%.1f%%)' % (
        gen, p['bytes'], gen + p['bytes'], RESERVE, 100.0 * (gen + p['bytes']) / RESERVE))
    if a.json:
        json.dump(p, open(a.json, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    if a.apply:
        import shutil
        for name, src in sorted(list(p['add'].items()) + list(p['texts'].items())):
            dst = os.path.join(a.out, *name.split('/'))
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.copyfile(src, dst)
            print('copiato ' + name)
    return p


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
