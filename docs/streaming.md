# Real-Time Video & Input Streaming (`docs/streaming.md`)

## 1. Video Pipeline
 Raw 1920x1080 BGRA frames at 30 FPS require ~249 MB/s before compression. AI Bridge compresses desktop frames in real time using H.264 over WebRTC:

```
Windows Desktop
  └── DXGI Desktop Duplication (GPU Texture + Dirty/Move Rects)
        └── NV12 Frame Processing
              └── Media Foundation H.264 Encoder (Hardware NVENC / QSV / AMF or Software Fallback)
                    └── WebRTC Video Track (RTP/SRTP)
                          └── Browser <video> Element
```

### Default Engineering Parameters
| Parameter | Default Value |
| :--- | :--- |
| Resolution | 1920 x 1080 (configurable scale & monitor index) |
| Frame Rate | 30 FPS |
| Codec | H.264 (`profile-level-id=42e01f`, Constrained Baseline / Main) |
| Starting Bitrate | 4.5 Mbps (adaptive 3–6 Mbps range) |
| Keyframe Interval (GOP) | 1–2 seconds (`30–60` frames) |
| Low-Latency Mode | `CODECAPI_AVLowLatencyMode = VARIANT_TRUE` |

## 2. Signaling & NAT Traversal
- **Signaling Endpoints**:
  - `POST /api/v1/sessions` — Creates a session, initializes the WebRTC peer connection, and returns the SDP offer plus configured STUN/TURN servers.
  - `POST /api/v1/sessions/{id}/answer` — Submits the browser's SDP answer.
  - `POST /api/v1/sessions/{id}/ice` — Exchanges trickled ICE candidates.
  - `WS /api/v1/ws/sessions/{id}` — Real-time bidirectional signaling WebSocket for SDP, ICE, mode changes, and telemetry updates.
- **STUN/TURN Configuration** (see `webrtc_stream.get_configured_ice_servers`):
  - `AI_BRIDGE_ICE_SERVERS` — JSON list of `{urls, username?, credential?}` (overrides others when set)
  - `AI_BRIDGE_TURN_URL` / `AI_BRIDGE_TURN_USERNAME` / `AI_BRIDGE_TURN_CREDENTIAL` — explicit TURN
  - Or ephemeral TURN via `AI_BRIDGE_TURN_HOST` + `AI_BRIDGE_TURN_SECRET` (required when `AI_BRIDGE_PROFILE=production`)
  - Default STUN: `stun:stun.l.google.com:19302` when no TURN is configured
  - Direct peer-to-peer media is preferred; TURN relay is used when NAT/firewalls block UDP

## 2b. Desktop audio (F11)
- **Default: off.** Video-only streams until operators opt in (`webrtc_stream.desktop_audio_opt_in`).
- Set `AI_BRIDGE_DESKTOP_AUDIO=1` (or `true`/`yes`) to attach `DesktopAudioTrack`. Prefers WASAPI speaker loopback via optional `soundcard` (`pip install "ai-bridge[webrtc]"`); if loopback cannot open, emits silent s16le PCM so negotiation still succeeds (`desktop_audio.py`, capabilities `capture_implemented` / `probe`).
- Task dispatch defaults to **fps=30** with optional `monitor_index` / `bitrate_kbps` (`dispatch._start_webrtc_from_task`). Canonical session create is `POST /api/v1/sessions` (dashboard Live Desktop). Legacy `POST /api/devices/{id}/desktop/webrtc/session` returns `Deprecation` headers.

## 3. Input Transport (`RTCDataChannel("input")`)
Mouse and keyboard events travel over a dedicated WebRTC DataChannel (`input`) rather than HTTP polling:
- `mouse_move`: `{ "type": "mouse_move", "x": 0.5, "y": 0.5, "normalized": true, "sequence": 1, "timestamp_ms": 1730000000000 }`
- `mouse_button`: `{ "type": "mouse_button", "action": "down" | "up" | "click" | "double_click", "button": "left" | "right" | "middle", "x": 0.5, "y": 0.5, "normalized": true }`
- `mouse_scroll`: `{ "type": "mouse_scroll", "delta_x": 0, "delta_y": -120 }`
- `key_event`: `{ "type": "key_event", "action": "down" | "up", "key": "a", "code": "KeyA" }`
- `release_all_keys`: `{ "type": "release_all_keys" }`

## 4. Stage-by-Stage Latency & Performance Telemetry
Both the native C++ agent and Python WebRTC manager measure stage-level metrics exposed on `/api/v1/sessions/{id}` and rendered in the Dashboard HUD:
- `capture_time_ms`: DXGI frame acquisition latency.
- `encode_queue_time_ms` & `encode_time_ms`: Media Foundation H.264 encoding latency.
- `encoded_frame_size_bytes`: Compressed frame size.
- `dropped_frames`: Frames skipped due to backpressure.
- `rtt_ms`: Round-trip network latency via WebRTC DataChannel `ping`/`pong` and `RTCPeerConnection.getStats()`.

