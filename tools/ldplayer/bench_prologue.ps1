param([string]$Shot = 'prologue', [string]$Out, [switch]$Seek)
# Prologue (stage 1010), da subito dopo bench_flow.ps1 fino al forziere arancione.
# Sequenza di tocchi misurata sul banco (la mappa e la telecamera sono fisse):
# Shadow sulla scalinata, piazza della fontana, gruppo di 3 Shadow, scalinata alta,
# forziere (uniqueTreasureId/reward: vedi HANDOFF). Screenshot prima e dopo il forziere.
. "$PSScriptRoot\bench_lib.ps1"
# Ogni tocco chiude prima le finestre del tutorial eventualmente aperte.
function T([int]$x, [int]$y) { $null = DismissTutorial; Tap $x $y }
$script:TutShot = $Shot; $script:TutN = 0

# -Seek: invece della sequenza fissa (che con i tutorial perde il passo) si segue
# l'indicatore TARGET sullo schermo fino a /stage/clear, tentando ogni tanto lo speciale
# di Donald. Il forziere qui non e' sul percorso.
if ($Seek) {
    if (-not $Out) { throw '-Seek richiede -Out' }
    $from = LogLines $Out
    $sw = [Diagnostics.Stopwatch]::StartNew(); $n = 0
    while (-not (Get-Content $Out | Select-Object -Skip $from | Where-Object { $_ -match 'POST /stage/clear' })) {
        if ($sw.Elapsed.TotalSeconds -gt 360) { Write-Host '  seek: nessun /stage/clear dopo 360 s'; break }
        $null = DismissTutorial
        $png = Shot "${Shot}_seek"
        # prima i tutorial guidati (cerchio di luce sull'oggetto da toccare), poi il TARGET
        $spot = FindSpotlight $png
        if ($spot) {
            $script:TutN++; Copy-Item $png ("$SHOTS\{0}_tut{1:D2}.png" -f $Shot, $script:TutN)
            Tap $spot[0] $spot[1]; GameWait 2; continue
        }
        $t = FindTarget $png
        if ($t) { Tap $t[0] $t[1] } else { Tap 960 540 }
        $n++
        if ($n % 8 -eq 0) { Swipe 130 790 400 520 150 }
        GameWait 1.2
    }
    Write-Host ("  {0,-28} {1,5:N1} s ({2} passi)" -f 'POST /stage/clear', $sw.Elapsed.TotalSeconds, $n)
}
else {
T 1360 360; GameWait 5          # verso il primo Shadow
T 990 560; GameWait 4           # attacco
T 1500 360; GameWait 5          # verso il bersaglio
T 1520 380; GameWait 3
T 1520 380; GameWait 4          # piazza della fontana
foreach ($i in 1..6) { T 1730 580; GameWait 1.5 }   # gruppo di 3
GameWait 2
T 1180 680; GameWait 5          # ultimo Shadow del gruppo
T 1020 200; GameWait 3
T 1020 200; GameWait 4          # scalinata alta
Shot "${Shot}_prima" | Out-Null
T 970 220; GameWait 5           # forziere arancione
Shot "${Shot}_forziere" | Out-Null
# HUD (ritratto, SPECIAL, HP) prima e dopo il forziere, affiancati
Add-Type -AssemblyName System.Drawing
$cmp = New-Object Drawing.Bitmap 1000, 240
$g = [Drawing.Graphics]::FromImage($cmp)
$i = 0
foreach ($n in "${Shot}_prima", "${Shot}_forziere") {
    $b = [Drawing.Bitmap]::FromFile("$SHOTS\$n.png")
    $g.DrawImage($b, (New-Object Drawing.Rectangle ($i * 500), 0, 500, 240), (New-Object Drawing.Rectangle 0, 0, 500, 240), [Drawing.GraphicsUnit]::Pixel)
    $b.Dispose(); $i++
}
$cmp.Save("$SHOTS\${Shot}_hud.png"); $g.Dispose(); $cmp.Dispose()
"confronto HUD: $SHOTS\${Shot}_hud.png"
if (-not $Out) { Status; return }

# Boss (Mega-Shadow + 9 Shadow): ci si avvicina e si toccano i nemici finche' il
# server riceve /stage/clear; poi si toccano le schermate dei risultati.
T 1340 270; GameWait 3
T 1340 270; GameWait 6
$from = LogLines $Out
# speciale di Donald (Thundaga, colpisce tutti): swipe rapido in diagonale sulla
# medaglia, provato sul banco (SPECIAL 3 -> 1, sciame sconfitto)
$null = DismissTutorial; Swipe 130 790 400 520 150; GameWait 4
$pts = @(@(1010, 460), @(860, 330), @(1180, 500), @(680, 680), @(870, 720), @(1150, 740), @(990, 880), @(1290, 640), @(1060, 330))
$sw = [Diagnostics.Stopwatch]::StartNew(); $i = 0
while (-not (Get-Content $Out | Select-Object -Skip $from | Where-Object { $_ -match 'POST /stage/clear' })) {
    if ($sw.Elapsed.TotalSeconds -gt 240) { Write-Host '  boss: nessun /stage/clear dopo 240 s'; break }
    $p = $pts[$i % $pts.Count]; T $p[0] $p[1]; $i++; Start-Sleep -Milliseconds 600
}
Write-Host ("  {0,-28} {1,5:N1} s" -f 'POST /stage/clear', $sw.Elapsed.TotalSeconds)
}   # fine della sequenza fissa
# RESULTS e CONGRATULATIONS senza attese: si tocca subito OK (960,965, vale anche come
# «tap screen») finche' parte il dialogo, che si salta con SKIP (indicazioni
# dell'utente). Uno screenshot per schermata (${Shot}_r1, _r2, ...) per verificarle.
Start-Sleep 3
for ($k = 1; $k -le 8; $k++) {
    $c = Px @(@(155, 50), @(500, 1000))
    if ($c[0][0] -gt 150 -and $c[0][1] -gt 150 -and (IsNear $c[1] @(247, 190, 99))) { break }
    Shot "${Shot}_r$k" | Out-Null
    T 960 965; Start-Sleep -Milliseconds 1500
}
SkipDialog 10 | Out-Null
Shot "${Shot}_dopo" | Out-Null
LastRequests $Out 6
Status
