# Fa scaricare al client l'ultima versione delle risorse (resource_data\<N>, es. 4 con le
# mappe generate). Il client chiede le risorse (azione 28) solo se il tutorial risulta
# finito: il server parte una volta con -TutorialFinished, l'app scarica (Download), poi
# server e app ripartono normali (relogin.ps1). Il download completo e' di ~2,3 GB.
#   .\update-resources.ps1 [-Revision N]
# -Revision = BASE della revisione del master (run-server.ps1)
param([int]$Revision = 182)
$repo = Split-Path (Split-Path (Split-Path $PSScriptRoot))
$log = 'D:\Progetto_Restauro_KH_UX\logs\server.log'
Set-Location $repo
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Confirm:$false
Start-Sleep 1
$null = Invoke-CimMethod Win32_Process -MethodName Create -Arguments @{ CommandLine = "powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$PSScriptRoot\run-server.ps1`" -Revision $Revision -TutorialFinished" }
Start-Sleep 5
& .\tools\ldplayer\bench_start.ps1 -Out $log -Shot 'upd' -Settle 10 | Select-Object -Last 2
# attesa della fine del download: nessuna nuova richiesta di file per 20 s
$last = 0; $quiet = 0
for ($t = 0; $t -lt 600 -and $quiet -lt 20; $t += 5) {
    Start-Sleep 5
    $n = @(Get-Content $log | Select-String 'GET /resource/').Count
    if ($n -gt $last) { $last = $n; $quiet = 0 } else { $quiet += 5 }
}
"file di risorse scaricati: $last"
# poi l'installazione (concatenazione in files/r/misc.mp4[.N] e misc.png) dura minuti:
# interromperla lascia le risorse a meta' (la home non trova piu' i suoi layout). Si
# attende che i file del guest abbiano le dimensioni dell'ultima versione.
. .\tools\ldplayer\bench_lib.ps1
$res = 'D:\Progetto_Restauro_KH_UX\resource_data'
$ver = Get-ChildItem $res -Directory | Where-Object Name -match '^\d+$' | Sort-Object { [int]$_.Name } | Select-Object -Last 1
$wantData = (Get-ChildItem "$($ver.FullName)\data" | Measure-Object Length -Sum).Sum
$wantIndex = (Get-ChildItem "$($ver.FullName)\index" | Measure-Object Length -Sum).Sum
$r = '/data/data/com.square_enix.android_googleplay.khuxww/files/r'
for ($t = 0; $t -lt 900; $t += 10) {
    $sizes = @(Sh "stat -c '%n %s' $r/misc.mp4 $r/misc.mp4.* $r/misc.png 2>/dev/null")
    $data = ($sizes | Where-Object { $_ -match 'misc\.mp4' } | ForEach-Object { [int64](($_ -split ' ')[-1]) } | Measure-Object -Sum).Sum
    $index = ($sizes | Where-Object { $_ -match 'misc\.png' } | ForEach-Object { [int64](($_ -split ' ')[-1]) } | Measure-Object -Sum).Sum
    if ($data -eq $wantData -and $index -eq $wantIndex) { "installate: dati $data, indice $index ($t s)"; break }
    Start-Sleep 10
}
if ($data -ne $wantData -or $index -ne $wantIndex) { throw "installazione incompleta: dati $data/$wantData, indice $index/$wantIndex" }
Start-Sleep 5
& "$PSScriptRoot\relogin.ps1" -Tag 'upd_home' -Revision $Revision | Select-Object -Last 1
