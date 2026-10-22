"""Tabella dei donatori delle texture che l'estrazione JP 4.3.1 locale ha scartato come doppioni.

    from jp_dedup_donors import load, lookup
    table = load()                                  # recon/tools/jp_dedup_donors.tsv
    src = lookup(table, 'lwf/character/enemy/1550/wait/wait_<hex>.png', JP_ROOT)   # percorso assoluto o None

Il pacchetto JP tiene una sola copia di ogni file identico (come gli stub `stub_of` del pacchetto 2016,
<ref_work>\\bundle2016\\files.tsv): le altre LWF che usano la stessa immagine la citano col proprio nome
(`<anim>_<esadecimale di «ビットマップ N.png»>.png`) ma il file non c'e'. Molte texture dei boss stanno solo nelle
LWF dei filmati (lwf/drama/<id>/: 1550 <- 2323901, 1561 <- 2331101, 1646 <- 2552901), con un altro numero di bitmap
(la 25 di atkSp di 1550 e' la 274 del filmato): la ricerca per nome non basta.

La tabella (solo nomi e percorsi, nessun dato Square Enix) la produce l'analisi in
D:\\Progetto_Restauro_KH_UX\\tmp\\jp_table\\v2 (fw.py final(), 21-10-2026). Ogni regola e' stata misurata sul
pacchetto 2016, dove il bersaglio vero di ogni stub e' noto, e si usa solo con precisione >= 99%:
  * unique: un solo file reale con le stesse dimensioni dichiarate (fra tutte quelle con cui le sue LWF lo
    dichiarano; i reali non dichiarati con le dimensioni vere): 2016 330/330;
  * align&donor, donor&order: due regole indipendenti danno lo stesso file
    - align: tabelle delle texture di due LWF allineate (ancora con lo stesso scarto d'indice subito prima e
      subito dopo lo slot, come import_jp_raisedraw.py);
    - donor: unico candidato nelle cartelle «donatrici» della famiglia (>= 2 texture gia' risolte vi puntano)
      o nella famiglia stessa;
    - order: unico candidato con numero di bitmap fra quelli delle ancore vicine della stessa LWF (numerazione
      monotona fra nemico e filmato);
    2016: align&donor 205/205, donor&order 103/104 (align&order 39/42: esclusa);
  * samevis: tutti i candidati sono la stessa immagine a vista (differenza media < 1/255, < 0,5% dei pixel oltre
    16/255): qualunque sia il vero, l'immagine e' quella. 2016: 138/138 a vista.
A giri fino a punto fisso (i risolti diventano ancore): 2016 776/777 a vista (675 lo stesso file), richiamo 10% dei
7513 stub di nemici e NPC; JP 9417 righe -> nemici completi in piu' 1545 (Pot Centipede) e 1591 (Green Gummi
Saucer), NPC 2021 (tappeto).
Le singole regole (donor 89%, order 92%, align 90%, firma delle bitmap 65%, stessa famiglia + stessa firma 79%,
ombra 97x24 della stessa famiglia 84%) NON bastano da sole: le varianti di
colore (es. 97 dello Shadow 1) hanno le stesse dimensioni e le stesse matrici con pixel diversi.

Formato: righe `<percorso pubblicato>\\t<sorgente relativa alla radice JP jp_final_4.3.1>\\t<regola>`; `#` commento.
Si usa solo per riempire una texture mancante; chi la usa serve una cartella solo se completa (mai una texture
assente).
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
TABLE = os.path.join(HERE, 'jp_dedup_donors.tsv')


def load(path=TABLE):
    """-> {percorso pubblicato: (sorgente relativa, regola)}; file assente -> {}."""
    out = {}
    if not path or not os.path.exists(path):
        return out
    with open(path, encoding='utf-8') as fh:
        for n, line in enumerate(fh, 1):
            line = line.rstrip('\r\n')
            if not line or line.startswith('#'):
                continue
            parts = line.split('\t')
            if len(parts) < 2 or not parts[0] or not parts[1]:
                raise ValueError('%s:%d: riga senza percorso o sorgente' % (path, n))
            if parts[1].startswith(('/', '\\')) or '..' in parts[1].split('/'):
                raise ValueError('%s:%d: sorgente non relativa alla radice JP: %s' % (path, n, parts[1]))
            out[parts[0]] = (parts[1], parts[2] if len(parts) > 2 else '')
    return out


def lookup(table, published, jp_root):
    """Sorgente assoluta della texture pubblicata `published`, se la tabella la conosce e il file esiste."""
    v = table.get(published)
    if not v:
        return None
    p = os.path.join(jp_root, *v[0].split('/'))
    return p if os.path.isfile(p) else None
