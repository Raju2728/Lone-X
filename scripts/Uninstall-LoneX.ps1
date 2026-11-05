[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
param([switch]$RemoveUserData)

$ErrorActionPreference = 'Stop'
# This portable uninstaller only removes the verified extracted package containing it.
$installRoot = [IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\')
$packageFile = Join-Path $installRoot 'resources\app\package.json'
$programFile = Join-Path $installRoot 'Lone X.exe'
if (!(Test-Path -LiteralPath $packageFile -PathType Leaf) -or !(Test-Path -LiteralPath $programFile -PathType Leaf)) {
    throw 'Run this script from the extracted Lone X folder containing Lone X.exe and resources\app.'
}
$package = Get-Content -Raw -LiteralPath $packageFile | ConvertFrom-Json
if ($package.name -ne 'lone-x' -or $package.productName -ne 'Lone X') { throw 'This folder is not a recognized Lone X package.' }

function Assert-SafeRemoval([string]$Target) {
    $resolved = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $Target).ProviderPath).TrimEnd('\')
    if ($resolved -ne $Target -or $resolved -eq [IO.Path]::GetPathRoot($resolved).TrimEnd('\')) { throw 'Refusing an unsafe removal path.' }
    foreach ($protected in @($env:USERPROFILE, $env:APPDATA, $env:LOCALAPPDATA, $env:SystemRoot, $env:ProgramFiles, ${env:ProgramFiles(x86)}, $env:ProgramData)) {
        if ($protected -and $resolved -eq [IO.Path]::GetFullPath($protected).TrimEnd('\')) { throw 'Refusing to remove a system or profile directory.' }
    }
    # Do not follow junctions or symbolic links during recursive removal.
    $pending = New-Object 'System.Collections.Generic.Stack[string]'
    $pending.Push($resolved)
    while ($pending.Count -gt 0) {
        $folder = $pending.Pop()
        if ((Get-Item -LiteralPath $folder -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'A linked directory was found. Remove the link manually before uninstalling.' }
        foreach ($entry in Get-ChildItem -LiteralPath $folder -Force) {
            if ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'A linked file or folder was found. Remove the link manually before uninstalling.' }
            if ($entry.PSIsContainer) { $pending.Push($entry.FullName) }
        }
    }
}

Assert-SafeRemoval $installRoot
$profileTargets = @()
if ($RemoveUserData) {
    if (!$env:APPDATA) { throw 'Windows application data location is unavailable.' }
    $profileBase = [IO.Path]::GetFullPath($env:APPDATA).TrimEnd('\')
    foreach ($profileName in @('Lone X', 'lone-x')) {
        $target = [IO.Path]::GetFullPath((Join-Path $profileBase $profileName))
        if ([IO.Path]::GetDirectoryName($target) -ne $profileBase) { throw 'Invalid profile directory.' }
        if (Test-Path -LiteralPath $target) { Assert-SafeRemoval $target; $profileTargets += $target }
    }
}

Write-Host 'This removes the extracted Lone X application and its bundled Ollama runtime and models.'
Write-Host 'Standalone Ollama, other installed applications, personal project files and downloads outside this folder are kept.'
if (!$RemoveUserData) { Write-Host 'Local accounts, chats and preferences are kept. Use -RemoveUserData to remove them too.' }
$targets = @($installRoot) + $profileTargets
if ($PSCmdlet.ShouldProcess(($targets -join ', '), 'Close Lone X and remove these folders')) {
    # Release this PowerShell process's working-directory handle before removal.
    Set-Location -LiteralPath ([IO.Path]::GetTempPath())
    [Environment]::CurrentDirectory = [IO.Path]::GetTempPath()
    $prefix = $installRoot + [IO.Path]::DirectorySeparatorChar
    foreach ($process in Get-Process) {
        $executable = $null
        try { $executable = $process.Path } catch { continue }
        if ($executable -and $executable.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
            Stop-Process -Id $process.Id -ErrorAction Stop
            $process.WaitForExit(10000) | Out-Null
        }
    }
    # Revalidate every exact target immediately before recursive deletion.
    foreach ($target in $profileTargets) { Assert-SafeRemoval $target; Remove-Item -LiteralPath $target -Recurse -Force }
    Assert-SafeRemoval $installRoot
    Remove-Item -LiteralPath $installRoot -Recurse -Force
    Write-Host 'Lone X has been removed.'
}
