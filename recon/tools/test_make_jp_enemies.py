"""Prova offline delle regole di make_jp_enemies.py su cartelle finte (nessun dato vero, nessuna scrittura in enemy_gen).

    python recon/tools/test_make_jp_enemies.py        -> «OK: ...» oppure «ERRORI (n)», uscita 1

Casi (21-10, I-009 Task 7): texture scartate come doppioni dall'estrazione JP e rimaste con lo STESSO nome in
un'altra animazione dello stesso nemico (es. 1532: wait.lwf cita wait_<x>.png, il file vero sta in atk1_o/), famiglie
dei nemici delle missioni 526-979 (oltre_families: displayId = famiglia se la cartella JP c'e'), tabella dei doppioni
(jp_dedup_donors.tsv: texture rimasta solo in un'altra cartella JP, es. lwf/drama/<id>/), controllo delle dimensioni
dichiarate nella regola dello stesso nome (1577: fumo di dead 146x148 al posto degli ingranaggi 95x65 di wait), tabella
delle texture ricostruite (jp_reconstructed.tsv, I-194: usata solo dopo le copie e i doppioni), copie da altri
contenitori (extra_donors.tsv: exact501 categoria 1, copie 2, animazione intera dal gemello Dark Road) e ricolorate
(jp_recoloured.tsv, categoria 4, anche la dead generica intera del gemello di colore).
"""
import os
import shutil
import struct
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
TMP = tempfile.mkdtemp(prefix='jpen-', dir=r'D:\Progetto_Restauro_KH_UX\tmp' if os.path.isdir(r'D:\Progetto_Restauro_KH_UX\tmp') else None)
JP, B16 = os.path.join(TMP, 'jp'), os.path.join(TMP, 'b2016')
ROOT = os.path.join(TMP, 'root')                      # finta radice JP delle sorgenti della tabella
JP = os.path.join(ROOT, 'lwf', 'character', 'enemy')
DON = os.path.join(TMP, 'donors.tsv')
with open(DON, 'w', encoding='utf-8') as fh:
    fh.write('# prova\n'
             'lwf/character/enemy/1700/wait/wait_a.png\tlwf/drama/99/99_x.png\tunique\n'
             'lwf/character/enemy/1701/wait/wait_a.png\tlwf/drama/99/99_assente.png\tunique\n'
             'lwf/character/enemy/20/wait/wait_q.png\tlwf/drama/99/99_x.png\tunique\n'
             'lwf/character/enemy/1801/wait/wait_s.png\tlwf/drama/99/99_x.png\tunique\n')
REC = os.path.join(TMP, 'recon.tsv')
with open(REC, 'w', encoding='utf-8') as fh:
    fh.write('# prova\n'
             'lwf/character/enemy/1800/wait/wait_s.png\tlwf/character/enemy/1800/atk1_o/atk1_o_s.png\tshadow-family\tnota\n'
             'lwf/character/enemy/1801/wait/wait_s.png\tlwf/character/enemy/1801/atk1_o/atk1_o_s.png\tshadow-family\tnota\n'
             'lwf/character/enemy/1802/wait/wait_s.png\tlwf/character/enemy/1802/atk1_o/assente.png\tshadow-common\tnota\n')
# copie da altri contenitori (extra_donors.tsv, I-194 del 21-10) e ricolorate (jp_recoloured.tsv): radici finte
BOX = {k: os.path.join(TMP, k) for k in ('jp501', 'ww501', 'recolour')}
XTR = os.path.join(TMP, 'extra.tsv')
with open(XTR, 'w', encoding='utf-8') as fh:
    fh.write('# prova\n'
             'lwf/character/enemy/1900/wait/wait_a.png\tjp501:lwf/character/enemy/5900/wait/wait_a.png\texact501\tn\n'
             'lwf/character/enemy/1901/wait/wait_a.png\tww501:lwf/character/enemy/5901/wait/wait_a.png\ttwinfam\tn\n'
             'lwf/character/enemy/1902/wait/wait.lwf\tww501:lwf/character/enemy/5902/wait/wait.lwf\twhole-dr-twin\tn\n'
             'lwf/character/enemy/1902/wait/wait_w.png\tww501:lwf/character/enemy/5902/wait/wait_w.png\twhole-dr-twin\tn\n'
             'lwf/character/enemy/1903/wait/wait_1.png\tjp501:lwf/character/enemy/5903/wait/wait_1.png\ttwinfam\tn\n'
             'lwf/character/enemy/1906/wait/wait_a.png\tww501:lwf/character/enemy/5901/wait/wait_a.png\ttwinfam\tn\n'
             'lwf/character/enemy/1910/wait/wait_a.png\tww501:lwf/character/enemy/5901/wait/wait_a.png\ttwinfam\tn\n')
COL = os.path.join(TMP, 'recol.tsv')
with open(COL, 'w', encoding='utf-8') as fh:
    fh.write('# prova\n'
             'lwf/character/enemy/1904/wait/wait_a.png\trecolour:lwf/character/enemy/1904/wait/wait_a.png\trecolour\tn\n'
             'lwf/character/enemy/1905/dead/dead.lwf\tww501:lwf/character/enemy/5902/dead/dead.lwf\trecolour-whole\tn\n'
             'lwf/character/enemy/1905/dead/dead_d.png\tww501:lwf/character/enemy/5902/dead/dead_d.png\trecolour-whole\tn\n'
             'lwf/character/enemy/1906/wait/wait_a.png\trecolour:lwf/character/enemy/1904/wait/wait_a.png\trecolour\tn\n')
# original copies matched by texture-table order (extra_donors_dedup.tsv, I-194 23-10): last among the copies
DDP = os.path.join(TMP, 'dedup.tsv')
with open(DDP, 'w', encoding='utf-8') as fh:
    fh.write('# test\n'
             'lwf/character/enemy/1907/wait/wait_a.png\tjp431:lwf/drama/98/98_a.png\tdedup-order\t10x10\tA\n'
             'lwf/character/enemy/1906/wait/wait_a.png\tjp431:lwf/drama/98/98_a.png\tdedup-order\t10x10\tA\n'
             'lwf/character/enemy/1909/wait/wait_a.png\tjp431:lwf/drama/98/98_big.png\tdedup-order\t10x10\tC\n'
             'lwf/character/enemy/1910/wait/wait_a.png\tjp431:lwf/drama/98/98_a.png\tdedup-override\t10x10\tA\n'
             'lwf/character/enemy/1911/wait/wait_a.png\tjp431:lwf/drama/98/98_a.png\tdedup-override\t10x10\tA\n'
             'lwf/character/enemy/1912/wait/wait_a.png\tjp431:lwf/drama/98/98_big.png\tdedup-override\t10x10\tA\n'
             'lwf/character/enemy/1913/wait/wait_a.png\tjp431:lwf/drama/98/98_a.png\tdedup-rescale\t10x10\tC\n'
             'lwf/character/enemy/1914/wait/wait_a.png\tjp431:lwf/drama/98/98_11.png\tdedup-rescale\t10x10\tC\n')
sys.argv = [sys.argv[0], '--jp', JP, '--jp-root', ROOT, '--donors', DON, '--recon', REC, '--b2016', B16, '--out', os.path.join(TMP, 'out'),
            '--extra', XTR, '--recolour', COL, '--dedup', DDP] + ['--src-root=%s=%s' % kv for kv in BOX.items()]
sys.path.insert(0, HERE)
import make_jp_enemies as m  # noqa: E402

errori = []


def check(cond, msg):
    if not cond:
        errori.append(msg)


def put(rel, data):
    p = os.path.join(JP, *rel.split('/'))
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'wb') as fh:
        fh.write(data)


def lwf(*pngs):
    return b'LWF\x00' + b'\x00'.join(x.encode() for x in pngs) + b'\x00'


def real_lwf(**tex):
    """LWF minima con la sezione texture (nome=(w, h)): stringBytes a 32, texture a 96, stringData a 312."""
    names = list(tex)
    blob = b''.join(n.encode() for n in names)
    b = bytearray(1024)
    struct.pack_into('<ii', b, 32, 400, len(blob))
    b[400:400 + len(blob)] = blob
    o = 0
    for k, n in enumerate(names):
        struct.pack_into('<ii', b, 600 + 8 * k, o, len(n))
        o += len(n)
    struct.pack_into('<ii', b, 312, 600, len(names))
    struct.pack_into('<ii', b, 96, 800, len(names))
    for k, n in enumerate(names):
        struct.pack_into('<iiiif', b, 800 + 20 * k, k, 0, tex[n][0], tex[n][1], 1.0)
    return bytes(b)


def png(w, h):
    """intestazione PNG con IHDR (basta a img_size)."""
    return b'\x89PNG\r\n\x1a\n' + struct.pack('>I', 13) + b'IHDR' + struct.pack('>II', w, h) + b'\x08\x06\x00\x00\x00'


try:
    # 1532: tutte le texture di wait/knockback/dead stanno solo in atk1_o/ col nome wait_*
    put('1532/wait/wait.lwf', lwf('wait_a.png', 'wait_b.png'))
    put('1532/atk1_o/atk1_o.lwf', lwf('wait_a.png', 'wait_b.png', 'atk1_o_c.png'))
    put('1532/atk1_o/wait_a.png', b'A')
    put('1532/atk1_o/wait_b.png', b'B')
    put('1532/atk1_o/atk1_o_c.png', b'C')
    put('1532/knockback/knockback.lwf', lwf('wait_a.png'))
    put('1532/dead/dead.lwf', lwf('wait_b.png'))
    r, todo = m.plan_enemy(1532)
    check(r['status'] == 'completo', 'stesso nome in altra animazione: completo (%s)' % r.get('why'))
    pre = 'lwf/character/enemy/1532/'
    check(todo.get(pre + 'wait/wait_a.png', '').endswith(os.path.join('atk1_o', 'wait_a.png')), 'wait_a da atk1_o')
    check(pre + 'move/move.lwf' in todo and pre + 'move/wait_b.png' in todo, 'move da wait con le texture riempite')
    check(r['anims']['wait']['status'] == 'jp+riempite', 'stato jp+riempite: %s' % r['anims']['wait'])

    # copie candidate diverse: incompleto (mai una texture a caso)
    put('1600/wait/wait.lwf', lwf('wait_a.png'))
    put('1600/atk1_o/atk1_o.lwf', lwf('atk1_o_x.png'))
    put('1600/atk1_o/atk1_o_x.png', b'X')
    put('1600/atk1_o/wait_a.png', b'A1')
    put('1600/knockback/knockback.lwf', lwf('knockback_y.png'))
    put('1600/knockback/knockback_y.png', b'Y')
    put('1600/knockback/wait_a.png', b'A2')
    put('1600/dead/dead.lwf', lwf('dead_z.png'))
    put('1600/dead/dead_z.png', b'Z')
    r, todo = m.plan_enemy(1600)
    check(r['status'] == 'incompleto' and 'wait' in r['why'] and not todo, 'copie diverse: incompleto (%s)' % r)

    # regola vecchia (<anim>_<suffisso> in un'altra animazione) invariata e preferita
    put('20/wait/wait.lwf', lwf('wait_q.png'))
    put('20/atk1_o/atk1_o.lwf', lwf('atk1_o_q.png'))
    put('20/atk1_o/atk1_o_q.png', b'Q')
    put('20/knockback/knockback.lwf', lwf('knockback_k.png'))
    put('20/knockback/knockback_k.png', b'K')
    put('20/dead/dead.lwf', lwf('dead_d.png'))
    put('20/dead/dead_d.png', b'D')
    r, todo = m.plan_enemy(20)
    check(r['status'] == 'completo' and todo.get('lwf/character/enemy/20/wait/wait_q.png', '').endswith('atk1_o_q.png'),
          'regola del suffisso: %s' % r)

    # tabella dei doppioni: wait_a.png manca in tutta la cartella del nemico, il file identico sta in un filmato
    os.makedirs(os.path.join(ROOT, 'lwf', 'drama', '99'))
    with open(os.path.join(ROOT, 'lwf', 'drama', '99', '99_x.png'), 'wb') as fh:
        fh.write(b'X')
    for fam in ('1700', '1701'):
        put(fam + '/wait/wait.lwf', lwf('wait_a.png'))
        put(fam + '/atk1_o/atk1_o.lwf', lwf('atk1_o_c.png'))
        put(fam + '/atk1_o/atk1_o_c.png', b'C')
        put(fam + '/knockback/knockback.lwf', lwf('atk1_o_c.png'))
        put(fam + '/knockback/atk1_o_c.png', b'C')
        put(fam + '/dead/dead.lwf', lwf('atk1_o_c.png'))
        put(fam + '/dead/atk1_o_c.png', b'C')
    r, todo = m.plan_enemy(1700)
    check(r['status'] == 'completo' and todo.get('lwf/character/enemy/1700/wait/wait_a.png') ==
          os.path.join(ROOT, 'lwf', 'drama', '99', '99_x.png'), 'doppione dalla tabella: %s' % r)
    check('1 dalla tabella dei doppioni' in r['anims']['wait'].get('note', ''), 'nota della tabella: %s' % r['anims']['wait'])
    check(todo.get('lwf/character/enemy/1700/move/wait_a.png', '').endswith('99_x.png'), 'move da wait col doppione')
    r, todo = m.plan_enemy(1701)
    check(r['status'] == 'incompleto' and not todo, 'sorgente della tabella assente: incompleto (%s)' % r)
    # la regola del suffisso dello stesso nemico vince sulla tabella (20 ha una riga per wait_q.png)
    r, todo = m.plan_enemy(20)
    check(todo.get('lwf/character/enemy/20/wait/wait_q.png', '').endswith('atk1_o_q.png'), 'suffisso prima della tabella')

    # dimensioni dichiarate (21-10): stesso nome in dead/ ma 146x148 contro 95x65 dichiarate -> non vale
    put('1577/wait/wait.lwf', real_lwf(**{'wait_1.png': (95, 65)}))
    put('1577/dead/dead.lwf', real_lwf(**{'dead_1.png': (146, 148)}))
    put('1577/dead/dead_1.png', png(146, 148))
    for an in ('atk1_o', 'knockback'):
        put('1577/%s/%s.lwf' % (an, an), real_lwf(**{an + '_k.png': (10, 10)}))
        put('1577/%s/%s_k.png' % (an, an), png(10, 10))
    check(m.tex_dims(os.path.join(JP, '1577', 'wait', 'wait.lwf')) == {'wait_1.png': (95, 65)}, 'tex_dims')
    check(m.tex_dims(os.path.join(JP, '1532', 'wait', 'wait.lwf')) is None, 'tex_dims: LWF illeggibile -> None')
    r, todo = m.plan_enemy(1577)
    check(r['status'] == 'incompleto' and 'wait' in r['why'], 'misure diverse: incompleto (%s)' % r)
    put('1577/dead/dead_1.png', png(96, 64))          # +-2 px dell'esportazione: vale
    m._sha.clear()
    r, todo = m.plan_enemy(1577)
    check(r['status'] == 'completo' and todo.get('lwf/character/enemy/1577/wait/wait_1.png', '').endswith('dead_1.png'),
          'misure uguali (+-2): completo (%s)' % r)

    # tabella delle texture ricostruite (I-194): l'ombra persa da un'altra animazione della stessa famiglia
    for fam in ('1800', '1801', '1802', '1803'):
        put(fam + '/wait/wait.lwf', lwf('wait_s.png'))
        for an in ('atk1_o', 'knockback', 'dead'):
            put('%s/%s/%s.lwf' % (fam, an, an), lwf(an + '_s.png'))
            put('%s/%s/%s_s.png' % (fam, an, an), b'S' + fam.encode() + an.encode())  # copie diverse: suffisso ambiguo
    r, todo = m.plan_enemy(1800)
    check(r['status'] == 'completo' and todo.get('lwf/character/enemy/1800/wait/wait_s.png') ==
          os.path.join(JP, '1800', 'atk1_o', 'atk1_o_s.png'), 'ricostruita dalla tabella: %s' % r)
    check('1 ricostruite' in r['anims']['wait'].get('note', ''), 'nota delle ricostruite: %s' % r['anims']['wait'])
    check(todo.get('lwf/character/enemy/1800/move/wait_s.png', '').endswith('atk1_o_s.png'), 'move da wait con la ricostruita')
    r, todo = m.plan_enemy(1801)
    check(todo.get('lwf/character/enemy/1801/wait/wait_s.png', '').endswith('99_x.png'), 'il doppione vero vince sulla ricostruita')
    r, todo = m.plan_enemy(1802)
    check(r['status'] == 'incompleto' and not todo, 'sorgente ricostruita assente: incompleto (%s)' % r)
    r, todo = m.plan_enemy(1803)
    check(r['status'] == 'incompleto' and not todo, 'senza riga: incompleto (mai una texture assente)')

    # altri contenitori (I-194, 21-10): exact501 = categoria 1, twinfam = 2, animazione intera dal gemello DR, misure
    def box(k, rel, data):
        q = os.path.join(BOX[k], *rel.split('/'))
        os.makedirs(os.path.dirname(q), exist_ok=True)
        with open(q, 'wb') as fh:
            fh.write(data)
        return q

    def body(fam, skip=()):
        for an in ('atk1_o', 'knockback', 'dead'):
            if an not in skip:
                put('%s/%s/%s.lwf' % (fam, an, an), lwf(an + '_k.png'))
                put('%s/%s/%s_k.png' % (fam, an, an), b'K' + fam.encode() + an.encode())
    for fam in ('1900', '1901', '1904', '1906'):
        put(fam + '/wait/wait.lwf', lwf('wait_a.png'))
        body(fam)
    q0 = box('jp501', 'lwf/character/enemy/5900/wait/wait_a.png', b'A0')
    q1 = box('ww501', 'lwf/character/enemy/5901/wait/wait_a.png', b'A1')
    r, todo = m.plan_enemy(1900)
    check(r['status'] == 'completo' and todo.get('lwf/character/enemy/1900/wait/wait_a.png') == q0 and r['category'] == 1,
          'exact501: diretto, categoria 1 (%s)' % r)
    r, todo = m.plan_enemy(1901)
    check(r['status'] == 'completo' and todo.get('lwf/character/enemy/1901/wait/wait_a.png') == q1 and r['category'] == 2,
          'twinfam: copia, categoria 2 (%s)' % r)
    check('1 da altri contenitori' in r['anims']['wait'].get('note', ''), 'nota degli altri contenitori: %s' % r['anims']['wait'])
    # animazione intera dal gemello DR: la LWF JP di wait manca del tutto
    body('1902')
    box('ww501', 'lwf/character/enemy/5902/wait/wait.lwf', lwf('wait_w.png'))
    qw = box('ww501', 'lwf/character/enemy/5902/wait/wait_w.png', b'W')
    r, todo = m.plan_enemy(1902)
    check(r['status'] == 'completo' and r['anims']['wait']['status'] == 'gemello DR' and r['category'] == 2
          and todo.get('lwf/character/enemy/1902/wait/wait_w.png') == qw
          and todo.get('lwf/character/enemy/1902/move/wait_w.png') == qw, 'animazione intera dal gemello: %s' % r)
    # misure dichiarate anche per le copie degli altri contenitori: 40x40 contro 95x65 -> incompleto
    put('1903/wait/wait.lwf', real_lwf(**{'wait_1.png': (95, 65)}))
    body('1903')
    box('jp501', 'lwf/character/enemy/5903/wait/wait_1.png', png(40, 40))
    r, todo = m.plan_enemy(1903)
    check(r['status'] == 'incompleto' and not todo, 'altro contenitore con misure diverse: incompleto (%s)' % r)
    # ricolorata (categoria 4) solo senza fonti migliori; dead generica intera dal gemello di colore
    qc = box('recolour', 'lwf/character/enemy/1904/wait/wait_a.png', b'RC')
    r, todo = m.plan_enemy(1904)
    check(r['status'] == 'completo' and todo.get('lwf/character/enemy/1904/wait/wait_a.png') == qc and r['category'] == 4,
          'ricolorata: categoria 4 (%s)' % r)
    check('1 ricolorate' in r['anims']['wait'].get('note', ''), 'nota delle ricolorate: %s' % r['anims']['wait'])
    r, todo = m.plan_enemy(1906)
    check(todo.get('lwf/character/enemy/1906/wait/wait_a.png') == q1 and r['category'] == 2, 'la copia vince sulla ricolorata')
    put('1905/wait/wait.lwf', lwf('wait_k.png'))
    put('1905/wait/wait_k.png', b'K')
    body('1905', skip=('dead',))
    box('ww501', 'lwf/character/enemy/5902/dead/dead.lwf', lwf('dead_d.png'))
    qd = box('ww501', 'lwf/character/enemy/5902/dead/dead_d.png', b'D')
    r, todo = m.plan_enemy(1905)
    check(r['status'] == 'completo' and r['anims']['dead']['status'] == 'gemello ricolorato' and r['category'] == 4
          and todo.get('lwf/character/enemy/1905/dead/dead_d.png') == qd, 'dead generica dal gemello di colore: %s' % r)
    os.remove(qd)
    r, todo = m.plan_enemy(1905)
    check(r['status'] == 'incompleto' and not todo, 'dead intera con una texture assente: incompleto (%s)' % r)

    # original copies by table order (extra_donors_dedup.tsv, rule dedup-order, category 2): used when nothing else
    # has the texture; a row of extra_donors.tsv wins on the same path (1906); declared size checked (1909: 40x40
    # source for 10x10 -> incomplete); an original file of the enemy always wins (1907)
    os.makedirs(os.path.join(ROOT, 'lwf', 'drama', '98'), exist_ok=True)
    with open(os.path.join(ROOT, 'lwf', 'drama', '98', '98_a.png'), 'wb') as fh:
        fh.write(png(10, 10))
    with open(os.path.join(ROOT, 'lwf', 'drama', '98', '98_big.png'), 'wb') as fh:
        fh.write(png(40, 40))
    for fam in ('1907', '1909'):
        put(fam + '/wait/wait.lwf', real_lwf(**{'wait_a.png': (10, 10)}))
        body(fam)
    r, todo = m.plan_enemy(1907)
    check(r['status'] == 'completo' and r['category'] == 2 and todo.get('lwf/character/enemy/1907/wait/wait_a.png') ==
          os.path.join(ROOT, 'lwf', 'drama', '98', '98_a.png'), 'dedup-order copy: category 2 (%s)' % r)
    check('1 by table order' in r['anims']['wait'].get('note', ''), 'dedup note: %s' % r['anims']['wait'])
    r, todo = m.plan_enemy(1906)
    check(todo.get('lwf/character/enemy/1906/wait/wait_a.png') == q1, 'extra_donors.tsv wins over the dedup table')
    r, todo = m.plan_enemy(1909)
    check(r['status'] == 'incompleto' and not todo, 'dedup copy with another size: incomplete (%s)' % r)
    check(m.extra_donors.category('dedup-order') == 2 and m.KIND_CAT['dedup'] == 2, 'dedup category 2')
    # an original file of the enemy always wins over the dedup row
    put('1907/wait/wait_a.png', png(10, 10))
    r, todo = m.plan_enemy(1907)
    check(todo.get('lwf/character/enemy/1907/wait/wait_a.png') == os.path.join(JP, '1907', 'wait', 'wait_a.png'),
          'the original file wins over the dedup row')
    # rule dedup-override (user's decision 23-10, 1636 wait): the reviewed row wins over a row of the other tables
    # (1910), over an original file even when nothing else is missing (1911); its declared size is still checked
    # (1912: a 40x40 source for 10x10 does not replace the original file)
    a98 = os.path.join(ROOT, 'lwf', 'drama', '98', '98_a.png')
    for fam in ('1910', '1911', '1912'):
        put(fam + '/wait/wait.lwf', real_lwf(**{'wait_a.png': (10, 10)}))
        body(fam)
    for fam in ('1911', '1912'):
        put(fam + '/wait/wait_a.png', png(10, 10))
    r, todo = m.plan_enemy(1910)
    check(r['status'] == 'completo' and todo.get('lwf/character/enemy/1910/wait/wait_a.png') == a98,
          'dedup-override wins over extra_donors.tsv (%s)' % r)
    r, todo = m.plan_enemy(1911)
    check(r['status'] == 'completo' and r['category'] == 2 and todo.get('lwf/character/enemy/1911/wait/wait_a.png') == a98,
          'dedup-override wins over the original file (%s)' % r)
    r, todo = m.plan_enemy(1912)
    check(todo.get('lwf/character/enemy/1912/wait/wait_a.png') == os.path.join(JP, '1912', 'wait', 'wait_a.png'),
          'dedup-override with another size: the original file stays')
    check(m.override('lwf/character/enemy/1907/wait/wait_a.png') is None, 'a dedup-order row is not an override')
    check('dedup-override' not in {v[2] for v in m.EXTRA.values()}, 'dedup-override never read from the other tables')
    # rule dedup-rescale (user-approved downscaled copies, 23-10): accepted only at EXACTLY the declared size
    # (1913: 10x10 -> complete, category 3); 1914: an 11x10 file, within the +-2 px of the other copies, is refused
    with open(os.path.join(ROOT, 'lwf', 'drama', '98', '98_11.png'), 'wb') as fh:
        fh.write(png(11, 10))
    for fam in ('1913', '1914'):
        put(fam + '/wait/wait.lwf', real_lwf(**{'wait_a.png': (10, 10)}))
        body(fam)
    r, todo = m.plan_enemy(1913)
    check(r['status'] == 'completo' and r['category'] == 3 and todo.get('lwf/character/enemy/1913/wait/wait_a.png') == a98
          and 'downscaled' in r['anims']['wait'].get('note', ''), 'dedup-rescale exact size: category 3 (%s)' % r)
    r, todo = m.plan_enemy(1914)
    check(r['status'] == 'incompleto' and not todo, 'dedup-rescale with +-2 px: refused (%s)' % r)
    check(m.extra_donors.category('dedup-rescale') == 3 and m.KIND_CAT['riscalata'] == 3, 'dedup-rescale category 3')
    check('dedup-rescale' not in {v[2] for v in m.EXTRA.values()}, 'dedup-rescale never read from the other tables')
    check(m.override('lwf/character/enemy/1913/wait/wait_a.png') is None, 'a dedup-rescale row is not an override')

    # alleati ospiti (I-199, ally_families.json): wait + atk1_o bastano; move, knockback e dead copiati da wait.
    # Solo per le famiglie alleate: lo stesso nemico con un altro displayId resta incompleto
    check(2001 in m.ALLY_FAMILIES and 1650 not in m.ALLY_FAMILIES, 'famiglie alleate: %s' % sorted(m.ALLY_FAMILIES)[:5])
    for fam in ('2001', '1650'):
        put(fam + '/wait/wait.lwf', lwf('wait_h.png'))
        put(fam + '/wait/wait_h.png', b'H')
        put(fam + '/atk1_o/atk1_o.lwf', lwf('atk1_o_h.png'))
        put(fam + '/atk1_o/atk1_o_h.png', b'I')
    r, todo = m.plan_enemy(2001)
    pre = 'lwf/character/enemy/2001/'
    check(r['status'] == 'completo' and r.get('ally'), 'alleato con wait + atk1_o: completo (%s)' % r.get('why'))
    check(all(todo.get(pre + an + '/' + an + '.lwf', '').endswith(os.path.join('wait', 'wait.lwf'))
              and todo.get(pre + an + '/wait_h.png', '').endswith('wait_h.png') for an in ('move', 'knockback', 'dead')),
          'alleato: move/knockback/dead da wait: %s' % sorted(todo))
    check(r['anims']['dead']['status'].startswith('da wait'), 'stato dead da wait: %s' % r['anims']['dead'])
    r, todo = m.plan_enemy(1650)
    check(r['status'] == 'incompleto' and not todo and not r.get('ally') and 'knockback' in r['why'],
          'nemico non alleato con solo wait + atk1_o: incompleto (%s)' % r)

    # famiglie delle missioni 526-979: id corti e lunghi -> famiglia, solo con la cartella JP (o 2016)
    fams = m.oltre_families([1532, 11532, 1906001532, 1600, 249, 10249, 17112004, 160911501, 99999], served={249})
    check(sorted(fams) == [1532, 1600], 'famiglie: %s' % sorted(fams))
    check(sorted(fams.get(1532, [])) == [1532, 11532, 1906001532], 'nemici della famiglia 1532: %s' % fams.get(1532))
    check(249 not in fams, 'famiglia gia\' servita esclusa')
    check(2004 not in fams and 1501 not in fams and 9999 not in fams, 'senza cartella: esclusa')
finally:
    shutil.rmtree(TMP, ignore_errors=True)

if errori:
    print('ERRORI (%d)' % len(errori))
    for e in errori:
        print(' -', e)
    sys.exit(1)
print('OK: test_make_jp_enemies')
