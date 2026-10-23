# Avvia il server KHUX per il banco LDPlayer (vedi HANDOFF, «Come riprendere il lavoro»).
# La chiave delle risorse non sta nel repository: la legge recon/tools/private_tools.py (configurazione locale).
# Log: D:\Progetto_Restauro_KH_UX\logs\server.log (lo leggono cycle.ps1 e relogin.ps1).
#   powershell -File run-server.ps1 [-Revision N] [-TutorialFinished] [-RealNow <ISO>]
# -Revision: BASE della revisione del master (alzarla dopo ogni modifica dei master); il server
# manda BASE*100000 + scadenze (lunedi'/inizio mese 08:00 UTC) passate dal 1/1/2026 (server/clock.js)
# -RealNow: ora reale finta all'avvio (KHUX_REAL_NOW, es. 2026-10-19T09:00:00Z) per provare un
# cambio di settimana o di mese; poi l'ora scorre normalmente
# -TutorialFinished: il client scarica le risorse (azione 28) solo a tutorial finito;
# dal 9 ottobre 2026 il server lo considera finito gia' dalla fase 995 (dopo il
# Prologue), quindi serve solo a un giocatore fermo prima.
# -KbFree: potenziamento dei keyblade senza materiali (KHUX_KB_FREE=1, prove dei livelli)
# -GachaShow: rowId del catalogo separati da virgola (es. B0306,B0456) aggiunti alla lista dello Shop anche
# se non sbloccati o fuori data (KHUX_GACHA_SHOW, prove al banco; docs/notes/shop.md)
# -Save nome: salvataggio server\save\<nome>.json invece di player.json (KHUX_SAVE; es. -Save prove,
# fatto da server/make-test-save.js)
# -EnemyAtk N: attacco dei nemici x N (KHUX_BENCH_ENEMY_ATK, solo banco: per finire a terra e provare Second
# Chance); la revisione servita cambia, quindi il client riscarica il master sia accendendola sia spegnendola
param([int]$Revision = 186, [switch]$TutorialFinished, [switch]$KbFree, [switch]$Pet, [switch]$NoPet, [switch]$TestPresents, [switch]$AllParts, [string]$RealNow, [string]$GachaShow, [int]$EnemyAtk = 0, [int]$SkillProb = -1, [string]$Save, [int]$StealUid = 0)
$repo = Split-Path (Split-Path (Split-Path $PSScriptRoot))
$logs = 'D:\Progetto_Restauro_KH_UX\logs'
New-Item -ItemType Directory -Force $logs | Out-Null
$env:KHUX_PUBLIC_URL = 'https://192.168.1.185'
$env:KHUX_REVISION = "$Revision"                      # BASE: alzarla dopo ogni modifica dei master
# numeri di medaglie per estrazione con l'animazione del risultato completa (raidgacha_result_display_NN,
# raisedraw_gen\raisedraw_report.json: 01 servita, 02-10 ok dalla risorse 40)
$env:KHUX_GACHA_SIZES = "1,2,3,4,5,6,7,8,9,10"
if ($GachaShow) { $env:KHUX_GACHA_SHOW = $GachaShow } else { Remove-Item Env:KHUX_GACHA_SHOW -ErrorAction SilentlyContinue }
if ($RealNow) { $env:KHUX_REAL_NOW = $RealNow } else { Remove-Item Env:KHUX_REAL_NOW -ErrorAction SilentlyContinue }
if ($StealUid -gt 0) { $env:KHUX_BENCH_STEAL_UID = "$StealUid" } else { Remove-Item Env:KHUX_BENCH_STEAL_UID -ErrorAction SilentlyContinue }
if ($EnemyAtk -gt 1) { $env:KHUX_BENCH_ENEMY_ATK = "$EnemyAtk" } else { Remove-Item Env:KHUX_BENCH_ENEMY_ATK -ErrorAction SilentlyContinue }
# -SkillProb P: attivazione di tutte le skill delle medaglie al P% (KHUX_BENCH_SKILL_PROB, solo banco)
if ($SkillProb -ge 0) { $env:KHUX_BENCH_SKILL_PROB = "$SkillProb" } else { Remove-Item Env:KHUX_BENCH_SKILL_PROB -ErrorAction SilentlyContinue }
if ($Save) { $env:KHUX_SAVE = Join-Path $repo "server\save\$Save.json" } else { Remove-Item Env:KHUX_SAVE -ErrorAction SilentlyContinue }
if ($TutorialFinished) { $env:KHUX_TUTORIAL_FINISHED = '1' }
if ($KbFree) { $env:KHUX_KB_FREE = '1' }
# -Pet: sistema dei pet e 6o slot (KHUX_PET=1, server/pet.js; I-005)
# pet acceso di default dal 15-10 (dimenticare -Pet lo toglieva dalla home); -NoPet per spegnerlo
if (-not $NoPet) { $env:KHUX_PET = '1' }
# -TestPresents: 6 regali di prova nel box Presents (KHUX_TEST_PRESENTS=1)
if ($TestPresents) { $env:KHUX_TEST_PRESENTS = '1' }
# -AllParts: tutte le parti dello Spirit della tabella petParts (KHUX_PET_ALL_PARTS=1, prove)
if ($AllParts) { $env:KHUX_PET_ALL_PARTS = '1' }
# dimensione dell'ultima versione delle risorse (cartella numerica piu' alta)
$res = 'D:\Progetto_Restauro_KH_UX\resource_data'
$last = Get-ChildItem $res -Directory | Where-Object Name -match '^\d+$' | Sort-Object { [int]$_.Name } | Select-Object -Last 1
$env:KHUX_RESOURCE_SIZE = [string](Get-ChildItem "$($last.FullName)\data" | Measure-Object Length -Sum).Sum
$env:KHUX_RESOURCE_DIR = $res
$env:KHUX_RESOURCE_KEY = python -I "$repo\recon\tools\private_tools.py" key
if ($LASTEXITCODE -or -not $env:KHUX_RESOURCE_KEY) { throw 'chiave delle risorse non disponibile: vedi recon/tools/private_tools.py' }
Set-Location $repo
node server\server.js *> "$logs\server.log"
