"""Standalone Executable Builder for AI Bridge Windows Agent.

Builds single-file, zero-prerequisite Windows executables:
1. dist/AIBridge-Setup.exe  - Full Graphical Setup & Package Provisioner Wizard
2. dist/AIBridge-Agent.exe  - Native Fluent 2 Desktop Client & System Tray Manager
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DIST_DIR = REPO_ROOT / "dist"
BUILD_DIR = REPO_ROOT / "build"
ASSETS_DIR = REPO_ROOT / "assets"
ICO_PATH = ASSETS_DIR / "ai-bridge.ico"


def build_setup_installer():
    """Build dist/AIBridge-Setup.exe using PyInstaller."""
    print("=" * 60)
    print("Building Standalone AI Bridge Setup Wizard Executable...")
    print("=" * 60)

    script_path = REPO_ROOT / "deployment" / "windows" / "installer_gui.py"
    req_file = REPO_ROOT / "deployment" / "windows" / "requirements.txt"

    args = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--clean",
        "--onefile",
        "--windowed",
        "--name", "AIBridge-Setup",
        f"--add-data={ASSETS_DIR};assets",
        f"--add-data={req_file};deployment/windows",
        "--hidden-import=PIL",
        "--hidden-import=PIL.Image",
        "--hidden-import=urllib.request",
        "--hidden-import=tkinter",
        "--hidden-import=queue",
    ]

    if ICO_PATH.exists():
        args.append(f"--icon={ICO_PATH}")

    args.append(str(script_path))

    print("Running command:", " ".join(args))
    res = subprocess.run(args, cwd=str(REPO_ROOT))
    if res.returncode != 0:
        raise RuntimeError(f"PyInstaller failed with code {res.returncode}")

    target_exe = DIST_DIR / "AIBridge-Setup.exe"
    if target_exe.exists():
        size_mb = target_exe.stat().st_size / (1024 * 1024)
        print(f"\n[SUCCESS] Generated standalone installer: {target_exe} ({size_mb:.2f} MB)")
    else:
        print("\n[WARNING] Expected executable not found at", target_exe)


def build_client_agent():
    """Build dist/AIBridge-Agent.exe using PyInstaller."""
    print("=" * 60)
    print("Building Native AI Bridge Client Executable...")
    print("=" * 60)

    script_path = REPO_ROOT / "agents" / "windows" / "gui_app.py"

    args = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--clean",
        "--onefile",
        "--windowed",
        "--name", "AIBridge-Agent",
        f"--add-data={ASSETS_DIR};assets",
        f"--add-data={REPO_ROOT / 'src'};src",
        "--hidden-import=pystray",
        "--hidden-import=psutil",
        "--hidden-import=PIL",
        "--hidden-import=aiortc",
        "--hidden-import=av",
        "--hidden-import=cryptography",
    ]

    if ICO_PATH.exists():
        args.append(f"--icon={ICO_PATH}")

    args.append(str(script_path))

    print("Running command:", " ".join(args))
    res = subprocess.run(args, cwd=str(REPO_ROOT))
    if res.returncode != 0:
        print(f"[NOTE] Client build returned {res.returncode}")
    else:
        target_exe = DIST_DIR / "AIBridge-Agent.exe"
        if target_exe.exists():
            size_mb = target_exe.stat().st_size / (1024 * 1024)
            print(f"\n[SUCCESS] Generated standalone client: {target_exe} ({size_mb:.2f} MB)")


def main():
    build_setup_installer()
    # If user passed --all, also compile the client
    if "--all" in sys.argv:
        build_client_agent()


if __name__ == "__main__":
    main()

