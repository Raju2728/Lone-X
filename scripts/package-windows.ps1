$ErrorActionPreference = 'Stop'
Push-Location (Split-Path -Parent $PSScriptRoot)
try {
    npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Build failed' }

    $runtime = Join-Path (Resolve-Path node_modules) 'electron/dist'
    if (!(Test-Path (Join-Path $runtime 'electron.exe'))) {
        throw 'Install the Electron Windows runtime before packaging.'
    }
    $stage = New-Item -ItemType Directory (Join-Path (Resolve-Path node_modules) ("lone-x-package-" + [guid]::NewGuid()))
    try {
        $bundle = New-Item -ItemType Directory (Join-Path $stage.FullName 'Lone X')
        Get-ChildItem -LiteralPath $runtime | Copy-Item -Destination $bundle.FullName -Recurse
        Rename-Item -LiteralPath (Join-Path $bundle.FullName 'electron.exe') -NewName 'Lone X.exe'
        Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Windows-Setup.txt') -Destination $bundle.FullName
        $app = New-Item -ItemType Directory (Join-Path $bundle.FullName 'resources/app')
        Copy-Item desktop -Destination $app.FullName -Recurse
        $dependencies = New-Item -ItemType Directory (Join-Path $app.FullName 'node_modules')
        Copy-Item node_modules/nodemailer -Destination $dependencies.FullName -Recurse
        $revision = git rev-parse HEAD
        if ($LASTEXITCODE -eq 0 -and $revision -match '^[a-f0-9]{40}$') {
            @{ revision = $revision } | ConvertTo-Json -Compress | Set-Content -Encoding ascii (Join-Path $app.FullName 'build-info.json')
        }
        $web = New-Item -ItemType Directory (Join-Path $app.FullName 'dist')
        Get-ChildItem dist | Where-Object Name -ne 'downloads' | Copy-Item -Destination $web.FullName -Recurse
        $assets = New-Item -ItemType Directory (Join-Path $app.FullName 'public')
        Copy-Item public/logo.png -Destination $assets.FullName
        '{"name":"lone-x","productName":"Lone X","main":"desktop/main.cjs"}' | Set-Content -Encoding ascii (Join-Path $app.FullName 'package.json')

        $ollamaSource = if ($env:LONEX_OLLAMA_RUNTIME_DIR) { $env:LONEX_OLLAMA_RUNTIME_DIR } else { Join-Path $env:LOCALAPPDATA 'Programs/Ollama' }
        $modelSource = if ($env:OLLAMA_MODELS) { $env:OLLAMA_MODELS } else { Join-Path $env:USERPROFILE '.ollama/models' }
        $manifestPath = 'manifests/registry.ollama.ai/library/qwen2.5/0.5b'
        $manifestSource = Join-Path $modelSource $manifestPath
        $manifest = Get-Content -Raw -LiteralPath $manifestSource | ConvertFrom-Json
        $bundled = New-Item -ItemType Directory (Join-Path $app.FullName 'ollama')
        Copy-Item -LiteralPath (Join-Path $ollamaSource 'ollama.exe') -Destination $bundled.FullName
        Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Ollama-LICENSE.txt') -Destination $bundled.FullName
        $cpuLibs = New-Item -ItemType Directory -Force (Join-Path $bundled.FullName 'lib/ollama')
        Get-ChildItem -LiteralPath (Join-Path $ollamaSource 'lib/ollama') -File | Copy-Item -Destination $cpuLibs.FullName
        $destination = Join-Path $bundled.FullName 'models'
        $manifestTarget = Join-Path $destination $manifestPath
        New-Item -ItemType Directory -Force (Split-Path -Parent $manifestTarget) | Out-Null
        Copy-Item -LiteralPath $manifestSource -Destination $manifestTarget
        $blobs = New-Item -ItemType Directory (Join-Path $destination 'blobs')
        foreach ($layer in (@($manifest.config) + @($manifest.layers))) {
            if ($layer.digest -notmatch '^sha256:[0-9a-f]{64}$') { throw 'Invalid Ollama blob digest' }
            $name = $layer.digest.Replace(':', '-')
            $source = Join-Path $modelSource "blobs/$name"
            if ((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash -ne $layer.digest.Substring(7)) {
                throw "Ollama blob checksum mismatch for $name"
            }
            Copy-Item -LiteralPath $source -Destination $blobs.FullName
        }

        $output = New-Item -ItemType Directory -Force public/downloads
        $archive = Join-Path $stage.FullName 'Lone-X-Windows.zip'
        tar.exe -a -cf $archive -C $stage.FullName 'Lone X'
        if ($LASTEXITCODE -ne 0) { throw 'ZIP creation failed' }
        Move-Item -LiteralPath $archive -Destination (Join-Path $output.FullName 'Lone-X-Windows.zip') -Force
        Get-FileHash (Join-Path $output.FullName 'Lone-X-Windows.zip')
    } finally {
        $root = (Resolve-Path node_modules).Path + [IO.Path]::DirectorySeparatorChar
        if ($stage.FullName.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) {
            Remove-Item -LiteralPath $stage.FullName -Recurse -Force
        }
    }
} finally {
    Pop-Location
}
