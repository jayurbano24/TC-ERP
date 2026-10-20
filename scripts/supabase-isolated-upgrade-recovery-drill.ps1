# Recovery: wipe upgrade volume + restore pre-upgrade dump. No sobrescribe evidence/after.
param(
  [Parameter(Mandatory = $true)]
  [string]$PreUpgradeManifestPath
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$log = Join-Path $root 'artifacts/upgrade-recovery-a14b4ce/recovery-drill.log'
$logDir = Split-Path $log -Parent
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }

"Recovery drill started: $(Get-Date -Format o)" | Tee-Object -FilePath $log

& (Join-Path $PSScriptRoot 'supabase-isolated-upgrade-restore.ps1') -ManifestPath $PreUpgradeManifestPath -StartStack
& (Join-Path $PSScriptRoot 'run-upgrade-validation-checks.ps1') -Phase recovered

$sw.Stop()
"Recovery drill finished in $($sw.Elapsed.TotalSeconds)s" | Tee-Object -FilePath $log -Append
Write-Host 'Compare evidence/before vs evidence/recovered (must match). evidence/after preserved.'
