param([string]$Out, [ValidateSet('name', 'editor', 'union', 'battle')][string]$Until = 'battle',
      [string]$Name = 'Player', [string]$Shot = 'flow')
# Percorso del nuovo giocatore, dal lancio fino a $Until, senza attese fisse. Ogni
# passo tocca un pulsante e attende che la schermata successiva sia riconosciuta dai
# pixel (bench_lib.ps1, Step); se non cambia, ritocca. Firme (almeno due punti,
# ricavate dagli screenshot):
#   contratto     Accept rosso (1080,1000) + Decline arancione (600,990) + bianco (960,500)
#   nascita       Register rosso (820,715) + fondo blu (960,500)
#   conferma      Register rosso (1080,815) + Edit arancione (600,815)
#   download      Download rosso (1080,740) + Cancel arancione (600,740)
#   filmato       SKIP grigio (155,50) + nero (1080,1000)
#   nome          OK rosso (850,1010) e (1080,1000), angolo scuro (155,50)
#   editor        OK rosso (1390,1040), solo nell'editor
#   conferma      OK rosso (1080,990) + Cancel arancione (600,990)
#   popup Unions  OK rosso (830,995) e (1100,995)
#   scelta Union  vetrata chiara (960,250) su fondo scuro (100,540)
#   Join          OK rosso (1080,870) + Cancel arancione (600,850)
# Poi tocchi sulla scena finche' il server ($Out) riceve /user/create e /stage/start.
. "$PSScriptRoot\bench_lib.ps1"
function Fail([string]$what) { LastRequests $Out 4; Status; throw "fermo a: $what" }
$sw = [Diagnostics.Stopwatch]::StartNew()

Sh "logcat -c; rm -f /data/tombstones/*; am force-stop $PKG; monkey -p $PKG -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1" | Out-Null
$ok = (Step 40 1020 'contratto' @(@(1080, 1000), @(600, 990), @(960, 500)) {
        param($c) (IsRed $c[0]) -and (IsOrange $c[1]) -and (IsBright $c[2]) } 120) -and
      (Step 1080 1000 'data di nascita' @(@(820, 715), @(960, 500)) {
        param($c) (IsRed $c[0]) -and $c[1][2] -gt 120 -and $c[1][0] -lt 40 }) -and
      (Step 820 715 'conferma data' @(@(1080, 815), @(600, 815)) {
        param($c) (IsRed $c[0]) -and (IsOrange $c[1]) }) -and
      # con misc 116 (/system/coppa) diverso da 0 il client scarica durante il filmato,
      # senza il dialogo «Download»: si accettano entrambi
      (Step 1080 815 'download o filmato' @(@(1080, 740), @(600, 740), @(155, 50), @(1080, 1000)) {
        param($c) ((IsRed $c[0]) -and (IsOrange $c[1])) -or
                  ($c[2][0] -gt 110 -and $c[2][1] -gt 110 -and (IsDark $c[3])) }) -and
      (Step 1080 740 'filmato' @(@(155, 50), @(1080, 1000)) {
        param($c) $c[0][0] -gt 110 -and $c[0][1] -gt 110 -and (IsDark $c[1]) }) -and
      (Step 155 50 'nome' @(@(850, 1010), @(1080, 1000), @(155, 50)) {
        param($c) (IsRed $c[0]) -and (IsRed $c[1]) -and (IsDark $c[2]) } 90)
if (-not $ok) { Fail 'avvio' }
if ($Until -eq 'name') { Shot $Shot | Out-Null; return }

Tap 958 510; Start-Sleep -Milliseconds 800
Sh "input text $Name; input keyevent 66" | Out-Null
Start-Sleep -Milliseconds 500
$ok = (Step 958 988 'editor avatar' @(, @(1390, 1040)) { param($c) IsRed $c[0] } 30 6)
if (-not $ok) { Fail 'editor' }
if ($Until -eq 'editor') { Shot $Shot | Out-Null; return }

$ok = (Step 1234 1008 'conferma avatar' @(@(1080, 990), @(600, 990)) {
        param($c) (IsRed $c[0]) -and (IsOrange $c[1]) } 30 6) -and
      (Step 1220 968 'vetrata' @(@(1080, 990), @(600, 990)) {
        param($c) -not ((IsRed $c[0]) -and (IsOrange $c[1])) } 30 6) -and
      (Step 155 50 'popup Unions' @(@(830, 995), @(1100, 995)) {
        param($c) (IsRed $c[0]) -and (IsRed $c[1]) } 90 0.6) -and
      (Step 958 975 'scelta Union' @(@(960, 250), @(100, 540), @(830, 995)) {
        param($c) (IsBright $c[0]) -and (IsDark $c[1]) -and -not (IsRed $c[2]) } 30 6) -and
      (Step 958 300 'Join Unicornis' @(@(1080, 870), @(600, 850)) {
        param($c) (IsRed $c[0]) -and (IsOrange $c[1]) } 30 6)
if (-not $ok) { Fail 'tutorial' }
$from = LogLines $Out
Tap 1222 848
if ($Until -eq 'union') { Shot $Shot | Out-Null; return }

# scena dopo la Union: si tocca finche' il server riceve /user/create
$t = [Diagnostics.Stopwatch]::StartNew()
while (-not (Get-Content $Out | Select-Object -Skip $from | Where-Object { $_ -match 'POST /user/create' })) {
    if ($t.Elapsed.TotalSeconds -gt 120) { Fail '/user/create' }
    Tap 155 50; Start-Sleep -Milliseconds 500
}
Write-Host ("  {0,-28} {1,5:N1} s" -f 'POST /user/create', $t.Elapsed.TotalSeconds)
if (-not (WaitLog $Out 'POST /stage/start' $from 60 'POST /stage/start')) { Fail '/stage/start' }
Start-Sleep -Seconds 8   # caricamento della battaglia
Shot $Shot | Out-Null
Write-Host ("totale {0:N0} s" -f $sw.Elapsed.TotalSeconds)
LastRequests $Out 4
Status
