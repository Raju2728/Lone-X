$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath $PSScriptRoot).Path
$executable = Join-Path $root 'Lone X.exe'
$icon = Join-Path $root 'Lone-X.ico'
if (!(Test-Path -LiteralPath $executable -PathType Leaf) -or !(Test-Path -LiteralPath $icon -PathType Leaf)) {
    throw 'Extract the entire Lone X ZIP before creating its shortcut.'
}
$manifest = Get-Content -LiteralPath (Join-Path $root 'resources/app/package.json') -Raw | ConvertFrom-Json
if ($manifest.name -ne 'lone-x' -or $manifest.productName -ne 'Lone X') { throw 'Unrecognised application folder.' }
$destination = Join-Path ([Environment]::GetFolderPath('DesktopDirectory')) 'Lone X.lnk'
if (Test-Path -LiteralPath $destination) {
    if ((Read-Host "Replace the existing shortcut at $destination ? Type YES") -cne 'YES') { exit 0 }
}
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($destination)
$shortcut.TargetPath = $executable
$shortcut.WorkingDirectory = $root
$shortcut.IconLocation = "$icon,0"
$shortcut.Description = 'Lone X'
$shortcut.Save()
Write-Host "Created $destination pointing to $executable"
