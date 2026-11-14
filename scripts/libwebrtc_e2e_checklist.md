# C++ libwebrtc E2E with dashboard (residual checklist)

Shipping path today: Python `aiortc` + PyAV (`webrtc_stream.py`). Optional
`ai_bridge_native.dll` only runs H.264 encode **timing** smoke.

**In-tree gap:** `windows-agent/.../webrtc_transport.*` (`NativeWebRtcPipeline`) is
DXGI capture + Media Foundation H.264 encode only — **no** libwebrtc
`PeerConnection`, SDP, ICE, or RTP. Dashboard Live Desktop talks to the Python
plane path.

## In-tree C++ PeerConnection path

- `http_signaling.cpp` — WinHTTP client for `/api/agent/webrtc/*`
- `peer_connection.cpp` — `PeerConnectionSession` via **libdatachannel**
  (`-DAIBRIDGE_WITH_LIBDATACHANNEL=ON`) or Google libwebrtc
  (`-DAIBRIDGE_WITH_LIBWEBRTC=ON -DAIBRIDGE_LIBWEBRTC_ROOT=...`)
- `ai_bridge_desktop --control-url URL --device-token TOK --session-id ID`

CI job: `windows-native-webrtc` builds with libdatachannel and runs the harness.

## Local / CI evidence harness

```sh
cmake -B windows-agent/build -DAIBRIDGE_WITH_LIBDATACHANNEL=ON
cmake --build windows-agent/build --config Release --target ai_bridge_desktop
python scripts/libwebrtc_e2e_harness.py --out .run/libwebrtc_e2e_evidence.json --native-agent
```

`libwebrtc_e2e_verified` becomes true when the native agent backend is
`libdatachannel`/`libwebrtc` and a signaling **offer** is observed on the plane.

## Still required for full dashboard browser E2E

1. Offer/answer + ICE connected (harness covers offer; answer needs a viewer PC).
2. Video frames rendered in the dashboard browser.
3. Mouse/keyboard datachannel round-trip.
4. Optionally set `AI_BRIDGE_LIBWEBRTC_E2E_VERIFIED=1` for operator-attested full UI E2E.

Until a C++ backend is linked and the harness passes, `shipping_path=python_aiortc`
and `libwebrtc_e2e=false` remain the honest defaults.
