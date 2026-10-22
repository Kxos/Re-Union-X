# Gioca la missione della storia selezionata (quella con «NEW»), dalla home o dalla lista
# delle missioni: Begin, Confirm, medaglia amica, Start, poi bench_prologue -Seek fino a
# /stage/clear, risultati e SKIP. Chiude i tutorial a finestra (DismissTutorial e quelli
# con il solo OK in basso, es. «Friends» e «1 Turn Triumphs»).
#   .\story.ps1 -Tag <prefisso screenshot> [-FromList]
param([string]$Tag = 'st', [switch]$FromList)
$repo = Split-Path (Split-Path (Split-Path $PSScriptRoot))
$log = 'D:\Progetto_Restauro_KH_UX\logs\server.log'
Set-Location $repo
. .\tools\ldplayer\bench_lib.ps1
# finestra di tutorial con il solo OK rosso in basso al centro
function OkPopup { $c = Px @(@(960, 975)); if (IsRed $c[0]) { Tap 960 975; Start-Sleep 2; return $true }; return $false }
function Close { $null = DismissTutorial; $null = OkPopup }

# dalla home per MENU -> Quests -> STORY: funziona anche quando un tutorial guidato
# della home blocca il pulsante Quests (dopo la missione 5 indica MENU)
if (-not $FromList) { Tap 1790 45; Start-Sleep 3; Tap 1740 297; Start-Sleep 10; Close; Tap 630 400; Start-Sleep 4; Close }
Shot "${Tag}_lista" | Out-Null
Tap 1300 690; Start-Sleep 5; Close                  # Begin
Tap 970 1005; Start-Sleep 5; Close                  # Confirm
Tap 1430 305; Start-Sleep 4                         # medaglia amica
$from = LogLines $log
Tap 970 1005                                        # Start
$null = WaitLog $log 'POST /stage/start' $from 30
Start-Sleep 8; Close
& .\tools\ldplayer\bench_prologue.ps1 -Out $log -Shot $Tag -Seek | Select-Object -First 1
Shot "${Tag}_fine" | Out-Null
$pid_ = Sh 'pidof com.square_enix.android_googleplay.khuxww'
"app: $(if ($pid_) { 'viva' } else { 'CHIUSA (crash?)' })"
Get-Content $log -Encoding UTF8 | Select-String 'inventario' | Select-Object -Last 3 | ForEach-Object Line
node -e "const p=require('./server/save/player.json'); console.log(JSON.stringify({lux:p.lux, money:p.money, jewel:p.freeStone, avatarCoin:p.spherePoint, materials:p.materials, last:p.lastClearStageId}))"
