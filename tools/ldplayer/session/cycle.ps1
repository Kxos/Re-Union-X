# Giro completo da NUOVO giocatore: cancella il salvataggio, riavvia il server, tutorial,
# Prologue seguendo lo schermo (-Seek), risultati, SKIP del dialogo, home.
#   .\cycle.ps1 -Tag <prefisso screenshot> [-Revision N]
# -Revision = BASE della revisione del master (run-server.ps1)
param([string]$Tag = 'c', [int]$Revision = 185)
$repo = Split-Path (Split-Path (Split-Path $PSScriptRoot))
$log = 'D:\Progetto_Restauro_KH_UX\logs\server.log'
Set-Location $repo
node -e "require('./recon/out/api_responses_ww431.json'); require('./recon/out/api_responses_auto_ww431.json')"; if (-not $?) { throw 'json' }
node --check server\server.js; if (-not $?) { throw 'sintassi' }
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Confirm:$false
Remove-Item "$repo\server\save\player.json" -ErrorAction SilentlyContinue   # nuovo giocatore
Start-Sleep 1
# processo staccato (Win32_Process.Create): fermare lo script che l'ha lanciato non deve
# fermare il server (con Start-Process il server moriva insieme allo script)
$null = Invoke-CimMethod Win32_Process -MethodName Create -Arguments @{ CommandLine = "powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$PSScriptRoot\run-server.ps1`" -Revision $Revision" }
Start-Sleep 5
& .\tools\ldplayer\bench_flow.ps1 -Out $log | Select-Object -Last 1
& .\tools\ldplayer\bench_prologue.ps1 -Out $log -Shot $Tag -Seek | Select-Object -Last 2
. .\tools\ldplayer\bench_lib.ps1
Start-Sleep 8
Shot "${Tag}_home" | Out-Null
LastRequests $log 4
