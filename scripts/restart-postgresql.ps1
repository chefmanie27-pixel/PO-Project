$ErrorActionPreference = 'Stop'
$statusPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\.cache\postgresql\restart-status.json'))
try {
  $service = Get-CimInstance Win32_Service -Filter "Name='postgresql-x64-17'"
  if (-not $service -or $service.PathName -notmatch 'PostgreSQL\\17\\bin\\pg_ctl.exe') { throw 'The intended local PostgreSQL 17 service was not found.' }
  Restart-Service -Name postgresql-x64-17 -ErrorAction Stop
  (Get-Service postgresql-x64-17).WaitForStatus('Running', [TimeSpan]::FromSeconds(30))
  [IO.File]::WriteAllText($statusPath, '{"restarted":true}')
} catch {
  [IO.File]::WriteAllText($statusPath, '{"restarted":false}')
  exit 1
}
