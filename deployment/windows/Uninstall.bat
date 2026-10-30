@echo off
rem ==============================================================================
rem AI Bridge Windows Agent — Double-Click Uninstaller
rem ==============================================================================
setlocal EnableDelayedExpansion

set SCRIPT_DIR=%~dp0
set PS_SCRIPT=%SCRIPT_DIR%Uninstall-AIBridge.ps1

echo [AI Bridge] Launching Windows Uninstaller...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PS_SCRIPT%" %*
pause

