@echo off
rem ==============================================================================
rem AI Bridge Windows Agent — Double-Click Setup Launcher
rem Starts the all-in-one setup wizard (installer_gui.py) on a tested Python.
rem ==============================================================================
setlocal EnableExtensions EnableDelayedExpansion

set SCRIPT_DIR=%~dp0
set PY=

for %%V in (3.12 3.13 3.14) do (
    if not defined PY (
        py -%%V -c "import sys" >nul 2>&1 && set PY=py -%%V
    )
)

if not defined PY (
    echo [AI Bridge] Python 3.12, 3.13 or 3.14 is required and was not found.
    echo             3.15 and newer are not tested, so this setup refuses to guess.
    echo             Install Python 3.12 from https://www.python.org/downloads/windows/
    pause
    exit /b 1
)

%PY% "%SCRIPT_DIR%installer_gui.py" %*
set EXIT_CODE=%ERRORLEVEL%

if %EXIT_CODE% NEQ 0 (
    echo [AI Bridge] Setup exited with code %EXIT_CODE%.
    pause
)
exit /b %EXIT_CODE%
