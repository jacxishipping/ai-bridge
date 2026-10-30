"""Interactive Live Terminal (PTY on Linux / ConPTY Pipes on Windows).

Provides high-performance, real-time terminal streaming over SSE:
- Linux: Full pseudo-terminal via pty.openpty() with ANSI color support, job control, signals.
- Windows: Piped interactive PowerShell with asynchronous stdout/stderr streaming.
- SSE Stream Broadcaster: Real-time chunk delivery to browser dashboard with replay buffer.
- Bi-directional interactive input: keystrokes, Ctrl+C, tab completion, command execution.
"""
from __future__ import annotations

import os
import platform
import queue
import subprocess
import sys
import threading
import time
import uuid
from typing import Generator

_TERMINAL_SESSIONS: dict[str, "TerminalSession"] = {}
_LOCK = threading.Lock()


class TerminalSession:
    """Manages an active interactive shell process and its real-time I/O streams."""

    def __init__(self, session_id: str, device_id: str = "local", cols: int = 120, rows: int = 35):
        self.session_id = session_id
        self.device_id = device_id
        self.cols = cols
        self.rows = rows
        self.created_at = time.time()
        self.last_active = time.time()
        self.is_alive = True
        self.seq = 0
        self.buffer: list[dict] = []
        self._max_buffer = 1000
        self.subscribers: set[queue.Queue] = set()

        self.proc: subprocess.Popen | None = None
        self.master_fd: int | None = None
        self.slave_fd: int | None = None

        self._start_process()

    def _start_process(self):
        """Spawn the platform shell (PTY on Linux, piped PowerShell on Windows)."""
        system = platform.system()

        if system == "Linux" or system == "Darwin":
            try:
                import pty

                self.master_fd, self.slave_fd = pty.openpty()

                # Set initial terminal size if termios available
                try:
                    import fcntl
                    import struct
                    import termios

                    winsize = struct.pack("HHHH", self.rows, self.cols, 0, 0)
                    fcntl.ioctl(self.master_fd, termios.TIOCSWINSZ, winsize)
                except Exception:
                    pass

                shell = os.environ.get("SHELL", "/bin/bash")
                if not os.path.exists(shell):
                    shell = "/bin/sh"

                env = os.environ.copy()
                env["TERM"] = "xterm-256color"
                env["COLORTERM"] = "truecolor"

                self.proc = subprocess.Popen(
                    [shell, "-i"],
                    stdin=self.slave_fd,
                    stdout=self.slave_fd,
                    stderr=self.slave_fd,
                    close_fds=True,
                    env=env,
                )
                os.close(self.slave_fd)
                self.slave_fd = None

                reader = threading.Thread(target=self._pty_read_loop, daemon=True)
                reader.start()
                return
            except Exception:
                pass

        # Windows / Fallback Piped Process
        shell_cmd = ["powershell.exe", "-NoLogo", "-NoExit", "-Command", "-"]
        if system != "Windows":
            shell_cmd = ["/bin/sh", "-i"]

        env = os.environ.copy()
        env["TERM"] = "xterm-256color"

        self.proc = subprocess.Popen(
            shell_cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=False,
            bufsize=0,
            env=env,
        )

        reader = threading.Thread(target=self._pipe_read_loop, daemon=True)
        reader.start()

    def _broadcast(self, text: str):
        """Append to history buffer and notify active SSE subscribers."""
        self.last_active = time.time()
        self.seq += 1
        chunk = {"seq": self.seq, "text": text, "ts": self.last_active}

        with _LOCK:
            self.buffer.append(chunk)
            if len(self.buffer) > self._max_buffer:
                self.buffer.pop(0)

            dead_subs = set()
            for q in self.subscribers:
                try:
                    q.put_nowait(chunk)
                except Exception:
                    dead_subs.add(q)
            self.subscribers.difference_update(dead_subs)

    def _pty_read_loop(self):
        """Read output from Linux PTY master FD."""
        try:
            while self.is_alive and self.master_fd is not None:
                data = os.read(self.master_fd, 2048)
                if not data:
                    break
                text = data.decode("utf-8", errors="replace")
                self._broadcast(text)
        except Exception:
            pass
        finally:
            self.is_alive = False
            self._broadcast("\r\n[Session Disconnected]\r\n")

    def _pipe_read_loop(self):
        """Read output from piped subprocess."""
        try:
            while self.is_alive and self.proc and self.proc.stdout:
                data = self.proc.stdout.read(512)
                if not data:
                    break
                text = data.decode("utf-8", errors="replace")
                self._broadcast(text)
        except Exception:
            pass
        finally:
            self.is_alive = False
            self._broadcast("\r\n[Session Disconnected]\r\n")

    def write(self, data: str):
        """Write user input to the terminal."""
        if not self.is_alive or not data:
            return
        self.last_active = time.time()
        raw = data.encode("utf-8", errors="replace")

        try:
            if self.master_fd is not None:
                os.write(self.master_fd, raw)
            elif self.proc and self.proc.stdin:
                self.proc.stdin.write(raw)
                self.proc.stdin.flush()
        except Exception:
            self.is_alive = False

    def resize(self, cols: int, rows: int):
        """Resize terminal dimensions."""
        self.cols = max(20, cols)
        self.rows = max(5, rows)
        if self.master_fd is not None and platform.system() in ("Linux", "Darwin"):
            try:
                import fcntl
                import struct
                import termios

                winsize = struct.pack("HHHH", self.rows, self.cols, 0, 0)
                fcntl.ioctl(self.master_fd, termios.TIOCSWINSZ, winsize)
            except Exception:
                pass

    def stream(self, since_seq: int = 0) -> Generator[str, None, None]:
        """Generator yielding SSE formatted strings for real-time frontend streaming."""
        q = queue.Queue(maxsize=500)
        with _LOCK:
            # Replay history since requested sequence number
            for item in self.buffer:
                if item["seq"] > since_seq:
                    q.put_nowait(item)
            self.subscribers.add(q)

        try:
            import json

            # Initial greeting event
            yield f"data: {json.dumps({'type': 'init', 'session_id': self.session_id, 'cols': self.cols, 'rows': self.rows})}\n\n"

            while self.is_alive or not q.empty():
                try:
                    chunk = q.get(timeout=20.0)
                    yield f"data: {json.dumps(chunk)}\n\n"
                except queue.Empty:
                    # Keep-alive heartbeat comment
                    yield ": ping\n\n"
        finally:
            with _LOCK:
                self.subscribers.discard(q)

    def close(self):
        """Terminate the terminal process and clean up handles."""
        self.is_alive = False
        try:
            if self.proc:
                self.proc.terminate()
                try:
                    self.proc.wait(timeout=1.0)
                except Exception:
                    self.proc.kill()
        except Exception:
            pass

        if self.master_fd is not None:
            try:
                os.close(self.master_fd)
            except Exception:
                pass
            self.master_fd = None


# ============================================================================
# Manager API
# ============================================================================

def create_terminal_session(device_id: str = "local", cols: int = 120, rows: int = 35) -> TerminalSession:
    """Create a new live terminal session."""
    session_id = uuid.uuid4().hex[:12]
    sess = TerminalSession(session_id, device_id=device_id, cols=cols, rows=rows)
    with _LOCK:
        _TERMINAL_SESSIONS[session_id] = sess
    return sess


def get_terminal_session(session_id: str) -> TerminalSession | None:
    """Retrieve an active terminal session."""
    with _LOCK:
        return _TERMINAL_SESSIONS.get(session_id)


def close_terminal_session(session_id: str) -> bool:
    """Close and remove a terminal session."""
    with _LOCK:
        sess = _TERMINAL_SESSIONS.pop(session_id, None)
    if sess:
        sess.close()
        return True
    return False


def list_terminal_sessions(device_id: str | None = None) -> list[dict]:
    """List active terminal sessions."""
    with _LOCK:
        results = []
        for s in _TERMINAL_SESSIONS.values():
            if device_id is None or s.device_id == device_id:
                results.append({
                    "session_id": s.session_id,
                    "device_id": s.device_id,
                    "is_alive": s.is_alive,
                    "created_at": s.created_at,
                    "last_active": s.last_active,
                    "cols": s.cols,
                    "rows": s.rows,
                })
        return results

