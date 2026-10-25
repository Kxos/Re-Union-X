# Tests of PlayLib.ps1 (no emulator needed):
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\play\launcher\test-PlayLib.ps1
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\PlayLib.ps1"
$errors = New-Object System.Collections.Generic.List[string]
function Check([bool]$ok, [string]$msg) { if (-not $ok) { $errors.Add($msg) } }
$tmp = Join-Path ([IO.Path]::GetTempPath()) "playlib-test-$PID"
New-Item -ItemType Directory -Force "$tmp\vms\config" | Out-Null
try {
    # Set-InstanceShares: two keys written, the other lines kept byte-equal, non-ASCII path round-trips
    $cfg = "$tmp\vms\config\leidian3.config"
    $orig = "{`r`n    `"propertySettings.phoneModel`": `"2210132C`",`r`n    `"statusSettings.sharedPictures`": `"C:/Users/x/Documents/XuanZhi9/Pictures`",`r`n    `"statusSettings.sharedMisc`": `"C:/Users/x/Documents/XuanZhi9/Misc`",`r`n    `"basicSettings.rootMode`": false`r`n}"
    [IO.File]::WriteAllText($cfg, $orig)
    Set-InstanceShares -LdDir $tmp -Index 3 -MiscDir 'C:\Users\Zoë\Games\Re-Union X' -PicturesDir 'D:\RX data'
    $j = [IO.File]::ReadAllText($cfg) | ConvertFrom-Json
    Check ($j.'statusSettings.sharedMisc' -eq 'C:/Users/Zoë/Games/Re-Union X') "sharedMisc = $($j.'statusSettings.sharedMisc')"
    Check ($j.'statusSettings.sharedPictures' -eq 'D:/RX data') "sharedPictures = $($j.'statusSettings.sharedPictures')"
    Check ([IO.File]::ReadAllText($cfg) -match '"propertySettings.phoneModel": "2210132C",') 'other keys changed'
    Check ($j.'basicSettings.rootMode' -eq $false) 'rootMode changed'

    # Get-InstanceShares reads back what Set-InstanceShares wrote (Play compares them with the wanted folders)
    $sh = Get-InstanceShares -LdDir $tmp -Index 3
    Check ($sh.Misc -eq 'C:/Users/Zoë/Games/Re-Union X' -and $sh.Pictures -eq 'D:/RX data') "Get-InstanceShares: $($sh.Misc) | $($sh.Pictures)"
    Check (Test-SharesMatch -Shares $sh -MiscDir 'C:\Users\Zoë\Games\Re-Union X\' -PicturesDir 'D:\RX data') 'same folders (trailing \, backslashes) must match'
    Check (-not (Test-SharesMatch -Shares $sh -MiscDir 'D:\Other\Re-Union X' -PicturesDir 'D:\RX data')) 'a different package folder must not match'
    Check ($null -eq (Get-InstanceShares -LdDir $tmp -Index 9)) 'missing instance config must give $null'

    # Disable-LDUpdate on a fresh LDPlayer without leidians.config: no error, nothing created
    $fresh = Join-Path $tmp 'fresh'; New-Item -ItemType Directory -Force "$fresh\vms\config" | Out-Null
    $ok = $true; try { Disable-LDUpdate -LdDir $fresh } catch { $ok = $false }
    Check $ok 'Disable-LDUpdate must not fail when leidians.config is missing'

    # Test-OneDrivePath
    $saved = $env:OneDrive; $env:OneDrive = 'C:\Users\x\OneDrive'
    Check (Test-OneDrivePath 'C:\Users\x\OneDrive\Re-Union X') 'OneDrive path not detected'
    Check (-not (Test-OneDrivePath 'C:\Games\Re-Union X')) 'C:\Games flagged as OneDrive'
    Check (-not (Test-OneDrivePath 'C:\Users\x\OneDriveOld\Re-Union X')) 'prefix without separator flagged'
    $env:OneDrive = $saved

    # Get-InstanceIndex from ldconsole list2 text
    $list = "0,LDPlayer,0,0,0,-1,-1,1920,1080,280`r`n3,Re-Union X,1312,1442,1,8256,9012,1920,1080,280"
    Check ((Get-InstanceIndex -List2 $list -Name 'Re-Union X') -eq 3) 'index of Re-Union X'
    Check ((Get-InstanceIndex -List2 $list -Name 'Missing') -eq -1) 'missing instance must be -1'
    Check ((Get-InstanceRunning -List2 $list -Index 3)) 'instance 3 running (pid columns > 0)'
    Check (-not (Get-InstanceRunning -List2 $list -Index 0)) 'instance 0 not running'

    # Disable-LDUpdate
    [IO.File]::WriteAllText("$tmp\vms\config\leidians.config", "{`r`n    `"languageId`": `"it_IT`",`r`n    `"nextCheckupdateTime`": 1792919586`r`n}")
    Disable-LDUpdate -LdDir $tmp
    $g = [IO.File]::ReadAllText("$tmp\vms\config\leidians.config") | ConvertFrom-Json
    Check ($g.nextCheckupdateTime -eq 4102444800) "nextCheckupdateTime = $($g.nextCheckupdateTime)"
    Check ($g.languageId -eq 'it_IT') 'languageId changed'

    # Test-FreeSpace
    Check (-not (Test-FreeSpace -Path $tmp -NeedBytes 1PB)) '1 PB reported as available'
    Check (Test-FreeSpace -Path $tmp -NeedBytes 1MB) '1 MB reported as missing'

    # Find-LDPlayer on this PC
    $ld = Find-LDPlayer
    Check ($ld -and $ld.Version -eq '9.5.37.0' -and (Test-Path (Join-Path $ld.Dir 'ldconsole.exe'))) "Find-LDPlayer: $($ld | Out-String)"
} finally { Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue }
if ($errors.Count) { $errors | ForEach-Object { "FAIL: $_" }; exit 1 } else { 'OK' }
