@echo off
rem ==============================================================================
rem AI Bridge Windows — Standalone EXE Compiler
rem Compiles AIBridge-Setup.exe and AIBridge-Agent.exe using PyInstaller
rem ==============================================================================
setlocal EnableDelayedExpansion

set SCRIPT_DIR=%~dp0
cd /d "%SCRIPT_DIR%..\.."

echo [AI Bridge] Building Standalone Single-File Windows Executables...
python deployment\windows\build_exe.py %*

set EXIT_CODE=%ERRORLEVEL%
if %EXIT_CODE% NEQ 0 (
    echo [AI Bridge] Build failed with code %EXIT_CODE%.
    pause
) else (
    echo [AI Bridge] Build completed successfully. Check the 'dist' folder!
)
exit /b %EXIT_CODE%
