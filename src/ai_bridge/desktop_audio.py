"""Optional WASAPI loopback capture for Live Desktop audio (opt-in).

Default remains off (`AI_BRIDGE_DESKTOP_AUDIO` unset). When enabled, we prefer
real loopback via the optional ``soundcard`` package; if unavailable or init
fails, callers fall back to honest silent PCM frames.
"""
from __future__ import annotations

import logging
import queue
import threading
import time
from typing import Any

log = logging.getLogger("ai_bridge.desktop_audio")

_PROBE_CACHE: dict[str, Any] | None = None


def wasapi_capture_available() -> bool:
    """True when this host can open a WASAPI/speaker loopback device."""
    info = probe_wasapi_loopback()
    return bool(info.get("available"))


def probe_wasapi_loopback() -> dict[str, Any]:
    """Probe once per process for loopback capability (no long-lived stream)."""
    global _PROBE_CACHE
    if _PROBE_CACHE is not None:
        return dict(_PROBE_CACHE)
    result: dict[str, Any] = {
        "available": False,
        "backend": None,
        "device": None,
        "reason": "not_probed",
    }
    try:
        import platform

        if platform.system() != "Windows":
            result["reason"] = "wasapi_windows_only"
            _PROBE_CACHE = result
            return dict(result)
        import soundcard as sc  # type: ignore

        mics = sc.all_microphones(include_loopback=True)
        loopbacks = [m for m in mics if getattr(m, "isloopback", False)]
        if not loopbacks:
            # Some drivers expose loopback only via default speaker mirror.
            try:
                spk = sc.default_speaker()
                loopbacks = [sc.get_microphone(id=spk.id, include_loopback=True)]
            except Exception:
                loopbacks = []
        if not loopbacks:
            result["reason"] = "no_loopback_device"
            _PROBE_CACHE = result
            return dict(result)
        result = {
            "available": True,
            "backend": "soundcard_wasapi_loopback",
            "device": getattr(loopbacks[0], "name", None) or str(loopbacks[0]),
            "reason": "ok",
        }
    except ImportError:
        result["reason"] = "soundcard_not_installed"
    except Exception as exc:  # noqa: BLE001
        result["reason"] = f"probe_failed:{type(exc).__name__}"
        log.debug("WASAPI probe failed: %s", exc)
    _PROBE_CACHE = result
    return dict(result)


def reset_probe_cache() -> None:
    global _PROBE_CACHE
    _PROBE_CACHE = None


class WasapiLoopbackCapture:
    """Background float32→s16le PCM reader for speaker loopback."""

    def __init__(self, sample_rate: int = 48000, channels: int = 2, samples_per_frame: int = 960):
        self.sample_rate = int(sample_rate)
        self.channels = int(channels)
        self.samples_per_frame = int(samples_per_frame)
        self._q: queue.Queue[bytes] = queue.Queue(maxsize=32)
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._backend = "none"
        self._error: str | None = None
        self._started = False

    @property
    def backend(self) -> str:
        return self._backend

    @property
    def error(self) -> str | None:
        return self._error

    @property
    def live(self) -> bool:
        return self._started and self._error is None and self._backend.startswith("soundcard")

    def start(self) -> bool:
        if self._started:
            return self.live
        try:
            import numpy as np  # soundcard depends on numpy
            import soundcard as sc  # type: ignore
        except ImportError as exc:
            self._error = f"missing_dependency:{exc}"
            return False
        try:
            mics = sc.all_microphones(include_loopback=True)
            loopbacks = [m for m in mics if getattr(m, "isloopback", False)]
            if not loopbacks:
                spk = sc.default_speaker()
                loopbacks = [sc.get_microphone(id=spk.id, include_loopback=True)]
            mic = loopbacks[0]
            self._backend = "soundcard_wasapi_loopback"
            self._stop.clear()

            def _run() -> None:
                try:
                    with mic.recorder(
                        samplerate=self.sample_rate,
                        channels=self.channels,
                        blocksize=self.samples_per_frame,
                    ) as rec:
                        while not self._stop.is_set():
                            data = rec.record(numframes=self.samples_per_frame)
                            # float32 [-1, 1] → s16le interleaved
                            clipped = np.clip(data, -1.0, 1.0)
                            pcm = (clipped * 32767.0).astype("<i2").tobytes()
                            try:
                                self._q.put(pcm, timeout=0.05)
                            except queue.Full:
                                try:
                                    self._q.get_nowait()
                                except queue.Empty:
                                    pass
                                try:
                                    self._q.put_nowait(pcm)
                                except queue.Full:
                                    pass
                except Exception as exc:  # noqa: BLE001
                    self._error = f"{type(exc).__name__}:{exc}"
                    log.warning("WASAPI loopback capture stopped: %s", exc)

            self._thread = threading.Thread(target=_run, name="ai-bridge-wasapi", daemon=True)
            self._thread.start()
            self._started = True
            # Wait briefly for first frames or immediate error.
            deadline = time.time() + 1.5
            while time.time() < deadline and self._error is None:
                if not self._q.empty():
                    break
                time.sleep(0.05)
            if self._error:
                return False
            return True
        except Exception as exc:  # noqa: BLE001
            self._error = f"{type(exc).__name__}:{exc}"
            self._backend = "none"
            return False

    def read_pcm(self, silent_fallback: bytes) -> bytes:
        try:
            return self._q.get_nowait()
        except queue.Empty:
            return silent_fallback

    def stop(self) -> None:
        self._stop.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=1.5)
        self._thread = None
        self._started = False
