param([ValidatePattern('^[a-z0-9-]+$')][string]$Label = 'local', [ValidateSet('15','60')][string]$Seconds = '15', [ValidateSet('20','50','100','all')][string]$Users = 'all', [ValidateSet('1000','5000','20000')][string]$ImportRows = '1000', [switch]$VariedSearch)
$ErrorActionPreference = 'Stop'
$previous = @{}
foreach ($name in @('RUN_LOAD_TESTS','LOAD_LABEL','LOAD_SECONDS','LOAD_USERS','LOAD_IMPORT_ROWS','LOAD_VARIETY')) { $previous[$name] = [Environment]::GetEnvironmentVariable($name) }
try {
  $env:LOAD_VARIETY = if ($VariedSearch) { '1' } else { '0' }
  $env:LOAD_IMPORT_ROWS = $ImportRows
  $env:RUN_LOAD_TESTS = '1'; $env:LOAD_LABEL = $Label; $env:LOAD_SECONDS = $Seconds
  $env:LOAD_USERS = if ($Users -eq 'all') { $null } else { $Users }
  & powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-admin.ps1 -Action integration -TestFile server/negotiations/load.test.ts
  if ($LASTEXITCODE -ne 0) { throw 'Ensaio de carga TEST falhou' }
} finally {
  foreach ($name in $previous.Keys) { [Environment]::SetEnvironmentVariable($name, $previous[$name]) }
}
