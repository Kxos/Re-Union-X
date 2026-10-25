# Checks a built play package (make-play-package.ps1):
#   powershell -NoProfile -File tools\play\packaging\test-package-layout.ps1 -Package <dir>
# Prints OK or one FAIL line per problem; exit 1 on failure.
param([Parameter(Mandatory)][string]$Package)
$ErrorActionPreference = 'Stop'
$repo = Split-Path (Split-Path (Split-Path $PSScriptRoot))
$errors = New-Object System.Collections.Generic.List[string]
function Check([bool]$ok, [string]$msg) { if (-not $ok) { $errors.Add($msg) } }
$d = Join-Path $Package 'data'

foreach ($p in 'Play.bat', 'README.txt', 'data\guest\node.tar', 'data\guest\licenses\nodejs-lts\copyright',
    'data\server\server.js', 'data\server\master_data', 'data\server\game_data\gacha_img', 'data\server\certs\server.crt',
    'data\server\certs\ca.crt', 'data\recon\out\master_types_ww431.json', 'data\recon\out\api_responses_ww431.json',
    'data\game\khux-4.3.1.apk', 'data\start-save.json', 'data\package.env', 'data\package.json') {
    Check (Test-Path (Join-Path $Package $p)) "missing $p"
}
Check (-not (Test-Path "$d\server\save")) 'data\server\save must not exist'
Check (-not (Test-Path "$d\server\certs\ca.key")) 'the package must not carry the CA private key'

if (Test-Path "$d\package.json") {
    $pj = Get-Content "$d\package.json" -Raw | ConvertFrom-Json
    Check (Test-Path "$d\resources\$($pj.resources)\data") "missing data\resources\$($pj.resources)\data"
    Check (Test-Path "$d\resources\$($pj.resources)\index") "missing data\resources\$($pj.resources)\index"
    Check ($pj.ldplayer -eq '9.5.37.0') "package.json ldplayer $($pj.ldplayer)"
}
$inst = Get-ChildItem "$d\setup" -Filter '*.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
Check ($inst -and $inst.VersionInfo.ProductVersion -match '^9\.5\.37') "LDPlayer installer missing or not 9.5.37 ($($inst.VersionInfo.ProductVersion))"

if (Test-Path "$d\package.env") {
    $envText = Get-Content "$d\package.env" -Raw
    Check ($envText -match '(?m)^KHUX_RESOURCE_KEY=[0-9a-fA-F]{32,}\r?$') 'package.env: no hex KHUX_RESOURCE_KEY'
    Check ($envText -match '(?m)^KHUX_RESOURCE_SIZE=\d+\r?$') 'package.env: no KHUX_RESOURCE_SIZE'
    Check ($envText -match '(?m)^RX_CA_HASH=[0-9a-f]{8}\r?$') 'package.env: no RX_CA_HASH'
    Check ($envText -notmatch "`r") 'package.env must use LF line endings (read by the guest shell)'
}
if (Test-Path "$d\server\certs\server.crt") {
    $openssl = $null; $p = Split-Path (Get-Command git).Source
    for ($i = 0; $i -lt 4 -and $p -and -not $openssl; $i++) { if (Test-Path "$p\usr\bin\openssl.exe") { $openssl = "$p\usr\bin\openssl.exe" }; $p = Split-Path $p }
    $san = & $openssl x509 -in "$d\server\certs\server.crt" -noout -ext subjectAltName 2>$null | Out-String
    Check ($san -match '127\.0\.0\.1' -and $san -match '\*\.kingdomhearts\.com') "server.crt SAN: $san"
    $a = (Get-FileHash "$d\server\certs\ca.crt").Hash; $b = (Get-FileHash "$repo\server\certs\ca.crt").Hash
    Check ($a -ne $b) 'package CA must differ from the bench CA'
}
$img = @(Get-ChildItem "$d\server\game_data\gacha_img" -Filter '*.png' -ErrorAction SilentlyContinue).Count
$kept = @(Get-ChildItem "$d\server\game_data\gacha_img_kept" -Filter '*-kept2.png' -ErrorAction SilentlyContinue).Count
Check ($img -gt 0 -and $kept -eq $img) "kept banner images $kept / $img"

$tracked = git -c safe.directory=* -C $repo ls-files | Where-Object { $_ -match '(package\.env|\.apk)$' }
Check (-not $tracked) "tracked in git: $tracked"

if ($errors.Count) { $errors | ForEach-Object { "FAIL: $_" }; exit 1 } else { 'OK' }
