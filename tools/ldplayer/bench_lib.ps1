# Funzioni comuni del banco (da includere con: . "$PSScriptRoot\bench_lib.ps1").
#
# Niente attese fisse: prima di ogni tocco si aspetta che il pulsante sia sullo
# schermo. Lo schermo si legge dentro il guest: screencap in formato grezzo (16
# byte di intestazione: larghezza, altezza, formato, spazio colore; poi RGBA) e
# dd dei soli pixel che servono, ~0,2 s a lettura contro ~0,8 s di un PNG.
$LD = 'D:\Progetto_Restauro_KH_UX\LDPlayer\LDPlayer9'
$PKG = 'com.square_enix.android_googleplay.khuxww'
$SCREEN_W = 1920
# /sdcard/Pictures del guest e' la cartella condivisa di LDPlayer sotto Documenti:
# gli screenshot passano di li' e vengono subito spostati su D: ($SHOTS).
$SHARED = "$env:USERPROFILE\Documents\XuanZhi9\Pictures"
$SHOTS = 'D:\Progetto_Restauro_KH_UX\screenshots'
New-Item -ItemType Directory -Force $SHOTS | Out-Null

# Un solo ld.exe alla volta, anche fra script diversi (mutex di sistema): con piu' ld.exe
# insieme, o uccidendone uno a meta', LDPlayer va in errore «g_pPipeMemHead->arBufHead[i].
# usingPipeId != nPipeId» e crasha (11 ottobre). Mai Stop-Process su ld.exe.
$LD_MUTEX = New-Object System.Threading.Mutex($false, 'Global\khux_ld_exe')
function Sh([string]$cmd) {
    $own = $false
    try { $own = $LD_MUTEX.WaitOne(120000) } catch [System.Threading.AbandonedMutexException] { $own = $true }
    if (-not $own) { throw "ld.exe occupato da piu' di 120 s: $cmd" }
    try { & "$LD\ld.exe" -s 0 $cmd } finally { $LD_MUTEX.ReleaseMutex() }
}

# Mai toccare con il gioco chiuso: sulla home di LDPlayer i tocchi aprono i banner pubblicitari nel
# browser di Windows (14-10: decine di schede gtarcade dopo un crash, story.ps1 continuava a toccare).
# Controllo del processo al massimo ogni 5 s; con il gioco chiuso si ferma lo script.
$script:AppSeen = [datetime]::MinValue
function AppAlive {
    if (((Get-Date) - $script:AppSeen).TotalSeconds -lt 5) { return $true }
    $alive = [bool]((Sh "pidof $PKG") -match '\d')
    if ($alive) { $script:AppSeen = Get-Date }
    return $alive
}
function Tap([int]$x, [int]$y) {
    if (-not (AppAlive)) { throw "gioco non in esecuzione: tocco ($x,$y) annullato" }
    Sh "input tap $x $y" | Out-Null
}

# Swipe da (x1,y1) a (x2,y2) in $ms millisecondi: lo swipe in diagonale su una
# medaglia ne usa l'attacco speciale, se la barra SPECIAL basta per il suo costo.
function Swipe([int]$x1, [int]$y1, [int]$x2, [int]$y2, [int]$ms = 250) {
    if (-not (AppAlive)) { throw "gioco non in esecuzione: trascinamento annullato" }
    Sh "input swipe $x1 $y1 $x2 $y2 $ms" | Out-Null
}

# Colori dei punti dati, come array di @(r, g, b), con una sola cattura.
function Px([int[][]]$pts) {
    $dd = ($pts | ForEach-Object {
        $o = 16 + ($_[1] * $SCREEN_W + $_[0]) * 4
        "dd if=/data/local/tmp/s.raw bs=1 skip=$o count=3 2>/dev/null | od -An -tu1"
    }) -join '; '
    $out = Sh "screencap /data/local/tmp/s.raw; $dd"
    @($out | Where-Object { $_.Trim() } | ForEach-Object { , [int[]]($_.Trim() -split '\s+') })
}

function IsRed($c) { $c[0] -gt 150 -and $c[1] -lt 80 -and $c[2] -lt 110 }
function IsNear($c, [int[]]$ref, [int]$tol = 24) {
    [Math]::Abs($c[0] - $ref[0]) -le $tol -and [Math]::Abs($c[1] - $ref[1]) -le $tol -and [Math]::Abs($c[2] - $ref[2]) -le $tol
}

# Attende che $cond (riceve i colori dei punti) sia vero; $false allo scadere,
# con uno screenshot "<what>_timeout.png" per capire dove si e' fermato.
function WaitFor([int[][]]$pts, [scriptblock]$cond, [double]$timeout = 60, [string]$what = 'attesa') {
    $sw = [Diagnostics.Stopwatch]::StartNew()
    while ($sw.Elapsed.TotalSeconds -lt $timeout) {
        $c = Px $pts
        if (& $cond $c) { Write-Host ("  {0,-28} {1,5:N1} s" -f $what, $sw.Elapsed.TotalSeconds); return $true }
        Start-Sleep -Milliseconds 250
    }
    Shot "${what}_timeout" | Out-Null
    Write-Host "  $what : SCADUTO dopo $timeout s (screenshot $SHOTS\${what}_timeout.png)"
    $false
}

function IsOrange($c) { $c[0] -gt 200 -and $c[1] -gt 60 -and $c[1] -lt 150 -and $c[2] -lt 40 }
function IsBright($c) { $c[0] -gt 150 -and $c[1] -gt 150 -and $c[2] -gt 150 }
function IsDark($c) { $c[0] + $c[1] + $c[2] -lt 90 }

# Un passo: tocca (x, y) e attende che $cond riconosca la schermata successiva;
# se dopo $retap secondi non e' cambiata, ritocca (es. il titolo che non accetta
# ancora tocchi). $false allo scadere di $timeout, con screenshot.
function Step([int]$x, [int]$y, [string]$what, [int[][]]$pts, [scriptblock]$cond,
              [double]$timeout = 60, [double]$retap = 4) {
    $sw = [Diagnostics.Stopwatch]::StartNew()
    while ($sw.Elapsed.TotalSeconds -lt $timeout) {
        Tap $x $y
        $t = [Diagnostics.Stopwatch]::StartNew()
        while ($t.Elapsed.TotalSeconds -lt $retap) {
            if (& $cond (Px $pts)) {
                Write-Host ("  {0,-28} {1,5:N1} s" -f $what, $sw.Elapsed.TotalSeconds); return $true
            }
            Start-Sleep -Milliseconds 200
        }
    }
    Shot "${what}_timeout" | Out-Null
    Write-Host "  $what : SCADUTO dopo $timeout s (screenshot $SHOTS\${what}_timeout.png)"
    $false
}

# Dialoghi della storia: se c'e' SKIP si salta sempre (regola dell'utente). Firma:
# testo SKIP chiaro in alto a sinistra (155,50) e riquadro del dialogo (247,190,99)
# in basso (500,1000). Attende fino a $timeout secondi un dialogo; $true se l'ha saltato.
function SkipDialog([double]$timeout = 10) {
    if (-not (WaitFor @(@(155, 50), @(500, 1000)) {
            param($c) $c[0][0] -gt 150 -and $c[0][1] -gt 150 -and (IsNear $c[1] @(247, 190, 99)) } $timeout 'dialogo')) {
        return $false
    }
    Tap 155 50; Start-Sleep 2; $true
}

# Finestre del tutorial in battaglia («Movement», ...): compaiono quando il server
# restituisce la fase salvata (es. 50). Firma: OK rosso (850,1000), banda blu scuro del
# titolo a lato del testo (400,140), cornice blu (1600,500). Le chiude tutte (anche a
# piu' pagine).
function DismissTutorial {
    $closed = $false
    for ($k = 0; $k -lt 6; $k++) {
        $c = Px @(@(850, 1000), @(400, 140), @(1600, 500))
        if (-not ((IsRed $c[0]) -and (IsNear $c[1] @(0, 48, 99) 30) -and (IsNear $c[2] @(8, 81, 148) 30))) { return $closed }
        $closed = $true
        # $TutShot (facoltativo): prefisso degli screenshot di ogni finestra chiusa
        if ($script:TutShot) { $script:TutN++; Shot ("{0}_tut{1:D2}" -f $script:TutShot, $script:TutN) | Out-Null }
        # la pagina successiva arriva con un'animazione: attesa piu' lunga
        Tap 960 990; Start-Sleep -Milliseconds 2000
    }
    $closed
}

# Attesa in tempo di gioco: con una finestra del tutorial aperta il gioco e' fermo, quindi
# quel tempo non conta. Chiude le finestre che compaiono durante l'attesa.
function GameWait([double]$seconds) {
    $sw = [Diagnostics.Stopwatch]::StartNew()
    $paused = 0.0
    while ($sw.Elapsed.TotalSeconds - $paused -lt $seconds) {
        $t0 = $sw.Elapsed.TotalSeconds
        if (DismissTutorial) { $paused += $sw.Elapsed.TotalSeconds - $t0 + 1 }
        Start-Sleep -Milliseconds 300
    }
}

# Indicatore rosa «TARGET» in battaglia: punta sempre al bersaglio dello stage. Da uno
# screenshot, il centro del gruppo di pixel rosa (R>200, G<100, B>120) piu' grande, a
# celle di 80 px (altri rosa, come i fiori, sono pochi pixel sparsi). $null se manca.
function FindTarget([string]$png) {
    Add-Type -AssemblyName System.Drawing
    $b = [Drawing.Bitmap]::FromFile($png)
    $cells = @{}
    for ($y = 0; $y -lt $b.Height; $y += 4) {
        for ($x = 0; $x -lt $b.Width; $x += 4) {
            $c = $b.GetPixel($x, $y)
            if ($c.R -gt 200 -and $c.G -lt 100 -and $c.B -gt 120) {
                $k = '{0},{1}' -f [int][Math]::Floor($x / 80), [int][Math]::Floor($y / 80)
                if (-not $cells[$k]) { $cells[$k] = [Collections.ArrayList]@() }
                [void]$cells[$k].Add(@($x, $y))
            }
        }
    }
    $b.Dispose()
    $best = $cells.GetEnumerator() | Sort-Object { $_.Value.Count } -Descending | Select-Object -First 1
    if (-not $best -or $best.Value.Count -lt 15) { return $null }
    $sx = ($best.Value | ForEach-Object { $_[0] } | Measure-Object -Average).Average
    $sy = ($best.Value | ForEach-Object { $_[1] } | Measure-Object -Average).Average
    @([int]$sx, [int]$sy)
}

# Tutorial «guidati» (es. il forziere): lo schermo si oscura tranne un cerchio di luce
# sull'oggetto da toccare. Nell'area di gioco (senza l'HUD) la luminosita' mediana per
# celle da 80 px scende sotto 110 (normale: ~145) e il cerchio supera 1,8 volte la
# mediana. Restituisce il centro delle celle piu' luminose, o $null.
function FindSpotlight([string]$png) {
    Add-Type -AssemblyName System.Drawing
    $b = [Drawing.Bitmap]::FromFile($png)
    $cells = @{}
    for ($y = 160; $y -lt 960; $y += 8) {
        for ($x = 320; $x -lt 1700; $x += 8) {
            $c = $b.GetPixel($x, $y)
            $k = '{0},{1}' -f [int][Math]::Floor($x / 80), [int][Math]::Floor($y / 80)
            $cells[$k] += ($c.R + $c.G + $c.B) / 3 / 100
        }
    }
    $b.Dispose()
    $v = @($cells.Values | Sort-Object)
    $med = $v[[int]($v.Count / 2)]; $max = $v[-1]
    if ($med -ge 110 -or $max -lt 1.8 * $med) { return $null }
    $top = @($cells.GetEnumerator() | Where-Object { $_.Value -ge 0.85 * $max })
    $xs = $top | ForEach-Object { [int]($_.Key.Split(',')[0]) * 80 + 40 }
    $ys = $top | ForEach-Object { [int]($_.Key.Split(',')[1]) * 80 + 40 }
    @([int]($xs | Measure-Object -Average).Average, [int]($ys | Measure-Object -Average).Average)
}

# Attende un pulsante rosso nel punto (x, y) e lo tocca.
function TapRed([int]$x, [int]$y, [string]$what, [double]$timeout = 60) {
    if (WaitFor @(, @($x, $y)) { param($c) IsRed $c[0] } $timeout $what) { Tap $x $y; return $true }
    $false
}

# Attende una riga del log del server che corrisponda a $pattern, scritta dopo $from righe.
function LogLines([string]$file) { @(Get-Content $file -ErrorAction SilentlyContinue).Count }
function WaitLog([string]$file, [string]$pattern, [int]$from, [double]$timeout = 60, [string]$what = $pattern) {
    $sw = [Diagnostics.Stopwatch]::StartNew()
    while ($sw.Elapsed.TotalSeconds -lt $timeout) {
        $new = @(Get-Content $file -ErrorAction SilentlyContinue | Select-Object -Skip $from)
        if ($new | Where-Object { $_ -match $pattern }) {
            Write-Host ("  {0,-28} {1,5:N1} s" -f $what, $sw.Elapsed.TotalSeconds); return $true
        }
        Start-Sleep -Milliseconds 300
    }
    Write-Host "  $what : SCADUTO dopo $timeout s"
    $false
}

# Screenshot in $SHOTS\<name>.png (passa dalla cartella condivisa e viene spostato).
function Shot([string]$name) {
    Sh "screencap -p /sdcard/Pictures/$name.png" | Out-Null
    $src = Join-Path $SHARED "$name.png"
    $dst = Join-Path $SHOTS "$name.png"
    for ($i = 0; $i -lt 20 -and -not (Test-Path -LiteralPath $src); $i++) { Start-Sleep -Milliseconds 100 }
    # il file compare prima che il guest abbia finito di scriverlo: Move-Item fallisce con
    # «in uso da un altro processo» e FindTarget/FindSpotlight ricevono un'immagine nulla
    # (story.ps1 fermo nel campo, 14-10): si riprova per ~3 s
    for ($i = 0; $i -lt 30; $i++) {
        try { Move-Item -LiteralPath $src -Destination $dst -Force -ErrorAction Stop; break }
        catch [System.IO.IOException] { Start-Sleep -Milliseconds 100 }
    }
    $dst
}

# Ultime richieste al server (senza DNS e master), una per riga.
function LastRequests([string]$file, [int]$n = 8) {
    Get-Content $file | Where-Object { $_ -notmatch '\[dns\]|dns:dirottata|tls:sni|content-type|GET /master/' } |
        Select-String -Pattern '^\S*\[(ok|\?|!)\S*\s+#\d+|body\(decifrato' | Select-Object -Last $n |
        ForEach-Object { $_.Line.Substring(0, [Math]::Min(300, $_.Line.Length)) }
}

function Status {
    "pid: " + (Sh "pidof $PKG")
    $t = Sh "ls /data/tombstones/ 2>/dev/null"
    if ($t) { "tombstone: $t" }
}
