"""Texture delle piastre di Shop > Draw assenti dalle risorse (I-133): lucchetto img/ui/ShopBut_Lock.png e
ShopBut_Lock_Disable.png, pulsante rosso di estrazione spento img/ui/But07_Disable.png.

    python -I recon/tools/make_shop_lock.py <cartella catalogo estratto> <uscita>

<cartella catalogo estratto> = res_bulk.py (catalog\\files); <uscita> = stage_gen\\files.

La piastra di un'estrazione (layout ShopDraw_3Plate_Plate_ver310) carica sempre
nell'ImageView Lock_icon (118x118, scala 0.9, figlio di LockMask) una delle due texture, anche
quando la piastra non e' bloccata: ShopBut_Lock se il flag del singleton e'
acceso, altrimenti ShopBut_Lock_Disable. Nessuna delle due e' in una risorsa servita (Dark Road le
ha rinominate in dark_Icon_Lock / dark_Icon_Lock_Disable): senza, crash 0x2c in all'apertura dello Shop con una piastra. La texture dello stesso layout e
dell'icona delle missioni (QuestBut_Lock, 118x118) e' identica a dark_Icon_Lock: si copiano le due
originali di Dark Road (lucchetto azzurro e la sua versione grigia), lette dal catalogo locale al
momento del build. Nel repository solo questo script, mai le bitmap.

Piastra bloccata (benefitId del master DrawMedalType che il giocatore non ha): i pulsanti di
estrazione DrawButton1 (But07, rosso) e DrawButton3 (But24, oro) passano a spento: il client
carica «img/ui/%s_Disable.png» su un ImageView con
9-slice: But24_Disable esiste, But07_Disable no (crash, banco 16-10). Le due texture hanno la stessa sagoma 60x118 (9-slice a meta', capInsetsX 30) e
lo spento originale e' grigio: But07_Disable = copia di But24_Disable.
"""
import os
import shutil
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import btf  # noqa: E402

src, out = sys.argv[1:3]
PAIRS = {'img/ui/ShopBut_Lock.png': 'img/ui/dark_Icon_Lock.png',
         'img/ui/ShopBut_Lock_Disable.png': 'img/ui/dark_Icon_Lock_Disable.png',
         'img/ui/But07_Disable.png': 'img/ui/But24_Disable.png'}
SIZES = {'img/ui/But07_Disable.png': (60, 118)}
for dst, s in PAIRS.items():
    sp = os.path.join(src, *s.split('/'))
    im = btf.decode(open(sp, 'rb').read())      # controllo: BTF valida e della misura del layout
    want = SIZES.get(dst, (118, 118))
    if im.size != want:
        sys.exit('%s: misura %s invece di %s' % (s, im.size, want))
    dp = os.path.join(out, *dst.split('/'))
    os.makedirs(os.path.dirname(dp), exist_ok=True)
    shutil.copyfile(sp, dp)
    print(dst, '<-', s, im.size)

# Testo del pannello del lucchetto (Txt_Lock sotto LockMask/lock_plate, 211x66, corpo 18): il client non lo scrive mai
# (nessun riferimento al nome nel codice) e il layout WW servito ha ancora il segnaposto giapponese dello sviluppo
# («fino a 11 caratteri per riga»). Lo mostrano le VIP Draw senza il benefit VIP (I-134): testo nostro con la regola
# del restauro (vip-benefit.js), nessuna schermata originale del pannello trovata.
LAYOUT = 'cocostudio/publish/ShopDraw_3Plate_Plate_ver310.json'
PLACEHOLDER = '"text": "上下で十一文字ずつで二十二文字まではいります"'
LOCK_TEXT = '"text": "Clear all Weekly Missions to unlock"'  # il client va a capo da solo: 2 righe (banco 26-10)
raw = open(os.path.join(src, *LAYOUT.split('/')), 'rb').read().decode('utf-8')
if raw.count(PLACEHOLDER) != 1:
    sys.exit('%s: segnaposto di Txt_Lock non trovato' % LAYOUT)
dp = os.path.join(out, *LAYOUT.split('/'))
os.makedirs(os.path.dirname(dp), exist_ok=True)
open(dp, 'wb').write(raw.replace(PLACEHOLDER, LOCK_TEXT).encode('utf-8'))
print(LAYOUT, '<- Txt_Lock in inglese')
