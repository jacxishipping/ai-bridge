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

This launches the six-step Setup Wizard:
1. Reports what is already installed and offers repair (just run it again) or
   uninstall.
2. Takes the control plane URL and device token, and can verify both live
   against `/health` and the agent task route before installing.
3. Selects a tested Python (3.12, 3.13 or 3.14). Newer builds such as 3.15 are
   refused, exactly as `install-agent.ps1` refuses them, instead of silently
   provisioning an untested interpreter.
4. Creates the virtual environment, installs every package from
   `requirements.txt`, and verifies the imports.
5. Writes `~/.ai-bridge/agent_gui.json` **without any credential**, seals the
   device token with DPAPI in `~/.ai-bridge/device.token`, and registers the
   background agent to start at sign-in (scheduled task when the wizard runs
   elevated, HKCU Run otherwise).
6. Creates shortcuts and can launch the desktop client.

Execution policy defaults to the conservative settings (no shell, no unattended
writes, tier 3 off); the policy card is where you opt in.

Or launch from command line:
```powershell
python deployment/windows/installer_gui.py
```

### Method 2: 1-Click PowerShell (Unattended / Scripted)
`Install-AIBridge.ps1` is a **compatibility shim**: it resolves a tested Python
and forwards to `installer_gui.py`, which is the only implementation. Its
parameters are translated to the wizard's own flags.

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
* `-InstallDir <string>`: Where the virtualenv is created (default: `%LOCALAPPDATA%\AIBridge`, as in the wizard).
* `-AutoStart`: Starts the desktop client at sign-in (HKCU Run).
* `-CreateShortcuts`: Creates Desktop and Start Menu `.lnk` shortcuts.
* `-HeadlessService`: Installs the background agent so it runs at sign-in under your own account.
* `-Silent`: Runs completely headlessly without GUI prompts (the wizard's `--silent`).
* `-HeadlessService`: registers the agent at sign-in as your own limited account.
  For a boot-time service install use `install-agent.ps1` instead.

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

## Building the Windows Executables

`build_exe.py` produces both artifacts with PyInstaller:

```powershell
# Setup wizard only (embeds dist\AIBridge-Agent.exe when it exists)
python deployment\windows\build_exe.py

# Tray client first, then the setup wizard that embeds it
python deployment\windows\build_exe.py --all
```

`Build-EXE.bat` forwards to the same script. Outputs land in `dist\`:

| File | Contents |
| :--- | :--- |
| `AIBridge-Agent.exe` | Standalone tray client (Python, Tk, pywin32, agent code bundled) |
| `AIBridge-Setup.exe` | Setup wizard with the tray client embedded as payload |

Both exes carry Explorer version metadata (`ProductName`, `FileDescription`,
`FileVersion`) read from `pyproject.toml`.

### Code signing (optional)

Version metadata does not create SmartScreen reputation - that requires an
Authenticode signature. The build signs both executables when signing is
configured through the environment, and skips the step otherwise:

| Variable | Required | Purpose |
| :--- | :--- | :--- |
| `AIBRIDGE_SIGN_CERT` | one of these | Path to a `.pfx`/`.p12` containing the certificate and private key |
| `AIBRIDGE_SIGN_PASSWORD` | no | Password for the PFX (omit when it has none) |
| `AIBRIDGE_SIGN_THUMBPRINT` | one of these | SHA-1 thumbprint of a certificate in the current user's store; used when `AIBRIDGE_SIGN_CERT` is unset |
| `AIBRIDGE_SIGN_TIMESTAMP_URL` | no | RFC 3161 timestamp server (default `http://timestamp.digicert.com`; set it empty to disable timestamping) |
| `AIBRIDGE_SIGNTOOL` | no | Explicit `signtool.exe` path; otherwise PATH then `Windows Kits\10\bin\*\x64` are searched |

The setup exe embeds the client *after* the client is signed, so the installed
copy keeps its signature.

Sign with a PFX file:
```powershell
$env:AIBRIDGE_SIGN_CERT = 'C:\certs\aibridge.pfx'
$env:AIBRIDGE_SIGN_PASSWORD = (Get-Content 'C:\certs\pfx-password.txt' -Raw).Trim()
python deployment\windows\build_exe.py --all
```

Sign with a certificate already installed in `Cert:\CurrentUser\My`:
```powershell
$env:AIBRIDGE_SIGN_THUMBPRINT = 'A1B2C3D4E5F6...'
python deployment\windows\build_exe.py --all
```

The build prints `[SIGN] Signed ...` and runs `signtool verify /pa` on each
artifact. Verification failures are reported as warnings, because a build host
may not trust a private CA; signing failures themselves abort the build rather
than leaving an unsigned artifact behind.

Check the result afterwards:
```powershell
Get-AuthenticodeSignature dist\AIBridge-Setup.exe | Format-List Status,SignerCertificate
signtool verify /pa /all dist\AIBridge-Agent.exe
```

Keep the PFX password out of shell history and source control: read it from a
secret store or file at build time, as in the example above.

---

## Uninstallation

To cleanly remove AI Bridge, autostart entries, and shortcuts:

Double-click `deployment\windows\Uninstall.bat` or run:
```powershell
powershell -ExecutionPolicy Bypass -File .\deployment\windows\Uninstall-AIBridge.ps1 -PurgeConfig
```

