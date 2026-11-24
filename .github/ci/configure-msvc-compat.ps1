$ErrorActionPreference = 'Stop'

$nativeDir = (Resolve-Path (Join-Path $PSScriptRoot '../../src-tauri/native')).Path

# Add to INCLUDE environment variable so MSVC always finds native headers
$existingInclude = [Environment]::GetEnvironmentVariable('INCLUDE')
$newInclude = if ($existingInclude) { "$nativeDir;$existingInclude" } else { $nativeDir }
"INCLUDE=$newInclude" | Out-File -FilePath $env:GITHUB_ENV -Encoding utf8 -Append

# Force-include msvc-compat.h via CFLAGS and CXXFLAGS without quotes
foreach ($name in @('CFLAGS', 'CXXFLAGS')) {
    $existing = [Environment]::GetEnvironmentVariable($name)
    $val = if ($existing) { "$existing /I$nativeDir /FImsvc-compat.h" } else { "/I$nativeDir /FImsvc-compat.h" }
    "$name=$val" | Out-File -FilePath $env:GITHUB_ENV -Encoding utf8 -Append
}
