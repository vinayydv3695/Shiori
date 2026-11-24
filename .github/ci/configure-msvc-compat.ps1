$ErrorActionPreference = 'Stop'

$header = (Resolve-Path (Join-Path $PSScriptRoot '../../src-tauri/native/msvc-compat.h')).Path.Replace('\', '/')
foreach ($name in @('CFLAGS', 'CXXFLAGS')) {
    $existing = [Environment]::GetEnvironmentVariable($name)
    "$name=$existing /FI`"$header`"" | Out-File -FilePath $env:GITHUB_ENV -Encoding utf8 -Append
}
