@echo off
rem ==============================================================================
rem AI Bridge Windows Agent — Double-Click Setup Launcher (Root)
rem ==============================================================================
setlocal EnableDelayedExpansion

set SCRIPT_DIR=%~dp0
set PS_SCRIPT=%SCRIPT_DIR%deployment\windows\Install-AIBridge.ps1

echo ==============================================================================
echo                      AI Bridge Windows Setup
echo ==============================================================================

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PS_SCRIPT%" %*
set EXIT_CODE=%ERRORLEVEL%

if %EXIT_CODE% NEQ 0 (
    echo [AI Bridge] Installation finished with code %EXIT_CODE%.
    pause
)
exit /b %EXIT_CODE%

