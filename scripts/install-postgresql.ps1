param([string]$Version = '17.12-1')
$ErrorActionPreference = 'Stop'

# Installs only a missing local PostgreSQL instance. No existing cluster is reset.
if (Get-Service -ErrorAction SilentlyContinue | Where-Object { $_.Name -match 'postgres|pgsql' }) {
  throw 'An existing PostgreSQL service was found. Reuse it instead of installing another instance.'
}
if (Test-Path -LiteralPath 'C:\Program Files\PostgreSQL\17\bin\postgres.exe') {
  throw 'Existing PostgreSQL binaries were found. Inspect that installation before continuing.'
}
$taskCache = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\.cache\postgresql'))
New-Item -ItemType Directory -Path $taskCache -Force | Out-Null

function Protect-LocalFile([string]$Path) {
  $acl = New-Object Security.AccessControl.FileSecurity
  $acl.SetAccessRuleProtection($true, $false)
  foreach ($sid in @([Security.Principal.WindowsIdentity]::GetCurrent().User, (New-Object Security.Principal.SecurityIdentifier('S-1-5-18')), (New-Object Security.Principal.SecurityIdentifier('S-1-5-32-544')))) {
    $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($sid, 'FullControl', 'Allow')))
  }
  Set-Acl -LiteralPath $Path -AclObject $acl
}

$credentialPath = Join-Path $taskCache 'postgres-admin.credential.xml'
if (Test-Path -LiteralPath $credentialPath) {
  $credential = Import-Clixml -LiteralPath $credentialPath
} else {
  $bytes = New-Object byte[] 32
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  $rng.GetBytes($bytes)
  $rng.Dispose()
  $password = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
  $credential = New-Object Management.Automation.PSCredential('postgres', (ConvertTo-SecureString $password -AsPlainText -Force))
  $credential | Export-Clixml -LiteralPath $credentialPath
  Protect-LocalFile $credentialPath
}
$optionPath = Join-Path $taskCache 'installer.options'
try {
  # Password is supplied through a restricted temporary file, never command arguments.
  $options = "mode=unattended`nunattendedmodeui=none`nsuperpassword=$($credential.GetNetworkCredential().Password)`n"
  [IO.File]::WriteAllText($optionPath, $options)
  Protect-LocalFile $optionPath
  & winget.exe install --id PostgreSQL.PostgreSQL.17 --version $Version --exact --source winget --silent --accept-package-agreements --accept-source-agreements --override "--optionfile `"$optionPath`""
  if ($LASTEXITCODE -ne 0) { throw "PostgreSQL installer did not complete (WinGet exit $LASTEXITCODE). Approve the Windows administrator prompt if requested." }
  $service = Get-Service -ErrorAction SilentlyContinue | Where-Object { $_.Name -match '^postgresql.*17' } | Select-Object -First 1
  if (-not $service) { throw 'The installation returned successfully but its PostgreSQL service was not found.' }
  if ($service.Status -ne 'Running') { Start-Service -Name $service.Name }
  Write-Output 'PostgreSQL 17 installation completed. Administrator credentials are encrypted for the current Windows user in the ignored project cache.'
  $service | Select-Object Name, Status
} finally {
  if (Test-Path -LiteralPath $optionPath) { Remove-Item -LiteralPath $optionPath -Force }
  $options = $null
  $password = $null
}
