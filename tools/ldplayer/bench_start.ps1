param([string]$Out, [string]$Shot = 'khuxstart', [double]$Settle = 8)
# Giocatore esistente (server con KHUX_NEWCOMER=0): lancio e KHUX START, ritoccato
# finche' il server ($Out) riceve POST /khux/login; poi, quando il log resta fermo
# per $Settle secondi, screenshot e ultime richieste. Nessuna attesa fissa.
. "$PSScriptRoot\bench_lib.ps1"
$sw = [Diagnostics.Stopwatch]::StartNew()
$from = LogLines $Out
Sh "logcat -c; rm -f /data/tombstones/*; am force-stop $PKG; monkey -p $PKG -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1" | Out-Null
# Tap di bench_lib rifiuta i tocchi a gioco chiuso: si aspetta che il processo sia partito (fino a 60 s)
for ($i = 0; $i -lt 60 -and -not (AppAlive); $i++) { Start-Sleep 1 }
while (-not (Get-Content $Out | Select-Object -Skip $from | Where-Object { $_ -match 'POST /khux/login' })) {
    if ($sw.Elapsed.TotalSeconds -gt 120) { Write-Host '  KHUX START: nessun /khux/login dopo 120 s'; break }
    # dopo un aggiornamento dei master compare «Download» (rosso) con «Cancel»; al primo
    # avvio dopo un riavvio del server a volte «A connection error has occurred
    # (N ERROR :251)» con il solo OK rosso al centro: OK fa riprovare
    $c = Px @(@(1080, 740), @(600, 740), @(960, 712))
    if ((IsRed $c[0]) -and (IsOrange $c[1])) { Tap 1080 740 }
    elseif (IsRed $c[2]) { Tap 960 712 }
    else { Tap 40 1020 }
    Start-Sleep -Seconds 2
}
Write-Host ("  {0,-28} {1,5:N1} s" -f 'POST /khux/login', $sw.Elapsed.TotalSeconds)
$n = LogLines $Out; $quiet = [Diagnostics.Stopwatch]::StartNew(); $pastLogin = $false
# finche' non arriva /tutorial/status (il dialogo «Download» puo' comparire dopo 10 s di log fermo: banco 19-10) si
# continua a guardare anche col log fermo, al massimo 120 s dal login
$loginAt = $sw.Elapsed.TotalSeconds
while (($quiet.Elapsed.TotalSeconds -lt $Settle -or (-not $pastLogin -and $sw.Elapsed.TotalSeconds - $loginAt -lt 120)) -and $sw.Elapsed.TotalSeconds -lt 300) {
    Start-Sleep -Milliseconds 500
    # il dialogo «Download» (master aggiornati) arriva dopo /khux/login e prima di /tutorial/status (la prima richiesta
    # dopo i download): da li' niente piu' screencap, che ogni mezzo secondo rallentavano l'avvio della WebView
    # delle Notices (logcat 19-10: 42 screencap in 20 s mentre Chromium partiva)
    if (-not $pastLogin) { $pastLogin = [bool](Get-Content $Out | Select-Object -Skip $from | Where-Object { $_ -match 'GET /tutorial/status' } | Select-Object -First 1) }
    if (-not $pastLogin) {
        $c = Px @(@(1080, 740), @(600, 740))
        if ((IsRed $c[0]) -and (IsOrange $c[1])) { Tap 1080 740; $quiet.Restart() }
    }
    $m = LogLines $Out
    if ($m -ne $n) { $n = $m; $quiet.Restart() }
}
Shot $Shot | Out-Null
Write-Host ("totale {0:N0} s" -f $sw.Elapsed.TotalSeconds)
LastRequests $Out 8
Status
