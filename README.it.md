# Re-Union X

*Un restauro amatoriale di Kingdom Hearts Union χ[Cross]* (repository: Re-Union-X)

[English](README.md) | **Italiano**

**Come giocare:** [docs/SETUP.md](docs/SETUP.md) (in inglese) · **Sito del progetto:** [Re-Union X](https://kxos.github.io/Re-Union-X/) · **Cerchiamo aiuto:** [post su Reddit](https://www.reddit.com/r/KingdomHearts/comments/1xcbwjg/) / [Cosa cerchiamo](#cosa-cerchiamo) · **Bug:** [segnala un bug](https://github.com/Kxos/Re-Union-X/issues/new?template=bug_report.yml)

> Oggi installare il gioco è lungo e complesso (a lavoro finito diventerà un unico launcher), e il gioco è
> in lavorazione: aspettatevi bug e crash, e segnalateli per favore.

> **Avvertenza.** Questo è un progetto amatoriale, non ufficiale e non commerciale. Non è affiliato a Square Enix
> o Disney, né approvato o sponsorizzato da loro. *Kingdom Hearts*, *Kingdom Hearts Union χ[Cross]* e tutti i
> nomi, personaggi e asset collegati appartengono ai rispettivi proprietari. Qui non si distribuiscono file del
> gioco. Vedi [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
>
> **Nome.** «Re-Union X» non ha legami con **KH ReUnion** ([@KH_ReUnion](https://x.com/KH_ReUnion)), un progetto amatoriale
> diverso con un nome simile. Se il suo team ci chiedesse di cambiare nome, ne parleremo volentieri.

> La documentazione di lavoro (HANDOFF, ISSUES, note tecniche, diario) è in inglese dal 22 ottobre 2026;
> questa pagina riassume il progetto in italiano.

Progetto di preservazione: ripristinare **Kingdom Hearts Union χ[Cross] · Dark Road**
come esperienza giocabile in locale, dopo la chiusura dei server (maggio 2021) e la
rimozione dall'app di quasi tutte le funzionalità di Union χ, ridotta a theater mode.

## Stato

| Fase | Descrizione | Stato |
|---|---|---|
| 1 | Reperimento client e valutazione fattibilità | ✅ completata |
| 2 | Ricognizione tecnica — architettura, protocollo, schema dati | ✅ completata |
| A | Analisi statica del client: host ed endpoint | ✅ completata |
| B | Server REST minimo → il client raggiunge la home screen | ✅ APK 4.3.1 **originale** su LDPlayer 9 (Android 9): nuovo giocatore, Prologue, home |
| C | Schema dei campi delle 54 tabelle master | ✅ completata — 106 tabelle, 1.739 campi |
| D | Popolamento master data, quest e combattimento single-player | 🔄 dal nuovo giocatore alla home; missioni di storia **1–979** con le mappe e le stanze originali (dai dati JP 4.3.1), filmati, musica per missione, statistiche e livelli originali dei nemici, obiettivi, forzieri e Trophy; Special Attack con danno variabile e attacchi dei nemici; Medal List, vendita, Level Up (pallini e guilt, skill, trait, Trait Medal), Evolve, Moogle Shop, Shop con i banner originali (807 deal con garanzie, pity, rotazione settimanale, stagionali, banner fissato e catalogo con filtri), Profilo, Missioni e campagne Limited, Avatar Boards, pet, livelli Lux fino a 999, Notices in gioco che spiegano ogni differenza dall'originale. Grafiche dei nemici: tutte le **245** famiglie di nemici delle missioni 1–979 complete (27 ottobre; verifica finale in gioco aperta, I-194): **209** del tutto originali (123 dai file originali JP 4.3.1, 86 file originali recuperati altrove nei dati del gioco), **36** restaurate con lavoro di ricostruzione (25 quasi del tutto originali con alcuni pezzi riscalati o ricostruiti, 11 ricolorate da un gemello) |
| E | Photon self-hosted per Union Cross / raid / PvP | ⬜ |

Stato aggiornato al 27 ottobre 2026. Le schermate che il client 4.3.1 non trova più nelle
risorse (layout CocoStudio, testi, animazioni) vengono **ricostruite**: dagli originali
vicini, dai nomi dei widget cercati dal client e da immagini di riferimento dell'epoca.

**[HANDOFF.md](HANDOFF.md)** — come riprendere: stato del banco e prossimo passo.
**[Notices del gioco](https://kxos.github.io/Re-Union-X/notices/)** (pagina web nello stile del gioco, in inglese; anche come [docs/NOTICES.md](docs/NOTICES.md)) — come funziona il gioco restaurato e dove differisce dall'originale.
**[docs/ISSUES.md](docs/ISSUES.md)** — i problemi aperti e chiusi; note tecniche per area in
[docs/notes/](docs/notes/), diario completo del lavoro (ogni problema risolto con la sua causa) in
[docs/journal/](docs/journal/).
**[REPORT.md](REPORT.md)** — risultati della ricognizione. **[PHASE-A.md](PHASE-A.md)** — analisi statica.
**[PHASE-C.md](PHASE-C.md)** — i campi delle tabelle master.

## Cosa cerchiamo

Chiediamo solo **informazioni**, mai file del gioco. Gran parte dei contenuti veniva scaricata dai
server dopo l'installazione e viene ricostruita dal progetto. Dal 27 ottobre non manca piu' nessuna
famiglia di nemici della storia (appello del 22 ottobre su
[Reddit](https://www.reddit.com/r/KingdomHearts/comments/1xcbwjg/)); aiutano ancora screenshot e video
delle **36 famiglie ricostruite** (elencate sul [sito](https://kxos.github.io/Re-Union-X/#status)) per
verificarle e migliorarle, dei nemici di eventi e raid, e tutto cio' che riguarda **eventi, raid, Coliseum, Union Cross e PvP** (screenshot, video, regole,
premi, guide). Contattaci aprendo una issue; non inviare ne' pubblicare file del gioco.

## Sintesi tecnica

- Il gioco è **Cocos2d-x con logica in C++ nativo** (non Unity/IL2CPP).
- La libreria del client non ha quasi nomi di funzione: il livello API si è trovato dalle stringhe
  di protocollo.
- Il client è protetto da un protector di terze parti: gira solo l'APK originale, su Android 9
  ([protector.md](docs/notes/protector.md)).
- Due stack di rete: **REST** (AES-256-CBC + gzip, chiave negoziata col server) e
  **Photon/eNet UDP** per il realtime.
- Le classi delle tabelle master del client espongono lo schema dei dati: **107 tabelle** nella build online
  WW 4.3.1, **54 rimosse** nel passaggio alla 5.0.1 offline. Quelle 54 sono la misura
  esatta del lavoro — e i loro **759 campi** sono stati ricavati dal binario, con nome
  e ordine delle colonne.
- Il **motore di combattimento è ancora intatto** nel client offline: va rialimentato
  con i dati, non riscritto.

## Struttura

```
REPORT.md, PHASE-*.md   Ricognizione e analisi
HANDOFF.md              Come riprendere il lavoro (stato e prossimo passo)
docs/                   ISSUES.md (problemi), notes/ (note tecniche per area), journal/ (diario),
                        NOTICES.md e notices/ (Notices del gioco, pagina web su GitHub Pages)
server/                 Server Node.js: API REST, DNS, tabelle master e di gioco generate
                        (server/README.md)
tools/ldplayer/         Banco su LDPlayer: avvio, sessioni (session/), tombstone
recon/tools/            Strumenti di analisi e di costruzione delle risorse (Python)
recon/out/              Schemi d'interfaccia: campi e tipi delle tabelle master, schemi delle risposte
                        (gli script di ricerca per Ghidra restano privati, fuori dal repository)
recon/dl/ ext/ web/     Materiale proprietario — NON versionato
```

### Ciclo di lavoro sul banco

| Comando | A cosa serve |
|---|---|
| `tools/ldplayer/session/relogin.ps1` | riavvia server e app con il giocatore salvato, fino alla home |
| `tools/ldplayer/session/build-resources.ps1 -Quick` | rigenera layout e testi e li scrive nel guest (~40 s, nessun download) |
| `tools/ldplayer/session/build-resources.ps1 -Version N` + `update-resources.ps1` | nuova versione completa delle risorse, scaricata dal client (~5 min); poi toccare a mano KHUX START (200,1020) e Download (1220,715) |
| `node server/check-stage-data.js` | controllo offline dei dati delle missioni |
| `node server/export-notices.js [--check]` | esporta le Notices del gioco in `docs/NOTICES.md` e `docs/notices/index.html` |

### Strumenti

| Script | Funzione |
|---|---|
| `vtables.py`, `codeindex.py` | Strumenti di ricerca che hanno prodotto gli schemi d'interfaccia in `recon/out` |
| `master_fields.py` | La pipeline della fase C: campi delle tabelle master |
| `strings.py` | Estrattore di stringhe da binari |
| `demangle.py`, `scope_methods.py` | Strumenti di ricerca sui nomi presenti nel binario |
| `elfinfo.py` | Architettura ed endianness di un ELF |
| `make_layouts.py` | Layout CocoStudio sostitutivi: copie di originali, scene, layout costruiti, cloni di widget, armature, testi |
| `resource_pack.py`, `resource_merge.py` | Pacchetto BGAD delle risorse generate e indice unito (con riserva di spazio per il ciclo rapido) |
| `import_ui_texts.py`, `ui_text_ids.py` | Testi `text/ui` originali dall'IPA 4.4.0; id dei testi usati dal binario |
| `widget_lookup.py`, `layout_tree.py`, `scene_tree.py` | Nomi dei widget cercati dal client; struttura di layout e scene |
| `action_case.py`, `batch_schema.py`, `who_refs.py` | Strumenti di ricerca che hanno prodotto gli schemi delle risposte in `recon/out` |
| `import_orig_stages.py`, `make_jp_rooms.py` | Stage e stanze originali della storia dai dati JP 4.3.1 e 2016 (missioni 1-979) |
| `import_jp_coco.py` | Layout CocoStudio originali JP al posto di quelli generati (elenco `jp_coco_layouts.txt`) |
| `make_jp_enemies.py`, `deep_donors.py` | Grafiche originali dei nemici; texture mancanti ritrovate per contenuto in altri file della stessa creatura |

## Ringraziamenti

Questo restauro si regge sul lavoro di chi ha conservato e documentato il gioco molto prima di noi:

- **thethiny** — [KHUxTools](https://github.com/thethiny/KHUxTools) (strumenti per risorse e master data),
  [KHUx-Server](https://github.com/thethiny/KHUx-Server) (rifacimento del server e delle API, master data originali),
  [KHUx-Recomp](https://github.com/thethiny/KHUx-Recomp) (ricompilazione statica e decompilato del client 1.0.1),
  [Modding-Database](https://github.com/thethiny/Modding-Database). Gran parte di cio' che questo progetto fa si basa
  sui formati che ha documentato.
- **Roboloid** e **Ultimadei** — il [database KHUχ di Roboloid](https://roboloid.github.io/khux/) (dati delle medaglie,
  moltiplicatori, condizioni degli speciali, galleria degli asset).
- **KHUX Wiki** ([khuxwiki.com](https://www.khuxwiki.com/)) e **KH Wiki** ([khwiki.com](https://www.khwiki.com/)) —
  missioni, medaglie, speciali, eventi e immagini usati come riferimento.
- **ReLux Team** — ricerche su eventi, raid, Union Cross e campagne del gioco, calcolatori fatti dai giocatori e
  indicazioni sui riferimenti della community, che guidano il restauro delle modalita' a evento.

## Regole del repository

Il codice e la documentazione sono lavoro nostro, con licenza MIT ([LICENSE](LICENSE)), che copre solo
quelli. Alcuni file di dati contengono fatti e testi brevi ricavati da wiki e database della community,
citati in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md); i nomi di giochi, personaggi, medaglie e luoghi
servono solo a indicare con cosa lavora il codice e appartengono ai rispettivi proprietari.

Non vengono mai versionati APK, IPA, OBB, librerie native, asset, audio, né master data
di Square Enix — `.gitignore` li esclude. Chi vuole riprodurre il lavoro estrae il client
dal proprio dispositivo o dalla propria installazione; il progetto non lo fornisce né lo linka.
Gli strumenti di decodifica del formato dei pacchetti e di analisi del protettore restano privati.

Progetto **non commerciale**, a scopo di preservazione e interoperabilità con un servizio
dismesso.
