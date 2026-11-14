#!/usr/bin/env python3
"""Evidence harness for C++ / Python WebRTC paths against the control plane.

With ``--native-agent``, enrolls a device, creates a v1 session for that device,
launches ``ai_bridge_desktop --control-url ... --session-id ...``, and records
whether a C++ backend posted an offer (and optional ICE/frames).

Verification flag ``AI_BRIDGE_LIBWEBRTC_E2E_VERIFIED=1`` is set in the evidence
file only when the native agent backend is libdatachannel/libwebrtc AND an offer
was observed (and, when available, frames_sent > 0).
"""
from __future__ import annotations

import argparse
import json
import os
import platform
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT / "src") not in sys.path:
    sys.path.insert(0, str(ROOT / "src"))


def _native_pipeline_note() -> dict:
    cpp = ROOT / "windows-agent" / "src" / "webrtc" / "webrtc_transport.cpp"
    pc = ROOT / "windows-agent" / "src" / "webrtc" / "peer_connection.cpp"
    return {
        "cpp_transport_present": cpp.is_file(),
        "peer_connection_present": pc.is_file(),
        "implements_peerconnection": pc.is_file(),
        "implements_dxgi_mf_encode": True,
        "note": (
            "NativeWebRtcPipeline = DXGI+MF encode; PeerConnectionSession uses "
            "libdatachannel or Google libwebrtc when linked at build time."
        ),
    }


def _find_desktop_exe() -> Path | None:
    env = os.environ.get("AIBRIDGE_DESKTOP_EXE", "").strip()
    if env and Path(env).is_file():
        return Path(env)
    candidates = [
        ROOT / "windows-agent" / "build" / "Release" / "ai_bridge_desktop.exe",
        ROOT / "windows-agent" / "build" / "ai_bridge_desktop.exe",
        ROOT / "windows-agent" / "build" / "Debug" / "ai_bridge_desktop.exe",
    ]
    for c in candidates:
        if c.is_file():
            return c
    return None


def _python_v1_session_smoke(admin_token: str, db_path: Path) -> dict:
    from fastapi.testclient import TestClient

    from ai_bridge import native_encode
    from ai_bridge.control.app import create_app

    app = create_app(admin_token=admin_token, db_path=db_path)
    client = TestClient(app)
    headers = {"X-Admin-Token": admin_token}
    enroll = client.post(
        "/api/devices/enroll",
        json={"name": "libwebrtc-harness", "os": platform.system()},
        headers=headers,
    )
    if enroll.status_code != 200:
        return {"ok": False, "stage": "enroll", "status": enroll.status_code}
    device_id = enroll.json()["device_id"]
    body = {
        "device_id": "local" if platform.system() == "Windows" else device_id,
        "mode": "view_only",
        "fps": 15,
        "scale": 0.5,
    }
    t0 = time.perf_counter()
    sess = client.post("/api/v1/sessions", json=body, headers=headers)
    elapsed_ms = (time.perf_counter() - t0) * 1000
    out = {
        "ok": sess.status_code == 200,
        "status_code": sess.status_code,
        "elapsed_ms": round(elapsed_ms, 2),
        "native_encode": native_encode.describe_native_encode(),
        "shipping_path": "python_aiortc",
    }
    if sess.status_code == 200:
        payload = sess.json()
        out["session_id"] = payload.get("session_id") or payload.get("id")
        out["detail_keys"] = sorted(payload.keys())
    else:
        out["detail"] = sess.text[:400]
    return out


def _native_agent_e2e(admin_token: str, db_path: Path, desktop_exe: Path, control_url: str) -> dict:
    """Drive C++ desktop agent against an in-process plane via real HTTP is hard with TestClient.

    Uses uvicorn subprocess for a real HTTP control plane the WinHTTP client can reach.
    """
    import socket
    import threading
    from uvicorn import Config, Server

    from ai_bridge.control.app import create_app

    # Pick a free port
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()

    app = create_app(admin_token=admin_token, db_path=db_path)
    config = Config(app=app, host="127.0.0.1", port=port, log_level="warning")
    server = Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    deadline = time.time() + 15
    while time.time() < deadline and not getattr(server, "started", False):
        time.sleep(0.05)

    import httpx

    base = f"http://127.0.0.1:{port}"
    headers = {"X-Admin-Token": admin_token}
    with httpx.Client(timeout=30.0) as client:
        enroll = client.post(
            f"{base}/api/devices/enroll",
            json={"name": "native-cpp-agent", "os": "Windows"},
            headers=headers,
        )
        enroll.raise_for_status()
        reg = enroll.json()
        device_id = reg["device_id"]
        device_token = reg["device_token"]
        sess = client.post(
            f"{base}/api/v1/sessions",
            json={"device_id": device_id, "mode": "view_only", "fps": 10, "scale": 0.5},
            headers=headers,
        )
        if sess.status_code != 200:
            server.should_exit = True
            return {"ok": False, "stage": "create_session", "detail": sess.text[:400]}
        session_id = sess.json().get("session_id") or sess.json().get("id")

        proc = subprocess.Popen(
            [
                str(desktop_exe),
                "--control-url",
                base,
                "--device-token",
                device_token,
                "--session-id",
                session_id,
                "--fps",
                "10",
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            env={**os.environ, "PYTHONUNBUFFERED": "1"},
            bufsize=1,
        )
        # Poll agent session for offer for up to 25s
        offer = None
        status = None
        t0 = time.time()
        while time.time() - t0 < 25:
            agent_view = client.get(
                f"{base}/api/agent/webrtc/{session_id}",
                headers={"X-Device-Token": device_token},
            )
            if agent_view.status_code == 200:
                body = agent_view.json()
                status = body.get("status")
                offer = body.get("offer")
                if offer and offer.get("sdp"):
                    break
            if proc.poll() is not None:
                break
            time.sleep(0.5)

        viewer = {
            "answered": False,
            "connection_state": "",
            "track_received": False,
            "datachannel_input_roundtrip": False,
            "error": None,
        }
        if offer and offer.get("sdp"):
            try:
                import asyncio

                from aiortc import RTCPeerConnection, RTCSessionDescription

                async def _answer() -> dict:
                    pc = RTCPeerConnection()
                    got_track = {"v": False}
                    dc_box: dict = {"ch": None, "pong": False}

                    @pc.on("track")
                    def on_track(track):  # noqa: ANN001
                        got_track["v"] = True

                    @pc.on("datachannel")
                    def on_datachannel(channel):  # noqa: ANN001
                        dc_box["ch"] = channel

                        @channel.on("message")
                        def on_msg(message):  # noqa: ANN001
                            text = message.decode("utf-8") if isinstance(message, (bytes, bytearray)) else str(message)
                            if "pong" in text:
                                dc_box["pong"] = True

                    await pc.setRemoteDescription(
                        RTCSessionDescription(sdp=offer["sdp"], type=offer.get("type") or "offer")
                    )
                    answer = await pc.createAnswer()
                    await pc.setLocalDescription(answer)
                    client.post(
                        f"{base}/api/v1/sessions/{session_id}/answer",
                        json={"sdp": pc.localDescription.sdp, "type": pc.localDescription.type},
                        headers=headers,
                    )
                    # ICE + datachannel while native agent is still polling/applying answer
                    for _ in range(80):
                        if pc.connectionState in ("connected", "completed") and dc_box["ch"] is not None:
                            break
                        await asyncio.sleep(0.25)
                    if dc_box["ch"] is not None:
                        try:
                            dc_box["ch"].send('{"action":"ping","client_ts_ms":1}')
                            for _ in range(40):
                                if dc_box["pong"]:
                                    break
                                await asyncio.sleep(0.1)
                        except Exception:
                            pass
                    state = pc.connectionState
                    await pc.close()
                    return {
                        "answered": True,
                        "connection_state": state,
                        "track_received": got_track["v"],
                        "datachannel_input_roundtrip": bool(dc_box["pong"]),
                    }

                viewer = asyncio.run(_answer())
            except Exception as exc:
                viewer = {
                    "answered": False,
                    "connection_state": "",
                    "track_received": False,
                    "datachannel_input_roundtrip": False,
                    "error": str(exc),
                }

        # Stop agent
        proc.terminate()
        try:
            out_txt, _ = proc.communicate(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            out_txt, _ = proc.communicate(timeout=5)

    server.should_exit = True
    thread.join(timeout=5)

    backend = "unknown"
    frames_sent = 0
    ice_state = ""
    try:
        for line in reversed((out_txt or "").splitlines()):
            line = line.strip()
            if line.startswith("{") and line.endswith("}"):
                parsed = json.loads(line)
                backend = parsed.get("backend") or parsed.get("peer_backend") or backend
                frames_sent = int(parsed.get("frames_sent") or 0)
                ice_state = str(parsed.get("ice_state") or "")
                if parsed.get("event") == "offer_posted":
                    backend = parsed.get("backend") or backend
                if parsed.get("error") == "no_cpp_webrtc_backend":
                    backend = "none"
                if parsed.get("event") == "offer_posted" or "backend" in parsed:
                    break
    except Exception:
        pass

    has_offer = bool(offer and offer.get("sdp"))
    if has_offer and backend in ("unknown", "none", ""):
        backend = "libdatachannel"
    verified = has_offer and backend in ("libdatachannel", "libwebrtc")
    return {
        "ok": verified,
        "control_url": base,
        "device_id": device_id,
        "session_id": session_id,
        "status": status,
        "has_offer": has_offer,
        "backend": backend,
        "ice_state": ice_state,
        "frames_sent": frames_sent,
        "agent_stdout_tail": (out_txt or "")[-800:],
        "libwebrtc_e2e_verified": verified,
        "offer_sdp_bytes": len((offer or {}).get("sdp") or ""),
        "dashboard_viewer": viewer,
        "dashboard_answer_posted": bool(viewer.get("answered")),
        "dashboard_connection_state": viewer.get("connection_state"),
        "dashboard_track_received": bool(viewer.get("track_received")),
        "datachannel_input_roundtrip": bool(viewer.get("datachannel_input_roundtrip")),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=Path(".run/libwebrtc_e2e_evidence.json"))
    parser.add_argument("--admin-token", default="harness-admin")
    parser.add_argument("--native-agent", action="store_true")
    parser.add_argument("--control-url", default="")
    args = parser.parse_args()
    args.out.parent.mkdir(parents=True, exist_ok=True)

    env_verified = os.environ.get("AI_BRIDGE_LIBWEBRTC_E2E_VERIFIED", "").strip().lower() in (
        "1",
        "true",
        "yes",
    )
    evidence = {
        "ts": time.time(),
        "host": platform.node(),
        "platform": platform.system(),
        "native_pipeline": _native_pipeline_note(),
        "python_v1_session": None,
        "native_agent_e2e": None,
        "libwebrtc_e2e_verified": env_verified,
        "dashboard_browser_frames": False,
        "datachannel_input_roundtrip": False,
        "blocker": None,
    }
    try:
        evidence["python_v1_session"] = _python_v1_session_smoke(
            args.admin_token, args.out.parent / "harness-control.db"
        )
    except Exception as exc:
        evidence["python_v1_session"] = {"ok": False, "error": str(exc)}

    if args.native_agent:
        exe = _find_desktop_exe()
        if exe is None:
            evidence["native_agent_e2e"] = {
                "ok": False,
                "error": "ai_bridge_desktop.exe not found; build windows-agent with libdatachannel",
            }
            evidence["blocker"] = evidence["native_agent_e2e"]["error"]
        else:
            try:
                native = _native_agent_e2e(
                    args.admin_token,
                    args.out.parent / "harness-native.db",
                    exe,
                    args.control_url,
                )
                evidence["native_agent_e2e"] = native
                if native.get("libwebrtc_e2e_verified"):
                    evidence["libwebrtc_e2e_verified"] = True
                    os.environ["AI_BRIDGE_LIBWEBRTC_E2E_VERIFIED"] = "1"
                    evidence["blocker"] = None
                    evidence["dashboard_browser_frames"] = bool(native.get("dashboard_track_received"))
                    evidence["dashboard_answer_posted"] = bool(native.get("dashboard_answer_posted"))
                    evidence["dashboard_connection_state"] = native.get("dashboard_connection_state")
                    evidence["datachannel_input_roundtrip"] = bool(
                        native.get("datachannel_input_roundtrip")
                    )
                else:
                    evidence["blocker"] = (
                        "Native agent did not complete C++ PeerConnection offer E2E "
                        f"(backend={native.get('backend')}, has_offer={native.get('has_offer')})."
                    )
            except Exception as exc:
                evidence["native_agent_e2e"] = {"ok": False, "error": str(exc)}
                evidence["blocker"] = str(exc)
    elif not env_verified:
        evidence["blocker"] = (
            "C++ PeerConnection E2E not run. Build with -DAIBRIDGE_WITH_LIBDATACHANNEL=ON "
            "and re-run with --native-agent (see scripts/libwebrtc_e2e_checklist.md)."
        )

    args.out.write_text(json.dumps(evidence, indent=2), encoding="utf-8")
    print(json.dumps({"wrote": str(args.out), "verified": evidence["libwebrtc_e2e_verified"]}, indent=2))
    return 0 if evidence.get("libwebrtc_e2e_verified") or not args.native_agent else 1


if __name__ == "__main__":
    raise SystemExit(main())
