# Re-Union X launcher, started by Play.bat in the package folder. It prepares the dedicated LDPlayer instance,
# starts our server inside it (data\guest\rx-start.sh) and opens the game.
#   Play.ps1 [-Package <package folder>] [-DataDir <save and logs, default %LOCALAPPDATA%\Re-Union X>]
# Exit codes: 0 game opened, 2 OneDrive, 3 disk space, 4 server error, 5 LDPlayer missing, 6 emulator start, 1 other.
# RX_PLAYLIB (tests only): a replacement for PlayLib.ps1; RX_ANSWER: answer to the yes/no questions.
param(
    [string]$Package = (Split-Path (Split-Path $PSScriptRoot)),
    [string]$DataDir = (Join-Path $env:LOCALAPPDATA 'Re-Union X')
)
$ErrorActionPreference = 'Stop'
if ($env:RX_PLAYLIB) { . $env:RX_PLAYLIB } else { . "$PSScriptRoot\PlayLib.ps1" }
$GAME = 'com.square_enix.android_googleplay.khuxww'
$NAME = 'Re-Union X'
New-Item -ItemType Directory -Force (Join-Path $DataDir 'logs') | Out-Null
$playLog = Join-Path $DataDir 'logs\play.log'
$serverLog = Join-Path $DataDir 'logs\server.log'
$firstStart = -not (Test-Path (Join-Path $DataDir 'save\player.json'))

function Say([string]$msg) {
    Write-Host $msg
    Add-Content $playLog ("{0:yyyy-MM-dd HH:mm:ss} {1}" -f (Get-Date), $msg)
}
function Progress([int]$pct, [string]$msg) { Write-Progress -Activity 'Re-Union X' -Status $msg -PercentComplete $pct; Say $msg }
function Stop-With([int]$code, [string]$msg) { Write-Progress -Activity 'Re-Union X' -Completed; Say ''; Say $msg; exit $code }
function Ask([string]$q) {
    if ($env:RX_ANSWER) { Say "$q $($env:RX_ANSWER)"; return $env:RX_ANSWER -match '^[yY]' }
    return (Read-Host "$q (Y/N)") -match '^[yY]'
}

try {
    Progress 2 'Checking the package folder...'
    if (Test-OneDrivePath $Package) {
        Stop-With 2 "This folder is inside OneDrive, which would upload the game files to the cloud.`nPlease move this folder out of OneDrive (for example to C:\Games\Re-Union X) and run Play again."
    }

    Progress 5 'Looking for LDPlayer 9.5.37...'
    $ld = Find-LDPlayer
    if (-not $ld -or $ld.Version -ne '9.5.37.0') {
        $have = if ($ld) { "LDPlayer $($ld.Version) is installed" } else { 'LDPlayer 9 is not installed' }
        Say "Re-Union X needs LDPlayer 9.5.37 exactly ($have)."
        $setup = Join-Path $Package 'data\setup\LDPlayer9-9.5.37.exe'
        if (-not (Ask 'Install LDPlayer 9.5.37 now from this folder?')) { Stop-With 5 'Re-Union X needs LDPlayer 9.5.37. Run Play again when you want to install it.' }
        Install-LDPlayer $setup
        $ld = Find-LDPlayer
        if (-not $ld -or $ld.Version -ne '9.5.37.0') { Stop-With 5 'Re-Union X needs LDPlayer 9.5.37, but it is still not installed. Run Play again to retry.' }
    }
    Disable-LDUpdate $ld.Dir

    $need = if ($firstStart) { 12GB } else { 2GB }
    if (-not (Test-FreeSpace -Path $ld.Dir -NeedBytes $need)) {
        Stop-With 3 ("Not enough free space on the LDPlayer drive ({0}): Re-Union X needs {1} GB free. Free some space and run Play again." -f [IO.Path]::GetPathRoot($ld.Dir), ($need / 1GB))
    }

    Progress 15 'Preparing the Re-Union X emulator...'
    $list = (Invoke-LDConsole $ld.Dir @('list2')) -join "`n"
    $idx = Get-InstanceIndex -List2 $list -Name $NAME
    if ($idx -lt 0) { $idx = New-ReUnionInstance $ld.Dir; $list = (Invoke-LDConsole $ld.Dir @('list2')) -join "`n" }
    $running = Get-InstanceRunning -List2 $list -Index $idx
    if (-not $running) { Set-InstanceShares -LdDir $ld.Dir -Index $idx -MiscDir $Package -PicturesDir $DataDir }

    if (-not $running) {
        Progress 25 'Starting the emulator (about a minute)...'
        Invoke-LDConsole $ld.Dir @('launch', '--index', "$idx") | Out-Null
    }
    $t = 0
    while ((Invoke-Guest $ld.Dir $idx 'getprop sys.boot_completed') -ne '1') {
        if ($t -ge 240) { Stop-With 6 "The emulator did not start in 4 minutes. Close LDPlayer and run Play again. If it happens again, send this file: $playLog" }
        Start-Sleep 5; $t += 5
    }
    if (-not ((Invoke-Guest $ld.Dir $idx "pm list packages $GAME") -match 'khuxww')) {
        Progress 45 'Installing the game in the emulator...'
        Invoke-LDConsole $ld.Dir @('installapp', '--index', "$idx", '--filename', (Join-Path $Package 'data\game\khux-4.3.1.apk')) | Out-Null
        $t = 0
        while (-not ((Invoke-Guest $ld.Dir $idx "pm list packages $GAME") -match 'khuxww')) {
            if ($t -ge 180) { Stop-With 1 "The game could not be installed in the emulator. Send this file: $playLog" }
            Start-Sleep 5; $t += 5
        }
    }

    Progress 60 'Starting the Re-Union X server (about a minute)...'
    $now = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    $out = @(Invoke-Guest $ld.Dir $idx "sh /mnt/shared/Misc/data/guest/rx-start.sh $now")
    $last = "$($out[-1])"
    Add-Content $playLog ($out -join "`n")
    if ($last -notmatch '^RX:READY') {
        $tail = if (Test-Path $serverLog) { (Get-Content $serverLog -Tail 20) -join "`n" } else { '' }
        Stop-With 4 "The Re-Union X server could not start ($($last -replace '^RX:ERROR ')).`n$tail`nPlease send this file in the bug report: $serverLog"
    }

    if ($firstStart) {
        Say 'First start: the game will now download about 4 GB of data.'
        Say 'Tap KHUX START, then Download, and keep the game open until it finishes.'
    } else {
        Say 'Tap KHUX START to play.'
    }
    Progress 95 'Opening the game...'
    Invoke-Guest $ld.Dir $idx "monkey -p $GAME -c android.intent.category.LAUNCHER 1" | Out-Null
    Write-Progress -Activity 'Re-Union X' -Completed
    Say 'Have fun! Always start the game with Play.'
    exit 0
} catch {
    Stop-With 1 "Unexpected error: $($_.Exception.Message)`nPlease send this file in the bug report: $playLog"
}
