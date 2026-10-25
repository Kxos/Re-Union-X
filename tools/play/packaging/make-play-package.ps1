# Builds the private play package (design: the author's private specs, «Play package for LDPlayer»):
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\play\packaging\make-play-package.ps1 -Out D:\ReUnionX-test
#     [-LdInstaller <LDPlayer 9.5.37 full installer>] [-Resources N] [-Revision 186]
#     [-MaxSave server\save\maxpower.json] [-ProudSave server\save\proudall.json]
# The package carries the original APK, a resource version, the resource key and the LDPlayer installer:
# it is a private artefact and never goes into git. This script only reads them from the author's work folder.
param(
    [Parameter(Mandatory)][string]$Out,
    [string]$LdInstaller = 'D:\Progetto_Restauro_KH_UX\LDPlayer\LDPlayer9\LDPlayer_0900053700.exe',
    [int]$Resources = 0,
    [int]$Revision = 189,
    [string]$MaxSave,
    [string]$ProudSave
)
$ErrorActionPreference = 'Stop'
$W = 'D:\Progetto_Restauro_KH_UX'
$repo = Split-Path (Split-Path (Split-Path $PSScriptRoot))
$resRoot = "$W\resource_data"
$apk = "$W\apk\khux-4.3.1-original.apk"
$cache = "$W\tmp\play\termux"
if (-not $MaxSave) { $MaxSave = "$repo\server\save\maxpower.json" }
if (-not $ProudSave) { $ProudSave = "$repo\server\save\proudall.json" }
# Git for Windows provides bash (server/make-cert.sh) and openssl; neither is on PowerShell's PATH by default
function Find-GitTool([string]$rel) {
    $p = Split-Path (Get-Command git).Source   # cmd\, bin\ or mingw64\bin\ of Git for Windows
    for ($i = 0; $i -lt 4 -and $p; $i++) { if (Test-Path (Join-Path $p $rel)) { return (Join-Path $p $rel) }; $p = Split-Path $p }
    throw "Git for Windows tool not found: $rel"
}
$bash = Find-GitTool 'bin\bash.exe'
$openssl = Find-GitTool 'usr\bin\openssl.exe'
function Step([string]$m) { Write-Host "== $m" }
function Need([string]$p) { if (-not (Test-Path $p)) { throw "missing: $p" } }

# --- inputs
Need $apk; Need $LdInstaller; Need $MaxSave; Need $ProudSave
$ldVer = (Get-Item $LdInstaller).VersionInfo.ProductVersion
if ($ldVer -notmatch '^9\.5\.37') { throw "LDPlayer installer is $ldVer, the package needs 9.5.37: $LdInstaller" }
$versions = Get-ChildItem $resRoot -Directory | Where-Object Name -match '^\d+$' | ForEach-Object { [int]$_.Name } | Sort-Object
if (-not $Resources) {
    $Resources = $versions[-1]
    $pending = Get-ChildItem $resRoot -Directory -Filter '_build_*' | Where-Object { [int]($_.Name -replace '\D') -gt $Resources }
    if ($pending) { throw "a newer resource build is unfinished ($($pending.Name -join ', ')): pass -Resources explicitly" }
}
$resDir = "$resRoot\$Resources"; Need "$resDir\data"; Need "$resDir\index"

if (Test-Path $Out) { throw "output folder exists, remove it first: $Out" }
# the package holds the APK, the resources and the key: never inside the public repository
$outFull = [IO.Path]::GetFullPath($Out).TrimEnd('\') + '\'
if ($outFull.StartsWith(([IO.Path]::GetFullPath($repo).TrimEnd('\') + '\'), [StringComparison]::OrdinalIgnoreCase)) {
    throw "the package must not be built inside the repository: $Out"
}
$d = Join-Path $Out 'data'
New-Item -ItemType Directory -Force $d | Out-Null

Step 'server code and tables'
robocopy "$repo\server" "$d\server" /E /NFL /NDL /NJH /NJS /NP /XD save logs certs resource_data /XF bash.exe.stackdump | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy server: $LASTEXITCODE" }
New-Item -ItemType Directory -Force "$d\recon\out" | Out-Null
Copy-Item "$repo\recon\out\*_ww431.json" "$d\recon\out\"

Step 'kept banner images (the guest has no Python)'
$img = "$repo\server\game_data\gacha_img"; $kept = "$repo\server\game_data\gacha_img_kept"
New-Item -ItemType Directory -Force $kept | Out-Null
# the server asks for <id>-kept<KEPT_STYLE>.png (server/gacha.js): same style here, or the guest serves plain banners
$keptStyle = (node -e "console.log(require(process.argv[1]).KEPT_STYLE)" "$repo\server\gacha.js").Trim()
if ($keptStyle -notmatch '^\d+$') { throw "cannot read KEPT_STYLE from server/gacha.js: $keptStyle" }
foreach ($f in Get-ChildItem $img -Filter '*.png') {
    $dst = Join-Path $kept ($f.BaseName + "-kept$keptStyle.png")
    if ((Test-Path $dst) -and (Get-Item $dst).LastWriteTime -ge $f.LastWriteTime) { continue }
    python -I "$repo\recon\tools\kept_banner_badge.py" $f.FullName $dst
    if ($LASTEXITCODE) { throw "kept_banner_badge.py failed on $($f.Name)" }
}
robocopy $kept "$d\server\game_data\gacha_img_kept" /E /NFL /NDL /NJH /NJS /NP | Out-Null

Step 'certificates of the package (not the bench CA)'
$tmpCerts = "$W\tmp\play\certs-$PID"
try {
    $env:KHUX_CERT_DIR = $tmpCerts.Replace('\', '/')
    & $bash "$repo\server\make-cert.sh" 127.0.0.1 | Out-Null
    if ($LASTEXITCODE) { throw "make-cert.sh failed: $LASTEXITCODE" }
    New-Item -ItemType Directory -Force "$d\server\certs" | Out-Null
    foreach ($f in 'ca.crt', 'server.crt', 'server.key') { Copy-Item "$tmpCerts\$f" "$d\server\certs\$f" }
    $caHash = (& $openssl x509 -subject_hash_old -noout -in "$tmpCerts\ca.crt").Trim()
} finally {
    # the CA private key never stays on disk, even if the build stops here
    Remove-Item Env:KHUX_CERT_DIR -ErrorAction SilentlyContinue
    Remove-Item -Recurse -Force $tmpCerts -ErrorAction SilentlyContinue
}

Step "resources version $Resources"
New-Item -ItemType Directory -Force "$d\resources\$Resources\data", "$d\resources\$Resources\index" | Out-Null
$sameVolume = ([IO.Path]::GetPathRoot((Resolve-Path $Out).Path)) -eq ([IO.Path]::GetPathRoot($resDir))
foreach ($kind in 'data', 'index') {
    foreach ($f in Get-ChildItem "$resDir\$kind" -File) {
        $dst = "$d\resources\$Resources\$kind\$($f.Name)"
        if ($sameVolume) { New-Item -ItemType HardLink -Path $dst -Target $f.FullName | Out-Null } else { Copy-Item $f.FullName $dst }
    }
}
$size = (Get-ChildItem "$resDir\data" -File | Measure-Object Length -Sum).Sum

Step 'game, LDPlayer installer, Node.js runtime, start save'
New-Item -ItemType Directory -Force "$d\game", "$d\setup", "$d\guest" | Out-Null
Copy-Item $apk "$d\game\khux-4.3.1.apk"
Copy-Item $LdInstaller "$d\setup\LDPlayer9-9.5.37.exe"
python -I "$PSScriptRoot\termux_node.py" $cache "$d\guest"
if ($LASTEXITCODE) { throw 'termux_node.py failed' }
foreach ($f in Get-ChildItem "$repo\tools\play\guest" -Filter '*.sh' -ErrorAction SilentlyContinue) {
    [IO.File]::WriteAllText("$d\guest\$($f.Name)", ((Get-Content $f.FullName -Raw) -replace "`r`n", "`n"))
}
if (Test-Path "$repo\tools\play\launcher") { Copy-Item -Recurse "$repo\tools\play\launcher" "$d\launcher" -Exclude 'test-*' }
node "$repo\server\make-package-save.js" $MaxSave $ProudSave "$d\start-save.json"
if ($LASTEXITCODE) { throw 'make-package-save.js failed' }

Step 'settings'
$key = (python -I "$repo\recon\tools\private_tools.py" key).Trim()
if ($LASTEXITCODE -or -not $key) { throw 'resource key not available (recon/tools/private_tools.py)' }
$stamp = Get-Date -Format 'yyyy-MM-dd.HHmm'
$envLines = @(
    "KHUX_RESOURCE_KEY=$key", "KHUX_RESOURCE_SIZE=$size", "KHUX_REVISION=$Revision",
    'KHUX_GACHA_SIZES=1,2,3,4,5,6,7,8,9,10', 'KHUX_PET=1', "RX_CA_HASH=$caHash", "RX_PACKAGE=$stamp", "RX_RESOURCES=$Resources")
[IO.File]::WriteAllText("$d\package.env", ($envLines -join "`n") + "`n")
[IO.File]::WriteAllText("$d\package.json", (@{ package = $stamp; resources = $Resources; revision = $Revision; ldplayer = '9.5.37.0' } | ConvertTo-Json))
Copy-Item "$repo\tools\play\package\Play.bat", "$repo\tools\play\package\README.txt" $Out

$total = (Get-ChildItem $Out -Recurse -File | Measure-Object Length -Sum).Sum
Step ("package {0} ready: {1:N1} GB in {2}" -f $stamp, ($total / 1GB), $Out)
