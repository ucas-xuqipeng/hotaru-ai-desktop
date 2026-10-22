param([string]$Target, [Parameter(Mandatory=$true)][string]$BackupName)
$ErrorActionPreference = 'Stop'
if (-not $Target) { $Target = Read-Host 'Path to your COMPLETE Hotaru portable application folder' }
$Target = (Resolve-Path -LiteralPath $Target).Path
if ($BackupName -notmatch '^(desktop-pet-\d{8}|pet-update-\d{8}-\d{6})$') { throw 'Invalid backup name.' }
$backup = Join-Path $Target ('data\backups\' + $BackupName)
if (-not (Test-Path -LiteralPath (Join-Path $backup 'app\main.cjs')) -or -not (Test-Path -LiteralPath (Join-Path $backup 'frontend\index.html'))) { throw 'Incomplete backup.' }
$running = Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($Target + '\', [StringComparison]::OrdinalIgnoreCase) }
if ($running) { throw 'Close Hotaru before restoring the backup.' }
Copy-Item -Path (Join-Path $backup 'app\*') -Destination (Join-Path $Target 'resources\app') -Recurse -Force
Copy-Item -Path (Join-Path $backup 'frontend\*') -Destination (Join-Path $Target 'backend\frontend') -Recurse -Force
Write-Host 'Restored the original app shell and frontend. Shared assets and configuration were not changed.'
