# Rientro di un giocatore ESISTENTE: riavvia il server tenendo il salvataggio
# (server\save\player.json), rilancia l'app e attende la home.
#   .\relogin.ps1 -Tag <prefisso screenshot> [-Revision N] [-RealNow <ISO>]
# -Revision = BASE della revisione del master; -RealNow: ora reale finta (run-server.ps1)
# -GachaShow B0306,B0456: banner del catalogo aggiunti alla lista dello Shop (KHUX_GACHA_SHOW, run-server.ps1;
# -Save nome: salvataggio server\save\<nome>.json (run-server.ps1; es. -Save prove)
# -EnemyAtk N: nemici con attacco x N (solo banco, run-server.ps1)
# -StealUid N: lo Steal del pet ruba sempre dal nemico N (solo banco, run-server.ps1)
# [string[]]: senza virgolette PowerShell passa B0306,B0456 come lista, qui riunita con le virgole)
param([string]$Tag = 'rl', [int]$Revision = 182, [switch]$KbFree, [switch]$Pet, [switch]$TestPresents, [switch]$AllParts, [string]$RealNow, [string[]]$GachaShow, [int]$EnemyAtk = 0, [int]$SkillProb = -1, [string]$Save, [int]$StealUid = 0)
$repo = Split-Path (Split-Path (Split-Path $PSScriptRoot))
$log = 'D:\Progetto_Restauro_KH_UX\logs\server.log'
Set-Location $repo
node --check server\server.js; if (-not $?) { throw 'sintassi' }
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Confirm:$false
Start-Sleep 1
# processo staccato (Win32_Process.Create): fermare lo script che l'ha lanciato non deve
# fermare il server (con Start-Process il server moriva insieme allo script)
$null = Invoke-CimMethod Win32_Process -MethodName Create -Arguments @{ CommandLine = "powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$PSScriptRoot\run-server.ps1`" -Revision $Revision$(if ($KbFree) { ' -KbFree' })$(if ($Pet) { ' -Pet' })$(if ($TestPresents) { ' -TestPresents' })$(if ($AllParts) { ' -AllParts' })$(if ($RealNow) { " -RealNow $RealNow" })$(if ($GachaShow) { " -GachaShow $($GachaShow -join ',')" })$(if ($EnemyAtk -gt 1) { " -EnemyAtk $EnemyAtk" })$(if ($SkillProb -ge 0) { " -SkillProb $SkillProb" })$(if ($Save) { " -Save $Save" })$(if ($StealUid -gt 0) { " -StealUid $StealUid" })" }
Start-Sleep 5
Get-Content $log -TotalCount 3
& .\tools\ldplayer\bench_start.ps1 -Out $log -Shot "${Tag}_home" -Settle 10
