$ErrorActionPreference = 'Stop'
. 'F:\HotaruAI\Open-LLM-VTuber\scripts\start_hotaru.ps1' -FunctionsOnly
$exe = 'F:\Voice\python.exe'
$required = @('F:\Voice\api_v2.py', '-a 127.0.0.1', '-p 9880', '-c F:\HotaruAI\private\hotaru.yaml')
$good = '"F:\Voice\python.exe" F:\Voice\api_v2.py -a 127.0.0.1 -p 9880 -c F:\HotaruAI\private\hotaru.yaml'
if (-not (Test-ExpectedProcess $exe $good $exe $required)) { throw 'Expected matching process was rejected' }
if (Test-ExpectedProcess 'F:\Other\python.exe' $good $exe $required) { throw 'Wrong executable accepted' }
if (Test-ExpectedProcess $exe ($good.Replace('hotaru.yaml','other.yaml')) $exe $required) { throw 'Wrong weights configuration accepted' }
if (Test-ExpectedProcess $exe ($good.Replace('127.0.0.1','0.0.0.0')) $exe $required) { throw 'Non-local bind accepted' }
if (Test-ExpectedProcess $exe ($good.Replace('hotaru.yaml','hotaru.yaml.old')) $exe $required) { throw 'Partial configuration path accepted' }
Write-Output '5 launcher identity checks passed.'
