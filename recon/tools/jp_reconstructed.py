"""Tabella delle texture RICOSTRUITE dei nemici e degli NPC JP 4.3.1 quasi completi (I-194, 21-10-2026).

    from jp_reconstructed import load, lookup
    table = load()                                   # recon/tools/jp_reconstructed.tsv
    src = lookup(table, 'lwf/character/enemy/1637/wait/wait_<hex>.png', JP_ROOT)   # percorso assoluto o None

Distinta dalla tabella dei doppioni (jp_dedup_donors.tsv: il file identico vero rimasto altrove). Qui la texture vera
e' persa e se ne usa un'altra REALE del JP, mai una forma inventata (decisione dell'utente del 21-10: ricostruire come
nell'originale dai dati che abbiamo, dichiararlo nelle Notices):
  * shadow-family: ombra (dichiarata w >= 3h, scura) presa da un'altra animazione della stessa famiglia con le stesse
    dimensioni dichiarate, la piu' vicina alle altre;
  * shadow-common: senza ombre nella famiglia, la variante piu' comune fra tutti i file JP con quelle dimensioni
    dichiarate (es. 97x24). Prova sul pacchetto 2016 (bersaglio vero noto, file vero escluso dai candidati): 458 ombre,
    differenza media 1,98/255 dalla vera alle dimensioni dichiarate (mediana 1,09, massimo 8,2);
  * family: la stessa parte da un'altra animazione della stessa famiglia (stesse dimensioni dichiarate, candidati
    tutti vicini fra loro, almeno 3 o tutti con lo stesso numero di bitmap). Prova sul 2016: 772 casi, 11 (1,4%) con
    differenza > 8/255.
Una famiglia entra nella tabella solo se cosi' TUTTE le sue texture mancanti si ricostruiscono; chi la usa serve una
cartella solo se completa (mai una texture assente). La produce D:\\Progetto_Restauro_KH_UX\\tmp\\jp_table\\recon\\build.py
(near.py: famiglie con <= 4 mancanti dopo la tabella dei doppioni; shadow16.py e family16.py: prove sul 2016).

Formato come jp_dedup_donors.tsv: `<percorso pubblicato>\\t<sorgente relativa a jp_final_4.3.1>\\t<metodo>\\t<nota>`.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import jp_dedup_donors  # noqa: E402

TABLE = os.path.join(HERE, 'jp_reconstructed.tsv')
METHODS = ('shadow-family', 'shadow-common', 'family')


def load(path=TABLE):
    """-> {percorso pubblicato: (sorgente relativa, metodo)}; file assente -> {}. Metodo sconosciuto: errore."""
    out = jp_dedup_donors.load(path)
    for k, (src, how) in out.items():
        if how not in METHODS:
            raise ValueError('%s: metodo sconosciuto %r per %s' % (path, how, k))
    return out


def lookup(table, published, jp_root):
    """Sorgente assoluta della texture ricostruita `published`, se la tabella la conosce e il file esiste."""
    return jp_dedup_donors.lookup(table, published, jp_root)
