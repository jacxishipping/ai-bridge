"""Runtime support for the AI Bridge Windows desktop app.

Three concerns the GUI should not implement inline:

1. **Device-token storage.** The token is a bearer credential: anything that can
   read it can drive the enrolled machine. On Windows it is sealed with DPAPI
   (``CryptProtectData``) under the current user, so a copied file is useless on
   another account or machine. Elsewhere (tests, Linux dev) it degrades to an
   owner-only ``0600`` file and ``token_backend()`` reports ``"file"`` so the UI
   can be honest about it.
2. **Single instance.** Two copies of the app share one token file and would
   fight over token rotation, so the second instance refuses to start.
3. **File logging**, including unhandled-exception capture, because the GUI's log
   widget disappears when the window closes.
"""
from __future__ import annotations

import base64
import contextlib
import ctypes
import logging
import logging.handlers
import os
import sys
import tempfile
from pathlib import Path

DPAPI_MAGIC = "aib-dpapi-v1:"
DEFAULT_TOKEN_FILE = Path.home() / ".ai-bridge" / "device.token"
DEFAULT_LOG_DIR = Path.home() / ".ai-bridge" / "logs"

CRYPTPROTECT_UI_FORBIDDEN = 0x1
ERROR_ALREADY_EXISTS = 183
CONFIG_TOKEN_KEY = "device_token"


class TokenStoreError(RuntimeError):
    """A stored token exists but cannot be read or decrypted by this user."""


# ---------------------------------------------------------------------------
# Platform probes
# ---------------------------------------------------------------------------
def is_windows() -> bool:
    return sys.platform == "win32"


def dpapi_available() -> bool:
    if not is_windows():
        return False
    try:
        ctypes.WinDLL("crypt32")
    except OSError:
        return False
    return True


def _dpapi(data: bytes, *, protect: bool) -> bytes:
    """Call CryptProtectData / CryptUnprotectData. Raises OSError on failure."""

    class _Blob(ctypes.Structure):
        _fields_ = [("cbData", ctypes.c_uint32), ("pbData", ctypes.c_void_p)]

    crypt32 = ctypes.WinDLL("crypt32", use_last_error=True)
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)

    func = crypt32.CryptProtectData if protect else crypt32.CryptUnprotectData
    func.argtypes = [
        ctypes.POINTER(_Blob),
        ctypes.c_void_p,
        ctypes.POINTER(_Blob),
        ctypes.c_void_p,
        ctypes.c_void_p,
        ctypes.c_uint32,
        ctypes.POINTER(_Blob),
    ]
    func.restype = ctypes.c_int
    kernel32.LocalFree.argtypes = [ctypes.c_void_p]
    kernel32.LocalFree.restype = ctypes.c_void_p

    buffer = ctypes.create_string_buffer(data, len(data))
    blob_in = _Blob(len(data), ctypes.cast(buffer, ctypes.c_void_p))
    blob_out = _Blob()

    ok = func(
        ctypes.byref(blob_in),
        None,
        None,
        None,
        None,
        CRYPTPROTECT_UI_FORBIDDEN,
        ctypes.byref(blob_out),
    )
    if not ok:
        err = ctypes.get_last_error()
        action = "protect" if protect else "unprotect"
        raise OSError(err or -1, f"DPAPI {action} failed")
    try:
        return ctypes.string_at(blob_out.pbData, blob_out.cbData)
    finally:
        kernel32.LocalFree(ctypes.cast(blob_out.pbData, ctypes.c_void_p))


# ---------------------------------------------------------------------------
# Token sealing
# ---------------------------------------------------------------------------
def seal_token(token: str) -> str:
    """Return the on-disk representation of ``token`` (DPAPI-sealed if possible)."""
    raw = token.encode("utf-8")
    if not raw:
        return ""
    if dpapi_available():
        sealed = _dpapi(raw, protect=True)
        return DPAPI_MAGIC + base64.b64encode(sealed).decode("ascii")
    return token


def unseal_token(stored: str) -> str:
    """Inverse of :func:`seal_token`; also accepts legacy plaintext files."""
    if not stored.startswith(DPAPI_MAGIC):
        return stored
    if not dpapi_available():
        raise TokenStoreError(
            "The stored device token is DPAPI-sealed and can only be opened by "
            "the Windows user that sealed it."
        )
    try:
        blob = base64.b64decode(stored[len(DPAPI_MAGIC):])
        return _dpapi(blob, protect=False).decode("utf-8")
    except (OSError, ValueError) as exc:
        raise TokenStoreError(f"Could not decrypt the sealed device token: {exc}") from exc


def token_backend(path: Path | None = None) -> str:
    """``"dpapi"`` if the stored token is sealed, otherwise ``"file"``."""
    target = Path(path) if path is not None else DEFAULT_TOKEN_FILE
    try:
        head = target.read_text(encoding="utf-8").strip()
    except OSError:
        return "file"
    return "dpapi" if head.startswith(DPAPI_MAGIC) else "file"


# ---------------------------------------------------------------------------
# Token file IO
# ---------------------------------------------------------------------------
def _atomic_write(path: Path, data: bytes, *, mode: int = 0o600) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(dir=str(path.parent), prefix=f".{path.name}.", suffix=".tmp")
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        with contextlib.suppress(OSError):
            os.chmod(tmp_name, mode)
        os.replace(tmp_name, path)
    except BaseException:
        with contextlib.suppress(OSError):
            os.unlink(tmp_name)
        raise


def save_token(token: str, path: Path | None = None) -> Path:
    """Persist ``token`` for this user. Returns the file written."""
    target = Path(path) if path is not None else DEFAULT_TOKEN_FILE
    _atomic_write(target, seal_token((token or "").strip()).encode("utf-8"))
    return target


def load_token(path: Path | None = None, *, default: str = "") -> str:
    """Read the persisted token, unsealing it if needed."""
    target = Path(path) if path is not None else DEFAULT_TOKEN_FILE
    if not target.exists():
        return default
    try:
        stored = target.read_text(encoding="utf-8").strip()
    except OSError as exc:
        raise TokenStoreError(f"Could not read the device token file: {exc}") from exc
    return unseal_token(stored) if stored else default


def clear_token(path: Path | None = None) -> None:
    target = Path(path) if path is not None else DEFAULT_TOKEN_FILE
    with contextlib.suppress(FileNotFoundError):
        target.unlink()


def migrate_token_file(path: Path | None = None) -> bool:
    """Re-seal a legacy plaintext token file. Returns True if it was rewritten."""
    target = Path(path) if path is not None else DEFAULT_TOKEN_FILE
    if not target.exists() or not dpapi_available():
        return False
    try:
        stored = target.read_text(encoding="utf-8").strip()
    except OSError:
        return False
    if not stored or stored.startswith(DPAPI_MAGIC):
        return False
    save_token(stored, target)
    return True


def strip_token_from_config(config: dict) -> dict:
    """Return a copy of the GUI config with the bearer token removed."""
    return {k: v for k, v in config.items() if k != CONFIG_TOKEN_KEY}


def mask_secret(value: str) -> str:
    """Render a credential safe for logs and status text."""
    text = (value or "").strip()
    if not text:
        return "(unset)"
    if len(text) <= 10:
        return "*" * len(text)
    return f"{text[:6]}\u2026{text[-4:]}"


# ---------------------------------------------------------------------------
# Single instance
# ---------------------------------------------------------------------------
class SingleInstanceGuard:
    """Hold a user-scoped lock for the lifetime of the desktop app."""

    def __init__(self, name: str = "AIBridgeWindowsClient", lock_dir: Path | None = None) -> None:
        self.name = name
        self.lock_dir = Path(lock_dir) if lock_dir is not None else DEFAULT_TOKEN_FILE.parent
        self._mutex: int | None = None
        self._handle = None

    @property
    def acquired(self) -> bool:
        return self._mutex is not None or self._handle is not None

    def acquire(self) -> bool:
        if self.acquired:
            return True
        if is_windows():
            kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
            kernel32.CreateMutexW.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_wchar_p]
            kernel32.CreateMutexW.restype = ctypes.c_void_p
            kernel32.CloseHandle.argtypes = [ctypes.c_void_p]
            ctypes.set_last_error(0)
            handle = kernel32.CreateMutexW(None, 0, self.name)
            if not handle:
                return False
            if ctypes.get_last_error() == ERROR_ALREADY_EXISTS:
                kernel32.CloseHandle(handle)
                return False
            self._mutex = handle
            return True

        import fcntl  # POSIX only, imported here so this module loads on Windows

        self.lock_dir.mkdir(parents=True, exist_ok=True)
        handle = open(self.lock_dir / f"{self.name}.lock", "a+")  # noqa: SIM115 - held open by design
        try:
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            handle.close()
            return False
        handle.seek(0)
        handle.truncate()
        handle.write(str(os.getpid()))
        handle.flush()
        self._handle = handle
        return True

    def release(self) -> None:
        if is_windows() and self._mutex is not None:
            with contextlib.suppress(OSError):
                ctypes.WinDLL("kernel32").CloseHandle(self._mutex)
            self._mutex = None
        if self._handle is not None:
            with contextlib.suppress(OSError):
                import fcntl

                fcntl.flock(self._handle.fileno(), fcntl.LOCK_UN)
            with contextlib.suppress(OSError):
                self._handle.close()
            self._handle = None


# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
def configure_file_logging(
    log_dir: Path | None = None,
    *,
    filename: str = "agent-gui.log",
    level: int = logging.INFO,
    max_bytes: int = 2_000_000,
    backups: int = 3,
) -> Path:
    """Attach one rotating file handler to the root logger. Idempotent."""
    directory = Path(log_dir) if log_dir is not None else DEFAULT_LOG_DIR
    directory.mkdir(parents=True, exist_ok=True)
    target = directory / filename

    root = logging.getLogger()
    for handler in root.handlers:
        if getattr(handler, "_aibridge_file_log", False):
            return target

    handler = logging.handlers.RotatingFileHandler(
        target, maxBytes=max_bytes, backupCount=backups, encoding="utf-8"
    )
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)-7s %(name)s: %(message)s"))
    handler._aibridge_file_log = True  # type: ignore[attr-defined]
    root.addHandler(handler)
    if root.level > level:
        root.setLevel(level)
    return target


def install_excepthook(logger_name: str = "ai_bridge.gui") -> None:
    """Record unhandled exceptions in the log before the default hook runs."""
    logger = logging.getLogger(logger_name)

    def _hook(exc_type, exc, tb):
        if issubclass(exc_type, KeyboardInterrupt):
            sys.__excepthook__(exc_type, exc, tb)
            return
        logger.critical("Unhandled exception in desktop app", exc_info=(exc_type, exc, tb))
        sys.__excepthook__(exc_type, exc, tb)

    sys.excepthook = _hook
