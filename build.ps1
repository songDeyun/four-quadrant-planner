$ErrorActionPreference = 'Stop'
$projectDir = $PSScriptRoot
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) {
    $compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe'
}
if (-not (Test-Path -LiteralPath $compiler)) {
    throw 'The .NET Framework C# compiler was not found.'
}
$icon = Join-Path $projectDir '四象限计划.ico'
$output = Join-Path $projectDir '四象限计划.exe'
$source = Join-Path $projectDir 'desktop\Launcher.cs'
& $compiler /nologo /target:winexe /reference:System.Windows.Forms.dll "/win32icon:$icon" "/out:$output" $source
if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }
Write-Output "Built: $output"
