# Tests of the Play.ps1 flow with a stub PlayLib (no emulator):
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\play\launcher\test-Play.ps1
$ErrorActionPreference = 'Stop'
$errors = New-Object System.Collections.Generic.List[string]
function Check([bool]$ok, [string]$msg) { if (-not $ok) { $errors.Add($msg) } }
$tmp = Join-Path ([IO.Path]::GetTempPath()) "play-test-$PID"
$pkg = Join-Path $tmp 'Re-Union X'; $data = Join-Path $tmp 'data'
New-Item -ItemType Directory -Force "$pkg\data\game", "$pkg\data\setup", $data | Out-Null
'apk' | Set-Content "$pkg\data\game\khux-4.3.1.apk"; 'exe' | Set-Content "$pkg\data\setup\LDPlayer9-9.5.37.exe"
$stub = Join-Path $tmp 'stub.ps1'
@'
function Rec([string]$s) { Add-Content $env:RX_CALLS $s }
function Find-LDPlayer { if ($env:RX_T_NOLD) { return $null }; @{ Dir = 'C:\LD'; Version = $env:RX_T_LDVER } }
function Test-OneDrivePath([string]$Path) { $Path.StartsWith($env:RX_T_ONEDRIVE) }
function Get-InstanceIndex([string]$List2, [string]$Name) { 1 }
function Get-InstanceRunning([string]$List2, [int]$Index) { [bool]$env:RX_T_RUNNING }
function New-ReUnionInstance([string]$LdDir) { Rec 'new-instance'; 1 }
function Set-InstanceShares([string]$LdDir, [int]$Index, [string]$MiscDir, [string]$PicturesDir) { Rec "shares $MiscDir|$PicturesDir" }
function Get-InstanceShares([string]$LdDir, [int]$Index) { Rec 'get-shares'; @{ Misc = 'x'; Pictures = 'y' } }
function Test-SharesMatch($Shares, [string]$MiscDir, [string]$PicturesDir) { -not $env:RX_T_OTHERSHARES }
function Disable-LDUpdate([string]$LdDir) { Rec 'no-update' }
function Test-FreeSpace([string]$Path, [long]$NeedBytes) { -not $env:RX_T_LOWSPACE }
function Install-LDPlayer([string]$Exe) { Rec "install $Exe" }
function Invoke-LDConsole([string]$LdDir, [string[]]$Arguments) { Rec ("ldconsole " + ($Arguments -join ' ')); '1,Re-Union X,0,0,0,-1,-1,1920,1080,280' }
function Invoke-Guest([string]$LdDir, [int]$Index, [string]$Cmd) {
    Rec "guest $Cmd"
    if ($Cmd -match 'boot_completed') { return @('1', '') }
    if ($Cmd -match 'mCurrentFocus') {
        # first look: Google's sign-in error over the game (fresh instance, clock in 2021); then the game
        $n = [int](Get-Content "$env:RX_CALLS.focus" -ErrorAction SilentlyContinue); Set-Content "$env:RX_CALLS.focus" ($n + 1)
        if ($n -eq 0) { return 'mCurrentFocus=Window{1 u0 com.google.android.gms/com.google.android.gms.auth.uiflows.addaccount.ErrorActivity}' }
        return 'mCurrentFocus=Window{2 u0 com.square_enix.android_googleplay.khuxww/org.cocos2dx.cpp.AppActivity}'
    }
    if ($Cmd -match 'pm list packages') {
        if ($env:RX_T_NOGAME -and -not (Select-String -Path $env:RX_CALLS -Pattern 'pm install' -Quiet)) { return '' }
        return 'package:com.square_enix.android_googleplay.khuxww'
    }
    if ($Cmd -match 'pm install') { return 'Success' }
    if ($Cmd -match 'rx-start\.sh') { if ($env:RX_T_SERVERFAIL) { return @('RX:ERROR SERVER the server stopped', '') } else { return @('unpacking', 'RX:READY 12', '') } }
    ''
}
'@ | Set-Content $stub -Encoding UTF8

function Run-Play([hashtable]$Env) {
    $calls = Join-Path $tmp "calls-$([guid]::NewGuid()).txt"; New-Item $calls -ItemType File | Out-Null
    $vars = @{ RX_PLAYLIB = $stub; RX_CALLS = $calls; RX_ANSWER = 'n'; RX_T_LDVER = '9.5.37.0'; RX_T_ONEDRIVE = 'Z:\none' }
    foreach ($k in $Env.Keys) { $vars[$k] = $Env[$k] }
    foreach ($k in $vars.Keys) { Set-Item "Env:$k" $vars[$k] }
    $out = & powershell -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot\Play.ps1" -Package $pkg -DataDir $data 2>&1 | Out-String
    $code = $LASTEXITCODE
    foreach ($k in $vars.Keys) { Remove-Item "Env:$k" -ErrorAction SilentlyContinue }
    return @{ Code = $code; Out = $out; Calls = (Get-Content $calls -Raw) }
}
try {
    $r = Run-Play @{ RX_T_ONEDRIVE = $tmp }
    Check ($r.Code -eq 2 -and $r.Out -match 'out of OneDrive') "OneDrive: code $($r.Code) $($r.Out)"
    $r = Run-Play @{ RX_T_LDVER = '9.5.38.0' }
    Check ($r.Code -eq 5 -and $r.Out -match 'needs LDPlayer 9\.5\.37') "LDPlayer 9.5.38 declined: code $($r.Code)"
    $r = Run-Play @{ RX_T_NOLD = '1'; RX_ANSWER = 'y' }
    Check ($r.Calls -match 'install .*LDPlayer9-9\.5\.37\.exe') 'missing LDPlayer accepted: installer not run'
    $r = Run-Play @{ RX_T_LOWSPACE = '1' }
    Check ($r.Code -eq 3 -and $r.Out -match 'free space') "low space: code $($r.Code)"
    $r = Run-Play @{ RX_T_RUNNING = '1' }
    Check ($r.Code -eq 0 -and $r.Calls -notmatch 'ldconsole launch' -and $r.Calls -match 'rx-start\.sh') "already running: code $($r.Code) calls $($r.Calls)"
    # the game must be closed before the server restarts (a running game loses its session with a new server)
    $stop = $r.Calls.IndexOf('am force-stop com.square_enix'); $start = $r.Calls.IndexOf('rx-start.sh')
    Check ($stop -ge 0 -and $stop -lt $start) 'already running: game not force-stopped before the server restart'
    # running with the shares of another package (new package unpacked elsewhere): restart the instance on the new folder
    $r = Run-Play @{ RX_T_RUNNING = '1'; RX_T_OTHERSHARES = '1' }
    $q = $r.Calls.IndexOf('ldconsole quit'); $s = $r.Calls.IndexOf("shares $pkg"); $l = $r.Calls.IndexOf('ldconsole launch')
    Check ($r.Code -eq 0 -and $q -ge 0 -and $q -lt $s -and $s -lt $l) "running with other shares: quit, shares, launch expected; calls $($r.Calls)"
    # running with the right shares: no restart
    $r = Run-Play @{ RX_T_RUNNING = '1' }
    Check ($r.Calls -notmatch 'ldconsole quit' -and $r.Calls -notmatch 'shares ') 'running with the right shares must not restart the instance'
    # game not installed: installed from inside the guest (no Windows path given to ldconsole)
    $r = Run-Play @{ RX_T_NOGAME = '1' }
    Check ($r.Code -eq 0 -and $r.Calls -match 'guest pm install -r /mnt/shared/Misc/data/game/khux-4\.3\.1\.apk' -and $r.Calls -notmatch 'installapp') "APK install from the guest: calls $($r.Calls)"
    $r = Run-Play @{ RX_T_SERVERFAIL = '1' }
    Check ($r.Code -eq 4 -and $r.Out -match [regex]::Escape("$data\logs\server.log")) "server error: code $($r.Code) $($r.Out)"
    $r = Run-Play @{}
    Check ($r.Code -eq 0) "happy path: code $($r.Code) $($r.Out)"
    Check ($r.Calls -match 'ldconsole launch' -and $r.Calls -match 'no-update' -and $r.Calls -match 'monkey -p com\.square_enix') "happy path calls: $($r.Calls)"
    Check ($r.Calls -match 'monkey -p [^\r\n]+\r?\n(?:.*\r?\n)*guest input keyevent 4') 'Google sign-in error not dismissed with Back after opening the game'
    Check ($r.Calls -match 'rx-start\.sh \d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ') 'real time not passed to the guest script'
    Check ($r.Calls -match [regex]::Escape("shares $pkg|$data")) 'shares not pointed at package and data folder'
    Check (Test-Path "$data\logs\play.log") 'play.log not written'
} finally { Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue }
if ($errors.Count) { $errors | ForEach-Object { "FAIL: $_" }; exit 1 } else { 'OK' }
