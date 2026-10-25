# Functions of the Re-Union X launcher (Play.ps1). Dot-source: . "$PSScriptRoot\PlayLib.ps1"
# Every function takes explicit paths or texts so that test-PlayLib.ps1 can run without an emulator.
$script:RX_INSTANCE = 'Re-Union X'
$script:RX_LD_VERSION = '9.5.37.0'

# LDPlayer 9 install folder and version from the uninstall keys, or $null
function Find-LDPlayer {
    $keys = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
            'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
            'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*'
    foreach ($k in Get-ItemProperty $keys -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -eq 'LDPlayer 9' }) {
        $dirs = @($k.InstallLocation)
        if ($k.DisplayIcon) { $dirs += Split-Path ($k.DisplayIcon -replace '"' -replace ',\d+$') }
        if ($k.UninstallString) { $dirs += Split-Path ($k.UninstallString -replace '"' -replace '\s+/.*$') }
        foreach ($dir in $dirs | Where-Object { $_ }) {
            if (Test-Path (Join-Path $dir 'ldconsole.exe')) {
                $ver = $k.DisplayVersion
                if (-not $ver) { $ver = (Get-Item (Join-Path $dir 'dnplayer.exe') -ErrorAction SilentlyContinue).VersionInfo.FileVersion }
                return @{ Dir = $dir; Version = $ver }
            }
        }
    }
    return $null
}

# $true if the path is inside a OneDrive-synced folder
function Test-OneDrivePath([string]$Path) {
    $full = [IO.Path]::GetFullPath($Path).TrimEnd('\') + '\'
    foreach ($root in $env:OneDrive, $env:OneDriveConsumer, $env:OneDriveCommercial | Where-Object { $_ }) {
        $r = [IO.Path]::GetFullPath($root).TrimEnd('\') + '\'
        if ($full.StartsWith($r, [StringComparison]::OrdinalIgnoreCase)) { return $true }
    }
    return $false
}

# Index of the instance called $Name in the output of «ldconsole list2», or -1
function Get-InstanceIndex([string]$List2, [string]$Name) {
    foreach ($line in $List2 -split "`r?`n") {
        $c = $line.Split(',')
        if ($c.Count -ge 2 -and $c[1] -eq $Name) { return [int]$c[0] }
    }
    return -1
}

# $true if instance $Index is running (list2 columns: index,title,top hwnd,bind hwnd,android started,pid,vbox pid,...)
function Get-InstanceRunning([string]$List2, [int]$Index) {
    foreach ($line in $List2 -split "`r?`n") {
        $c = $line.Split(',')
        if ($c.Count -ge 6 -and $c[0] -eq "$Index") { return ($c[4] -eq '1' -or [int]$c[5] -gt 0) }
    }
    return $false
}

# Sets one "key": value line of an LDPlayer JSON config, keeping every other byte; adds the key if missing
function Set-LDConfigValue([string]$File, [string]$Key, [string]$JsonValue) {
    $text = [IO.File]::ReadAllText($File)
    $pattern = '("' + [regex]::Escape($Key) + '"\s*:\s*)("(?:[^"\\]|\\.)*"|[^,\r\n}]+)'
    if ([regex]::IsMatch($text, $pattern)) {
        $text = [regex]::Replace($text, $pattern, { param($m) $m.Groups[1].Value + $JsonValue }, 1)
    } else {
        $text = [regex]::Replace($text, '^\s*\{', { param($m) $m.Value + "`r`n    `"$Key`": $JsonValue," }, 1)
    }
    [IO.File]::WriteAllText($File, $text, (New-Object Text.UTF8Encoding($false)))
}

# Shared folders of instance $Index: Misc = the package, Pictures = the save/log folder (instance must be stopped)
function Set-InstanceShares([string]$LdDir, [int]$Index, [string]$MiscDir, [string]$PicturesDir) {
    $cfg = Join-Path $LdDir "vms\config\leidian$Index.config"
    $q = { param($p) '"' + ([IO.Path]::GetFullPath($p).TrimEnd('\') -replace '\\', '/') + '"' }
    Set-LDConfigValue $cfg 'statusSettings.sharedMisc' (& $q $MiscDir)
    Set-LDConfigValue $cfg 'statusSettings.sharedPictures' (& $q $PicturesDir)
}

# Shared folders of instance $Index as written in its config (@{Misc; Pictures}), or $null without a config
function Get-InstanceShares([string]$LdDir, [int]$Index) {
    $cfg = Join-Path $LdDir "vms\config\leidian$Index.config"
    if (-not (Test-Path $cfg)) { return $null }
    $j = [IO.File]::ReadAllText($cfg) | ConvertFrom-Json
    return @{ Misc = $j.'statusSettings.sharedMisc'; Pictures = $j.'statusSettings.sharedPictures' }
}

# $true if the shares point at these folders (case, slashes and a trailing separator ignored)
function Test-SharesMatch($Shares, [string]$MiscDir, [string]$PicturesDir) {
    if (-not $Shares) { return $false }
    $n = { param($p) if (-not $p) { '' } else { ([IO.Path]::GetFullPath(($p -replace '/', '\')).TrimEnd('\')).ToLowerInvariant() } }
    return ((& $n $Shares.Misc) -eq (& $n $MiscDir)) -and ((& $n $Shares.Pictures) -eq (& $n $PicturesDir))
}

# Postpones LDPlayer's update check (the game only works on 9.5.37). A fresh install that was never opened has no
# leidians.config yet: nothing to postpone then
function Disable-LDUpdate([string]$LdDir) {
    $cfg = Join-Path $LdDir 'vms\config\leidians.config'
    if (Test-Path $cfg) { Set-LDConfigValue $cfg 'nextCheckupdateTime' '4102444800' }
}

# $true if the drive of $Path has at least $NeedBytes free
function Test-FreeSpace([string]$Path, [long]$NeedBytes) {
    $root = [IO.Path]::GetPathRoot([IO.Path]::GetFullPath($Path))
    return ((New-Object IO.DriveInfo($root)).AvailableFreeSpace -ge $NeedBytes)
}

# New dedicated instance, Android 9 (LDPlayer 9 default), 1920x1080, root off; returns its index
function New-ReUnionInstance([string]$LdDir) {
    $c = Join-Path $LdDir 'ldconsole.exe'
    & $c add --name $script:RX_INSTANCE | Out-Null
    $idx = Get-InstanceIndex -List2 ((& $c list2) -join "`n") -Name $script:RX_INSTANCE
    if ($idx -lt 0) { throw "LDPlayer could not create the instance «$script:RX_INSTANCE»" }
    & $c modify --index $idx --resolution 1920,1080,280 --root 0 | Out-Null
    return $idx
}

# ld.exe output as one trimmed string, and its last non-empty line (ld.exe adds empty lines)
function ConvertTo-GuestText($Lines) { ((@($Lines) | Where-Object { $_ -ne $null }) -join "`n").Trim() }
function Get-LastLine($Lines) { @(@($Lines) | Where-Object { "$_".Trim() -ne '' })[-1] }

# ldconsole.exe with arguments; returns its output lines
function Invoke-LDConsole([string]$LdDir, [string[]]$Arguments) { & (Join-Path $LdDir 'ldconsole.exe') @Arguments }

# Runs the LDPlayer installer included in the package and waits for it to close
function Install-LDPlayer([string]$Exe) { Start-Process -FilePath $Exe -Wait }

# Root shell command in the guest through ld.exe (one ld.exe at a time: LDPlayer crashes with concurrent calls)
$script:LD_MUTEX = New-Object System.Threading.Mutex($false, 'Global\khux_ld_exe')
function Invoke-Guest([string]$LdDir, [int]$Index, [string]$Cmd) {
    $own = $false
    try { $own = $script:LD_MUTEX.WaitOne(120000) } catch [System.Threading.AbandonedMutexException] { $own = $true }
    if (-not $own) { throw 'LDPlayer is busy (ld.exe), try again in a minute' }
    try { & (Join-Path $LdDir 'ld.exe') -s $Index $Cmd } finally { $script:LD_MUTEX.ReleaseMutex() }
}
