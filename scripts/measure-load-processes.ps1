param([ValidatePattern('^[a-z0-9-]+$')][string]$Label = 'large-import', [ValidateSet('1000','5000','20000')][string]$ImportRows = '20000', [ValidateSet('20','50','100')][string]$Users = '20', [switch]$VariedSearch)
$ErrorActionPreference = 'Stop'
$directory = Join-Path (Get-Location).Path '.local\phase2'
New-Item -ItemType Directory -Path $directory -Force | Out-Null
$arguments = @('-NoProfile','-ExecutionPolicy','Bypass','-File','scripts/load-test.ps1','-Label',$Label,'-ImportRows',$ImportRows,'-Users',$Users)
if ($VariedSearch) { $arguments += '-VariedSearch' }
$worker = Start-Process -FilePath (Get-Command powershell.exe).Source -ArgumentList $arguments -WorkingDirectory (Get-Location).Path -WindowStyle Hidden -RedirectStandardOutput (Join-Path $directory ($Label+'.log')) -RedirectStandardError (Join-Path $directory ($Label+'.error.log')) -PassThru
$workerHandle = $worker.Handle
$samples = [System.Collections.Generic.List[object]]::new()
$previous = @{}
$last = Get-Date
while (!$worker.HasExited) {
  $now = Get-Date
  $seconds = ($now-$last).TotalSeconds
  $cpu = 0.0; $rss = 0.0; $count = 0
  foreach ($process in @(Get-Process -Name postgres -ErrorAction SilentlyContinue)) {
    $count++; $rss += $process.WorkingSet64
    if ($previous.ContainsKey($process.Id)) { $cpu += [math]::Max([double]0, [double]($process.CPU-$previous[$process.Id])) }
    $previous[$process.Id] = $process.CPU
  }
  $samples.Add([pscustomobject]@{at=$now.ToUniversalTime().ToString('o');postgresProcesses=$count;postgresWorkingSetMB=[math]::Round($rss/1MB,2);postgresCpuOneCorePercent=if($seconds -gt 0){[math]::Round(100*$cpu/$seconds,2)}else{0}})
  $last=$now
  Start-Sleep -Seconds 1
  $worker.Refresh()
}
$samples | ConvertTo-Json -Depth 4 | Set-Content -Encoding UTF8 -LiteralPath (Join-Path $directory ($Label+'-resources.json'))
$worker.WaitForExit()
if ($worker.ExitCode -ne 0) { throw 'Ensaio falhou; confira os logs locais' }
Write-Output ('Ensaio e recursos PostgreSQL registrados: '+$Label)
