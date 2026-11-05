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
# Shell di root (ld.exe): solo per i comandi che ne hanno bisogno (/data/tombstones, /data/data, setprop, /mnt/shared).
function ShRoot([string]$cmd) {
    $own = $false
    try { $own = $LD_MUTEX.WaitOne(120000) } catch [System.Threading.AbandonedMutexException] { $own = $true }
    if (-not $own) { throw "ld.exe occupato da piu' di 120 s: $cmd" }
    try { & "$LD\ld.exe" -s 0 $cmd } finally { $LD_MUTEX.ReleaseMutex() }
}

# Tutto il resto passa da adb (utente shell, niente root: su non c'e'), con un tempo massimo: 05-11 un ld.exe
# «pidof» e' rimasto appeso 10 minuti e il relogin con lui; un adb appeso si puo' chiudere senza toccare
# LDPlayer, e lo script si ferma con un errore chiaro invece di aspettare per sempre.
$ADB = Join-Path $LD 'adb.exe'
$ADB_SERIAL = 'emulator-5554'   # istanza 0
$ADB_MUTEX = New-Object System.Threading.Mutex($false, 'Global\khux_adb')
function Sh([string]$cmd, [int]$TimeoutSec = 60) {
    if ($cmd -match '/data/tombstones|/data/data|/mnt/shared|setprop') { return ShRoot $cmd }
    $own = $false
    try { $own = $ADB_MUTEX.WaitOne(120000) } catch [System.Threading.AbandonedMutexException] { $own = $true }
    if (-not $own) { throw "adb occupato da piu' di 120 s: $cmd" }
    try {
        $psi = New-Object System.Diagnostics.ProcessStartInfo $ADB
        $psi.Arguments = "-s $ADB_SERIAL shell `"" + ($cmd -replace '"', '\"') + "`""
        $psi.UseShellExecute = $false; $psi.CreateNoWindow = $true
        $psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true
        $p = [System.Diagnostics.Process]::Start($psi)
        $out = $p.StandardOutput.ReadToEndAsync(); $null = $p.StandardError.ReadToEndAsync()
        if (-not $p.WaitForExit($TimeoutSec * 1000)) {
            try { $p.Kill() } catch {}
            throw "il guest non risponde ad adb da $TimeoutSec s: $cmd"
        }
        @($out.Result -split "`r?`n" | Where-Object { $_ -ne '' })
    } finally { $ADB_MUTEX.ReleaseMutex() }
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
        "dd if=/data/local/tmp/px.raw bs=1 skip=$o count=3 2>/dev/null | od -An -tu1"
    }) -join '; '
    # px.raw e non s.raw: s.raw e' di root (era scritto da ld.exe) e l'utente shell di adb non puo' sovrascriverlo
    $out = Sh "screencap /data/local/tmp/px.raw; $dd"
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
# richieste di gioco nel log, senza le righe DNS (anche le query del PC, con il DNS di Windows sul server) e senza
# i poll periodici della home (chat, playtime, push): con quelle righe il log non resta mai fermo e l'attesa
# della home arrivava sempre al limite di 300 s
function GameLines([string]$file) {
    @(Get-Content $file -ErrorAction SilentlyContinue | Where-Object { $_ -match '^\S*\[(ok|\?|!)\S*\s+#\d+\s' -and $_ -notmatch 'chatsvc/user|/playtime/|/system/push' }).Count
}
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
    # PNG letto direttamente dallo stdout di «adb exec-out screencap -p», ~0,5 s. Prima si scriveva in
    # /sdcard/Pictures (cartella condivisa) e lo screencap di LDPlayer lanciava poi «am broadcast
    # MEDIA_SCANNER_SCAN_FILE», che restava appeso per minuti quando Android era lento (05-11: ANR di
    # com.google.android.gms; ld.exe e relogin fermi con lui). Due tentativi da 30 s, poi avviso e $null.
    $dst = Join-Path $SHOTS "$name.png"
    for ($t = 0; $t -lt 2; $t++) {
        $own = $false
        try { $own = $ADB_MUTEX.WaitOne(120000) } catch [System.Threading.AbandonedMutexException] { $own = $true }
        if (-not $own) { throw "adb occupato da piu' di 120 s: screenshot $name" }
        try {
            $psi = New-Object System.Diagnostics.ProcessStartInfo $ADB
            $psi.Arguments = "-s $ADB_SERIAL exec-out screencap -p"
            $psi.UseShellExecute = $false; $psi.CreateNoWindow = $true; $psi.RedirectStandardOutput = $true
            $p = [System.Diagnostics.Process]::Start($psi)
            $ms = New-Object System.IO.MemoryStream
            $copy = $p.StandardOutput.BaseStream.CopyToAsync($ms)
            if ($p.WaitForExit(30000) -and $copy.Wait(5000) -and $ms.Length -gt 1000) {
                [System.IO.File]::WriteAllBytes($dst, $ms.ToArray()); return $dst
            }
            try { $p.Kill() } catch {}
            Write-Warning "screenshot $name : screencap non ha risposto (tentativo $($t + 1))"
        } finally { $ADB_MUTEX.ReleaseMutex() }
    }
    Write-Warning "screenshot $name non riuscito"
    $null
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
