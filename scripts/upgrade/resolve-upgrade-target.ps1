# Destino único validado para upgrade/recovery (54342). Sin fallback a verify/local.
$ErrorActionPreference = 'Stop'

function Test-UrlUsesForbiddenPort {
  param([string]$Url, [int[]]$ForbiddenPorts)
  if ([string]::IsNullOrWhiteSpace($Url)) { return $false }
  foreach ($p in $ForbiddenPorts) {
    if ($Url -match "[:@/\.]$p(/|`"|'|$|\?)") { return $true }
  }
  return $false
}

function Get-UpgradeTargetFromWorkdir {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Root,
    [Parameter(Mandatory = $true)]
    [string]$Workdir
  )

  $isoConfig = Join-Path $Root 'supabase\isolated-upgrade\config.toml'
  if (-not (Test-Path $isoConfig)) {
    throw 'Missing supabase/isolated-upgrade/config.toml'
  }
  & (Join-Path $Root 'scripts\assert-isolated-upgrade-target.ps1') -Workdir (Split-Path $isoConfig -Parent)
  $workConfig = Join-Path $Workdir 'supabase\config.toml'
  if (Test-Path $workConfig) {
    & (Join-Path $Root 'scripts\assert-isolated-upgrade-target.ps1') -Workdir (Join-Path $Workdir 'supabase')
  }

  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $statusRaw = (npx supabase status --workdir $Workdir -o json 2>&1 | Out-String)
  $ErrorActionPreference = $prevEap

  $jsonStart = $statusRaw.IndexOf('{')
  $jsonEnd = $statusRaw.LastIndexOf('}')
  if ($jsonStart -lt 0 -or $jsonEnd -le $jsonStart) {
    throw 'Upgrade stack status unavailable. Start stack only after explicit restore procedure.'
  }
  $status = ($statusRaw.Substring($jsonStart, $jsonEnd - $jsonStart + 1) | ConvertFrom-Json)

  $dbUrl = [string]$status.DB_URL
  $apiUrl = [string]$status.API_URL
  if ([string]::IsNullOrWhiteSpace($dbUrl) -or [string]::IsNullOrWhiteSpace($apiUrl)) {
    throw 'status JSON missing DB_URL or API_URL'
  }

  $forbidden = @(54322, 54332)
  foreach ($u in @($dbUrl, $apiUrl, [string]$status.REST_URL, [string]$status.STUDIO_URL)) {
    if (Test-UrlUsesForbiddenPort -Url $u -ForbiddenPorts $forbidden) {
      throw "Forbidden port in status URL (refusing non-upgrade target): $u"
    }
  }

  if ($dbUrl -notmatch '127\.0\.0\.1:54342' -and $dbUrl -notmatch 'localhost:54342') {
    throw "DB_URL must be local upgrade port 54342. Got: $dbUrl"
  }
  if ($apiUrl -notmatch ':54341') {
    throw "API_URL must use upgrade port 54341. Got: $apiUrl"
  }

  return [pscustomobject]@{
    ProjectId       = 'tc-erp-isolated-upgrade'
    DbUrl           = $dbUrl
    ApiUrl          = $apiUrl
    AnonKey         = [string]$status.ANON_KEY
    ServiceRoleKey  = [string]$status.SERVICE_ROLE_KEY
    JwtSecret       = [string]$status.JWT_SECRET
    StatusRaw       = $status
  }
}

function Set-UpgradeEnvironmentVariables {
  param(
    [Parameter(Mandatory = $true)]
    $Target
  )

  if ([string]::IsNullOrWhiteSpace($Target.DbUrl)) { throw 'UPGRADE_DATABASE_URL required (no fallback)' }
  if ([string]::IsNullOrWhiteSpace($Target.ApiUrl)) { throw 'UPGRADE_SUPABASE_URL required (no fallback)' }
  if ([string]::IsNullOrWhiteSpace($Target.AnonKey)) { throw 'UPGRADE_SUPABASE_ANON_KEY required' }
  if ([string]::IsNullOrWhiteSpace($Target.JwtSecret)) { throw 'UPGRADE_SUPABASE_JWT_SECRET required' }

  $env:UPGRADE_STACK_MODE = '1'
  $env:UPGRADE_DATABASE_URL = $Target.DbUrl
  $env:UPGRADE_SUPABASE_URL = $Target.ApiUrl
  $env:UPGRADE_SUPABASE_ANON_KEY = $Target.AnonKey
  $env:UPGRADE_SUPABASE_SERVICE_ROLE_KEY = $Target.ServiceRoleKey
  $env:UPGRADE_SUPABASE_JWT_SECRET = $Target.JwtSecret

  # Alias solo para suites existentes en a14b4ce; valores siempre derivados del target validado.
  $env:CLASSIFY_FULL_DATABASE_URL = $Target.DbUrl
  $env:ISOLATED_SUPABASE_URL = $Target.ApiUrl
  $env:ISOLATED_SUPABASE_ANON_KEY = $Target.AnonKey
  $env:ISOLATED_SUPABASE_SERVICE_ROLE_KEY = $Target.ServiceRoleKey
  $env:ISOLATED_SUPABASE_JWT_SECRET = $Target.JwtSecret
}

function Clear-UpgradeEnvironmentVariables {
  Remove-Item Env:UPGRADE_STACK_MODE -ErrorAction SilentlyContinue
  Remove-Item Env:UPGRADE_DATABASE_URL -ErrorAction SilentlyContinue
  Remove-Item Env:UPGRADE_SUPABASE_URL -ErrorAction SilentlyContinue
  Remove-Item Env:UPGRADE_SUPABASE_ANON_KEY -ErrorAction SilentlyContinue
  Remove-Item Env:UPGRADE_SUPABASE_SERVICE_ROLE_KEY -ErrorAction SilentlyContinue
  Remove-Item Env:UPGRADE_SUPABASE_JWT_SECRET -ErrorAction SilentlyContinue
  Remove-Item Env:CLASSIFY_FULL_DATABASE_URL -ErrorAction SilentlyContinue
  Remove-Item Env:ISOLATED_SUPABASE_URL -ErrorAction SilentlyContinue
  Remove-Item Env:ISOLATED_SUPABASE_ANON_KEY -ErrorAction SilentlyContinue
  Remove-Item Env:ISOLATED_SUPABASE_SERVICE_ROLE_KEY -ErrorAction SilentlyContinue
  Remove-Item Env:ISOLATED_SUPABASE_JWT_SECRET -ErrorAction SilentlyContinue
}

function Assert-UpgradeEnvironmentPresent {
  foreach ($name in @(
      'UPGRADE_DATABASE_URL', 'UPGRADE_SUPABASE_URL', 'UPGRADE_SUPABASE_ANON_KEY', 'UPGRADE_SUPABASE_JWT_SECRET'
    )) {
    if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name))) {
      throw "Missing required env $name (upgrade mode forbids skipping configuration)"
    }
  }
  if ($env:UPGRADE_STACK_MODE -ne '1') {
    throw 'UPGRADE_STACK_MODE must be 1 for upgrade/recovery operations'
  }
}
