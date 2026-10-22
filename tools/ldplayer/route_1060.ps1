# Percorso della 1060 misurato sul banco (11 ottobre 2026): x, y, attesa s, ripetizioni
Set-Location 'D:\Progetto_Restauro_KH_UX\Android\KH-UX-Dark-Road-Restoration'
. .\tools\ldplayer\bench_lib.ps1
$log = 'D:\Progetto_Restauro_KH_UX\logs\server.log'
$from = LogLines $log
$route = @(
    @(750, 300, 4, 1), @(1275, 660, 5, 1), @(1050, 280, 2.5, 6), @(1400, 900, 3, 1), @(1130, 920, 2, 8),
    @(1550, 1000, 3.5, 1), @(1050, 980, 3.5, 1), @(890, 970, 2, 7), @(0, 0, 4, 1), @(1000, 920, 4, 1), @(910, 850, 9, 1),
    @(900, 250, 4, 1), @(1050, 250, 4, 1), @(1570, 500, 2, 9), @(1550, 1000, 3.5, 1), @(1050, 980, 3.5, 1),
    @(1000, 920, 4, 1), @(800, 950, 4, 1), @(1110, 1030, 2, 10))
$k = 0
foreach ($s in $route) {
    for ($i = 0; $i -lt $s[3]; $i++) { if ($s[0]) { Tap $s[0] $s[1] }; Start-Sleep -Milliseconds ([int]($s[2] * 1000)) }
    $k++; Shot ('r1060_{0:D2}' -f $k) | Out-Null
}
$clear = [bool](Get-Content $log | Select-Object -Skip $from | Where-Object { $_ -match 'POST /stage/clear' })
"clear=$clear alive=" + "$(Sh "pidof $PKG")".Trim()
