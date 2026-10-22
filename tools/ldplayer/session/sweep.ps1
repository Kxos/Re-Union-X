# Mappatura dei pulsanti: per ogni pulsante della home e del menu riavvia l'app da capo
# (server gia' avviato, giocatore salvato), tocca, attende, fotografa e annota se l'app
# e' viva, le richieste partite e, se va in crash, il riassunto del tombstone.
#   .\sweep.ps1 [-Only nome,nome] [-Wait 10]
# Rapporto: D:\Progetto_Restauro_KH_UX\logs\sweep.txt; screenshot sweep_<nome>.png.
param([string[]]$Only, [int]$Wait = 10)
$repo = Split-Path (Split-Path (Split-Path $PSScriptRoot))
Set-Location $repo
. .\tools\ldplayer\bench_lib.ps1
$log = 'D:\Progetto_Restauro_KH_UX\logs\server.log'
$report = 'D:\Progetto_Restauro_KH_UX\logs\sweep.txt'
$pkg = 'com.square_enix.android_googleplay.khuxww'
# nome, menu (tocca prima MENU), x, y
$buttons = @(
  @('home_profilo', $false, 260, 95), @('home_rotolo', $false, 425, 135), @('home_chat', $false, 1560, 45),
  @('home_quests', $false, 100, 950), @('home_moogle', $false, 290, 980), @('home_avatarboards', $false, 440, 980),
  @('home_shop', $false, 1695, 980), @('home_presents', $false, 1845, 985), @('home_guida', $false, 1740, 703),
  @('menu_home', $true, 1745, 163), @('menu_quests', $true, 1745, 297), @('menu_equipment', $true, 1745, 430),
  @('menu_avatarboards', $true, 1745, 563), @('menu_medallist', $true, 1745, 697), @('menu_shop', $true, 1745, 830),
  @('menu_other', $true, 1745, 963)
)
if ($Only) { $buttons = $buttons | Where-Object { $Only -contains $_[0] } }
"mappatura $(Get-Date -Format s)" | Set-Content $report -Encoding utf8
foreach ($b in $buttons) {
  $name, $menu, $x, $y = $b
  Sh "am force-stop $pkg" | Out-Null
  & .\tools\ldplayer\bench_start.ps1 -Out $log -Shot "sweep_${name}_home" -Settle 6 | Out-Null
  $before = "$(Sh 'ls /data/tombstones')"
  if ($menu) { Tap 1790 45; Start-Sleep 3 }
  $from = LogLines $log
  Tap $x $y
  Start-Sleep $Wait
  $alive = "$(Sh "pidof $pkg")".Trim()
  Shot "sweep_$name" | Out-Null
  $reqs = Get-Content $log | Select-Object -Skip $from | Select-String '#\d+ (GET|POST|PUT) (\S+?)(\?|$| )' |
    ForEach-Object { $_.Matches[0].Groups[2].Value } | Select-Object -Unique
  $line = "{0,-20} {1}  richieste: {2}" -f $name, $(if ($alive) { 'viva' } else { 'CRASH' }), ($reqs -join ' ')
  $line | Add-Content $report -Encoding utf8
  if (-not $alive -and "$(Sh 'ls /data/tombstones')" -ne $before) {
    & .\tools\ldplayer\tombstone.ps1 2>&1 | Select-Object -First 9 | ForEach-Object { "    $_" } | Add-Content $report -Encoding utf8
  }
}
Get-Content $report
