@echo off
setlocal
set "LONEX_UNINSTALL_SCRIPT=%~dp0Uninstall-LoneX.ps1"
cd /d "%TEMP%"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%LONEX_UNINSTALL_SCRIPT%"
