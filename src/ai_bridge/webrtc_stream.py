"""WebRTC desktop streaming with Hardware Acceleration & Real-time DataChannel Input.

Architecture (compatible with the agent's outbound-only model):

* The browser never talks to the agent directly. Signaling goes through
  the control plane over plain HTTP, which both sides can already reach:
  the viewer polls the session for the agent's offer, posts its answer
  and ICE candidates; the agent polls the session for the answer and
  viewer candidates. Media itself is peer-to-peer WebRTC (STUN-assisted).
* Real-time WebRTC DataChannel (Ultra-Low Latency Input):
  Dual-control mouse clicks, movements, scroll, and keystrokes travel
  directly over the peer-to-peer RTCDataChannel (<15ms latency), bypassing
  HTTP round-trips entirely.
* Multi-Monitor & DXGI Hardware Acceleration:
  Streams any selected physical or virtual display at up to 60 FPS using
  DirectX/DXGI and Direct Memory BitBlt capture.
"""
from __future__ import annotations

import asyncio
import json
import platform
import threading
import time
import urllib.error
import urllib.request

SESSION_TTL_SECONDS = 600
DEFAULT_ICE_SERVERS = [{"urls": "stun:stun.l.google.com:19302"}]

_STREAMERS: dict[str, "AgentStreamer"] = {}
_AGENT_CONTEXT: dict[str, str] = {}


def set_agent_context(control_url: str, device_token: str) -> None:
    """Let dispatch() start a stream: the poller owns the control URL
    and device token, dispatch() does not receive them as arguments."""
    _AGENT_CONTEXT["control_url"] = control_url
    _AGENT_CONTEXT["device_token"] = device_token


def grab_screen(scale: float = 0.75, monitor_index: int | None = None):
    """Grab the desktop using hardware-accelerated / fast capture and scale it."""
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
    """aiortc video track fed by desktop grabs (constructed lazily so
    importing this module never requires aiortc)."""

    def __new__(cls, *args, **kwargs):
        import fractions
        from aiortc import VideoStreamTrack

        class _Track(VideoStreamTrack):
            kind = "video"

            def __init__(self, scale: float = 0.75, fps: int = 10, monitor_index: int | None = None):
                super().__init__()
                self._scale = scale
                self._fps = max(1, min(60, int(fps)))
                self._monitor_index = monitor_index
                self._step = int((1.0 / self._fps) * 90000)

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
                try:
                    img = await asyncio.to_thread(grab_screen, self._scale, self._monitor_index)
                except Exception as exc:
                    # Headless host: stop the track instead of spamming errors.
                    raise RuntimeError(f"Desktop capture unavailable: {exc}") from exc
                frame = av.VideoFrame.from_image(img)
                frame.pts = pts
                frame.time_base = time_base
                return frame

        return _Track(*args, **kwargs)


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
    """Runs one aiortc peer connection in its own thread/loop with DataChannel input injection."""

    def __init__(
        self,
        session_id: str,
        signaling,
        scale: float = 0.75,
        fps: int = 10,
        monitor_index: int | None = None,
        ice_servers: list | None = None,
    ):
        self.session_id = session_id
        self.signaling = signaling
        self.scale = scale
        self.fps = fps
        self.monitor_index = monitor_index
        self.ice_servers = ice_servers or DEFAULT_ICE_SERVERS
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self.pc = None
        self.input_channel = None

    def start(self) -> None:
        if self.session_id in _STREAMERS:
            raise RuntimeError(f"Stream already running for session {self.session_id}")
        _STREAMERS[self.session_id] = self
        self._thread = threading.Thread(target=self._run_loop, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
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
            _STREAMERS.pop(self.session_id, None)

    def _handle_input_payload(self, raw_message: str | bytes) -> None:
        """Execute real-time input received over WebRTC DataChannel (<15ms latency)."""
        try:
            if isinstance(raw_message, bytes):
                raw_message = raw_message.decode("utf-8")
            data = json.loads(raw_message)
            action = (data.get("action") or data.get("type") or "").lower()

            from ai_bridge.tools import perform_approved_ui_action

            screen_w = int(data.get("screen_width") or 1920)
            screen_h = int(data.get("screen_height") or 1080)

            x = data.get("x")
            y = data.get("y")
            abs_x, abs_y = None, None
            if x is not None and y is not None:
                fx, fy = float(x), float(y)
                if 0.0 <= fx <= 1.0 and 0.0 <= fy <= 1.0 and (fx != 0 or fy != 0):
                    abs_x = int(fx * screen_w)
                    abs_y = int(fy * screen_h)
                else:
                    abs_x = int(fx)
                    abs_y = int(fy)

            delta = int(data.get("delta", data.get("delta_y", -120)))
            text = str(data.get("text", ""))
            key = str(data.get("key", ""))

            if action in ("click", "double_click", "triple_click", "right_click", "middle_click"):
                act = "right_click" if action == "right_click" else ("middle_click" if action == "middle_click" else action)
                perform_approved_ui_action(act, x=abs_x, y=abs_y, approval_granted=True)
            elif action in ("move_mouse", "mouse_move"):
                perform_approved_ui_action("move_mouse", x=abs_x, y=abs_y, approval_granted=True)
            elif action == "scroll":
                perform_approved_ui_action("scroll", x=abs_x, y=abs_y, delta=delta, approval_granted=True)
            elif action in ("type_text", "type"):
                perform_approved_ui_action("type_text", text=text, approval_granted=True)
            elif action in ("press_key", "key_press", "hotkey"):
                perform_approved_ui_action("press_key", key=key, approval_granted=True)
        except Exception:
            pass

    async def _run(self) -> None:
        try:
            from aiortc import RTCConfiguration, RTCIceServer, RTCPeerConnection, RTCSessionDescription
        except ImportError as exc:
            raise RuntimeError(
                "WebRTC streaming requires the aiortc package (install the "
                "'webrtc' extra: pip install ai-bridge[webrtc])."
            ) from exc

        config = RTCConfiguration(iceServers=[RTCIceServer(urls=s["urls"]) for s in self.ice_servers])
        pc = RTCPeerConnection(configuration=config)
        self.pc = pc

        # 1. Video Track (with DXGI & Multi-Monitor support)
        track = ScreenTrack(scale=self.scale, fps=self.fps, monitor_index=self.monitor_index)
        pc.addTrack(track)

        # 2. DataChannel for Ultra-Low Latency Input Injection
        try:
            input_dc = pc.createDataChannel("input", ordered=True)
            self.input_channel = input_dc

            @input_dc.on("message")
            def on_dc_message(msg):
                self._handle_input_payload(msg)
        except Exception:
            pass

        @pc.on("datachannel")
        def on_datachannel(channel):
            self.input_channel = channel

            @channel.on("message")
            def on_message(msg):
                self._handle_input_payload(msg)

        # Wait for gathering to complete, then post offer with inline candidates
        offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        for _ in range(100):
            if pc.iceGatheringState == "complete":
                break
            await asyncio.sleep(0.1)
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

                    raw_cand = cand.get("candidate")
                    cand_str = ""
                    sdp_mid = cand.get("sdpMid")
                    sdp_mline_index = cand.get("sdpMLineIndex")

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
                break
            await asyncio.sleep(0.5)

        # Keep streaming until session ends or expires
        while not self._stop.is_set():
            sess = await asyncio.to_thread(self.signaling.poll_session)
            if sess.get("status") in ("ended", "error"):
                break
            if time.time() - float(sess.get("created_at", time.time())) > SESSION_TTL_SECONDS:
                break
            if pc.connectionState in ("failed", "closed"):
                break
            await asyncio.sleep(2)
        await pc.close()


def start_stream(
    session_id: str,
    signaling,
    scale: float = 0.75,
    fps: int = 10,
    monitor_index: int | None = None,
) -> dict:
    streamer = AgentStreamer(session_id, signaling, scale=scale, fps=fps, monitor_index=monitor_index)
    streamer.start()
    return {"session_id": session_id, "status": "started"}


def stop_stream(session_id: str) -> dict:
    streamer = _STREAMERS.get(session_id)
    if streamer:
        streamer.stop()
        return {"session_id": session_id, "status": "stopped"}
    return {"session_id": session_id, "status": "not_running"}
