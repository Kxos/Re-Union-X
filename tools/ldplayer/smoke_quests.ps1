# Prova automatica delle missioni: per ogni stageId scrive server\save\smoke.json (il server
# propone solo quella missione, vedi respondStageList), rilancia l'app, apre Quests > Story,
# Begin, Confirm, Start, e controlla che l'app sia ancora viva dopo l'avvio della battaglia.
#   .\tools\ldplayer\smoke_quests.ps1 -Stages 1060,7090 [-Out risultati.json]
# Il server deve essere gia' avviato (relogin.ps1). Alla fine toglie smoke.json.
param([int[]]$Stages, [string]$Out = 'D:\Progetto_Restauro_KH_UX\stage_gen\smoke_results.json')
$repo = Split-Path (Split-Path $PSScriptRoot)
Set-Location $repo
. .\tools\ldplayer\bench_lib.ps1
$log = 'D:\Progetto_Restauro_KH_UX\logs\server.log'
$smoke = Join-Path $repo 'server\save\smoke.json'
$results = @()
if (Test-Path $Out) { $results = @(Get-Content $Out -Raw | ConvertFrom-Json) }
foreach ($id in $Stages) {
    "{`"stageId`": $id}" | Out-File -Encoding ascii $smoke
    & .\tools\ldplayer\bench_start.ps1 -Out $log -Shot "smoke_${id}_home" -Settle 6 | Out-Null
    $from = LogLines $log
    # Notices aperte all'avvio (dal 16-10): bordo blu ai due lati, X bianca; sulla home (1722,58) e' MENU
    $c = Px @(@(180, 560), @(1740, 560), @(1722, 58))
    if ((IsNear $c[0] @(8, 81, 148)) -and (IsNear $c[1] @(16, 85, 156)) -and (IsBright $c[2])) { Tap 1722 58; Start-Sleep 4 }
    foreach ($t in '100,960', '640,400', '1305,692', '972,1005', '972,1005') {
        $x, $y = $t -split ','; Tap $x $y; Start-Sleep 6
    }
    $started = [bool](Get-Content $log | Select-Object -Skip $from | Where-Object { $_ -match 'POST /stage/start' })
    Start-Sleep 10
    $shot = Shot "smoke_$id"
    $alive = [bool]("$(Sh "pidof $PKG")".Trim())
    $crash = ''
    if (-not $alive) { $crash = (& .\tools\ldplayer\tombstone.ps1 2>&1 | Select-Object -Last 6) -join ' | ' }
    $r = [pscustomobject]@{ stageId = $id; started = $started; alive = $alive; shot = "$shot"; crash = $crash }
    "{0}: start={1} vivo={2}" -f $id, $started, $alive
    $results = @($results | Where-Object { $_.stageId -ne $id }) + $r
    $results | ConvertTo-Json -Depth 3 | Out-File -Encoding utf8 $Out
}
Remove-Item $smoke -ErrorAction SilentlyContinue
