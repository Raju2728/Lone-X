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
        $app = New-Item -ItemType Directory (Join-Path $bundle.FullName 'resources/app')
        Copy-Item desktop -Destination $app.FullName -Recurse
        $web = New-Item -ItemType Directory (Join-Path $app.FullName 'dist')
        Get-ChildItem dist | Where-Object Name -ne 'downloads' | Copy-Item -Destination $web.FullName -Recurse
        $assets = New-Item -ItemType Directory (Join-Path $app.FullName 'public')
        Copy-Item public/logo.png -Destination $assets.FullName
        '{"name":"lone-x","productName":"Lone X","main":"desktop/main.cjs"}' | Set-Content -Encoding ascii (Join-Path $app.FullName 'package.json')

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
