# Costruisce resource_data\<N>: pezzi OBB 5.0.1 + addnl della versione 7 (hard link) +
# il pacchetto generato (stage_gen\files: mappe, LWF sostitutivi, layout di
# make_layouts.py) come ultimo pezzo, e l'indice unito. Poi si installa con
# update-resources.ps1 (il server annuncia solo l'ultima versione).
#   .\build-resources.ps1 -Version N
#
# Ciclo rapido per le prove (~1 min invece di ~5): -Quick rigenera il pacchetto dentro
# l'ultima versione gia' installata (sostituisce l'ultimo pezzo e l'indice) e lo scrive direttamente
# nel guest. I dati del client sono i pezzi concatenati e spezzati a 2 GiB (files/r/misc.mp4,
# misc.mp4.1, misc.mp4.2 ...): il pacchetto generato e' la coda, gli offset dei pezzi prima non
# cambiano. Si tronca il pezzo del guest dove inizia il generato, si accoda il nuovo (e si riscrive
# il pezzo dopo, se il generato ci arriva: resource_parts.py), si copia misc.png, poi riavvio
# dell'app (il server resta acceso). Dimensioni fisse: vedi sotto.
#   .\build-resources.ps1 -Quick
#
# Prova a secco (-DryRun): stessi generatori su una copia di stage_gen\files in
# tmp\stage_gen_dry, pacchetto e indice controllati contro la riserva dell'ultima versione
# installata (come -Quick); non scrive in resource_data, ne' nel guest, ne' fa login.
#   .\build-resources.ps1 -DryRun
# -NoJp: senza i layout originali JP di import_jp_coco.py (elenco recon\tools\jp_coco_layouts.txt).
# -NoRooms: versione completa senza il pacchetto delle stanze recuperate (rooms_gen, make_jp_rooms.py).
# -NoEnemies: versione completa senza le grafiche originali dei nemici (enemy_gen, make_jp_enemies.py);
#   il master va rigenerato con KHUX_NO_ENEMY_GEN=1, altrimenti i nemici citano grafiche assenti (crash).
# -NoRaisedraw: versione completa senza le LWF del risultato delle estrazioni (raisedraw_gen,
#   import_jp_raisedraw.py); KHUX_GACHA_SIZES va ridotto a 1 (solo raidgacha_result_display_01 servita).
# I pacchetti statici di una versione completa sono scritti in resource_data\<N>\packs.txt: -Quick e
# -DryRun usano quelli della versione installata (senza packs.txt: niente stanze, versioni <= 34).
# -NoCompact: versione completa con OBB, addnl e medaglie non compattati (resource_compact.py, I-171: senza,
#   i record che l'indice unito non cita restano nei dati, ~90 MB).
# -TestStraddle <nome>: solo per la prova al banco dei pezzi oltre 4 GiB (I-171, risorse_layout.md#pezzi): versione
#   completa con un pezzo di zeri prima del generato, perche' il record <nome> del generato stia a cavallo dei 4 GiB.
#   La versione dopo, senza -TestStraddle, torna sotto i 4 GiB (nuovo download completo).
param([int]$Version, [switch]$Quick, [switch]$DryRun, [switch]$NoJp, [switch]$NoRooms, [switch]$NoEnemies, [switch]$NoRaisedraw, [switch]$NoCompact, [string]$TestStraddle)
$ErrorActionPreference = 'Stop'
$repo = Split-Path (Split-Path (Split-Path $PSScriptRoot))
Set-Location $repo
$D = 'D:\Progetto_Restauro_KH_UX'
$sg = "$D\stage_gen"
if ($DryRun) {
  $Quick = $true
  $sg = "$D\tmp\stage_gen_dry"
  robocopy "$D\stage_gen\files" "$sg\files" /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -ge 8) { throw 'copia di stage_gen\files non riuscita' }
  $global:LASTEXITCODE = 0
  New-Item -ItemType Directory -Force "$sg\quest_thumbs" | Out-Null
}
if ($Quick) {
  $Version = [int](Get-ChildItem "$D\resource_data" -Directory | Where-Object Name -match '^\d+$' |
    Sort-Object { [int]$_.Name } | Select-Object -Last 1).Name
} elseif (-not $Version) { throw 'serve -Version N oppure -Quick' }
# controlli prima di ogni generatore (I-171): una versione completa non tocca una cartella esistente ne' (con la
# compattazione) i pacchetti condivisi di $D\compact su cui conta il -Quick della versione installata
if ($TestStraddle -and $Quick) { throw '-TestStraddle vale solo per una versione completa (-Version N), non con -Quick o -DryRun' }
if (-not $Quick -and (Test-Path "$D\resource_data\$Version")) { throw "$D\resource_data\$Version esiste gia'" }
# chiave delle risorse: dalla configurazione locale fuori dal repository (recon/tools/private_tools.py)
$key = python -I recon\tools\private_tools.py key
if ($LASTEXITCODE -or -not $key) { throw 'chiave delle risorse non disponibile: vedi recon/tools/private_tools.py' }
# cartelle di riferimento locali, non fornite da questo progetto (KHUX_JP_DATA / KHUX_REF_WORK o khux_local.json)
$jpData = python -I recon\tools\private_tools.py path jp_data
$refWork = python -I recon\tools\private_tools.py path ref_work
if ($LASTEXITCODE -or -not $jpData -or -not $refWork) { throw 'cartelle locali non configurate: vedi recon/tools/private_tools.py' }
python -I recon\tools\make_layouts.py "$D\layouts\orig" "$sg\files"
# texture assenti da ogni risorsa, ricostruite (Pillow: senza -I)
python recon\tools\make_textures.py "$D\catalog\files" "$sg\files"
if ($LASTEXITCODE) { throw 'make_textures fallito' }
# piastre di Shop > Draw (I-133): lucchetto img/ui/ShopBut_Lock e _Disable (caricato sempre dalla
# piastra) e But07_Disable (pulsante spento di una piastra bloccata); senza, crash 0x2c
python -I recon\tools\make_shop_lock.py "$D\catalog\files" "$sg\files"
if ($LASTEXITCODE) { throw 'make_shop_lock fallito' }
# Stock Medal (medaglia 1 degli slot vuoti, immagine 90000; I-075)
python recon\tools\make_stock_medal.py "$D\reference\empty_slot\stock_medal_khuxwiki.png" "$D\catalog\files\img\medal" "$sg\files"
if ($LASTEXITCODE) { throw 'make_stock_medal fallito' }
# miniature dell'elenco Story stage_select_ico_<mondo>_<thumbId> (95 assenti: il carosello
# mostrava miniature di altre missioni o il «?», I-064), dalle anteprime di Roboloid in cache
python recon\tools\make_quest_thumbs.py server\master_data\stage.json "$D\catalog\files\img\adventure\stage" "$D\external\roboloid\cache\map" "$sg\files" --report "$sg\quest_thumbs\report.json"
if ($LASTEXITCODE) { throw 'make_quest_thumbs fallito' }
# animazione move delle grafiche di Dark Road usate dai nemici (copia di wait)
$env:BGAD_KEY = $key
# immagini dei keyblade img/keyBlade/KeyBlade_%06d.png (popup del keyblade ottenuto), dalle
# bitmap dei LWF lwf/avatar/keyblade (estratte una volta in catalog\keyblade_lwf)
$kl = "$D\catalog\keyblade_lwf"
if (-not (Test-Path "$kl\img\carouselDeck")) { python -I recon\tools\res_bulk.py "$D\resource_data\names_v4.tsv" "$D\resource_data\7\data" $kl lwf/avatar/keyblade/ lwf/medal/medaltype/ lwf/medal/medaldeck/ img/carouselDeck/ rule/ cocostudio/publish/Deck_KeyBlade_0701_05.png }
# LWF del risultato delle estrazioni servite (raidgacha_result_display_01, Medal_D_Up3): fonte delle
# texture tolte dall'estrazione JP per le cartelle 02-10 (import_jp_raisedraw.py)
$rw = "$D\catalog\raisedraw_ww"
if (-not (Test-Path "$rw\lwf\raisedraw")) { python -I recon\tools\res_bulk.py "$D\resource_data\names_v4.tsv" "$D\resource_data\7\data" $rw lwf/raisedraw/ }
# KeyBlade_ef6/ef8 e star01 di GuiltBonus_max (fonte per nome, NAME_WW di import_jp_raisedraw.py, 19-10)
if (-not (Test-Path "$rw\lwf\battleresult\Result_LuxLevelUp")) { python -I recon\tools\res_bulk.py "$D\resource_data\names_v4.tsv" "$D\resource_data\7\data" $rw lwf/battleresult/Result_LuxLevelUp/ }
# deck per keyblade (img/carouselDeck/Deck%03d...) e bagliore dell'attributo nel deck
# (MedalDeck_Type1/2/11/21/31/01): servite solo 001 e Type3, crash di «Select a Keyblade»
python recon\tools\make_keyblade_decks.py server\master_data\keyblade.json $kl "$sg\files"
if ($LASTEXITCODE) { throw 'make_keyblade_decks fallito' }
# posa del keyblade nei riquadri dei menu (rule/keyblade_rule.bin, una riga per keyblade, centrata
# come Starlight: Treasure Trove era a destra e tagliato in «Select a Keyblade»)
python -I recon\tools\keyblade_rule.py server\master_data\keyblade.json "$kl\rule\keyblade_rule.bin" "$kl\lwf\avatar\keyblade" "$sg\files"
if ($LASTEXITCODE) { throw 'keyblade_rule fallito' }
python recon\tools\make_keyblade_images.py server\master_data\keyblade.json $kl "$sg\files"
if ($LASTEXITCODE) { throw 'make_keyblade_images fallito' }
# bagliore «medaglia del tipo dello slot» MedalType1/2/01 (solo MedalType3 servito: crash di
# Optimize su Treasure Trove, slot Power)
python recon\tools\make_medaltype_lwf.py $kl "$sg\files"
# armatura ActMapCarouselAnim della 4.3.1 JP (GuiltBonus_Plus, icone di tier 1-10: la WW servita ne ha 8, I-124)
python recon\tools\make_carousel_anim.py
if ($LASTEXITCODE) { throw 'make_medaltype_lwf fallito' }
python -I recon\tools\make_enemy_moves.py server\master_data\enemy.json "$D\resource_data\names_v4.tsv" "$D\resource_data\7\data" "$D\catalog\enemy_wait" "$sg\files"
if ($LASTEXITCODE) { throw 'make_enemy_moves fallito' }
# versioni 4.3.1 (addnl) di file cambiati dall'OBB 5.0.1: wait (avatar fermo nel campo, con il
# keyblade) e win_levelup; nell'indice unito vincerebbe l'OBB (I-091)
python -I recon\tools\prefer_addnl.py "$D\ipa431\names_addnl.tsv" "$D\ipa431\addnl.mp4" "$sg\files"
if ($LASTEXITCODE) { throw 'prefer_addnl fallito' }
# testi ui originali dell'IPA 4.4.0 (import_ui_texts.py -> layouts\ui_texts), dopo quelli
# scritti a mano: dove c'e' l'originale prevale, tranne i segnaposto «[id]» dell'IPA (es. i
# filtri Supernova 106240205-215) quando make_layouts.py ha gia' scritto un testo
python -I recon\tools\import_ui_texts.py "$D\resource_data\names_v4.tsv" "$D\ipa440\names440misc.tsv" "$D\ipa440\miscdata" "$D\layouts\ui_texts" "$D\layouts\served_texts\text\ui"
foreach ($t in Get-ChildItem "$D\layouts\ui_texts\text\ui" -File) {
    $dst = Join-Path "$sg\files\text\ui" $t.Name
    if ((Test-Path $dst) -and ([IO.File]::ReadAllText($t.FullName) -match '^\[\d+\]$')) { continue }
    Copy-Item $t.FullName $dst -Force
}
# testi di dialogo degli NPC (text/drama/2040xxxxx, I-154): citati dai record npc delle mappe gia' in
# $sg\files\stage, scaricati dal CDN nell'originale (nelle risorse WW solo 204010301); dal pacchetto
# 2016 (inglese), in mancanza dal JP 4.3.1 (segnalati); senza, toccare l'NPC con la nuvoletta non fa nulla
python -I recon\tools\import_npc_talk.py "$D\resource_data\names_v4.tsv" "$refWork\bundle2016" `
  "$jpData\text\drama" `
  "$sg\files\stage" "$sg\files" --report "$sg\npc_talk.json"
if ($LASTEXITCODE) { throw 'import_npc_talk fallito' }
# pulsante «Overwrite Skill» del Level Up acceso (I-157): il client carica skill_mix_button_On/_Disable e,
# acceso, le cornici Medal_Syn_Select_Panel02 in img/ui; WW serve solo _Off (acceso restava grigio). BTF del 2016
# Icona skill 3 (thumbId 3: Lux Plus e le combo «& Lux Plus»): WW serve img/skill/Skill_Icon1,2,4-9 ma non la 3;
# senza, il riquadro teneva l'icona di prima (Lux Plus con la freccia rossa di Attack Boost, banco 18-10)
# Controllo delle immagini dal nome composto con un numero (18-10, risorse_layout.md#icone-numerate): le
# mancanti con una fonte. Dal pacchetto 2016 (BTF uguali byte per byte ai WW dove ci sono entrambi):
# - IncentiveIcon_NN: icona di un premio per tipo, costanti (tipo 7 titolo, 8 CP, 9 HP, 26 Skip
#   Ticket, ... usati da reward/mission); WW serve solo 02/04/14. Escluse 10 e 12 (giapponese disegnato)
# - material_54 (material.materialId 54, Remembrance Gem; tipo 5, riga material +0)
# - Prize_Treasure02-04 («Prize_Treasure%02d» dal premio; WW solo 01)
# - Topinfo_BarBut1,3-7 _Off/_On («Button_%d», indice+1; WW solo 2)
# - Deck_Arrow_U/R1-3 (frecce del bonus di attributo del deck; WW solo publish/Deck_Arrow_U1)
# - tutorial_N («tutorial_%d», id 1-65 costanti dei chiamanti): le 19 del 2016
#   in inglese; quelle dei soli dati JP (48-65) hanno il testo giapponese e restano assenti (ISSUES I-159)
# - light/NPC/39994,39996,39997 (immagini dei SEQ light novel 1010151/1989901, comando 4002)
$img16 = @('ui\skill_mix_button_On', 'ui\skill_mix_button_Disable', 'ui\Medal_Syn_Select_Panel02', 'skill\Skill_Icon3',
  'material\material_54', 'prizes\Prize_Treasure02', 'prizes\Prize_Treasure03', 'prizes\Prize_Treasure04',
  'light\NPC\39994', 'light\NPC\39996', 'light\NPC\39997')
$img16 += @(6, 7, 8, 9, 11, 15, 16, 17, 26, 28, 29) | ForEach-Object { 'incentive\IncentiveIcon_{0:D2}' -f $_ }
$img16 += @(1, 3, 4, 5, 6, 7) | ForEach-Object { "ui\Topinfo_BarBut${_}_Off"; "ui\Topinfo_BarBut${_}_On" }
$img16 += @(1, 2, 3) | ForEach-Object { "ui\Deck_Arrow_U$_"; "ui\Deck_Arrow_R$_" }
$img16 += @(12, 13, 16, 17, 20, 21, 22, 23, 24, 25, 27, 29, 30, 32, 33, 34, 45, 46, 47) | ForEach-Object { "tutorial\tutorial_$_" }
foreach ($n in $img16) {
    $src = "$refWork\bundle2016\files\img\$n.png"
    if (-not (Test-Path $src)) { throw "manca $src" }
    New-Item -ItemType Directory -Force (Split-Path "$sg\files\img\$n.png") | Out-Null
    Copy-Item $src "$sg\files\img\$n.png" -Force
}
# Dai dati JP 4.3.1 (PNG, revisione piu' alta; btf_fix le premoltiplica), senza testo disegnato:
# - IncentiveIcon_30-32, 35-41 (40 Platinum Ticket e 41 Draw Ticket nelle missioni 4059/4060/4091)
# - AvtInfo_CrownIcon1-3 / trophyIcon1-2 del Profilo (corona = (mvpCount-1)/50+1, trofeo =
#   (pvpMvpCount-1)/50+1 senza segno, fino a 4; col nostro 0 il client chiede CrownIcon1 e trophyIcon4)
# - cifre del danno dmgGuardBreak/dmgReflection_num0-9 e _comma (tipi 5 e 6)
$jpImg = "$jpData\img"
$imgJp = @(30, 31, 32, 35, 36, 37, 38, 39, 40, 41) | ForEach-Object { 'incentive\IncentiveIcon_{0:D2}' -f $_ }
$imgJp += @('ui\AvtInfo_CrownIcon1', 'ui\AvtInfo_CrownIcon2', 'ui\AvtInfo_CrownIcon3', 'ui\AvtInfo_trophyIcon1', 'ui\AvtInfo_trophyIcon2')
foreach ($k in 'GuardBreak', 'Reflection') { $imgJp += @(0..9 | ForEach-Object { "damage\dmg${k}_num$_" }) + "damage\dmg${k}_comma" }
# - arco dell'HP in battaglia (PlayerStatusIndicator, I-032): oltre 3000 HP il client carica Avatar_Circle_06 e
#   Avatar_Side_02-04, assenti dalle risorse WW (prima: HP del giocatore fermo a 3000)
$imgJp += @('ui\PlayerStatusIndicator\Avatar_Circle_06') + (2..4 | ForEach-Object { "ui\PlayerStatusIndicator\Avatar_Side_0$_" })
foreach ($n in $imgJp) {
    $leaf = Split-Path -Leaf $n
    $cand = @(Get-ChildItem (Split-Path "$jpImg\$n.png") -File | Where-Object { $_.Name -match ('^' + [regex]::Escape($leaf) + '(\.\d{8})?\.png$') } |
      Sort-Object { if ($_.Name -match '\.(\d{8})\.png$') { [int]$Matches[1] } else { -1 } })
    if (-not $cand) { throw "manca $jpImg\$n.png" }
    New-Item -ItemType Directory -Force (Split-Path "$sg\files\img\$n.png") | Out-Null
    Copy-Item $cand[-1].FullName "$sg\files\img\$n.png" -Force
}
# Serviti solo sotto cocostudio/publish (non valgono per img/...): stesso file anche in img/ (WW localizzate:
# CrownIcon4, trophyIcon3/4, IncentiveIcon_42 Premium Ticket). Estratti una volta in catalog\img_alias
$alias = @{ 'ui\AvtInfo_CrownIcon4' = 'cocostudio/publish/AvtInfo_CrownIcon4.png'; 'ui\AvtInfo_trophyIcon3' = 'cocostudio/publish/AvtInfo_trophyIcon3.png'
  'ui\AvtInfo_trophyIcon4' = 'cocostudio/publish/AvtInfo_trophyIcon4.png'; 'incentive\IncentiveIcon_42' = 'cocostudio/publish/IncentiveIcon_42.png'
  # arco dell'HP (I-032): nelle risorse WW solo sotto cocostudio/publish, stesse dimensioni di quelle in img/ui
  'ui\PlayerStatusIndicator\Avatar_Circle_01' = 'cocostudio/publish/Avatar_Circle_01.png'; 'ui\PlayerStatusIndicator\Avatar_Side_01' = 'cocostudio/publish/Avatar_Side_01.png'
  # biglietto dorato del pannello Skip (I-203): il client lo ricarica da img/ui quando si torna da «Force Skip» a
  # «Skip», ma img/ui/ST_Ticket_Icon.png manca anche nelle risorse JP/WW originali (restava l'icona arcobaleno)
  'ui\ST_Ticket_Icon' = 'cocostudio/publish/ST_Ticket_Icon.png' }
$ac = "$D\catalog\img_alias"
$need = @($alias.Values | Where-Object { -not (Test-Path "$ac\$_") })
if ($need) { python -I recon\tools\res_get.py "$D\resource_data\names_v4.tsv" "$D\resource_data\7\data" $ac @need; if ($LASTEXITCODE) { throw 'res_get img_alias fallito' } }
foreach ($k in $alias.Keys) {
    if (-not (Test-Path "$ac\$($alias[$k])")) { throw "manca $ac\$($alias[$k])" }
    New-Item -ItemType Directory -Force (Split-Path "$sg\files\img\$k.png") | Out-Null
    Copy-Item "$ac\$($alias[$k])" "$sg\files\img\$k.png" -Force
}
# piastra «Banner Catalog» dello Shop: testi del pulsante Gold Ticket (106140420-424) e icona
# Star7_Ticket_39 (aveva il segno «仮»), dopo i testi IPA; banner 9001 in server\game_data\gacha_img
python recon\tools\make_shop_art.py "$sg\files" server\game_data
if ($LASTEXITCODE) { throw 'make_shop_art fallito' }
# LWF del risultato delle estrazioni (raisedraw_gen\files, pacchetto statico: vedi sotto) importati PRIMA di
# import_jp_coco: i suoni dei loro eventi (x10 draw 509000390, popup del Nova 509000740, I-152) li cerca
# jp_sound_effects.py, che deve vedere le cartelle gia' scritte anche partendo da raisedraw_gen vuoto. Le
# cartelle files\ di rooms_gen ed enemy_gen non le scrive questo script (make_jp_rooms.py, make_jp_enemies.py):
# ci sono gia' quando parte.
$xg = "$D\raisedraw_gen"
if (-not $NoRaisedraw -and (-not $Quick -or -not (Test-Path "$xg\files"))) {
  # logo «NOVA» del popup del Nova al posto del «BURST» JP (make_nova_logo.py -> raisedraw_gen\nova, fuori
  # da git): sostituisce Burst_Logo / Burst_Logo_B (422x142) di GuiltBonus_BurstLvup con --replace
  python recon\tools\make_nova_logo.py --out "$xg\nova"
  if ($LASTEXITCODE) { throw 'make_nova_logo fallito' }
  $burst = 'lwf/medal/guilt_bonus/GuiltBonus_BurstLvup/GuiltBonus_BurstLvup_'
  $novaReplace = @('--replace', "${burst}42757273745f4c6f676f2e706e67.png=$xg\nova\Burst_Logo.png",
                   '--replace', "${burst}42757273745f4c6f676f5f422e706e67.png=$xg\nova\Burst_Logo_B.png")
  python recon\tools\import_jp_raisedraw.py --ww "$D\catalog\raisedraw_ww" --out "$xg\files" --report "$xg\raisedraw_report.json" @novaReplace
  if ($LASTEXITCODE) { throw 'import_jp_raisedraw fallito' }
}
# layout originali dai dati JP 4.3.1 al posto dei nostri generati (I-117): elenco versionato in
# recon\tools\jp_coco_layouts.txt (togliere una riga = torna il generato), sopra l'uscita di
# make_layouts/make_textures; rapporto e manifest in $sg\jp_import (Pillow: senza -I)
# Copia anche (pure con -NoJp) gli AKB delle BGM Medals e gli effetti sonori se_<nome> dei LWF serviti e
# generati assenti dalle risorse (jp_sound_effects.py, I-152: x10 draw, popup del Nova, nemici JP; ~4,3 MB;
# rapporto $sg\jp_import\sound_effects.json), leggendo anche i LWF dei pacchetti statici.
# -NoJp: niente originali JP (tornano i generati; serve per un -Quick su una versione installata
# prima degli originali: i ~250 nomi nuovi non stanno nella riserva dell'indice)
$jpOpt = @(); if ($NoJp) { $jpOpt = @('--none') }
# pacchetti statici che non saranno nell'indice: esclusi dalla ricerca dei suoni (-NoRooms/-NoEnemies/
# -NoRaisedraw; con -Quick quelli assenti da packs.txt della versione installata)
$seOpt = @()
$instPacks = if ($Quick -and (Test-Path "$D\resource_data\$Version\packs.txt")) { @(Get-Content "$D\resource_data\$Version\packs.txt") } else { @() }
foreach ($sp in @(@('rooms_gen', $NoRooms), @('enemy_gen', $NoEnemies), @('raisedraw_gen', $NoRaisedraw))) {
  if ($sp[1] -or ($Quick -and $instPacks -notcontains $sp[0])) { $seOpt += @('--no-static', $sp[0]) }
}
# segnaposto della wait.lwf per ogni NPC delle mappe senza LWF servita (I-197: il client fa addChild(NULL) e va in
# crash); PRIMA di import_jp_coco, che li sostituisce col JP dove esistono tutte le texture
python -I recon\tools\npc_placeholders.py "$sg\files" --served "$D\resource_data\names_v4.tsv" --served "$D\ipa431\names_addnl.tsv" --report "$sg\npc_placeholders.json"
if ($LASTEXITCODE) { throw 'npc_placeholders fallito' }
python recon\tools\import_jp_coco.py --out "$sg\files" --report "$sg\jp_import" @jpOpt @seOpt
if ($LASTEXITCODE) { throw 'import_jp_coco fallito' }
# originali (2016, JP 4.3.1, IPA 4.4.0) al posto delle nostre ricostruzioni, dopo tutti i generatori (I-170,
# recon\tools\originals.tsv); i file dell'IPA 4.4.0 si estraggono una volta in catalog\ipa440_extract
$i440 = "$D\catalog\ipa440_extract"
$i440Need = @('img/union/Union_01.png', 'img/union/Union_02.png', 'img/union/Union_03.png', 'img/union/Union_04.png', 'img/union/Union_05.png',
  'cocostudio/publish/MenuDialog_account_select_ver401.json', 'cocostudio/publish/appleid_button_2x.png',
  'cocostudio/publish/facebook_button_2x.png', 'cocostudio/publish/SQEXBridge_button_2x.png') | Where-Object { -not (Test-Path "$i440\$_") }
if ($i440Need) { python -I recon\tools\res_get.py "$D\ipa440\names440misc.tsv" "$D\ipa440\miscdata" $i440 @i440Need; if ($LASTEXITCODE) { throw 'res_get ipa440 fallito' } }
python -I recon\tools\import_originals.py recon\tools\originals.tsv "$refWork\bundle2016\files" `
  "$jpData" "$sg\files" `
  --served "$D\resource_data\names_v4.tsv,$D\ipa431\names_addnl.tsv" --i440 $i440 --report "$sg\originals.json"
if ($LASTEXITCODE) { throw 'import_originals fallito' }
# suoni se_<nome> dei LWF originali appena importati (KeyBlade_Evolution/StepUp, training_SE dei pet): la
# ricerca di import_jp_coco e' girata prima, sui LWF generati senza eventi (banco 19-10: evoluzione muta)
python -I recon\tools\jp_sound_effects.py --out "$sg\files" --apply @seOpt
if ($LASTEXITCODE) { throw 'jp_sound_effects fallito' }
# PNG veri e BTF non premoltiplicati -> BTF come le originali (alpha premoltiplicata)
python recon\tools\btf_fix.py "$sg\files"
if ($LASTEXITCODE) { throw 'btf_fix fallito' }
python -I recon\tools\resource_pack.py "$sg\files" $key "$sg\gen.mp4" "$sg\gen.png"
# pacchetti statici (medaglie, stanze, nemici) con --cache: rifatti solo se i loro file cambiano
# pacchetto delle immagini delle medaglie (fetch_medal_images.py, ~150 MB): solo nelle
# versioni complete, come penultimo pezzo; -Quick riscrive solo l'ultimo (quello generato)
$mg = "$D\medal_gen"
$medalPack = @()
if (Test-Path "$mg\files") {
  # Trait Medal (I-084 parte B): medaglia associata in bianco e nero, id 9000000+N (server/trait_medals.json);
  # ~180 MB, oltre la riserva del pacchetto generato: stanno col pacchetto delle medaglie
  if (-not $Quick) { python recon\tools\make_trait_medal_images.py server\trait_medals.json "$mg\files" "$mg\files"; if ($LASTEXITCODE) { throw 'make_trait_medal_images fallito' } }
  if (-not $Quick) { python recon\tools\btf_fix.py "$mg\files"; python -I recon\tools\resource_pack.py --cache "$mg\files" $key "$mg\gen.mp4" "$mg\gen.png"; if ($LASTEXITCODE) { throw 'resource_pack medaglie fallito' } }
  if (Test-Path "$mg\gen.png") { $medalPack = @("$mg\gen.png", "$mg\gen.mp4") }
}
if ($LASTEXITCODE) { throw 'resource_pack fallito' }
$v = "$D\resource_data\$Version"
# pacchetto delle stanze recuperate (make_jp_rooms.py -> rooms_gen\files: stanze JP 4.3.1/2016 con
# tessere e lwf in BTF): solo nelle versioni complete, dopo le medaglie e prima del generato (che
# vince a nome ripetuto); -Quick non lo ricostruisce mai, lo rimette nell'indice solo se la versione
# installata lo contiene (packs.txt)
$rg = "$D\rooms_gen"
$roomsPack = @()
if ($Quick) {
  if ((Test-Path "$v\packs.txt") -and ((Get-Content "$v\packs.txt") -contains 'rooms_gen')) {
    if (-not (Test-Path "$rg\gen.png")) { throw "la versione $Version contiene rooms_gen ma manca $rg\gen.png" }
    $roomsPack = @("$rg\gen.png", "$rg\gen.mp4")
  }
} elseif (-not $NoRooms -and (Test-Path "$rg\files")) {
  python -I recon\tools\resource_pack.py --cache "$rg\files" $key "$rg\gen.mp4" "$rg\gen.png"
  if ($LASTEXITCODE) { throw 'resource_pack stanze fallito' }
  $roomsPack = @("$rg\gen.png", "$rg\gen.mp4")
}
# pacchetto delle grafiche originali dei nemici (make_jp_enemies.py -> enemy_gen\files: lwf/character/enemy
# JP 4.3.1/2016 in BTF, docs/notes/battaglia.md#nemici-jp): come rooms_gen, dopo le stanze e prima del
# generato; make-game-tables.js tiene il displayId originale dei nemici le cui cartelle sono in enemy_gen\files
$eg = "$D\enemy_gen"
$enemyPack = @()
if ($Quick) {
  if ((Test-Path "$v\packs.txt") -and ((Get-Content "$v\packs.txt") -contains 'enemy_gen')) {
    if (-not (Test-Path "$eg\gen.png")) { throw "la versione $Version contiene enemy_gen ma manca $eg\gen.png" }
    $enemyPack = @("$eg\gen.png", "$eg\gen.mp4")
  }
} elseif (-not $NoEnemies -and (Test-Path "$eg\files")) {
  python -I recon\tools\resource_pack.py --cache "$eg\files" $key "$eg\gen.mp4" "$eg\gen.png"
  if ($LASTEXITCODE) { throw 'resource_pack nemici fallito' }
  $enemyPack = @("$eg\gen.png", "$eg\gen.mp4")
} elseif ($NoEnemies -and (Test-Path "$eg\files")) {
  Write-Warning 'senza enemy_gen: il master deve essere rigenerato con KHUX_NO_ENEMY_GEN=1'
}
# pacchetto delle LWF del risultato delle estrazioni (Shop > Draw, raidgacha_result_display_02..10 e
# Medal_D_*): dai dati JP con import_jp_raisedraw.py, complete di texture (le tolte dall'estrazione JP prese
# dalla _01 servita allineando le tabelle delle texture). Nel generato (16-10) lo portavano a 136,5 MB, oltre
# la riserva di 128 MiB (~33 MB: 72-78 texture per cartella): pacchetto statico come enemy_gen, dopo i nemici e
# prima del generato. Importato piu' sopra (prima di import_jp_coco, per i suoni di I-152) nelle versioni
# complete o se manca raisedraw_gen\files; rapporto in raisedraw_gen\raisedraw_report.json (Pillow: senza -I)
$raisedrawPack = @()
if ($Quick) {
  if ((Test-Path "$v\packs.txt") -and ((Get-Content "$v\packs.txt") -contains 'raisedraw_gen')) {
    if (-not (Test-Path "$xg\gen.png")) { throw "la versione $Version contiene raisedraw_gen ma manca $xg\gen.png" }
    $raisedrawPack = @("$xg\gen.png", "$xg\gen.mp4")
  }
} elseif (-not $NoRaisedraw -and (Test-Path "$xg\files")) {
  python recon\tools\btf_fix.py "$xg\files"
  if ($LASTEXITCODE) { throw 'btf_fix raisedraw fallito' }
  python -I recon\tools\resource_pack.py --cache "$xg\files" $key "$xg\gen.mp4" "$xg\gen.png"
  if ($LASTEXITCODE) { throw 'resource_pack raisedraw fallito' }
  $raisedrawPack = @("$xg\gen.png", "$xg\gen.mp4")
}
$staticPacks = $medalPack + $roomsPack + $enemyPack + $raisedrawPack
# Pacchetti nell'ordine dei dati (etichetta, indice, dati separati da virgola): OBB 5.0.1 main + patch
# (indice aliud.png), addnl 4.3.1, i pacchetti statici, il generato per ultimo
$o = "$D\obb76"
$plist = @(@('obb', "$D\apk501\ext\assets\aliud.png", "$o\main.76.com.square_enix.android_googleplay.khuxww.obb,$o\patch.87.com.square_enix.android_googleplay.khuxww.obb"),
           @('addnl', "$D\ipa431\addnl.png", "$D\ipa431\addnl.mp4"))
for ($i = 0; $i -lt $staticPacks.Count; $i += 2) { $plist += , @((Split-Path -Leaf (Split-Path $staticPacks[$i])), $staticPacks[$i], $staticPacks[$i + 1]) }
$plist += , @('stage_gen', "$sg\gen.png", "$sg\gen.mp4")
# Compattazione (I-171, resource_compact.py): nei dati restano solo i record che l'indice unito puo' citare
# (via ~85 MB nella 47: addnl 54,7, OBB 30,1, medaglie 4,9; verificato nome per nome con resource_compare.py).
# Pacchetti compattati in $D\compact (<etichetta>.mp4/.png, rifatti solo se cambiano gli ingressi); l'elenco
# di una versione sta in resource_data\<N>\compact.txt: -Quick e -DryRun usano gli stessi (mai ricompattati:
# lo controlla la somma delle dimensioni piu' sotto). -NoCompact: pacchetti come sono (versioni <= 47).
$cdir = "$D\compact"
# impronta di un pacchetto compattato in compact.txt: etichetta, byte dei dati, SHA1 dell'indice (cambia con ogni
# offset), impronta degli ingressi (.png.src); -Quick la ricalcola e si ferma se non coincide
function Compact-Stamp([string]$l) {
  "$l`t$((Get-Item "$cdir\$l.mp4").Length)`t$((Get-FileHash -Algorithm SHA1 "$cdir\$l.png").Hash)`t$(Get-Content "$cdir\$l.png.src")"
}
if ($Quick) {
  $cLines = if (Test-Path "$v\compact.txt") { @(Get-Content "$v\compact.txt" | Where-Object { $_ }) } else { @() }
  $compact = @($cLines | ForEach-Object { ($_ -split "`t")[0] })
} elseif ($NoCompact) {
  $compact = @()
} else {
  $compact = @(@('obb', 'addnl', 'medal_gen') | Where-Object { $l = $_; $plist | Where-Object { $_[0] -eq $l } })
  $cArgs = @(); foreach ($l in $compact) { $cArgs += @('--compact', $l) }
  $pArgs = @(); foreach ($p in $plist) { $pArgs += $p }
  python -I recon\tools\resource_compact.py @cArgs recon\tools recon\ext\ww431\libcocos2dcpp.so $key $cdir @pArgs
  if ($LASTEXITCODE) { throw 'resource_compact fallito' }
}
foreach ($p in $plist) {
  if ($compact -contains $p[0]) {
    if (-not (Test-Path "$cdir\$($p[0]).png")) { throw "manca $cdir\$($p[0]).png (pacchetto compattato della versione $Version)" }
    $p[1] = "$cdir\$($p[0]).png"; $p[2] = "$cdir\$($p[0]).mp4"
  }
}
if ($Quick) {
  foreach ($line in $cLines) {
    $l = ($line -split "`t")[0]
    if ((Compact-Stamp $l) -ne $line) {
      $msg = "pacchetto compattato $cdir\$l diverso da quello della versione $Version (compact.txt): rifatto da un build successivo, serve una versione completa"
      if ($DryRun) { Write-Warning $msg } else { throw $msg }
    }
  }
}
# Dimensioni fisse: il client confronta le dimensioni dei file installati con quelle del
# download e, se cambiano, butta le risorse e riscarica tutto (resourceRevision 0). Il
# pacchetto generato si riempie di zeri fino a una riserva (letto per offset, la coda non
# e' mai letta) e l'indice ha un nome di riempimento (resource_merge.py): una versione
# completa riserva 168 MiB e 64 KiB, -Quick ritorna alle dimensioni installate.
# Pezzi dei dati, numerati di seguito: OBB (d0000-d0032 nella 7), addnl (d0033-d0034), uno per pacchetto
# statico, il generato per ultimo (nella 47: medaglie d0035, stanze d0036, nemici d0037, raisedraw d0038,
# generato d0039)
if ($Quick) {
  $genName = (Get-ChildItem "$v\data" | Sort-Object Name | Select-Object -Last 1).Name
  $dataSize = (Get-Item "$v\data\$genName").Length
  $mergeOpt = @('--fast-md5', '--index-size', (Get-Item "$v\index\misc.png").Length)
} else {
  # si costruisce in resource_data\_build_<N> (il server annuncia solo le cartelle numeriche) e si rinomina dopo i
  # controlli finali: un build fallito non lascia una versione nuova rotta che il server servirebbe
  $vFinal = $v; $v = "$D\resource_data\_build_$Version"
  if (Test-Path $v) { Remove-Item -Recurse -Force $v }   # resto di un build fallito
  New-Item -ItemType Directory -Force "$v\data", "$v\index" | Out-Null
  $nx = 0
  # OBB e addnl: hard link a pezzi da 64 MiB condivisi fra le versioni; non compattati quelli della 7,
  # compattati quelli di $cdir\pieces\<etichetta> (resource_split.py, rifatti quando cambia il pacchetto)
  $v7 = @(Get-ChildItem "$D\resource_data\7\data" | Sort-Object Name)
  foreach ($b in @(@('obb', 0, 33), @('addnl', 33, 2))) {
    $l = $b[0]
    if ($compact -contains $l) {
      $pd = "$cdir\pieces\$l"; $stamp = Get-Content "$cdir\$l.png.src"
      if (-not (Test-Path "$pd.src") -or (Get-Content "$pd.src") -ne $stamp) {
        if (Test-Path $pd) { Remove-Item -Recurse -Force $pd }   # i pezzi gia' collegati alle versioni restano
        python -I recon\tools\resource_split.py $pd 64 "$cdir\$l.mp4"
        if ($LASTEXITCODE) { throw "resource_split $l fallito" }
        Set-Content -Encoding ascii "$pd.src" $stamp
      }
      $src = @(Get-ChildItem $pd -File | Sort-Object Name)
    } else {
      $src = $v7[$b[1]..($b[1] + $b[2] - 1)]
      $p = $plist | Where-Object { $_[0] -eq $l }
      $sum = 0; foreach ($f in $p[2] -split ',') { $sum += (Get-Item $f).Length }
      if (($src | Measure-Object Length -Sum).Sum -ne $sum) { throw "i pezzi della 7 per $l non sono lunghi quanto il pacchetto" }
    }
    foreach ($f in $src) { New-Item -ItemType HardLink -Path ("$v\data\d{0:D4}" -f $nx) -Target $f.FullName | Out-Null; $nx++ }
  }
  # pacchetti statici come pezzi seguenti (copie: le versioni dopo li ricostruiscono)
  for ($i = 2; $i -lt $plist.Count - 1; $i++) { Copy-Item $plist[$i][2] ("$v\data\d{0:D4}" -f $nx); $nx++ }
  # -TestStraddle: pezzo di zeri prima del generato, lungo quanto basta perche' il record scelto stia a cavallo
  # di misc.mp4.1 / misc.mp4.2 (resource_parts.py --straddle); il nome del pezzo resta in testpad.txt per -Quick
  if ($TestStraddle) {
    $start = 0; foreach ($p in $plist[0..($plist.Count - 2)]) { foreach ($f in $p[2] -split ',') { $start += (Get-Item $f).Length } }
    $padLen = [int64](python -I recon\tools\resource_parts.py --straddle "$sg\gen.png" "$sg\gen.mp4" $TestStraddle $start)
    if ($LASTEXITCODE) { throw "-TestStraddle: $TestStraddle assente dal pacchetto generato o gia' oltre 4 GiB" }
    if ($padLen -ge 2147483648) { throw "riempimento di $padLen byte: un pezzo deve stare sotto i 2 GiB" }
    $padName = 'd{0:D4}' -f $nx
    $fs = [IO.File]::Create("$v\data\$padName"); $fs.SetLength($padLen); $fs.Close(); $nx++
    Set-Content -Encoding ascii "$v\testpad.txt" $padName
    "prova I-171: riempimento $padName di $padLen byte, $TestStraddle a cavallo di misc.mp4.1 / misc.mp4.2"
  }
  $genName = 'd{0:D4}' -f $nx
  $names = @(); if ($medalPack) { $names += 'medal_gen' }; if ($roomsPack) { $names += 'rooms_gen' }; if ($enemyPack) { $names += 'enemy_gen' }; if ($raisedrawPack) { $names += 'raisedraw_gen' }
  Set-Content -Encoding ascii "$v\packs.txt" $names
  if ($compact) { Set-Content -Encoding ascii "$v\compact.txt" @($compact | ForEach-Object { Compact-Stamp $_ }) }
  # 168 MiB dal 20 ottobre (I-171): contenuto 138,8 MB (132,4 MiB) nella 47, restano ~35,6 MiB per i -Quick (piu'
  # degli originali di I-170, ~33 MB in un colpo; 160 MiB ne lasciava 27,6). 176 MiB dal 19 ottobre, 128 MiB prima
  # (192 MiB portava i dati oltre 4 GiB); 4 MiB finiti con le icone dei materiali (10 ottobre), 16 MiB con le
  # miniature Story (11 ottobre), 32 MiB con la musica delle BGM Medals (15 ottobre, ~55 MB di audio)
  # 360 MiB dalla versione 50 (20-10 sera): animazioni originali degli attacchi speciali (originals.tsv #36, ~190 MB),
  # contenuto 307 MiB, ~53 MiB per i -Quick; oltre 4 GiB in tutto (misc.mp4.2, provato con la 48, I-171)
  $dataSize = 360MB
  $mergeOpt = @('--filler', 65536)   # riserva dell'indice per i cicli -Quick (4 KB finivano presto)
}
# cartelle mixture/medal/compose/<imageId>/Medal_L dell'animazione di Level Up/Evolve come alias di
# img/medal/Medal_L_<id>.png (nessun dato in piu'; il WW ne serviva 21: cornici vuote, banco 19-10)
python -I recon\tools\medal_mixture_alias.py server\master_data\medal.json "$sg\mixture_alias.tsv"
if ($LASTEXITCODE) { throw 'medal_mixture_alias fallito' }
$mergeOpt += @('--alias', "$sg\mixture_alias.tsv")
$genLen = (Get-Item "$sg\gen.mp4").Length
if ($genLen -gt $dataSize) { throw "pacchetto generato di $genLen byte oltre la riserva di ${dataSize}: serve una versione completa" }
$fs = [IO.File]::Open("$sg\gen.mp4", 'Open', 'ReadWrite'); $fs.SetLength($dataSize); $fs.Close()
# riempimento di -TestStraddle: dati in piu' in coda al pacchetto prima del generato (nessun nome lo cita)
$padFile = $null
if ($Quick -and (Test-Path "$v\testpad.txt")) { $padFile = "$v\data\$(Get-Content "$v\testpad.txt")" }
elseif (-not $Quick -and $TestStraddle) { $padFile = "$v\data\$padName" }
if ($padFile) { $plist[$plist.Count - 2][2] += ",$padFile" }
# argomenti di resource_merge.py: indice e dati di ogni pacchetto, nell'ordine dei dati
$packs = @(); foreach ($p in $plist) { $packs += @($p[1], $p[2]) }
if ($Quick) {
  # i pacchetti prima del generato devono essere lunghi quanto i pezzi installati: altrimenti gli offset
  # dell'indice nuovo non cadrebbero sui record (pacchetto statico o compattato rifatto dopo la versione)
  $before = (Get-ChildItem "$v\data" | Where-Object Name -ne $genName | Measure-Object Length -Sum).Sum
  $sum = 0; foreach ($p in $plist[0..($plist.Count - 2)]) { foreach ($f in $p[2] -split ',') { $sum += (Get-Item $f).Length } }
  if ($sum -ne $before) {
    $msg = "pacchetti prima del generato di $sum byte, pezzi installati della versione $Version di ${before}: serve una versione completa"
    if ($DryRun) { Write-Warning $msg } else { throw $msg }
  }
}
if ($DryRun) {
  $want = (Get-Item "$v\index\misc.png").Length
  $ErrorActionPreference = 'Continue'
  $out = python -I recon\tools\resource_merge.py --last-wins @mergeOpt recon\tools recon\ext\ww431\libcocos2dcpp.so $key "$sg\misc_dry.png" @packs 2>&1
  $quick = -not $LASTEXITCODE
  if (-not $quick) {
    # oltre la riserva dell'indice: si prova l'indice di una versione completa (riserva di 64 KiB)
    $out2 = python -I recon\tools\resource_merge.py --last-wins --fast-md5 --filler 65536 --alias "$sg\mixture_alias.tsv" recon\tools recon\ext\ww431\libcocos2dcpp.so $key "$sg\misc_dry.png" @packs 2>&1
    if ($LASTEXITCODE) { $out2; throw 'resource_merge fallito anche come versione completa' }
  }
  $ErrorActionPreference = 'Stop'
  $ix = (Get-Item "$sg\misc_dry.png").Length
  "prova a secco su versione ${Version}: pacchetto $genLen byte su $dataSize di riserva ($([math]::Round(100 * $genLen / $dataSize, 1))%)"
  if ($quick) { "indice $ix byte = installato: -Quick possibile; niente scritto in resource_data ne' nel guest" }
  else { "indice oltre la riserva di -Quick ($($out | Select-Object -Last 1)): serve una versione completa (-Version $($Version + 1)); come versione completa l'indice e' di $ix byte. Niente scritto in resource_data ne' nel guest" }
  return
}
if ($Quick) {
  . "$repo\tools\ldplayer\bench_lib.ps1"
  # prima di toccare la versione o il guest: le risorse installate devono essere quelle della versione $Version
  # (somma dei pezzi = pezzi prima del generato + generato installato, stesso indice). Altrimenti (versione piu'
  # nuova non ancora scaricata, download a meta') -Quick scriverebbe la coda di un'altra versione: dati corrotti
  $r = "/data/data/$PKG/files/r"
  $inst = @(Sh "stat -c '%n %s' $r/misc.mp4 $r/misc.mp4.* $r/misc.png 2>/dev/null")
  $why = $inst | python -I recon\tools\resource_parts.py --check-installed ($before + $dataSize) (Get-Item "$v\index\misc.png").Length
  if ($LASTEXITCODE) { throw "le risorse installate nel guest non corrispondono alla versione ${Version} ($why): esegui update-resources.ps1, non usare -Quick" }
}
# l'ultimo pezzo e' una copia (non un hard link): sovrascriverlo non tocca le altre versioni
Copy-Item "$sg\gen.mp4" "$v\data\$genName" -Force
python -I recon\tools\resource_merge.py --last-wins @mergeOpt recon\tools recon\ext\ww431\libcocos2dcpp.so $key "$v\index\misc.png" @packs
if ($LASTEXITCODE) { throw 'resource_merge fallito' }
if (-not $Quick) {
  # il client spezza i dati in misc.mp4, misc.mp4.1, misc.mp4.2 ... a 2 GiB e ne legge al massimo 10 (20 GiB);
  # ogni file di /system/resource deve stare sotto i 2 GiB (size letto come int); risorse_layout.md#pezzi
  $files = @(Get-ChildItem "$v\data")
  $total = ($files | Measure-Object Length -Sum).Sum
  "versione ${Version}: dati $([math]::Round($total / 1GB, 2)) GiB in $($files.Count) pezzi, pacchetti statici: $((Get-Content "$v\packs.txt") -join ', '); compattati: $($compact -join ', ')"
  $big = @($files | Where-Object Length -ge 2147483648)
  if ($big) { throw "pezzi da 2 GiB o piu' (il client li rifiuta): $($big.Name -join ', ')" }
  if ($total -gt 10 * [int64]2147483648) { throw "dati oltre 20 GiB ($total byte): il client legge solo misc.mp4 .. misc.mp4.9" }
  if ($total -gt 2 * [int64]2147483648) { Write-Warning "dati oltre 4 GiB ($total byte): misc.mp4.2, non ancora provato al banco (I-171)" }
  Rename-Item $v (Split-Path -Leaf $vFinal)
  "versione $Version pronta in $vFinal (il server la annuncia da ora)"
  return
}

# Il pacchetto generato e' la coda dei dati: comincia all'offset globale $before (somma dei pezzi prima) e
# cade nel pezzo $before >> 31 del guest (misc.mp4, .1, .2 ...), magari a cavallo di due. resource_parts.py
# lo spezza nei segmenti (pezzo, offset locale, lunghezza): il primo si scrive troncando il suo pezzo
# all'offset locale e accodando, gli altri riscrivono il pezzo da zero
$genLen = (Get-Item "$v\data\$genName").Length
$segs = @(python -I recon\tools\resource_parts.py "$v\data\$genName" $before "$SHARED\q_gen")
if ($LASTEXITCODE -or -not $segs) { throw 'resource_parts fallito' }
Copy-Item "$v\index\misc.png" "$SHARED\q_index.bin" -Force
$cmd = "u=`$(stat -c %u:%g $r/misc.mp4)"
$check = @(); $want = @(); $first = $true
foreach ($sgm in $segs) {
  $f = $sgm -split "`t"
  $seg = "/sdcard/Pictures/$(Split-Path -Leaf $f[3])"
  if ($first) { $cmd += " && truncate -s $($f[1]) $r/$($f[0]) && cat $seg >> $r/$($f[0])" }
  else { $cmd += " && cat $seg > $r/$($f[0])" }
  $cmd += " && chown `$u $r/$($f[0])"
  $check += "$r/$($f[0])"; $want += [int64]$f[1] + [int64]$f[2]; $first = $false
}
$cmd += " && cat /sdcard/Pictures/q_index.bin > $r/misc.png && chown `$u $r/misc.png"
$check += "$r/misc.png"; $want += (Get-Item "$v\index\misc.png").Length
Sh "am force-stop $PKG" | Out-Null
Sh $cmd | Out-Null
foreach ($sgm in $segs) { Remove-Item ($sgm -split "`t")[3] }
Remove-Item "$SHARED\q_index.bin"
$got = "$(Sh "stat -c %s $($check -join ' ')")" -split '\s+' | Where-Object { $_ }
for ($i = 0; $i -lt $want.Count; $i++) {
  if ([int64]$got[$i] -ne $want[$i]) { throw "scrittura nel guest non riuscita: $got invece di $want" }
}
"versione $Version aggiornata nel guest: $(($check | ForEach-Object { Split-Path -Leaf $_ }) -join ', ') = $($got -join ', ')"
# solo l'app riparte: il server resta acceso (riavviarlo ricalcolerebbe gli md5 di 2,3 GB;
# la revisione delle risorse non cambia, quindi nessun download)
if (Get-Process node -ErrorAction SilentlyContinue) {
  & "$repo\tools\ldplayer\bench_start.ps1" -Out 'D:\Progetto_Restauro_KH_UX\logs\server.log' -Shot 'quick_home' -Settle 6 | Select-Object -Last 1
} else { & "$PSScriptRoot\relogin.ps1" -Tag 'quick' | Select-Object -Last 1 }
