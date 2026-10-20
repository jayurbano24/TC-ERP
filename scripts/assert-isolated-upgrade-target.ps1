# Valida workdir del stack upgrade (nunca local 54322 ni verify 54332).
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
if ($text -notmatch 'project_id\s*=\s*"tc-erp-isolated-upgrade"') {
  throw 'Refusing: project_id must be tc-erp-isolated-upgrade.'
}
foreach ($pair in @(
    @{ Port = 54322; Label = 'protegida tc-erp-local' },
    @{ Port = 54332; Label = 'verify aislado' }
  )) {
  if ($text -match "(?ms)\[db\][^\[]*?\r?\nport\s*=\s$($pair.Port)\b") {
    throw "Refusing: [db] port must not be $($pair.Port) ($($pair.Label))."
  }
}
if ($text -notmatch '(?ms)\[db\][^\[]*?\r?\nport\s*=\s*54342\b') {
  throw 'Refusing: upgrade [db] port must be 54342.'
}
if ($text -notmatch '(?ms)\[api\][^\[]*?\r?\nport\s*=\s*54341\b') {
  throw 'Refusing: upgrade [api] port must be 54341.'
}
if ($text -notmatch '(?ms)\[studio\][^\[]*?\r?\nport\s*=\s*54343\b') {
  throw 'Refusing: upgrade [studio] port must be 54343.'
}
if ($text -notmatch '(?ms)\[inbucket\][^\[]*?\r?\nport\s*=\s*54344\b') {
  throw 'Refusing: upgrade [inbucket] port must be 54344.'
}
if ($text -notmatch '(?ms)shadow_port\s*=\s*54340\b') {
  throw 'Refusing: upgrade shadow_port must be 54340.'
}
if ($text -match 'project_id\s*=\s*"tc-erp-local"') {
  throw 'Refusing: project_id is tc-erp-local.'
}
if ($text -match 'project_id\s*=\s*"tc-erp-isolated-verify"') {
  throw 'Refusing: project_id is tc-erp-isolated-verify (use stack upgrade).'
}

Write-Host "Upgrade isolated target OK: $Workdir (tc-erp-isolated-upgrade / 54342)"
