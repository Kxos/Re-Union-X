"""Prova offline di jp_sound_effects.py (eventi LWF, id come il client, piano e collect su alberi sintetici).

    python -I recon/tools/test_jp_sound_effects.py        -> «OK: ...» oppure «ERRORI (n)», uscita 1
"""
import json
import os
import struct
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import jp_sound_effects as m  # noqa: E402

errori = []


def check(cond, msg):
    if not cond:
        errori.append(msg)


def lwf_eventi(eventi, altre=()):
    """LWF sintetico: tabella delle stringhe (eventi + altre) e sezione eventName con gli id degli eventi."""
    strs = list(eventi) + list(altre)
    blob = b''.join(s.encode('utf-8') for s in strs)
    o_str = 32 + 288
    o_ev = o_str + len(blob)
    o_stab = o_ev + 4 * len(eventi)
    data = [0] * 72
    data[0], data[1] = o_str, len(blob)                          # [0] stringBytes
    data[50], data[51] = o_ev, len(eventi)                       # [25] eventName
    data[70], data[71] = o_stab, len(strs)                       # [35] stringData
    b = b'LWF\0' + bytes(28) + struct.pack('<72i', *data) + blob
    b += struct.pack('<%di' % len(eventi), *range(len(eventi)))
    pos = 0
    for s in strs:
        n = len(s.encode('utf-8'))
        b += struct.pack('<2i', pos, n)
        pos += n
    return b


def scrivi(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'wb') as fh:
        fh.write(data if isinstance(data, bytes) else data.encode('utf-8'))


# --- eventi e nomi audio
d = lwf_eventi(['isPlaySE_1', 'se_ui2_se_000039'], altre=['se_non_evento', 'end'])
check(m.lwf_events(d) == ['isPlaySE_1', 'se_ui2_se_000039'], 'lwf_events: solo la sezione eventName')
check(m.lwf_events(b'non un lwf') == [], 'lwf_events: file non LWF')
check(m.sound_names(['se_b', 'playBGM_x', 'se_a', 'se_a', 'se_', 'isPlaySE_1', 'stopSE']) == ['a', 'b', 'x'],
      'sound_names: se_/playBGM_, ordinati e senza doppi')
check(m.sound_names(['playSE_ui2_se_000075', 'isPlaySound_1', 'playSE_']) == ['ui2_se_000075'],
      'sound_names: playSE_ (ruota del trait Kakusei_Get1/2, I-084)')

# --- id come testo text/audio, poi atoi del nome
check(m.c_atoi(' 509000390\r\n') == 509000390 and m.c_atoi('-12x') == -12 and m.c_atoi('abc') == 0, 'c_atoi')
check(m.resolve('ui2_se_000039', '509000390') == 509000390, 'resolve: testo')
check(m.resolve('509000740', None) == 509000740, 'resolve: atoi del nome senza testo')
check(m.resolve('ui2_se_x', '0') == 0 and m.resolve('ui2_se_x', None) == 0, 'resolve: non risolto = 0')
check(m.akb_name(509000390) == 'audio/509000390.akb', 'akb_name')

# --- revisioni JP: la piu' alta vince, il file senza revisione conta -1
with tempfile.TemporaryDirectory() as t:
    for f in ('a', 'a.00000005', 'b.akb', 'b.00000007.akb', 'c.00000001.akb', 'c.00000002.akb'):
        scrivi(os.path.join(t, f), f)
    lt = m.latest(t)
    check(os.path.basename(lt['a']) == 'a.00000005', 'latest: senza estensione')
    check(os.path.basename(lt['b.akb']) == 'b.00000007.akb', 'latest: revisione sopra il file semplice')
    check(os.path.basename(lt['c.akb']) == 'c.00000002.akb', 'latest: revisione piu\' alta')
check(m.latest(os.path.join(tempfile.gettempdir(), 'non_esiste_jp_se')) == {}, 'latest: cartella assente')

# --- piano: serviti e generati saltati, testo JP copiato se manca, assenti segnalati, ordine fisso
sounds = {'lwf/z/z.lwf': ['served_se', 'gen_se', 'jp_only_text', 'senza_akb', 'nessuno'],
          'lwf/a/a.lwf': ['jp_se', 'served_se']}
with tempfile.TemporaryDirectory() as t:
    tp = os.path.join(t, 'T4')
    scrivi(tp, '4')
    p = m.plan(sounds, served_text={'served_se': '1', 'jp_se': '3', 'senza_akb': '5'},
               gen_text={'gen_se': '2'}, jp_text={'jp_only_text': tp, 'jp_se': 'T3'},
               have={'audio/000000001.akb', 'audio/000000002.akb'},
               jp_audio={'000000003.akb': 'A3', '000000004.akb': 'A4'})
    check(p['add'] == {'audio/000000003.akb': 'A3', 'audio/000000004.akb': 'A4'}, 'plan: add %r' % p['add'])
    check(p['ids'] == [3, 4], 'plan: ids')
    check(p['texts'] == {'text/audio/jp_only_text': tp}, 'plan: testo JP solo se non servito %r' % p['texts'])
    check(p['missing_jp'] == {5: 'senza_akb'}, 'plan: assente anche nel JP')
    check(p['unresolved'] == {'nessuno': ['lwf/z/z.lwf']}, 'plan: non risolto')
    check(p['refs'][3] == ['lwf/a/a.lwf'], 'plan: refs')
    check(list(p['add']) == sorted(p['add']), 'plan: ordine deterministico')

# --- collect su alberi sintetici (senza risorse servite)
with tempfile.TemporaryDirectory() as t:
    out, st, jp = os.path.join(t, 'out'), os.path.join(t, 'static', 'files'), os.path.join(t, 'jp')
    scrivi(os.path.join(out, 'lwf', 'demo', 'x10', 'x10.lwf'), lwf_eventi(['se_ui2_se_000039']))
    scrivi(os.path.join(st, 'lwf', 'medal', 'nova', 'nova.lwf'), lwf_eventi(['se_ui2_se_000074', 'se_static_se']))
    scrivi(os.path.join(st, 'audio', '509000800.akb'), b'static')            # gia' in un pacchetto statico
    scrivi(os.path.join(out, 'audio', '509000900.akb'), b'old')              # della corsa precedente (owned)
    scrivi(os.path.join(out, 'audio', '509000950.akb'), b'altro')            # di un altro generatore
    for n, v in (('ui2_se_000039', '509000390'), ('ui2_se_000074', '509000740'), ('static_se', '509000800'),
                 ('owned_se', '509000900'), ('other_se', '509000950')):
        scrivi(os.path.join(jp, 'text', 'audio', n), v)
    for i in (509000390, 509000740, 509000800, 509000900, 509000950):
        scrivi(os.path.join(jp, 'audio', '%09d.akb' % i), b'akb%d' % i)
    scrivi(os.path.join(jp, 'audio', '509000390.00000009.akb'), b'rev9')
    jp_lwf = os.path.join(jp, 'lwf', 'p', 'p.00000003.lwf')
    scrivi(jp_lwf, lwf_eventi(['se_owned_se', 'se_other_se']))
    writes = {'lwf/p/p.lwf': ('jp', jp_lwf, None)}
    kw = dict(writes=writes, owned={'audio/509000900.akb'}, jp_root=jp, served=None, static_roots=[st])
    p = m.collect(out, {'text/audio/ui2_se_000039'}, **kw)
    check(p['ids'] == [509000390, 509000740, 509000900], 'collect: ids %r' % p['ids'])
    check(os.path.basename(p['add']['audio/509000390.akb']) == '509000390.00000009.akb', 'collect: revisione JP')
    check(set(p['texts']) == {'text/audio/ui2_se_000074', 'text/audio/owned_se'},
          'collect: testi solo dove il servito manca %r' % p['texts'])
    check(p['bytes'] == 4 + 12 + 12 + 9 + 9, 'collect: byte %d' % p['bytes'])
    check(p['lwf_with_sounds'] == 3 and p['sound_names'] == 5, 'collect: conteggi')
    check(m.collect(out, {'text/audio/ui2_se_000039'}, **kw) == p, 'collect: deterministico')
    # una scrittura gia' decisa (es. BGM Medal) conta come presente; un LWF generato vince sul servito
    p2 = m.collect(out, set(), writes=dict(writes, **{'audio/509000740.akb': ('jp', 'x', None)}),
                   owned=set(), jp_root=jp, served=None, static_roots=[st])
    check(p2['ids'] == [509000390], 'collect: scritture e file non owned contano come presenti %r' % p2['ids'])

# --- Served.read / _read_at: indice sintetico, due pezzi, un record a cavallo del confine; cache degli eventi
import bgad  # noqa: E402


def record(nome, dati):
    """Record BGAD in chiaro (enc 0, comp 0, senza nonce): decode() restituisce i dati cosi' come sono."""
    n = nome.encode()
    return bgad.HDR.pack(b'BGAD', 2, 0, bgad.HDR.size, len(n), 0, 0, len(dati), len(dati)) + n + dati


with tempfile.TemporaryDirectory() as t:
    lwf_a = lwf_eventi(['se_ui2_se_000039'])
    lwf_b = lwf_eventi(['se_ui2_se_000074', 'isPlaySE_1'])
    ra, rb, rt = (record('lwf/a/a.lwf', lwf_a), record('lwf/b/b.lwf', lwf_b),
                  record('text/audio/ui2_se_000039', b'509000390'))
    blob = b'\0' * 10 + ra + rb + rt
    cut = 10 + len(ra) + 7                      # rb a cavallo dei due pezzi
    data = os.path.join(t, 'data')
    scrivi(os.path.join(data, 'd0000'), blob[:cut])
    scrivi(os.path.join(data, 'd0001'), blob[cut:])
    tsv = os.path.join(t, 'names.tsv')
    righe = ['revision\t123', 'lwf/a/a.lwf\t10', 'lwf/b/b.lwf\t%d' % (10 + len(ra)),
             'text/audio/ui2_se_000039\t%d' % (10 + len(ra) + len(rb))]
    scrivi(tsv, '\n'.join(righe) + '\n')
    sv = m.Served(tsv, data, key=bytes(32))
    check('revision' not in sv.off and len(sv.off) == 3, 'Served: indice senza la riga revision')
    check(sv._read_at(cut - 3, 6) == blob[cut - 3:cut + 3], '_read_at: lettura a cavallo dei pezzi')
    check(sv._read_at(len(blob) - 2, 10) == blob[-2:], '_read_at: fine dei dati')
    check(sv.read('lwf/a/a.lwf') == lwf_a, 'Served.read: record nel primo pezzo')
    check(sv.read('lwf/b/b.lwf') == lwf_b, 'Served.read: record a cavallo dei pezzi')
    check(sv.read('text/audio/ui2_se_000039') == b'509000390', 'Served.read: record nel secondo pezzo')
    check(sv.read('non/servito') is None, 'Served.read: nome assente')
    # cache: prima corsa scrive, seconda la legge (nessuna lettura), indice cambiato = nuova scansione
    cache = os.path.join(t, 'rep', 'cache.json')
    s1 = m.served_lwf_sounds(sv, cache)
    check(s1 == {'lwf/a/a.lwf': ['ui2_se_000039'], 'lwf/b/b.lwf': ['ui2_se_000074']}, 'cache: scansione %r' % s1)
    check(os.path.exists(cache), 'cache: scritta')

    def vietato(name):
        raise AssertionError('lettura con la cache valida')
    sv.read = vietato
    check(m.served_lwf_sounds(sv, cache) == s1, 'cache: letta senza rileggere i LWF')
    sv2 = m.Served(tsv, data, key=bytes(32))
    st1 = sv.stamp()
    check(sv2.stamp() == st1, 'stamp: stesso indice e dati = stessa impronta')
    scrivi(tsv, '\n'.join(righe[:2]) + '\n')    # indice cambiato (b tolto)
    sv3 = m.Served(tsv, data, key=bytes(32))
    check(sv3.stamp() != st1, 'stamp: indice cambiato')
    s3 = m.served_lwf_sounds(sv3, cache, save_cache=False)
    check(s3 == {'lwf/a/a.lwf': ['ui2_se_000039']}, 'cache: impronta diversa = nuova scansione %r' % s3)
    with open(cache, encoding='utf-8') as fh:
        c = json.load(fh)
    check(c['stamp'] == st1 and c['sounds'] == s1, 'save_cache=False: cache di prima non toccata')
    for x in (sv, sv2, sv3):
        x.close()
    # collect con i serviti: il LWF servito b cita 509000740, il testo servito risolve a
    out, jp = os.path.join(t, 'out'), os.path.join(t, 'jp')
    os.makedirs(out)
    scrivi(os.path.join(jp, 'text', 'audio', 'ui2_se_000074'), '509000740')
    for i in (509000390, 509000740):
        scrivi(os.path.join(jp, 'audio', '%09d.akb' % i), b'x')
    scrivi(tsv, '\n'.join(righe) + '\n')
    sv4 = m.Served(tsv, data, key=bytes(32))
    p = m.collect(out, set(sv4.off), jp_root=jp, served=sv4, static_roots=[])
    sv4.close()
    check(p['ids'] == [509000390, 509000740] and set(p['texts']) == {'text/audio/ui2_se_000074'},
          'collect con i serviti: %r %r' % (p['ids'], p['texts']))

# --- radice JP vera: i due suoni muti di I-152 ci sono
if os.path.isdir(m.JP_ROOT):
    a = m.latest(os.path.join(m.JP_ROOT, 'audio'))
    tx = m.latest(os.path.join(m.JP_ROOT, 'text', 'audio'))
    for n, i in (('ui2_se_000039', 509000390), ('ui2_se_000074', 509000740)):
        check('%09d.akb' % i in a, 'JP vero: audio %d' % i)
        check(n in tx and m.resolve(n, m.read_text(open(tx[n], 'rb').read())) == i, 'JP vero: text/audio/' + n)
else:
    print('(radice JP assente: controllo sui file veri saltato)')

if errori:
    print(f'ERRORI ({len(errori)})')
    for e in errori:
        print(' -', e)
    sys.exit(1)
print('OK: eventi LWF, id come, revisioni JP, piano, collect (statici, owned, scritture), '
      'Served.read/_read_at a cavallo dei pezzi, cache e impronta, JP vero')
