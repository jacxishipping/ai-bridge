# Windows Agent Architecture (`windows-agent/`)

## 1. Two-Process Session Model
Windows isolates background services from interactive user desktops. To operate reliably across session changes while maintaining least privilege, the AI Bridge Windows Agent is split into two native C++20 executables plus a shared C-API library:

1. **Process A — Windows Service (`ai_bridge_service.exe`)**
   - Runs in **Session 0**.
   - Maintains outbound connection and heartbeat to the AI Bridge Backend (`/api/v1/agents/{id}/heartbeat`).
   - Collects machine-wide system metrics (`GetSystemTimes`, `GlobalMemoryStatusEx`, `GetDiskFreeSpaceExW`, `WTSQuerySessionInformationW`).
   - Hosts the ACL-restricted Named Pipe server (`\\.\pipe\AIBridgeDesktopPipe`).
   - Supervises and launches the interactive desktop agent inside the active user session.

2. **Process B — Interactive Desktop Agent (`ai_bridge_desktop.exe`)**
   - Runs inside the logged-in user's **interactive desktop session**.
   - Captures desktop frames via **DXGI Desktop Duplication API** (`IDXGIOutput1::DuplicateOutput`) and window-specific surfaces via `PrintWindow(PW_RENDERFULLCONTENT)`.
   - Encodes frames via **Media Foundation H.264** (`CLSID_CMSH264EncoderMFT` / hardware NVENC, Intel QSV, AMD AMF, or software fallback) with dynamic bitrate adjustment.
   - Injects mouse and keyboard events via the Win32 **`SendInput`** API with Per-Monitor DPI v2 awareness.
   - Synchronizes clipboard events bidirectionally over WebRTC DataChannel and REST.
   - Communicates with `ai_bridge_service.exe` over `\\.\pipe\AIBridgeDesktopPipe` using length-prefixed JSON envelopes authenticated with an HMAC-SHA256 tag.

3. **Native Shared Bridge (`ai_bridge_native.dll`)**
   - Exports a clean C ABI (`windows-agent/src/c_api.h`) used by both the native executables and the Python WebRTC/MCP runtime (`src/ai_bridge/screen_capture.py`):
     - `aibridge_capture_frame`: Full desktop DXGI capture with dirty/move rects & cursor metadata.
     - `aibridge_capture_window`: High-fidelity single-window capture by HWND.
     - `aibridge_enumerate_monitors`: Enumerates all attached displays with bounds and rotation.
     - `aibridge_encode_h264_frame` & `aibridge_set_encoder_bitrate`: Real-time H.264 encoding with dynamic bitrate adaptation.
     - `aibridge_send_mouse_move`, `aibridge_send_mouse_button`, `aibridge_send_mouse_scroll`: SendInput coordinate transformation.
     - `aibridge_send_key_event`, `aibridge_release_all_keys`: Virtual key tracking & disconnect key-up safety.
     - `aibridge_get_system_health_json`: CPU, RAM, disk, uptime, and multi-session snapshot.

## 2. Screen Capture (`windows-agent/src/capture/`)
- **Primary Backend**: DXGI Desktop Duplication (`IDXGIOutputDuplication`).
  - Extracts GPU textures (`ID3D11Texture2D`), dirty rectangles (`GetFrameDirtyRects`), move rectangles (`GetFrameMoveRects`), and cursor pointer metadata (`DXGI_OUTDUPL_POINTER_POSITION`).
  - Automatically handles `DXGI_ERROR_ACCESS_LOST` (display mode switch, UAC prompt, lock screen) and `DXGI_ERROR_DEVICE_REMOVED` / `DXGI_ERROR_DEVICE_RESET` by re-initializing the D3D11 device and duplication output.
- **Secure Desktop / UAC Handling**:
  - `DxgiCaptureEngine::IsSecureDesktopActive()` probes `OpenInputDesktop(0, FALSE, DESKTOP_READOBJECTS)` and inspects the desktop name (`Winlogon` / `Disconnect`).
  - The agent never attempts to bypass Windows User Interface Privilege Isolation (UIPI) or Secure Desktop boundaries; instead, it reports `secure_desktop_active: true` to the dashboard and MCP status tools.

## 3. Input Control (`windows-agent/src/input/`)
- Uses `SendInput` with `MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK` mapped to the `[0, 65535]` virtual desktop space across single or multiple monitors.
- Enables `DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2`.
- Tracks every held virtual key and mouse button (`keydown` / `mousedown`).
- **Disconnect Safety**: `SendInputController::ReleaseAllHeldKeys()` is invoked automatically whenever a WebRTC DataChannel closes, a session mode changes to `view_only`, or a session is terminated, preventing stuck modifier keys (`Ctrl`, `Alt`, `Shift`, `Win`).
- **Rate Limiting**: Token-bucket rate limiter caps remote input at 250 events/second.

## 4. Building and Testing
```powershell
cmake -S windows-agent -B windows-agent/build
cmake --build windows-agent/build --config Release
ctest --test-dir windows-agent/build -C Release --output-on-failure
```

