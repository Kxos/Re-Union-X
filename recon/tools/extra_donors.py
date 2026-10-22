"""Tabelle delle texture dei nemici JP 4.3.1 mancanti prese da ALTRI contenitori (I-194, 21-10-2026).

    import extra_donors as xd
    table = xd.load()                                   # recon/tools/extra_donors.tsv (copie originali)
    src = xd.lookup(table, 'lwf/character/enemy/1534/wait/wait_<hex>.png')   # percorso assoluto o None
    xd.category(table['...'][2])                        # 1 file diretto, 2 copia, 4 ricolorata

Regola dell'utente (21-10, vincolante): i file originali vincono sempre. Ordine per texture/animazione:
  1. file originali diretti allo stesso percorso (dump JP 4.3.1, OBB JP 5.0.1, OBB WW 5.0.1, pacchetto 2016);
  2. copie originali riconosciute come doppione/alias/gemello con regole misurate >= 99% (jp_dedup_donors.tsv; qui:
     jp501 resolved_501.tsv, enemy_src2 resolved_extra.json, LWF gemelle Dark Road verificate a vista);
  3. parti ricostruite della stessa famiglia (jp_reconstructed.tsv);
  4. ricolorazione di un gemello della stessa specie (jp_recoloured.tsv, contenitore `recolour`, PNG generati fuori dal
     repo in D:\\Progetto_Restauro_KH_UX\\enemy_gen_src\\recolour);
  5. aspetto Dark Road della stessa specie (DR_LOOK di server/make-enemy-oltre.js), solo per le famiglie ancora
     incomplete.

extra_donors.tsv (categorie 1 e 2; la genera D:\\Progetto_Restauro_KH_UX\\tmp\\integr\\mk_extra.py):
  * jp501 = OBB JP 5.0.1 (main.98 + patch.114; BTF estratti in tmp\\jp501\\x): `exact501` stesso percorso (cat. 1);
    `lwfmatch+anchors` = tabella delle texture della LWF identica a quella di una cartella Dark Road e ogni texture
    4.3.1 superstite uguale a vista alla DR; `unique`, `align&donor`, `donor&order` = regole di jp_dedup_donors.py
    sull'insieme 4.3.1 + 5.0.1 (2016: >= 99%). Esclusi i 45 conflitti con la tabella dei doppioni (atkSp di 2011);
  * ww501 = OBB WW 5.0.1 (BTF in tmp\\enemy_src2\\ww e wwtex), b2016 = pacchetto 2016, jp431 = jp_final_4.3.1:
    `twinfam` = stessa texture nel gemello di famiglia (alias WW o famiglia gemella, tmp\\enemy_src2\\resolved_extra.json;
    esclusi i 14 con misure diverse da quelle dichiarate);
  * `whole-dr-twin` = animazione INTERA (LWF e texture) di un gemello Dark Road verificato a vista (le texture
    superstiti delle altre animazioni uguali a quelle DR), quando la LWF 4.3.1 manca del tutto: 1543 Pot Spider
    wait e dead da 5048 (foglio tmp\\integr\\v1543.png: zampe di knockback identiche, vaso rosso).
Formato: `<percorso pubblicato>\\t<contenitore>:<percorso>\\t<regola>\\t<nota>`; `#` commento. Le misure dichiarate
(+-2 px) le controlla chi usa la tabella (make_jp_enemies.py fits()).
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
TABLE = os.path.join(HERE, 'extra_donors.tsv')
RECOLOUR_TABLE = os.path.join(HERE, 'jp_recoloured.tsv')
DEEP_TABLE = os.path.join(HERE, 'extra_donors_deep.tsv')
D = r'D:\Progetto_Restauro_KH_UX'
import sys  # noqa: E402
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # with python -I the script folder is not on sys.path
import private_tools  # noqa: E402  (local reference data folders, see private_tools.py)
ROOTS = {
    'jp431': [private_tools.local_path('jp_data')],
    'jp501': [os.path.join(D, 'tmp', 'jp501', 'x')],
    'ww501': [os.path.join(D, 'tmp', 'enemy_src2', 'ww'), os.path.join(D, 'tmp', 'enemy_src2', 'wwtex')],
    'b2016': [private_tools.local_path('ref_work', 'bundle2016', 'files')],
    'recolour': [os.path.join(D, 'enemy_gen_src', 'recolour')],
}
RULES = {'exact501': 1, 'lwfmatch+anchors': 2, 'unique': 2, 'align&donor': 2, 'donor&order': 2, 'twinfam': 2,
         'whole-dr-twin': 2, 'content-anchor': 2, 'bracket': 2, 'recolour': 4, 'recolour-whole': 4}


def category(rule):
    """categoria della regola d'utente (1 diretto, 2 copia, 4 ricolorata)."""
    return RULES[rule]


def load(path=TABLE, rules=None):
    """-> {percorso pubblicato: (contenitore, percorso, regola, nota)}; file assente o '' -> {}.
    Contenitore o regola sconosciuti, percorso assoluto o con '..': errore."""
    out = {}
    if not path or not os.path.exists(path):
        return out
    ok = set(rules or RULES)
    with open(path, encoding='utf-8') as fh:
        for n, line in enumerate(fh, 1):
            line = line.rstrip('\r\n')
            if not line or line.startswith('#'):
                continue
            parts = line.split('\t')
            if len(parts) < 3 or not parts[0] or ':' not in parts[1]:
                raise ValueError('%s:%d: riga senza percorso, sorgente <contenitore>:<percorso> o regola' % (path, n))
            box, rel = parts[1].split(':', 1)
            if box not in ROOTS:
                raise ValueError('%s:%d: contenitore sconosciuto %r' % (path, n, box))
            if parts[2] not in ok:
                raise ValueError('%s:%d: regola sconosciuta %r' % (path, n, parts[2]))
            if rel.startswith(('/', '\\')) or '..' in rel.split('/') or ':' in rel:
                raise ValueError('%s:%d: percorso non relativo: %s' % (path, n, rel))
            out[parts[0]] = (box, rel, parts[2], parts[3] if len(parts) > 3 else '')
    return out


def lookup(table, published, roots=None):
    """Sorgente assoluta di `published` (prima radice del contenitore dove il file esiste) o None."""
    v = table.get(published)
    if not v:
        return None
    for root in (roots or ROOTS).get(v[0], []):
        p = os.path.join(root, *v[1].split('/'))
        if os.path.isfile(p):
            return p
    return None
