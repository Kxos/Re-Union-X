# Step timing for build-resources.ps1 (dot-sourced). `python` is shadowed by a function that times every call and writes
# a line to D:\Progetto_Restauro_KH_UX\logs\build-resources-steps.log; the summary (slowest steps) is printed at the end by Show-BuildSteps.
# Output and $LASTEXITCODE pass through unchanged, so `$x = python ...` and `if ($LASTEXITCODE)` keep working.
$script:BuildSteps = New-Object System.Collections.ArrayList
$script:BuildT0 = Get-Date
function python {
  $label = ($args | Where-Object { $_ -is [string] -and $_ -match '\.py$' } | Select-Object -First 1)
  if (-not $label) { $label = "$($args | Select-Object -First 2)" }
  $label = Split-Path -Leaf $label
  $sw = [Diagnostics.Stopwatch]::StartNew()
  $input | & (Get-Command python.exe -CommandType Application | Select-Object -First 1).Source @args   # $input: forwards `$x | python ...`
  $code = $LASTEXITCODE
  $sw.Stop()
  [void]$script:BuildSteps.Add([pscustomobject]@{ Step = $label; Sec = [math]::Round($sw.Elapsed.TotalSeconds, 1); Exit = $code })
  $global:LASTEXITCODE = $code
}
function Show-BuildSteps {
  $tot = [math]::Round(((Get-Date) - $script:BuildT0).TotalSeconds, 1)
  $py = ($script:BuildSteps | Measure-Object Sec -Sum).Sum
  $by = $script:BuildSteps | Group-Object Step | ForEach-Object { [pscustomobject]@{ Step = $_.Name; Calls = $_.Count; Sec = [math]::Round(($_.Group | Measure-Object Sec -Sum).Sum, 1) } } | Sort-Object Sec -Descending
  $lines = @("build-resources: total $tot s, python steps $([math]::Round($py,1)) s, other (powershell/adb/copy) $([math]::Round($tot-$py,1)) s") + ($by | Select-Object -First 12 | ForEach-Object { '  {0,7} s  x{1}  {2}' -f $_.Sec, $_.Calls, $_.Step })
  $lines
  Add-Content -Path 'D:\Progetto_Restauro_KH_UX\logs\build-resources-steps.log' -Value (@("--- $(Get-Date -Format s)") + $lines) -Encoding utf8
}

# Pre-flight checks (04-11): a build killed half way by memory pressure (Claude Code reaps background jobs when the machine is
# short of RAM) wastes 10+ minutes, so refuse to start in a bad state. KHUX_BUILD_FORCE=1 skips the checks.
function Assert-BuildPreflight([int]$MinAvailMB = 2500, [int]$MinFreeDiskGB = 10) {
  if ($env:KHUX_BUILD_FORCE -eq '1') { 'pre-flight: skipped (KHUX_BUILD_FORCE=1)'; return }
  # one build at a time: two of them write the same stage_gen\files and gen.mp4
  $other = @(Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID -and $_.Name -match '^powershell' -and $_.CommandLine -match 'build-resources\.ps1' -and $_.CommandLine -notmatch 'Get-CimInstance' })
  if ($other) { throw "another build-resources.ps1 is running (pid $($other.ProcessId -join ', ')): wait for it or stop it" }
  $av = [int](Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory).AvailableMBytes
  if ($av -lt $MinAvailMB) {
    $top = Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 5 | ForEach-Object { '{0} {1} MB' -f $_.Name, [int]($_.WorkingSet64 / 1MB) }
    throw "only $av MB of RAM available (minimum $MinAvailMB): close some programs first. Biggest now: $($top -join '; ')"
  }
  $free = [int]((Get-PSDrive D).Free / 1GB)
  if ($free -lt $MinFreeDiskGB) { throw "only $free GB free on D: (minimum $MinFreeDiskGB)" }
  # below-normal priority (inherited by python/robocopy children): the PC, LDPlayer and the session stay responsive
  try { (Get-Process -Id $PID).PriorityClass = 'BelowNormal' } catch { }
  "pre-flight ok: $av MB RAM available, $free GB free on D:"
}
