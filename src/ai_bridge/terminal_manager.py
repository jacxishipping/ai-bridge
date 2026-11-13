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

    def __init__(
        self,
        session_id: str,
        device_id: str = "local",
        cols: int = 120,
        rows: int = 35,
        remote_exec=None,
        device_label: str = "",
        device_os: str = "",
    ):
        self.session_id = session_id
        self.device_id = device_id
        self.cols = cols
        self.rows = rows
        self.remote_exec = remote_exec
        self.device_label = device_label or device_id
        self.device_os = device_os or ""
        self._is_remote = bool(remote_exec is not None and device_id and device_id != "local")
        self._is_windows_remote = "win" in self.device_os.lower()
        self._remote_cwd = ""
        self._line_buf = ""
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

    def _prompt(self) -> str:
        cwd_disp = self._remote_cwd or ("~" if not self._is_windows_remote else "C:\\")
        if self._is_windows_remote:
            return f"PS {self.device_label} {cwd_disp}> "
        return f"{self.device_label}:{cwd_disp}$ "

    def _start_process(self):
        """Spawn the platform shell (PTY on Linux, piped PowerShell on Windows) or start Remote Agent Relay."""
        if self._is_remote:
            os_tag = f" ({self.device_os})" if self.device_os else ""
            self._broadcast(
                f"Connected to {self.device_label}{os_tag} via AI Bridge Agent Shell Relay.\r\n"
                f"{self._prompt()}"
            )
            return

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

                env = {k: v for k, v in os.environ.items() if k not in ("AI_BRIDGE_ADMIN_TOKEN", "AI_BRIDGE_DEVICE_TOKEN", "AI_BRIDGE_OIDC_CLIENT_SECRET", "AI_BRIDGE_CSRF_SECRET")}
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

        env = {k: v for k, v in os.environ.items() if k not in ("AI_BRIDGE_ADMIN_TOKEN", "AI_BRIDGE_DEVICE_TOKEN", "AI_BRIDGE_OIDC_CLIENT_SECRET", "AI_BRIDGE_CSRF_SECRET")}
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

    def _exec_remote_line(self, cmd: str):
        """Execute a submitted command line on the remote agent and broadcast output."""
        try:
            stripped = cmd.strip()
            if not stripped:
                self._broadcast(self._prompt())
                return
            if stripped.lower() in ("exit", "logout"):
                self._broadcast("logout\r\n[Session Disconnected]\r\n")
                self.is_alive = False
                return
            if stripped.startswith("cd ") or stripped == "cd":
                target_dir = stripped[3:].strip().strip('"').strip("'") if len(stripped) > 2 else ""
                probe_cmd = (
                    f'cd "{target_dir}" && pwd'
                    if (target_dir and not self._is_windows_remote)
                    else (
                        f'Set-Location -LiteralPath "{target_dir}"; (Get-Location).Path'
                        if (target_dir and self._is_windows_remote)
                        else ("pwd" if not self._is_windows_remote else "(Get-Location).Path")
                    )
                )
                res = self.remote_exec(self.device_id, probe_cmd, self._remote_cwd)
                out = str((res or {}).get("stdout") or "").strip()
                err = str((res or {}).get("stderr") or "").strip()
                rc = (res or {}).get("returncode", 0)
                if rc == 0 and out:
                    self._remote_cwd = out.splitlines()[-1].strip()
                elif err:
                    self._broadcast(f"{err}\r\n")
                self._broadcast(self._prompt())
                return

            res = self.remote_exec(self.device_id, stripped, self._remote_cwd)
            if isinstance(res, dict):
                stdout = str(res.get("stdout") or "")
                stderr = str(res.get("stderr") or "")
                combined = stdout
                if stderr:
                    combined = f"{combined.rstrip()}\r\n{stderr}" if combined.strip() else stderr
                if combined:
                    norm = combined.replace("\r\n", "\n").replace("\n", "\r\n")
                    if not norm.endswith("\r\n"):
                        norm += "\r\n"
                    self._broadcast(norm)
            elif res is not None:
                self._broadcast(f"{res}\r\n")
        except Exception as exc:
            self._broadcast(f"[Remote execution error: {exc}]\r\n")
        if self.is_alive:
            self._broadcast(self._prompt())

    def write(self, data: str):
        """Write user input to the terminal."""
        if not self.is_alive or not data:
            return
        self.last_active = time.time()

        if self._is_remote:
            for ch in data:
                if ch == "\x03":
                    self._line_buf = ""
                    self._broadcast(f"^C\r\n{self._prompt()}")
                elif ch == "\x04":
                    self._line_buf = ""
                    self._broadcast("^D\r\n[Session Disconnected]\r\n")
                    self.is_alive = False
                    return
                elif ch in ("\x7f", "\b"):
                    if self._line_buf:
                        self._line_buf = self._line_buf[:-1]
                elif ch in ("\r", "\n"):
                    cmd = self._line_buf
                    self._line_buf = ""
                    if cmd.strip():
                        self._broadcast(f"{cmd}\r\n")
                        threading.Thread(target=self._exec_remote_line, args=(cmd,), daemon=True).start()
                    else:
                        self._broadcast(f"\r\n{self._prompt()}")
                else:
                    self._line_buf += ch
            return

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

def create_terminal_session(
    device_id: str = "local",
    cols: int = 120,
    rows: int = 35,
    remote_exec=None,
    device_label: str = "",
    device_os: str = "",
) -> TerminalSession:
    """Create a new live terminal session."""
    session_id = uuid.uuid4().hex[:12]
    sess = TerminalSession(
        session_id,
        device_id=device_id,
        cols=cols,
        rows=rows,
        remote_exec=remote_exec,
        device_label=device_label,
        device_os=device_os,
    )
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

