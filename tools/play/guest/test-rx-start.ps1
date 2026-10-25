# Test of rx-start.sh on the dedicated «Re-Union X» instance (never on the bench instance 0):
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\play\guest\test-rx-start.ps1 -Package D:\ReUnionX-test -DataDir D:\ReUnionX-test-data
# Points the instance's shared folders at the package and the data folder, starts it, installs the game if
# missing, then runs the start script twice and once with an invalid real time.
param([Parameter(Mandatory)][string]$Package, [Parameter(Mandatory)][string]$DataDir)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\..\launcher\PlayLib.ps1"
$errors = New-Object System.Collections.Generic.List[string]
function Check([bool]$ok, [string]$msg) { if (-not $ok) { $errors.Add($msg) } }
$ld = Find-LDPlayer; $c = Join-Path $ld.Dir 'ldconsole.exe'
$idx = Get-InstanceIndex -List2 ((& $c list2) -join "`n") -Name 'Re-Union X'
if ($idx -le 0) { throw "dedicated instance not found (index $idx); refusing to touch instance 0" }
$g = { param($cmd) Invoke-Guest $ld.Dir $idx $cmd }
$gt = { param($cmd) ConvertTo-GuestText (Invoke-Guest $ld.Dir $idx $cmd) }

# setup: shares, boot, game installed
New-Item -ItemType Directory -Force $DataDir | Out-Null
if (Get-InstanceRunning -List2 ((& $c list2) -join "`n") -Index $idx) { & $c quit --index $idx | Out-Null; Start-Sleep 8 }
Set-InstanceShares -LdDir $ld.Dir -Index $idx -MiscDir $Package -PicturesDir $DataDir
& $c launch --index $idx | Out-Null
$t = 0; do { Start-Sleep 5; $t += 5; $b = & $gt 'getprop sys.boot_completed' } while ($b -ne '1' -and $t -lt 240)
Check ($b -eq '1') "boot not completed after $t s"
if ((& $gt 'pm list packages com.square_enix.android_googleplay.khuxww') -notmatch 'khuxww') {
    & $c installapp --index $idx --filename (Join-Path $Package 'data\game\khux-4.3.1.apk') | Out-Null
    $t = 0; do { Start-Sleep 5; $t += 5 } while ((& $gt 'pm list packages com.square_enix.android_googleplay.khuxww') -notmatch 'khuxww' -and $t -lt 180)
}
$now = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
$script = 'sh /mnt/shared/Misc/data/guest/rx-start.sh'

foreach ($run in 1, 2) {
    $out = @(& $g "$script $now")
    Check ((Get-LastLine $out) -match '^RX:READY \d+') "run ${run}: last line «$(Get-LastLine $out)»"
}
Check (([int](& $gt 'iptables -t nat -S RX_NAT | grep -c DNAT')) -eq 4) 'RX_NAT must hold exactly 4 DNAT rules after two runs'
Check (([int](& $gt 'iptables -t nat -S OUTPUT | grep -c RX_NAT')) -eq 1) 'OUTPUT must jump to RX_NAT once'
Check (@((& $gt 'pidof node') -split '\s+' | Where-Object { $_ }).Count -eq 1) 'exactly one node process'
Check ((& $gt 'date +%Y') -eq '2021') 'guest clock not in 2021'
Check (Test-Path (Join-Path $DataDir 'save\player.json')) 'save\player.json not created from the start save'
Check (Test-Path (Join-Path $DataDir 'logs\server.log')) 'logs\server.log missing'

# an invalid real time makes the server exit: the script must report it
$bad = @(& $g "$script not-a-date")
Check ((Get-LastLine $bad) -match '^RX:ERROR SERVER') "invalid real time: last line «$(Get-LastLine $bad)»"
$null = & $g "$script $now"   # leave a working server behind

if ($errors.Count) { $errors | ForEach-Object { "FAIL: $_" }; exit 1 } else { 'OK' }
