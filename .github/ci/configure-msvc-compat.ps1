$ErrorActionPreference = 'Stop'

$nativeDir = (Resolve-Path (Join-Path $PSScriptRoot '../../src-tauri/native')).Path.Replace('\', '/')

# NOTE: Do NOT set or overwrite $env:INCLUDE here. Overwriting INCLUDE breaks
# libclang / bindgen's automatic discovery of the Windows SDK (UCRT headers like stdio.h).
# Instead, pass /I and /FI flags directly via CFLAGS and CXXFLAGS for MSVC and CMake.
foreach ($name in @('CFLAGS', 'CXXFLAGS')) {
    $existing = [Environment]::GetEnvironmentVariable($name)
    $val = if ($existing) { "$existing /I$nativeDir /FImsvc-compat.h" } else { "/I$nativeDir /FImsvc-compat.h" }
    "$name=$val" | Out-File -FilePath $env:GITHUB_ENV -Encoding utf8 -Append
}
