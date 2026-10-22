# Misura del login: N relogin, tempo fino a /khux/login e totale (righe di relogin.ps1).
#   .\login-time.ps1 -N 5 [-RealNow 2026-10-19T09:00:00Z]
param([int]$N = 5, [string]$RealNow)
$repo = Split-Path (Split-Path (Split-Path $PSScriptRoot))
Set-Location $repo
$rows = @()
for ($i = 1; $i -le $N; $i++) {
    # splatting: un array passato come argomento a uno script non diventa -RealNow <ISO>
    $extra = @{}; if ($RealNow) { $extra.RealNow = $RealNow }
    $out = & "$PSScriptRoot\relogin.ps1" -Tag "lt$i" @extra *>&1 | Out-String   # *>&1: le righe dei tempi sono Write-Host (flusso 6)
    $login = [regex]::Match($out, 'POST /khux/login\s+([\d,]+) s').Groups[1].Value -replace ',', '.'
    $tot = [regex]::Match($out, 'totale ([\d,]+) s').Groups[1].Value -replace ',', '.'
    $master = @(Get-Content 'D:\Progetto_Restauro_KH_UX\logs\server.log' -Encoding Unicode | Select-String 'GET /master/').Count
    $rows += [pscustomobject]@{ giro = $i; login = [double]$login; totale = [double]$tot; tabelle = $master }
}
$rows | Format-Table | Out-String
"media login: {0:N1} s, media totale: {1:N1} s" -f ($rows | Measure-Object login -Average).Average, ($rows | Measure-Object totale -Average).Average
