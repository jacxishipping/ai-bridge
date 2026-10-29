"""WebRTC desktop streaming.

Architecture (kept compatible with the agent's outbound-only model):

* The browser never talks to the agent directly. Signaling goes through
  the control plane over plain HTTP, which both sides can already reach:
  the viewer polls the session for the agent's offer, posts its answer
  and ICE candidates; the agent polls the session for the answer and
  viewer candidates. Media itself is peer-to-peer WebRTC (STUN-assisted);
  if ICE cannot connect, the dashboard falls back to screenshot frames.
* A streaming session is a single, time-boxed approval: the viewer
  creates it (viewer role, same as the frame endpoint), the agent
  captures only while the session is live, and either side ending the
  session — or the TTL expiring — stops capture. No per-frame approval
  is possible for video, so sessions are capped at 10 minutes and the
  dashboard shows a live indicator while streaming.

Dependencies: aiortc (optional extra ``webrtc``). Without it,
start_stream raises a clear error and the dashboard falls back to
frames. Screen capture reuses Pillow, the same as capture_desktop_frame.

Known limit: media is UDP ICE (STUN-assisted, no TURN bundled). On a
network that blocks UDP, or behind symmetric NAT, ICE cannot connect
and the dashboard falls back to screenshot frames. Adding a TURN
server (ice_servers) is the fix for those networks, not more code here.
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


def grab_screen(scale: float = 0.75):
    """Grab the desktop and scale it, mirroring capture_desktop_frame."""
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
    if scale < 0.99:
        shot = shot.resize(
            (max(100, int(shot.width * scale)), max(100, int(shot.height * scale))),
            Image.Resampling.BILINEAR,
        )
    if shot.mode in ("RGBA", "P"):
        shot = shot.convert("RGB")
    return shot


class ScreenTrack:
    """aiortc video track fed by desktop grabs (constructed lazily so
    importing this module never requires aiortc)."""

    def __new__(cls, *args, **kwargs):
        from aiortc import MediaStreamTrack

        class _Track(MediaStreamTrack):
            kind = "video"

            def __init__(self, scale: float = 0.75, fps: int = 10):
                super().__init__()
                self._scale = scale
                self._fps = max(1, min(30, int(fps)))

            async def recv(self):
                import av

                pts, time_base = await self.next_timestamp()
                try:
                    img = await asyncio.to_thread(grab_screen, self._scale)
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
    """Runs one aiortc peer connection in its own thread/loop."""

    def __init__(self, session_id: str, signaling, scale: float = 0.75, fps: int = 10,
                 ice_servers: list | None = None):
        self.session_id = session_id
        self.signaling = signaling
        self.scale = scale
        self.fps = fps
        self.ice_servers = ice_servers or DEFAULT_ICE_SERVERS
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self.pc = None

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
        track = ScreenTrack(scale=self.scale, fps=self.fps)
        pc.addTrack(track)

        # NOTE: aiortc does not emit per-candidate "icecandidate" events
        # the way browsers do — candidates are gathered during
        # setLocalDescription and embedded in localDescription.sdp.
        # So: wait for gathering to complete, then post the offer with
        # its candidates inline. The browser side still trickles its own
        # candidates, which we apply below from the session.
        offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        for _ in range(100):
            if pc.iceGatheringState == "complete":
                break
            await asyncio.sleep(0.1)
        self.signaling.post_offer({"sdp": pc.localDescription.sdp, "type": pc.localDescription.type})

        # Wait for the viewer's answer, then apply viewer candidates.
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
                    from aiortc import RTCIceCandidate

                    await pc.addIceCandidate(RTCIceCandidate(
                        candidate=cand["candidate"], sdpMid=cand.get("sdpMid"),
                        sdpMLineIndex=cand.get("sdpMLineIndex")))
                except Exception:
                    pass
                seen_viewer_candidates += 1
            if answer is not None and pc.connectionState in ("connected", "completed"):
                break
            await asyncio.sleep(0.5)

        # Keep streaming until the session ends or expires.
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


def start_stream(session_id: str, signaling, scale: float = 0.75, fps: int = 10) -> dict:
    streamer = AgentStreamer(session_id, signaling, scale=scale, fps=fps)
    streamer.start()
    return {"session_id": session_id, "status": "started"}


def stop_stream(session_id: str) -> dict:
    streamer = _STREAMERS.get(session_id)
    if streamer:
        streamer.stop()
        return {"session_id": session_id, "status": "stopped"}
    return {"session_id": session_id, "status": "not_running"}
