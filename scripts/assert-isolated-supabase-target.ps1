# Valida que el workdir apunta al stack aislado (nunca tc-erp-local / 54322).
param(
  [Parameter(Mandatory = $true)]
  [string]$Workdir
)

$ErrorActionPreference = 'Stop'
$configPath = Join-Path $Workdir 'config.toml'
if (-not (Test-Path $configPath)) {
  throw "Missing config.toml in workdir: $Workdir"
}

$text = Get-Content $configPath -Raw
if ($text -notmatch 'project_id\s*=\s*"tc-erp-isolated-verify"') {
  throw "Refusing: project_id must be tc-erp-isolated-verify (got other config in $Workdir)"
}
if ($text -match '(?ms)\[db\][^\[]*?\r?\nport\s*=\s*54322\b') {
  throw 'Refusing: [db] port must not be 54322 (instancia local protegida).'
}
if ($text -notmatch '(?ms)\[db\][^\[]*?\r?\nport\s*=\s*54332\b') {
  throw 'Refusing: isolated [db] port must be 54332.'
}
if ($text -notmatch '(?ms)\[api\][^\[]*?\r?\nport\s*=\s*54331\b') {
  throw 'Refusing: isolated [api] port must be 54331.'
}
if ($text -notmatch '(?ms)\[studio\][^\[]*?\r?\nport\s*=\s*54333\b') {
  throw 'Refusing: isolated [studio] port must be 54333.'
}
if ($text -notmatch '(?ms)\[inbucket\][^\[]*?\r?\nport\s*=\s*54334\b') {
  throw 'Refusing: isolated [inbucket] port must be 54334.'
}
if ($text -notmatch '(?ms)shadow_port\s*=\s*54330\b') {
  throw 'Refusing: isolated shadow_port must be 54330.'
}
if ($text -match 'project_id\s*=\s*"tc-erp-local"') {
  throw 'Refusing: project_id is tc-erp-local.'
}

Write-Host "Isolated target OK: $Workdir (tc-erp-isolated-verify / 54332)"
