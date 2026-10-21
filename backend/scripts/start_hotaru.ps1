param([switch]$NoBrowser, [switch]$FunctionsOnly)
function Test-ExpectedProcess([string]$ActualExe, [string]$Command, [string]$ExpectedExe, [string[]]$RequiredParts) {
    if (-not [string]::Equals($ActualExe, $ExpectedExe, [StringComparison]::OrdinalIgnoreCase)) { return $false }
    foreach ($part in $RequiredParts) {
        $pattern = '(?i)(?:^|["\s])' + [regex]::Escape($part) + '(?=["\s]|$)'
        if ($Command -notmatch $pattern) { return $false }
    }
    return $true
}
if ($FunctionsOnly) { return }
$ErrorActionPreference = 'Stop'
$appRoot = 'F:\HotaruAI\Open-LLM-VTuber'
$voiceRoot = 'F:\GPTSoVITS-Hotaru\GPT-SoVITS-v2pro-20250604'
$logRoot = 'F:\HotaruAI\logs'
$env:PYTHONIOENCODING = 'utf-8'
$env:NO_PROXY = 'localhost,127.0.0.1,::1'
$env:no_proxy = $env:NO_PROXY
$env:PATH = 'F:\HotaruAI\tools;' + $env:PATH
New-Item -ItemType Directory -Path $logRoot -Force | Out-Null
Add-Type -AssemblyName System.Net.Http
$localHandler = New-Object System.Net.Http.HttpClientHandler
$localHandler.UseProxy = $false
$localClient = New-Object System.Net.Http.HttpClient($localHandler)
$localClient.Timeout = [TimeSpan]::FromSeconds(3)

function Test-LocalService([int]$Port, [string]$ExpectedExe, [string[]]$RequiredParts) {
    $listeners = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
    if ($listeners.Count -eq 0) { return $false }
    foreach ($ownerId in ($listeners.OwningProcess | Select-Object -Unique)) {
        $owner = Get-CimInstance Win32_Process -Filter "ProcessId=$ownerId"
        if (-not $owner -or -not (Test-ExpectedProcess $owner.ExecutablePath $owner.CommandLine $ExpectedExe $RequiredParts) -or
            @($listeners | Where-Object LocalAddress -ne '127.0.0.1').Count -gt 0) {
            throw "Port $Port is used by another application. Existing processes have been preserved."
        }
    }
    return $true
}

function Wait-Ready([string]$Url, [System.Diagnostics.Process]$Process, [int]$Seconds) {
    $watch = [Diagnostics.Stopwatch]::StartNew()
    while ($watch.Elapsed.TotalSeconds -lt $Seconds) {
        try {
            $response = $localClient.GetAsync($Url).GetAwaiter().GetResult()
            $ok = $response.IsSuccessStatusCode
            $response.Dispose()
            if ($ok) { return }
        } catch { }
        if ($Process -and $Process.HasExited -and $Process.ExitCode -ne 0) {
            throw "Service process exited. See $logRoot."
        }
        Start-Sleep -Milliseconds 800
    }
    throw "Service startup timed out. See $logRoot."
}

try {
    $voiceParts = @("$voiceRoot\api_v2.py", '-a 127.0.0.1', '-p 9880', "-c $appRoot\private\hotaru-tts.yaml")
    if (-not (Test-LocalService 9880 "$voiceRoot\runtime\python.exe" $voiceParts)) {
        $env:PYTHONPATH = "$voiceRoot;$voiceRoot\GPT_SoVITS"
        $env:version = 'v2ProPlus'
        $voice = Start-Process -FilePath "$voiceRoot\runtime\python.exe" -ArgumentList @(
            "$voiceRoot\api_v2.py", '-a', '127.0.0.1', '-p', '9880', '-c', "$appRoot\private\hotaru-tts.yaml"
        ) -WorkingDirectory $voiceRoot -WindowStyle Hidden -PassThru `
            -RedirectStandardOutput "$logRoot\voice.stdout.log" -RedirectStandardError "$logRoot\voice.stderr.log"
    }
    Wait-Ready 'http://127.0.0.1:9880/openapi.json' $voice 180
    $appExe = ((Get-Content 'F:\HotaruAI\runtime\pyvenv.cfg' | Where-Object {$_ -like 'executable = *'}) -replace '^executable = ', '').Trim()
    if (-not (Test-LocalService 12393 $appExe @("$appRoot\hotaru_runtime.py"))) {
        $env:PYTHONPATH = $appRoot
        $app = Start-Process -FilePath 'F:\HotaruAI\runtime\Scripts\python.exe' -ArgumentList @("$appRoot\hotaru_runtime.py") `
            -WorkingDirectory $appRoot -WindowStyle Hidden -PassThru `
            -RedirectStandardOutput "$logRoot\app.stdout.log" -RedirectStandardError "$logRoot\app.stderr.log"
    }
    Wait-Ready 'http://127.0.0.1:12393/' $app 180
    Write-Host 'Hotaru is ready: http://127.0.0.1:12393/'
    if (-not $NoBrowser) { Start-Process 'http://127.0.0.1:12393/' }
} finally {
    $localClient.Dispose()
    $localHandler.Dispose()
}
