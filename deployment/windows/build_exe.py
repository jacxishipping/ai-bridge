"""Standalone Executable Builder for AI Bridge Windows Agent.

Builds single-file, zero-prerequisite Windows executables:
1. dist/AIBridge-Setup.exe  - Full Graphical Setup & Package Provisioner Wizard
2. dist/AIBridge-Agent.exe  - Native Fluent 2 Desktop Client & System Tray Manager
"""
from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
import tomllib
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DIST_DIR = REPO_ROOT / "dist"
BUILD_DIR = REPO_ROOT / "build"
ASSETS_DIR = REPO_ROOT / "assets"
ICO_PATH = ASSETS_DIR / "ai-bridge.ico"
SIGN_TIMESTAMP_DEFAULT = "http://timestamp.digicert.com"


def signing_requested() -> bool:
    """True when the environment asks for Authenticode signing."""
    return bool(
        os.environ.get("AIBRIDGE_SIGN_CERT", "").strip()
        or os.environ.get("AIBRIDGE_SIGN_THUMBPRINT", "").strip()
    )


def signing_config() -> dict | None:
    """Signing inputs from the environment, or None when signing is off."""
    if not signing_requested():
        return None
    return {
        "cert": os.environ.get("AIBRIDGE_SIGN_CERT", "").strip(),
        "password": os.environ.get("AIBRIDGE_SIGN_PASSWORD", ""),
        "thumbprint": os.environ.get("AIBRIDGE_SIGN_THUMBPRINT", "").strip(),
        "timestamp": os.environ.get("AIBRIDGE_SIGN_TIMESTAMP_URL", SIGN_TIMESTAMP_DEFAULT).strip(),
    }


def find_signtool() -> str:
    """Locate signtool.exe: explicit override, PATH, then the Windows SDK."""
    override = os.environ.get("AIBRIDGE_SIGNTOOL", "").strip()
    if override:
        if Path(override).is_file():
            return override
        found = shutil.which(override)
        if found:
            return found
        raise RuntimeError(f"AIBRIDGE_SIGNTOOL points at {override}, which does not exist.")

    found = shutil.which("signtool") or shutil.which("signtool.exe")
    if found:
        return found

    kits = Path(os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)")) / "Windows Kits" / "10" / "bin"
    if kits.is_dir():
        def version_key(path: Path) -> tuple[int, ...]:
            return tuple(int(part) for part in re.findall(r"\d+", path.parent.parent.name))

        candidates = sorted(kits.glob("*/x64/signtool.exe"), key=version_key, reverse=True)
        if candidates:
            return str(candidates[0])

    raise RuntimeError(
        "Signing was requested but signtool.exe was not found. Install the Windows SDK "
        "or set AIBRIDGE_SIGNTOOL to its full path."
    )


def build_sign_args(exe: Path, signtool: str, config: dict) -> list[str]:
    """The signtool command line for the configured certificate."""
    args = [signtool, "sign", "/fd", "SHA256"]
    if config["cert"]:
        args += ["/f", config["cert"]]
        if config["password"]:
            args += ["/p", config["password"]]
    else:
        args += ["/sha1", config["thumbprint"]]
    if config["timestamp"]:
        args += ["/tr", config["timestamp"], "/td", "SHA256"]
    args.append(str(exe))
    return args


def sign_executable(exe: Path) -> None:
    """Authenticode-sign one executable. No-op unless signing is configured."""
    config = signing_config()
    if config is None:
        print(f"[SIGN] {exe.name}: skipped (set AIBRIDGE_SIGN_CERT or AIBRIDGE_SIGN_THUMBPRINT to sign)")
        return

    signtool = find_signtool()
    if config["cert"]:
        source = f"certificate {config['cert']}"
    else:
        source = f"thumbprint {config['thumbprint']}"
    print(f"[SIGN] Signing {exe.name} with {source} via {signtool}")

    res = subprocess.run(build_sign_args(exe, signtool, config), capture_output=True, text=True)
    if res.returncode != 0:
        detail = (res.stdout + res.stderr).strip()[:500]
        raise RuntimeError(f"signtool failed ({res.returncode}): {detail}")
    print(f"[SIGN] Signed {exe.name}")

    verify = subprocess.run([signtool, "verify", "/pa", str(exe)], capture_output=True, text=True)
    if verify.returncode == 0:
        print(f"[SIGN] Verified {exe.name}")
    else:
        detail = (verify.stdout + verify.stderr).strip()[:300]
        print(f"[SIGN] [WARN] Could not verify {exe.name} on this host: {detail}")


def project_version() -> str:
    """The single version declared in pyproject.toml."""
    try:
        data = tomllib.loads((REPO_ROOT / "pyproject.toml").read_text(encoding="utf-8"))
        return str(data["project"]["version"])
    except Exception as exc:  # noqa: BLE001 - metadata is cosmetic, never block a build
        print(f"[WARN] Could not read the project version: {exc}")
        return "0.0.0"


def _version_quad(version: str) -> tuple[int, int, int, int]:
    """Pad a dotted version to the four integers a VS_VERSIONINFO needs."""
    numbers = [int(part) for part in re.findall(r"\d+", version)][:4]
    return tuple(numbers + [0] * (4 - len(numbers)))


def write_version_file(name: str, description: str, version: str) -> Path:
    """Write the Windows version resource Explorer and SmartScreen read."""
    quad = _version_quad(version)
    BUILD_DIR.mkdir(parents=True, exist_ok=True)
    path = BUILD_DIR / f"version-{name}.txt"
    path.write_text(
        f"""VSVersionInfo(
  ffi=FixedFileInfo(
    filevers={quad},
    prodvers={quad},
    mask=0x3f,
    flags=0x0,
    OS=0x40004,
    fileType=0x1,
    subtype=0x0,
    date=(0, 0)
  ),
  kids=[
    StringFileInfo([
      StringTable(
        '040904B0',
        [StringStruct('CompanyName', 'AI Bridge'),
         StringStruct('FileDescription', '{description}'),
         StringStruct('FileVersion', '{version}'),
         StringStruct('InternalName', '{name}'),
         StringStruct('OriginalFilename', '{name}.exe'),
         StringStruct('ProductName', 'AI Bridge'),
         StringStruct('ProductVersion', '{version}')])
    ]),
    VarFileInfo([VarStruct('Translation', [1033, 1200])])
  ]
)
""",
        encoding="utf-8",
    )
    return path


def build_setup_installer():
    """Build dist/AIBridge-Setup.exe using PyInstaller."""
    print("=" * 60)
    print("Building Standalone AI Bridge Setup Wizard Executable...")
    print("=" * 60)

    script_path = REPO_ROOT / "deployment" / "windows" / "installer_gui.py"
    req_file = REPO_ROOT / "deployment" / "windows" / "requirements.txt"

    # The onefile bundle is temporary, so the wizard carries the whole
    # application payload and copies it into the install folder at setup time.
    payload = [
        (ASSETS_DIR, "assets"),
        (REPO_ROOT / "agents", "agents"),
        (REPO_ROOT / "src", "src"),
        (REPO_ROOT / "pyproject.toml", "."),
        (REPO_ROOT / "README.md", "."),
        (req_file, "deployment/windows"),
    ]

    # A single distributable exe: the built tray client rides inside the setup
    # wizard and is copied out at install time.
    client_exe = DIST_DIR / "AIBridge-Agent.exe"
    if client_exe.exists():
        payload.append((client_exe, "payload"))
        print(f"Embedding the standalone tray client: {client_exe}")
    else:
        print("[NOTE] AIBridge-Agent.exe not found in dist; run with --all to embed it.")

    args = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--clean",
        "--onefile",
        "--windowed",
        "--name", "AIBridge-Setup",
        *[f"--add-data={source};{dest}" for source, dest in payload],
        "--hidden-import=PIL",
        "--hidden-import=PIL.Image",
        "--hidden-import=urllib.request",
        "--hidden-import=tkinter",
        "--hidden-import=queue",
        f"--version-file={write_version_file('AIBridge-Setup', 'AI Bridge Windows Setup', project_version())}",
    ]

    if ICO_PATH.exists():
        args.append(f"--icon={ICO_PATH}")

    args.append(str(script_path))

    print("Running command:", " ".join(args))
    res = subprocess.run(args, cwd=str(REPO_ROOT))
    if res.returncode != 0:
        raise RuntimeError(f"PyInstaller failed with code {res.returncode}")

    target_exe = DIST_DIR / "AIBridge-Setup.exe"
    if not target_exe.exists():
        raise RuntimeError(f"Expected installer executable not found at {target_exe}")
    sign_executable(target_exe)
    size_mb = target_exe.stat().st_size / (1024 * 1024)
    print(f"\n[SUCCESS] Generated standalone installer: {target_exe} ({size_mb:.2f} MB)")


def build_client_agent():
    """Build dist/AIBridge-Agent.exe using PyInstaller."""
    print("=" * 60)
    print("Building Native AI Bridge Client Executable...")
    print("=" * 60)

    script_path = REPO_ROOT / "agents" / "windows" / "gui_app.py"

    # gui_app.py imports its siblings (app_runtime, diagnose, gui_ui), the
    # poller from agents/common, and the ai_bridge package from src/. A frozen
    # build must analyse those path roots; it also needs pywin32 for the tray.
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
        f"--paths={REPO_ROOT / 'agents' / 'windows'}",
        f"--paths={REPO_ROOT / 'agents'}",
        f"--paths={REPO_ROOT / 'src'}",
        "--hidden-import=win32gui",
        "--hidden-import=win32con",
        "--hidden-import=pywintypes",
        "--hidden-import=psutil",
        "--hidden-import=PIL",
        "--hidden-import=PIL.Image",
        f"--version-file={write_version_file('AIBridge-Agent', 'AI Bridge Windows Tray Client', project_version())}",
    ]

    if ICO_PATH.exists():
        args.append(f"--icon={ICO_PATH}")

    args.append(str(script_path))

    print("Running command:", " ".join(args))
    res = subprocess.run(args, cwd=str(REPO_ROOT))
    if res.returncode != 0:
        # Never let --all embed a stale client left over from an earlier build.
        raise RuntimeError(f"PyInstaller client build failed with code {res.returncode}")
    target_exe = DIST_DIR / "AIBridge-Agent.exe"
    if not target_exe.exists():
        raise RuntimeError(f"Expected client executable not found at {target_exe}")
    # Sign before the installer build embeds this file, so the payload carries
    # the same signature as the standalone client.
    sign_executable(target_exe)
    size_mb = target_exe.stat().st_size / (1024 * 1024)
    print(f"\n[SUCCESS] Generated standalone client: {target_exe} ({size_mb:.2f} MB)")


def main():
    # Build the client first so the setup exe can embed it, giving one
    # distributable file that carries both the wizard and the tray client.
    if "--all" in sys.argv:
        build_client_agent()
    build_setup_installer()


if __name__ == "__main__":
    main()

