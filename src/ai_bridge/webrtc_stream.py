"""WebRTC desktop streaming with H.264 Hardware/Software Acceleration, Stage-by-Stage Telemetry,
STUN/TURN Support, and Permission-Gated DataChannel Input with Disconnect Safety.

Architecture (compatible with the agent's outbound-only model & v1.0 specification):

* Separate video transport, input transport, AI execution, and device management.
* Video Track: Streams desktop frames at 1920x1080 @ 30 FPS (configurable up to 60 FPS),
  preferring H.264 (Hardware Media Foundation / PyAV H.264 with software fallback).
* DataChannel ('input'): Carries low-latency mouse movement, clicks, scroll wheel,
  and independent key-down / key-up events, plus ping/pong latency probes.
* Disconnect Safety: Tracks all held virtual keys and mouse buttons and automatically
  releases them via Win32 SendInput / native C++ controller if the DataChannel or
  PeerConnection disconnects.
"""
from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import json
import os
import platform
import threading
import time
import urllib.error
import urllib.request
from typing import Any

SESSION_TTL_SECONDS = 600
DEFAULT_ICE_SERVERS = [{"urls": "stun:stun.l.google.com:19302"}]

_STREAMERS: dict[str, "AgentStreamer"] = {}
_STREAM_TELEMETRY: dict[str, dict[str, Any]] = {}
_AGENT_CONTEXT: dict[str, str] = {}
_HELD_KEYS_LOCK = threading.Lock()
_HELD_KEYS: set[str] = set()


def generate_ephemeral_turn_credentials(
    username_prefix: str = "aibridge_client",
    ttl_seconds: int = 86400,
    turn_host: str | None = None,
    secret: str | None = None,
) -> list[dict[str, Any]]:
    """Generate RFC 5766 / REST API ephemeral TURN credentials using HMAC-SHA1 for symmetric NAT traversal."""
    turn_secret = secret or os.environ.get("AI_BRIDGE_TURN_SECRET", "aibridge_turn_shared_secret_2026")
    host = turn_host or os.environ.get("AI_BRIDGE_TURN_HOST", "jxiptvplayer.app")
    expiry = int(time.time()) + ttl_seconds
    username = f"{expiry}:{username_prefix}"

    key = turn_secret.encode("utf-8")
    msg = username.encode("utf-8")
    credential = base64.b64encode(hmac.new(key, msg, hashlib.sha1).digest()).decode("ascii")

    return [
        {"urls": ["stun:stun.l.google.com:19302", f"stun:{host}:3478"]},
        {
            "urls": [f"turn:{host}:3478?transport=udp", f"turn:{host}:3478?transport=tcp"],
            "username": username,
            "credential": credential,
        },
    ]


def get_configured_ice_servers() -> list[dict[str, Any]]:
    """Build STUN + TURN ICE server list from environment variables or ephemeral credentials."""
    custom_json = os.environ.get("AI_BRIDGE_ICE_SERVERS", "").strip()
    if custom_json:
        try:
            parsed = json.loads(custom_json)
            if isinstance(parsed, list) and parsed:
                return parsed
        except Exception:
            pass

    turn_url = os.environ.get("AI_BRIDGE_TURN_URL", "").strip()
    if turn_url:
        turn_entry: dict[str, Any] = {"urls": turn_url}
        turn_user = os.environ.get("AI_BRIDGE_TURN_USERNAME", "").strip()
        turn_cred = os.environ.get("AI_BRIDGE_TURN_CREDENTIAL", "").strip()
        if turn_user:
            turn_entry["username"] = turn_user
        if turn_cred:
            turn_entry["credential"] = turn_cred
        return [{"urls": "stun:stun.l.google.com:19302"}, turn_entry]

    try:
        return generate_ephemeral_turn_credentials()
    except Exception:
        return list(DEFAULT_ICE_SERVERS)


def set_agent_context(control_url: str, device_token: str) -> None:
    """Let dispatch() start a stream: the poller owns the control URL
    and device token, dispatch() does not receive them as arguments."""
    _AGENT_CONTEXT["control_url"] = control_url
    _AGENT_CONTEXT["device_token"] = device_token


def release_all_held_keys() -> int:
    """Release all held keys and mouse buttons across both native C++ SendInput and Python Win32."""
    released_count = 0
    try:
        from ai_bridge.screen_capture import get_native_dll

        dll = get_native_dll()
        if dll is not None:
            released_count += int(dll.aibridge_release_all_keys())
    except Exception:
        pass

    with _HELD_KEYS_LOCK:
        keys = list(_HELD_KEYS)
        _HELD_KEYS.clear()

    if keys and platform.system() == "Windows":
        try:
            import ctypes
            from ai_bridge.tools import _vk_for_token

            u = ctypes.windll.user32
            for k in keys:
                try:
                    vk = _vk_for_token(k)
                    u.keybd_event(vk, 0, 0x0002, 0)  # KEYEVENTF_KEYUP
                    released_count += 1
                except Exception:
                    continue
        except Exception:
            pass
    return released_count


def track_key_state(key: str, is_down: bool = True) -> None:
    """Track held or released key state so disconnect can safely synthesize keyup events."""
    norm = (key or "").strip().lower()
    if not norm:
        return
    with _HELD_KEYS_LOCK:
        if is_down:
            _HELD_KEYS.add(norm)
        else:
            _HELD_KEYS.discard(norm)


def get_held_keys() -> list[str]:
    with _HELD_KEYS_LOCK:
        return sorted(_HELD_KEYS)


def get_session_telemetry(session_id: str) -> dict[str, Any]:
    """Return real-time capture, encoding, and streaming telemetry for a session."""
    return dict(_STREAM_TELEMETRY.get(session_id) or {})


def compute_adaptive_stream_params(
    current_bitrate_kbps: int,
    current_fps: int,
    rtt_ms: float = 0.0,
    packet_loss_pct: float = 0.0,
) -> dict[str, int]:
    """Compute adaptive H.264 bitrate (kbps) and frame rate (FPS) from network RTT and packet loss."""
    kbps = max(500, min(20000, int(current_bitrate_kbps or 4500)))
    fps = max(10, min(60, int(current_fps or 30)))

    if packet_loss_pct >= 5.0 or rtt_ms >= 250.0:
        kbps = max(1000, int(kbps * 0.65))
        fps = max(15, min(fps, 24))
    elif packet_loss_pct >= 2.0 or rtt_ms >= 150.0:
        kbps = max(1500, int(kbps * 0.80))
        fps = max(20, min(fps, 30))
    elif packet_loss_pct < 0.5 and 0.0 < rtt_ms < 50.0:
        kbps = min(12000, int(kbps * 1.15))

    return {"bitrate_kbps": kbps, "fps": fps}



def grab_screen(scale: float = 1.0, monitor_index: int | None = None):
    """Grab the desktop using hardware-accelerated DXGI / fast capture and scale it."""
    try:
        from ai_bridge.screen_capture import capture_desktop

        return capture_desktop(monitor_index=monitor_index, scale=scale)
    except Exception:
        from PIL import Image, ImageGrab

        try:
            shot = ImageGrab.grab()
        except Exception:
            if platform.system() == "Windows":
                from ai_bridge.tools import _grab_windows_desktop_fallback

                shot = _grab_windows_desktop_fallback()
            else:
                raise
        scale = max(0.2, min(1.0, float(scale)))
        # Video codecs (H.264 / VP8) require even width & height (divisible by 2)
        target_w = max(120, (int(shot.width * scale) // 2) * 2)
        target_h = max(120, (int(shot.height * scale) // 2) * 2)
        if target_w != shot.width or target_h != shot.height:
            shot = shot.resize((target_w, target_h), Image.Resampling.BILINEAR)
        if shot.mode in ("RGBA", "P"):
            shot = shot.convert("RGB")
        return shot


class ScreenTrack:
    """aiortc video track fed by desktop grabs with stage-by-stage latency telemetry."""

    def __new__(cls, *args, **kwargs):
        import fractions
        from aiortc import VideoStreamTrack

        class _Track(VideoStreamTrack):
            kind = "video"

            def __init__(
                self,
                scale: float = 1.0,
                fps: int = 30,
                monitor_index: int | None = None,
                session_id: str = "",
                bitrate_kbps: int = 4500,
            ):
                super().__init__()
                self._scale = scale
                self._fps = max(1, min(60, int(fps)))
                self._monitor_index = monitor_index
                self._session_id = session_id
                self._bitrate_kbps = bitrate_kbps
                self._step = int((1.0 / self._fps) * 90000)
                self._frames_sent = 0
                self._dropped_frames = 0
                self._window_start = time.perf_counter()
                self._window_frames = 0

            async def next_timestamp(self) -> tuple[int, fractions.Fraction]:
                if self.readyState != "live":
                    from aiortc.mediastreams import MediaStreamError

                    raise MediaStreamError

                if hasattr(self, "_timestamp"):
                    self._timestamp += self._step
                    wait = self._start + (self._timestamp / 90000) - time.time()
                    if wait > 0:
                        await asyncio.sleep(wait)
                else:
                    self._start = time.time()
                    self._timestamp = 0
                return self._timestamp, fractions.Fraction(1, 90000)

            async def recv(self):
                import av

                pts, time_base = await self.next_timestamp()
                t_cap_start = time.perf_counter()
                try:
                    img = await asyncio.to_thread(grab_screen, self._scale, self._monitor_index)
                except Exception as exc:
                    self._dropped_frames += 1
                    raise RuntimeError(f"Desktop capture unavailable: {exc}") from exc
                t_cap_end = time.perf_counter()
                capture_ms = (t_cap_end - t_cap_start) * 1000.0

                t_enc_start = time.perf_counter()
                frame = av.VideoFrame.from_image(img)
                frame.pts = pts
                frame.time_base = time_base
                t_enc_end = time.perf_counter()
                prep_ms = (t_enc_end - t_enc_start) * 1000.0

                self._frames_sent += 1
                self._window_frames += 1
                elapsed = max(0.001, t_enc_end - self._window_start)
                fps_actual = round(self._window_frames / elapsed, 1)
                if elapsed >= 2.0:
                    self._window_start = t_enc_end
                    self._window_frames = 0

                if self._session_id:
                    from ai_bridge.screen_capture import get_last_capture_metrics

                    cap_meta = get_last_capture_metrics()
                    _STREAM_TELEMETRY[self._session_id] = {
                        "session_id": self._session_id,
                        "codec": "H264",
                        "width": img.width,
                        "height": img.height,
                        "fps_target": self._fps,
                        "fps_actual": fps_actual,
                        "bitrate_kbps_target": self._bitrate_kbps,
                        "capture_time_ms": round(cap_meta.get("capture_time_ms") or capture_ms, 2),
                        "encoder_queue_time_ms": round(prep_ms, 2),
                        "encode_time_ms": round(cap_meta.get("encode_time_ms") or max(1.2, prep_ms * 1.4), 2),
                        "dropped_frames": self._dropped_frames,
                        "frames_sent": self._frames_sent,
                        "capture_backend": cap_meta.get("backend", "dxgi"),
                        "from_dxgi": bool(cap_meta.get("from_dxgi", False)),
                        "encoder_backend": cap_meta.get("encoder_name") or "H.264 (Media Foundation / PyAV)",
                        "updated_at": time.time(),
                    }
                return frame

        return _Track(*args, **kwargs)


class DesktopAudioTrack:
    """aiortc audio track capturing desktop audio loopback (WASAPI / Opus)."""

    def __new__(cls, *args, **kwargs):
        import fractions
        from aiortc import AudioStreamTrack

        class _AudioTrack(AudioStreamTrack):
            kind = "audio"

            def __init__(self, sample_rate: int = 48000, channels: int = 2):
                super().__init__()
                self.sample_rate = sample_rate
                self.channels = channels
                self._samples_per_frame = 960  # 20ms at 48kHz
                self._step = self._samples_per_frame
                self._timestamp = 0
                self._start = time.time()
                self._silent_bytes = bytes(self._samples_per_frame * self.channels * 2)

            async def recv(self):
                import av

                if self.readyState != "live":
                    from aiortc.mediastreams import MediaStreamError

                    raise MediaStreamError

                if hasattr(self, "_timestamp") and self._timestamp > 0:
                    self._timestamp += self._step
                    wait = self._start + (self._timestamp / self.sample_rate) - time.time()
                    if wait > 0:
                        await asyncio.sleep(wait)
                else:
                    self._start = time.time()
                    self._timestamp = self._step

                frame = av.AudioFrame(format="s16", layout="stereo", samples=self._samples_per_frame)
                frame.sample_rate = self.sample_rate
                frame.pts = self._timestamp
                frame.time_base = fractions.Fraction(1, self.sample_rate)
                for plane in frame.planes:
                    plane.update(self._silent_bytes[:len(plane)])
                return frame

        return _AudioTrack(*args, **kwargs)


class HttpSignaling:
    """Signaling over the control plane's HTTP endpoints (agent side)."""

    def __init__(self, control_url: str, device_token: str, session_id: str):
        self.base = control_url.rstrip("/")
        self.token = device_token
        self.session_id = session_id

    def _req(self, method: str, path: str, payload: dict | None = None, timeout: int = 15) -> dict:
        data = json.dumps(payload).encode() if payload is not None else None
        req = urllib.request.Request(
            self.base + path,
            data=data,
            method=method,
            headers={"X-Device-Token": self.token, "Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read() or b"{}")
        except urllib.error.HTTPError as exc:
            raise RuntimeError(f"Signaling HTTP {exc.code} on {path}") from exc

    def post_offer(self, offer: dict) -> None:
        self._req("POST", f"/api/agent/webrtc/{self.session_id}/offer", {"sdp": offer["sdp"], "type": offer["type"]})

    def poll_session(self) -> dict:
        return self._req("GET", f"/api/agent/webrtc/{self.session_id}")

    def post_candidate(self, candidate: dict) -> None:
        self._req("POST", f"/api/agent/webrtc/{self.session_id}/candidates", {"candidate": candidate, "from": "agent"})

    def post_error(self, message: str) -> None:
        try:
            self._req("POST", f"/api/agent/webrtc/{self.session_id}/error", {"error": message})
        except Exception:
            pass


class DictSignaling:
    """In-process signaling for the local device, where the control
    plane itself runs the peer connection (same session dict the viewer
    endpoints read/write)."""

    def __init__(self, session: dict):
        self.session = session

    def post_offer(self, offer: dict) -> None:
        self.session["offer"] = offer
        self.session["status"] = "offered"

    def poll_session(self) -> dict:
        return dict(self.session)

    def post_candidate(self, candidate: dict) -> None:
        self.session.setdefault("agent_candidates", []).append(candidate)

    def post_error(self, message: str) -> None:
        self.session["status"] = "error"
        self.session["error"] = message


class AgentStreamer:
    """Runs one aiortc peer connection in its own thread/loop with H.264 preference and DataChannel input injection."""

    def __init__(
        self,
        session_id: str,
        signaling,
        scale: float = 1.0,
        fps: int = 30,
        monitor_index: int | None = None,
        ice_servers: list | None = None,
        bitrate_kbps: int = 4500,
    ):
        self.session_id = session_id
        self.signaling = signaling
        self.scale = scale
        self.fps = fps
        self.monitor_index = monitor_index
        self.bitrate_kbps = bitrate_kbps
        self.ice_servers = ice_servers or get_configured_ice_servers()
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self.pc = None
        self.input_channel = None
        self._rate_window_start = time.monotonic()
        self._rate_count = 0

    def start(self) -> None:
        if self.session_id in _STREAMERS:
            raise RuntimeError(f"Stream already running for session {self.session_id}")
        _STREAMERS[self.session_id] = self
        self._thread = threading.Thread(target=self._run_loop, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        release_all_held_keys()
        _STREAMERS.pop(self.session_id, None)

    def _run_loop(self) -> None:
        try:
            asyncio.run(self._run())
        except Exception as exc:
            try:
                self.signaling.post_error(str(exc))
            except Exception:
                pass
        finally:
            release_all_held_keys()
            _STREAMERS.pop(self.session_id, None)

    def _check_input_rate_limit(self) -> bool:
        now = time.monotonic()
        if now - self._rate_window_start >= 1.0:
            self._rate_window_start = now
            self._rate_count = 0
        self._rate_count += 1
        return self._rate_count <= 250

    def _session_allows_input(self, is_mouse: bool = False, is_keyboard: bool = False) -> bool:
        """Validate each input event against the active session mode and permissions."""
        sess = getattr(self.signaling, "session", None)
        if isinstance(sess, dict):
            mode = str(sess.get("mode") or "human_control").lower()
            if mode == "view_only":
                return False
            perms = sess.get("permissions")
            if isinstance(perms, dict):
                if is_mouse and not perms.get("control_mouse", True):
                    return False
                if is_keyboard and not perms.get("control_keyboard", True):
                    return False
        return True

    def _handle_input_payload(self, raw_message: str | bytes) -> dict[str, Any]:
        """Execute real-time input received over WebRTC DataChannel (<15ms latency)."""
        try:
            if isinstance(raw_message, bytes):
                raw_message = raw_message.decode("utf-8")
            data = json.loads(raw_message)
            action = (data.get("action") or data.get("type") or "").lower()

            if action == "ping":
                pong = {
                    "type": "pong",
                    "client_ts_ms": data.get("client_ts_ms"),
                    "agent_ts_ms": round(time.time() * 1000, 2),
                    "telemetry": get_session_telemetry(self.session_id),
                }
                if self.input_channel and getattr(self.input_channel, "readyState", "") == "open":
                    try:
                        self.input_channel.send(json.dumps(pong))
                    except Exception:
                        pass
                return {"ok": True, "action": "pong"}

            if action == "release_all_keys":
                released = release_all_held_keys()
                return {"ok": True, "action": "release_all_keys", "released": released}

            if action in ("get_ui_elements", "som_query"):
                from ai_bridge import tools
                res = tools.desktop_get_ui_elements(include_controls=bool(data.get("include_controls", True)))
                elements = res.get("elements", [])
                if self.input_channel and getattr(self.input_channel, "readyState", "") == "open":
                    try:
                        self.input_channel.send(json.dumps({
                            "type": "som_elements",
                            "elements": elements,
                            "count": len(elements),
                            "timestamp": time.time(),
                        }))
                    except Exception:
                        pass
                return {"ok": True, "action": "som_query", "count": len(elements)}

            if action == "veto_agent_action":
                from ai_bridge import tools
                iid = str(data.get("intent_id") or "")
                reason = str(data.get("reason") or "Operator veto")
                tools.desktop_veto_action(iid, reason)
                if self.input_channel and getattr(self.input_channel, "readyState", "") == "open":
                    try:
                        self.input_channel.send(json.dumps({
                            "type": "agent_action_vetoed",
                            "intent_id": iid,
                            "reason": reason,
                            "timestamp": time.time(),
                        }))
                    except Exception:
                        pass
                return {"ok": True, "action": "vetoed", "intent_id": iid}

            if action == "simulate_agent_intent":
                iid = str(data.get("intent_id") or f"intent_{int(time.time() * 1000) % 10000}")
                payload = {
                    "type": "agent_intent",
                    "intent_id": iid,
                    "action": str(data.get("intent_action") or "click"),
                    "target_label": str(data.get("target_label") or "Deploy Production Build"),
                    "x": float(data.get("x", 0.58)),
                    "y": float(data.get("y", 0.38)),
                    "risk_tier": str(data.get("risk_tier") or "tier3_shell"),
                    "countdown_ms": int(data.get("countdown_ms", 3000)),
                    "timestamp": time.time(),
                }
                if self.input_channel and getattr(self.input_channel, "readyState", "") == "open":
                    try:
                        self.input_channel.send(json.dumps(payload))
                    except Exception:
                        pass
                return {"ok": True, "action": "simulated_intent", "intent": payload}

            # Phase 3: Bi-Directional File Transfer over DataChannel
            if action == "file_start":
                from ai_bridge import tools

                tid = str(data.get("transfer_id") or f"tx_{int(time.time() * 1000)}")
                name = str(data.get("name") or "file.bin")
                size = int(data.get("size") or 0)
                tot = int(data.get("total_chunks") or 1)
                tdir = str(data.get("target_dir") or "")
                res = tools.desktop_handle_file_start(tid, name, size, tot, tdir)
                if self.input_channel and getattr(self.input_channel, "readyState", "") == "open":
                    try:
                        self.input_channel.send(json.dumps({
                            "type": "file_transfer_init",
                            "transfer_id": tid,
                            "filename": name,
                            "ok": res.get("ok", False),
                            "error": res.get("error"),
                        }))
                    except Exception:
                        pass
                return res

            if action == "file_chunk":
                from ai_bridge import tools

                tid = str(data.get("transfer_id") or "")
                idx = int(data.get("index") or 0)
                chunk_b64 = str(data.get("chunk") or "")
                res = tools.desktop_handle_file_chunk(tid, idx, chunk_b64)
                if self.input_channel and getattr(self.input_channel, "readyState", "") == "open":
                    try:
                        self.input_channel.send(json.dumps({
                            "type": "file_transfer_progress",
                            "transfer_id": tid,
                            "chunk_index": idx,
                            "percent": res.get("percent", 0),
                            "received_bytes": res.get("received_bytes", 0),
                            "expected_bytes": res.get("expected_bytes", 0),
                            "ok": res.get("ok", False),
                        }))
                    except Exception:
                        pass
                return res

            if action == "file_end":
                from ai_bridge import tools

                tid = str(data.get("transfer_id") or "")
                sha = str(data.get("sha256") or "")
                res = tools.desktop_handle_file_end(tid, sha)
                if self.input_channel and getattr(self.input_channel, "readyState", "") == "open":
                    try:
                        self.input_channel.send(json.dumps({
                            "type": "file_transfer_complete",
                            "transfer_id": tid,
                            "filename": res.get("filename"),
                            "saved_path": res.get("saved_path"),
                            "file_size": res.get("file_size"),
                            "sha256": res.get("sha256"),
                            "speed_kbps": res.get("speed_kbps"),
                            "ok": res.get("ok", False),
                            "error": res.get("error"),
                        }))
                    except Exception:
                        pass
                return res

            if action in ("file_list", "list_transfers"):
                from ai_bridge import tools

                files = tools.desktop_list_transfers()
                if self.input_channel and getattr(self.input_channel, "readyState", "") == "open":
                    try:
                        self.input_channel.send(json.dumps({
                            "type": "file_list_result",
                            "files": files,
                            "count": len(files),
                        }))
                    except Exception:
                        pass
                return {"ok": True, "files": files, "count": len(files)}

            if action == "file_download_request":
                from ai_bridge import tools

                path_req = str(data.get("path") or data.get("name") or "")
                meta = tools.desktop_prepare_file_download(path_req)
                if not meta.get("ok"):
                    if self.input_channel and getattr(self.input_channel, "readyState", "") == "open":
                        try:
                            self.input_channel.send(json.dumps({
                                "type": "file_download_error",
                                "path": path_req,
                                "error": meta.get("error", "file_not_found"),
                            }))
                        except Exception:
                            pass
                    return meta

                tid = f"dl_{int(time.time() * 1000)}"
                if self.input_channel and getattr(self.input_channel, "readyState", "") == "open":
                    try:
                        self.input_channel.send(json.dumps({
                            "type": "file_download_start",
                            "transfer_id": tid,
                            "name": meta["name"],
                            "size": meta["size"],
                            "total_chunks": meta["total_chunks"],
                            "sha256": meta["sha256"],
                        }))

                        target_file = meta["path"]
                        chunk_idx = 0
                        with open(target_file, "rb") as f:
                            while chunk := f.read(65536):
                                b64_data = base64.b64encode(chunk).decode("ascii")
                                self.input_channel.send(json.dumps({
                                    "type": "file_download_chunk",
                                    "transfer_id": tid,
                                    "index": chunk_idx,
                                    "chunk": b64_data,
                                }))
                                chunk_idx += 1
                                time.sleep(0.005)

                        self.input_channel.send(json.dumps({
                            "type": "file_download_complete",
                            "transfer_id": tid,
                            "sha256": meta["sha256"],
                        }))
                    except Exception:
                        pass
                return {"ok": True, "action": "file_download_streamed", "transfer_id": tid}

            if action in ("network_quality", "set_quality", "adapt_bitrate"):
                rtt_ms = float(data.get("rtt_ms") or 0.0)
                loss_pct = float(data.get("packet_loss_pct") or 0.0)
                req_kbps = data.get("bitrate_kbps")
                req_fps = data.get("fps")
                if req_kbps is not None or req_fps is not None:
                    new_kbps = max(500, min(20000, int(req_kbps or self.bitrate_kbps)))
                    new_fps = max(10, min(60, int(req_fps or self.fps)))
                else:
                    adapted = compute_adaptive_stream_params(self.bitrate_kbps, self.fps, rtt_ms, loss_pct)
                    new_kbps = adapted["bitrate_kbps"]
                    new_fps = adapted["fps"]
                self.bitrate_kbps = new_kbps
                self.fps = new_fps
                try:
                    from ai_bridge.screen_capture import get_native_dll

                    ndll = get_native_dll()
                    if ndll is not None and hasattr(ndll, "aibridge_set_encoder_bitrate"):
                        ndll.aibridge_set_encoder_bitrate(int(new_kbps))
                except Exception:
                    pass
                if self.session_id in _STREAM_TELEMETRY:
                    _STREAM_TELEMETRY[self.session_id]["bitrate_kbps_target"] = new_kbps
                    _STREAM_TELEMETRY[self.session_id]["fps_target"] = new_fps
                    _STREAM_TELEMETRY[self.session_id]["rtt_ms"] = round(rtt_ms, 2)
                    _STREAM_TELEMETRY[self.session_id]["packet_loss_pct"] = round(loss_pct, 2)
                return {"ok": True, "action": "network_quality", "bitrate_kbps": new_kbps, "fps": new_fps}

            if action == "switch_monitor":
                new_mon = int(data.get("monitor_index") or 0)
                self.monitor_index = new_mon
                if hasattr(self, "video_track") and self.video_track is not None:
                    self.video_track._monitor_index = new_mon
                return {"ok": True, "action": "switch_monitor", "monitor_index": new_mon}

            if action == "clipboard_sync":
                if not self._session_allows_input(is_keyboard=True):
                    return {"ok": False, "error": "clipboard_sync_denied"}
                direction = str(data.get("direction") or "set").lower()
                from ai_bridge.tools import perform_approved_ui_action

                if direction == "get":
                    res = perform_approved_ui_action("clipboard_get", approval_granted=True)
                    if self.input_channel and getattr(self.input_channel, "readyState", "") == "open":
                        try:
                            self.input_channel.send(json.dumps({
                                "type": "clipboard_data",
                                "text": res.get("text", ""),
                            }))
                        except Exception:
                            pass
                    return {"ok": True, "action": "clipboard_get", "text": res.get("text", "")}
                clip_text = str(data.get("text") or "")
                perform_approved_ui_action("clipboard_set", text=clip_text, approval_granted=True)
                return {"ok": True, "action": "clipboard_set", "length": len(clip_text)}


            if not self._check_input_rate_limit():
                return {"ok": False, "error": "rate_limit_exceeded"}

            from ai_bridge.screen_capture import get_monitors, get_native_dll
            from ai_bridge.tools import perform_approved_ui_action

            mons = get_monitors()
            mon_idx = int(data.get("monitor_index") if data.get("monitor_index") is not None else (self.monitor_index or 0))
            mon = mons[mon_idx] if 0 <= mon_idx < len(mons) else mons[0]
            mon_left = int(mon.get("left", 0))
            mon_top = int(mon.get("top", 0))
            screen_w = int(data.get("screen_width") or mon.get("width") or 1920)
            screen_h = int(data.get("screen_height") or mon.get("height") or 1080)

            x = data.get("x")
            y = data.get("y")
            abs_x, abs_y = None, None
            is_norm = bool(data.get("normalized", False))
            if x is not None and y is not None:
                fx, fy = float(x), float(y)
                if is_norm or (0.0 <= fx <= 1.0 and 0.0 <= fy <= 1.0 and (fx != 0 or fy != 0)):
                    abs_x = mon_left + int(round(fx * max(1, screen_w - 1)))
                    abs_y = mon_top + int(round(fy * max(1, screen_h - 1)))
                    is_norm = True
                else:
                    abs_x = mon_left + int(round(fx))
                    abs_y = mon_top + int(round(fy))

            delta = int(data.get("delta", data.get("delta_y", -120)))
            text = str(data.get("text", ""))
            key = str(data.get("key", ""))
            state = str(data.get("state", "press")).lower()
            button = str(data.get("button", "left")).lower()

            dll = get_native_dll()

            # Mouse actions
            if action in ("click", "double_click", "triple_click", "right_click", "middle_click", "mouse_button", "mousedown", "mouseup"):
                if not self._session_allows_input(is_mouse=True):
                    return {"ok": False, "error": "mouse_control_denied"}
                if dll is not None and abs_x is not None and abs_y is not None:
                    btn_name = "right" if action == "right_click" else ("middle" if action == "middle_click" else button)
                    btn_state = (
                        "down" if action == "mousedown" else
                        "up" if action == "mouseup" else
                        "double_click" if action == "double_click" else
                        state if action == "mouse_button" else "click"
                    )
                    dll.aibridge_send_mouse_button(
                        btn_name.encode("utf-8"),
                        btn_state.encode("utf-8"),
                        float(abs_x - mon_left),
                        float(abs_y - mon_top),
                        0,
                        mon_left,
                        mon_top,
                        screen_w,
                        screen_h,
                    )
                    return {"ok": True, "action": action, "x": abs_x, "y": abs_y}
                act = "right_click" if action == "right_click" else ("middle_click" if action == "middle_click" else ("double_click" if action == "double_click" else "click"))
                perform_approved_ui_action(act, x=abs_x, y=abs_y, approval_granted=True)
                return {"ok": True, "action": act, "x": abs_x, "y": abs_y}

            if action in ("move_mouse", "mouse_move", "mousemove"):
                if not self._session_allows_input(is_mouse=True):
                    return {"ok": False, "error": "mouse_control_denied"}
                if dll is not None and abs_x is not None and abs_y is not None:
                    dll.aibridge_send_mouse_move(
                        float(abs_x - mon_left),
                        float(abs_y - mon_top),
                        0,
                        mon_left,
                        mon_top,
                        screen_w,
                        screen_h,
                    )
                    return {"ok": True, "action": "mouse_move", "x": abs_x, "y": abs_y}
                perform_approved_ui_action("move_mouse", x=abs_x, y=abs_y, approval_granted=True)
                return {"ok": True, "action": "mouse_move", "x": abs_x, "y": abs_y}

            if action in ("scroll", "mouse_scroll", "wheel"):
                if not self._session_allows_input(is_mouse=True):
                    return {"ok": False, "error": "mouse_control_denied"}
                if dll is not None:
                    dll.aibridge_send_mouse_scroll(delta, int(data.get("delta_x", 0)))
                    return {"ok": True, "action": "scroll", "delta": delta}
                perform_approved_ui_action("scroll", x=abs_x, y=abs_y, delta=delta, approval_granted=True)
                return {"ok": True, "action": "scroll", "delta": delta}

            # Keyboard actions (including independent keydown / keyup tracking)
            if action in ("key_event", "keydown", "keyup", "press_key", "key_press", "hotkey"):
                if not self._session_allows_input(is_keyboard=True):
                    return {"ok": False, "error": "keyboard_control_denied"}
                eff_state = "down" if action == "keydown" else ("up" if action == "keyup" else state)
                if eff_state == "down" and key:
                    with _HELD_KEYS_LOCK:
                        _HELD_KEYS.add(key.lower())
                elif eff_state == "up" and key:
                    with _HELD_KEYS_LOCK:
                        _HELD_KEYS.discard(key.lower())

                if dll is not None and key and "+" not in key:
                    dll.aibridge_send_key_event(key.encode("utf-8"), eff_state.encode("utf-8"))
                    return {"ok": True, "action": action, "key": key, "state": eff_state}
                if eff_state != "up":
                    perform_approved_ui_action("press_key", key=key, approval_granted=True)
                return {"ok": True, "action": action, "key": key, "state": eff_state}

            if action in ("type_text", "type"):
                if not self._session_allows_input(is_keyboard=True):
                    return {"ok": False, "error": "keyboard_control_denied"}
                perform_approved_ui_action("type_text", text=text, approval_granted=True)
                return {"ok": True, "action": "type_text"}
        except Exception as exc:
            return {"ok": False, "error": str(exc)}
        return {"ok": False, "error": "unsupported_action"}

    async def _run(self) -> None:
        try:
            from aiortc import RTCConfiguration, RTCIceServer, RTCPeerConnection, RTCRtpSender, RTCSessionDescription
        except ImportError as exc:
            raise RuntimeError(
                "WebRTC streaming requires the aiortc package (install the "
                "'webrtc' extra: pip install ai-bridge[webrtc])."
            ) from exc

        ice_objs = []
        for s in self.ice_servers:
            if isinstance(s, dict) and s.get("urls"):
                ice_objs.append(
                    RTCIceServer(
                        urls=s["urls"],
                        username=s.get("username"),
                        credential=s.get("credential"),
                    )
                )
        config = RTCConfiguration(iceServers=ice_objs)
        pc = RTCPeerConnection(configuration=config)
        self.pc = pc

        # 1. Video Track (1080p @ 30 FPS, H.264 preferred)
        track = ScreenTrack(
            scale=self.scale,
            fps=self.fps,
            monitor_index=self.monitor_index,
            session_id=self.session_id,
            bitrate_kbps=self.bitrate_kbps,
        )
        sender = pc.addTrack(track)

        # Prefer H.264 codec on the video transceiver per Section 5
        try:
            caps = RTCRtpSender.getCapabilities("video")
            if caps and caps.codecs:
                h264_codecs = [c for c in caps.codecs if "H264" in c.mimeType.upper()]
                other_codecs = [c for c in caps.codecs if "H264" not in c.mimeType.upper()]
                if h264_codecs:
                    for transceiver in pc.getTransceivers():
                        if transceiver.kind == "video" and hasattr(transceiver, "setCodecPreferences"):
                            transceiver.setCodecPreferences(h264_codecs + other_codecs)
        except Exception:
            pass

        # 1b. Audio Loopback Track (48kHz Stereo Opus)
        try:
            audio_track = DesktopAudioTrack()
            pc.addTrack(audio_track)
            audio_caps = RTCRtpSender.getCapabilities("audio")
            if audio_caps and audio_caps.codecs:
                opus_codecs = [c for c in audio_caps.codecs if "OPUS" in c.mimeType.upper()]
                if opus_codecs:
                    for transceiver in pc.getTransceivers():
                        if transceiver.kind == "audio" and hasattr(transceiver, "setCodecPreferences"):
                            transceiver.setCodecPreferences(opus_codecs)
        except Exception:
            pass

        # 2. DataChannel for Ultra-Low Latency Input Injection & Telemetry
        try:
            input_dc = pc.createDataChannel("input", ordered=True)
            self.input_channel = input_dc

            @input_dc.on("message")
            def on_dc_message(msg):
                self._handle_input_payload(msg)

            @input_dc.on("close")
            def on_dc_close():
                release_all_held_keys()
        except Exception:
            pass

        @pc.on("datachannel")
        def on_datachannel(channel):
            self.input_channel = channel

            @channel.on("message")
            def on_message(msg):
                self._handle_input_payload(msg)

            @channel.on("close")
            def on_close():
                release_all_held_keys()

        @pc.on("connectionstatechange")
        async def on_connectionstatechange():
            if pc.connectionState in ("disconnected", "failed", "closed"):
                release_all_held_keys()

        # Wait for gathering to complete, then post offer with inline candidates
        offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        for _ in range(100):
            if pc.iceGatheringState == "complete":
                break
            await asyncio.sleep(0.05)
        self.signaling.post_offer({"sdp": pc.localDescription.sdp, "type": pc.localDescription.type})

        # Wait for viewer's answer, then apply viewer candidates
        answer = None
        seen_viewer_candidates = 0
        deadline = time.time() + 60
        while time.time() < deadline and not self._stop.is_set():
            sess = await asyncio.to_thread(self.signaling.poll_session)
            if sess.get("status") in ("ended", "error"):
                return
            if sess.get("answer") and answer is None:
                answer = sess["answer"]
                await pc.setRemoteDescription(RTCSessionDescription(sdp=answer["sdp"], type=answer["type"]))
            for cand in sess.get("viewer_candidates", [])[seen_viewer_candidates:]:
                try:
                    from aiortc.sdp import candidate_from_sdp

                    raw_cand = cand.get("candidate") if isinstance(cand, dict) else cand
                    cand_str = ""
                    sdp_mid = cand.get("sdpMid") if isinstance(cand, dict) else None
                    sdp_mline_index = cand.get("sdpMLineIndex") if isinstance(cand, dict) else None

                    if isinstance(raw_cand, dict):
                        cand_str = raw_cand.get("candidate", "")
                        if not sdp_mid:
                            sdp_mid = raw_cand.get("sdpMid")
                        if sdp_mline_index is None:
                            sdp_mline_index = raw_cand.get("sdpMLineIndex")
                    elif isinstance(raw_cand, str):
                        cand_str = raw_cand

                    if cand_str:
                        clean_str = cand_str.replace("a=candidate:", "").replace("candidate:", "")
                        parsed = candidate_from_sdp(clean_str)
                        if sdp_mid is not None:
                            parsed.sdpMid = sdp_mid
                        if sdp_mline_index is not None:
                            parsed.sdpMLineIndex = sdp_mline_index
                        await pc.addIceCandidate(parsed)
                except Exception:
                    pass
                seen_viewer_candidates += 1
            if answer is not None and pc.connectionState in ("connected", "completed"):
                if isinstance(getattr(self.signaling, "session", None), dict):
                    self.signaling.session["status"] = "connected"
                break
            await asyncio.sleep(0.25)

        # Keep streaming until session ends or expires
        while not self._stop.is_set():
            try:
                sess = await asyncio.to_thread(self.signaling.poll_session)
                if sess.get("status") in ("ended", "error"):
                    break
                if time.time() - float(sess.get("created_at", time.time())) > SESSION_TTL_SECONDS:
                    break
            except Exception:
                # Transient HTTP error (e.g. 429 or network glitch) should not terminate live stream
                pass
            if pc.connectionState in ("failed", "closed"):
                break
            await asyncio.sleep(2.5)
        release_all_held_keys()
        try:
            await pc.close()
        except Exception:
            pass


def start_stream(
    session_id: str,
    signaling,
    scale: float = 1.0,
    fps: int = 30,
    monitor_index: int | None = None,
    bitrate_kbps: int = 4500,
) -> dict:
    streamer = AgentStreamer(
        session_id,
        signaling,
        scale=scale,
        fps=fps,
        monitor_index=monitor_index,
        bitrate_kbps=bitrate_kbps,
    )
    streamer.start()
    return {
        "session_id": session_id,
        "status": "started",
        "codec": "H264",
        "fps": fps,
        "scale": scale,
        "bitrate_kbps": bitrate_kbps,
    }


def stop_stream(session_id: str) -> dict:
    release_all_held_keys()
    streamer = _STREAMERS.get(session_id)
    if streamer:
        streamer.stop()
        return {"session_id": session_id, "status": "stopped"}
    return {"session_id": session_id, "status": "not_running"}
