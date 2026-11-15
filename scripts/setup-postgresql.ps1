$ErrorActionPreference = 'Stop'
$taskCache = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\.cache\postgresql'))
$credentialPath = Join-Path $taskCache 'postgres-admin.credential.xml'
if (-not (Test-Path -LiteralPath $credentialPath)) { throw 'The encrypted administrator credential from the local installation is required.' }

# Protect generated app credentials through inherited NTFS permissions.
$acl = New-Object Security.AccessControl.DirectorySecurity
$acl.SetAccessRuleProtection($true, $false)
foreach ($sid in @([Security.Principal.WindowsIdentity]::GetCurrent().User, (New-Object Security.Principal.SecurityIdentifier('S-1-5-18')), (New-Object Security.Principal.SecurityIdentifier('S-1-5-32-544')))) {
  $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')))
}
$existingAcl = Get-Acl -LiteralPath $taskCache
if (-not $existingAcl.AreAccessRulesProtected) {
  Set-Acl -LiteralPath $taskCache -AclObject $acl
} else {
  $allowedSids = @([Security.Principal.WindowsIdentity]::GetCurrent().User.Value, 'S-1-5-18', 'S-1-5-32-544')
  foreach ($rule in $existingAcl.Access) {
    if ($rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -notin $allowedSids) {
      throw 'The existing credential cache grants unexpected access. No credentials were loaded.'
    }
  }
}

if (Test-Path Env:PO_LOCAL_POSTGRES_PASSWORD) { throw 'Refusing to overwrite an existing task credential variable.' }
try {
  $credential = Import-Clixml -LiteralPath $credentialPath
  $env:PO_LOCAL_POSTGRES_PASSWORD = $credential.GetNetworkCredential().Password
  & node (Join-Path $PSScriptRoot 'setup-postgresql.mjs')
  if ($LASTEXITCODE -ne 0) { throw 'Local database configuration did not complete. See the non-secret status above.' }
} finally {
  Remove-Item Env:PO_LOCAL_POSTGRES_PASSWORD -ErrorAction SilentlyContinue
  $credential = $null
}
