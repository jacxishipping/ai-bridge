"""Linux netns / gVisor-oriented browser egress isolation helpers.

Playwright Chromium still runs as a child process. When
``AI_BRIDGE_BROWSER_NETNS=1`` on Linux, launch wrappers prefer ``unshare`` /
``bwrap`` if present. gVisor ``runsc`` is detected but not auto-invoked unless
``AI_BRIDGE_BROWSER_GVISOR=1`` and ``runsc`` is on PATH.
"""
from __future__ import annotations

import os
import shutil
import sys
from typing import Any


def browser_netns_requested() -> bool:
    return os.environ.get("AI_BRIDGE_BROWSER_NETNS", "").strip().lower() in ("1", "true", "yes")


def browser_gvisor_requested() -> bool:
    return os.environ.get("AI_BRIDGE_BROWSER_GVISOR", "").strip().lower() in ("1", "true", "yes")


def describe_os_browser_isolation() -> dict[str, Any]:
    is_linux = sys.platform.startswith("linux")
    has_unshare = bool(shutil.which("unshare"))
    has_bwrap = bool(shutil.which("bwrap"))
    has_runsc = bool(shutil.which("runsc"))
    mode = "none"
    if browser_gvisor_requested() and has_runsc:
        mode = "gvisor_runsc"
    elif browser_netns_requested() and is_linux and (has_bwrap or has_unshare):
        mode = "linux_netns_wrapper"
    elif browser_netns_requested() and not is_linux:
        mode = "unsupported_platform"
    return {
        "platform": sys.platform,
        "netns_requested": browser_netns_requested(),
        "gvisor_requested": browser_gvisor_requested(),
        "has_unshare": has_unshare,
        "has_bwrap": has_bwrap,
        "has_runsc": has_runsc,
        "mode": mode,
        "limitations": [
            "Isolation wraps the Chromium process; it is not a separate agent worker VM.",
            "gVisor requires runsc on PATH and AI_BRIDGE_BROWSER_GVISOR=1.",
            "Non-Linux hosts cannot enable netns; Playwright sandbox still applies.",
        ],
    }


def chromium_launch_wrapper_argv(inner_argv: list[str]) -> list[str]:
    """Return argv that optionally wraps Chromium with bwrap/unshare/runsc."""
    info = describe_os_browser_isolation()
    mode = info["mode"]
    if mode == "gvisor_runsc":
        return ["runsc", "do", "--"] + list(inner_argv)
    if mode == "linux_netns_wrapper":
        if info["has_bwrap"]:
            # Minimal network namespace + fresh /tmp; keep /usr and libs visible.
            return [
                "bwrap",
                "--unshare-net",
                "--die-with-parent",
                "--ro-bind",
                "/usr",
                "/usr",
                "--ro-bind",
                "/lib",
                "/lib",
                "--ro-bind-try",
                "/lib64",
                "/lib64",
                "--proc",
                "/proc",
                "--dev",
                "/dev",
                "--tmpfs",
                "/tmp",
                "--",
            ] + list(inner_argv)
        if info["has_unshare"]:
            return ["unshare", "--net", "--"] + list(inner_argv)
    return list(inner_argv)
