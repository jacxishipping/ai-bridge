# AI Bridge Windows Agent — Installation Guide

This directory contains the complete Windows installer application, provisioning scripts, and dependency definitions for running the AI Bridge Windows Agent.

## Included Packages

The installer automatically configures an isolated virtual environment and provisions all required packages:

| Category | Package | Purpose |
| :--- | :--- | :--- |
| **Real-time WebRTC** | `aiortc>=1.8.0` | Peer-to-peer low-latency WebRTC desktop media streaming |
| **Media Codecs** | `av>=11.0.0` | Hardware-accelerated PyAV video frame encoding (H.264/VP8) |
| **Desktop Vision** | `Pillow>=10.0.0` | High-performance screenshot capture, cropping, and UI grounding |
| **Telemetry** | `psutil>=5.9.0` | Real-time CPU, RAM, disk, and network hardware metrics |
| **Protocol / API** | `fastapi`, `uvicorn`, `pydantic`, `httpx` | Robust MCP / HTTP client communication |
| **Security** | `cryptography>=42.0.0` | Device token signing, signature verification, and TLS |
| **System Tray** | `pystray>=0.19.5` | Minimized notification area tray icon and menu controls |

---

## Installation Methods

### Method 1: Graphical Setup Wizard (Recommended)
Double-click `Setup.bat` in the repository root (or in `deployment/windows/Setup.bat`).

This launches the Fluent 2 dark-theme Setup Wizard:
1. Validates Python runtime (Python 3.11+).
2. Allows testing the Control Server URL with real-time ping latency.
3. Automatically creates the virtual environment.
4. Installs all required wheels/packages.
5. Generates Desktop & Start Menu shortcuts with the AI Bridge icon.
6. Configures auto-start with Windows login (HKCU).

Or launch from command line:
```powershell
python deployment/windows/installer_gui.py
```

### Method 2: 1-Click PowerShell (Unattended / Scripted)
Run an elevated or unprivileged PowerShell session with ExecutionPolicy bypass:

```powershell
powershell -ExecutionPolicy Bypass -File .\deployment\windows\Install-AIBridge.ps1 `
    -ControlUrl "https://jxiptvplayer.app" `
    -DeviceToken "YOUR_DEVICE_TOKEN" `
    -AutoStart `
    -CreateShortcuts
```

#### Parameters:
* `-ControlUrl <string>`: The URL of the control plane (default: `https://jxiptvplayer.app`).
* `-DeviceToken <string>`: The device enrollment token obtained from the dashboard.
* `-InstallDir <string>`: Target directory for the virtualenv (default: repository root).
* `-AutoStart`: Registers the agent to start on Windows login under `HKCU:\Software\Microsoft\Windows\CurrentVersion\Run`.
* `-CreateShortcuts`: Creates Desktop and Start Menu `.lnk` shortcuts.
* `-HeadlessService`: Registers a Windows Scheduled Task instead of a GUI client.
* `-Silent`: Runs completely headlessly without GUI prompts.

---

## Verifying Package Installation

You can verify that all modules are properly installed and discoverable at any time:

```powershell
python deployment/windows/installer_gui.py --verify-only
```

Sample output:
```
Verifying installed packages in current Python environment...
  [OK] aiortc WebRTC Core (aiortc)
  [OK] PyAV Video Codec Engine (av)
  [OK] Pillow Desktop Vision (PIL)
  [OK] Hardware & Process Telemetry (psutil)
  [OK] Pydantic Schemas & Typing (pydantic)
  [OK] Security & Token Cryptography (cryptography)
  [OK] FastAPI Framework (fastapi)
  [OK] Uvicorn Engine (uvicorn)
  [OK] Windows System Tray Integration (pystray)
Package verification SUCCEEDED
```

---

## Uninstallation

To cleanly remove AI Bridge, autostart entries, and shortcuts:

Double-click `deployment\windows\Uninstall.bat` or run:
```powershell
powershell -ExecutionPolicy Bypass -File .\deployment\windows\Uninstall-AIBridge.ps1 -PurgeConfig
```

