param([string]$Target)
$ErrorActionPreference = 'Stop'
if (-not $Target) { $Target = Read-Host 'Path to your COMPLETE Hotaru portable application folder' }
$Target = (Resolve-Path -LiteralPath $Target).Path
$appPackage = Join-Path $Target 'resources\app\package.json'
if (-not (Test-Path -LiteralPath $appPackage) -or -not (Test-Path -LiteralPath (Join-Path $Target 'backend\hotaru_runtime.py'))) {
  throw 'Choose the existing complete Hotaru portable application folder.'
}
$running = Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($Target + '\', [StringComparison]::OrdinalIgnoreCase) }
if ($running) { throw 'Close Hotaru before applying the update.' }
$backup = Join-Path $Target ('data\backups\pet-update-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $backup -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $Target 'resources\app') -Destination (Join-Path $backup 'app') -Recurse
Copy-Item -LiteralPath (Join-Path $Target 'backend\frontend') -Destination (Join-Path $backup 'frontend') -Recurse
Copy-Item -Path (Join-Path $PSScriptRoot 'resources\app\*') -Destination (Join-Path $Target 'resources\app') -Recurse -Force
Copy-Item -Path (Join-Path $PSScriptRoot 'backend\frontend\*') -Destination (Join-Path $Target 'backend\frontend') -Recurse -Force
Write-Host ('Updated. Original app files backed up to: ' + $backup)
Write-Host 'Voice models, Live2D assets, persona files, API configuration and chat data were not replaced.'
