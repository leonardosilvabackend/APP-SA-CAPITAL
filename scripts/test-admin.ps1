param([ValidateSet('migrate','integration','backup','privileges')][string]$Action, [string]$TestFile)
$ErrorActionPreference = 'Stop'
$archivePath = Join-Path $env:LOCALAPPDATA 'SA-Capital\secrets\test-admin-env.protected'
if (!(Test-Path -LiteralPath $archivePath)) { throw 'Credencial administrativa TEST protegida nao encontrada.' }
$content = [Net.NetworkCredential]::new('', (ConvertTo-SecureString ([IO.File]::ReadAllText($archivePath)))).Password
$match = [regex]::Match($content, '(?m)^DATABASE_URL=(.+)\r?$')
if (!$match.Success) { throw 'Arquivo administrativo TEST invalido.' }
$previous = $env:SA_MIGRATION_DATABASE_URL
$previousIntegration = $env:RUN_NEGOTIATION_DB_TESTS
try {
  $env:SA_MIGRATION_DATABASE_URL = $match.Groups[1].Value.Trim()
  switch ($Action) {
    'migrate' { & node --import tsx scripts/run.mjs test migrate; if ($LASTEXITCODE -eq 0) { & node scripts/test-privileges.mjs } }
    'integration' { $env:RUN_NEGOTIATION_DB_TESTS = '1'; if ($TestFile) { & node --import tsx scripts/run.mjs test test --no-cache $TestFile } else { & node --import tsx scripts/run.mjs test test --no-cache } }
    'backup' { & node scripts/test-backup.mjs }
    'privileges' { & node scripts/test-privileges.mjs }
  }
  if ($LASTEXITCODE -ne 0) { throw 'A operacao local TEST falhou.' }
} finally {
  $env:SA_MIGRATION_DATABASE_URL = $previous
  $env:RUN_NEGOTIATION_DB_TESTS = $previousIntegration
}
