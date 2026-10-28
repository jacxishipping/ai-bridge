"""Vision, OCR, and UI element grounding for AI Bridge desktop automation."""
from __future__ import annotations

import json
import logging
import os
import platform
import subprocess
import time
from pathlib import Path
from typing import Any

logger = logging.getLogger("ai_bridge.vision")

_POWERSHELL_OCR_SCRIPT = r"""param([string]$ImagePath)
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.IsGenericMethod })[0]

Function Await($WinRtTask, $ResultType) {
    $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
    $netTask = $asTask.Invoke($null, @($WinRtTask))
    $netTask.Wait(-1) | Out-Null
    return $netTask.Result
}

[Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.Streams.IRandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.SoftwareBitmap, Windows.Graphics.Imaging, ContentType = WindowsRuntime] | Out-Null
[Windows.Media.Ocr.OcrEngine, Windows.Media.Ocr, ContentType = WindowsRuntime] | Out-Null
[Windows.Media.Ocr.OcrResult, Windows.Media.Ocr, ContentType = WindowsRuntime] | Out-Null

$abs = (Resolve-Path $ImagePath).Path
$file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($abs)) ([Windows.Storage.StorageFile])
$stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
$decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
$bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
$ocr = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
if (-not $ocr -and [Windows.Media.Ocr.OcrEngine]::AvailableRecognizerLanguages.Count -gt 0) {
    $ocr = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Media.Ocr.OcrEngine]::AvailableRecognizerLanguages[0])
}
if (-not $ocr) {
    Write-Output '{"ok":false,"error":"No OCR language pack available"}'
    exit 0
}

$res = Await ($ocr.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
$lines = @()
$allWords = @()

foreach ($l in $res.Lines) {
    $words = @()
    $minX = 999999; $minY = 999999; $maxX = 0; $maxY = 0
    foreach ($w in $l.Words) {
        $wx = [int]$w.BoundingRect.X
        $wy = [int]$w.BoundingRect.Y
        $ww = [int]$w.BoundingRect.Width
        $wh = [int]$w.BoundingRect.Height
        if ($wx -lt $minX) { $minX = $wx }
        if ($wy -lt $minY) { $minY = $wy }
        if (($wx + $ww) -gt $maxX) { $maxX = $wx + $ww }
        if (($wy + $wh) -gt $maxY) { $maxY = $wy + $wh }
        $wordObj = @{
            text = $w.Text
            x = $wx
            y = $wy
            width = $ww
            height = $wh
            center = @([int]($wx + $ww / 2), [int]($wy + $wh / 2))
        }
        $words += $wordObj
        $allWords += $wordObj
    }
    $lines += @{
        text = $l.Text
        bounds = @($minX, $minY, [int]($maxX - $minX), [int]($maxY - $minY))
        center = @([int]($minX + ($maxX - $minX) / 2), [int]($minY + ($maxY - $minY) / 2))
        words = $words
    }
}

@{
    ok = $true
    text = $res.Text
    line_count = $lines.Count
    lines = $lines
    words = $allWords
} | ConvertTo-Json -Depth 5 -Compress
"""

_OCR_PS1_CACHE: Path | None = None


def get_ocr_script_path() -> Path:
    global _OCR_PS1_CACHE
    if _OCR_PS1_CACHE and _OCR_PS1_CACHE.exists():
        return _OCR_PS1_CACHE
    target = Path(os.environ.get("TEMP", os.environ.get("TMP", "/tmp"))) / "ai_bridge_ocr.ps1"
    target.write_text(_POWERSHELL_OCR_SCRIPT, encoding="utf-8")
    _OCR_PS1_CACHE = target
    return target


def run_ocr(image_path: str | Path) -> dict[str, Any]:
    """Run native OCR on an image file and return extracted text with pixel coordinates."""
    path = Path(image_path)
    if not path.is_file():
        return {"ok": False, "error": f"Image file not found: {path}"}

    if platform.system() != "Windows":
        return {
            "ok": False,
            "error": "Native WinRT OCR is supported on Windows hosts.",
            "text": "",
            "lines": [],
            "words": [],
        }

    script_path = get_ocr_script_path()
    try:
        cmd = [
            "powershell",
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            str(script_path),
            "-ImagePath",
            str(path.resolve()),
        ]
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=25)
        if res.returncode != 0:
            return {"ok": False, "error": f"OCR script failed (code {res.returncode}): {res.stderr[:200]}"}

        out_text = res.stdout.strip()
        if not out_text:
            return {"ok": False, "error": "OCR produced no output."}

        try:
            data = json.loads(out_text, strict=False)
        except Exception:
            import re
            cleaned = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', out_text)
            data = json.loads(cleaned, strict=False)
        return data
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "OCR timed out after 25s."}
    except Exception as exc:
        return {"ok": False, "error": f"OCR failed: {exc}"}


def list_win32_ui_controls() -> list[dict[str, Any]]:
    """Enumerate visible desktop controls (menus, buttons, input fields, child controls)."""
    if platform.system() != "Windows":
        return []

    import ctypes
    from ctypes import wintypes

    u = ctypes.windll.user32
    hdesk = u.OpenDesktopW("Default", 0, False, 0x01FF)
    if hdesk:
        u.SetThreadDesktop(hdesk)

    controls: list[dict[str, Any]] = []
    rect = wintypes.RECT()

    def _enum_win(hwnd, _):
        if not u.IsWindowVisible(hwnd):
            return True
        tlen = u.GetWindowTextLengthW(hwnd)
        if tlen <= 0:
            return True
        t_buf = ctypes.create_unicode_buffer(tlen + 1)
        u.GetWindowTextW(hwnd, t_buf, tlen + 1)
        wtitle = t_buf.value.strip()
        if not wtitle:
            return True

        u.GetWindowRect(hwnd, ctypes.byref(rect))
        w_x, w_y, w_w, w_h = rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top
        if w_w <= 0 or w_h <= 0:
            return True

        controls.append({
            "hwnd": int(hwnd),
            "text": wtitle,
            "type": "window",
            "bounds": [w_x, w_y, w_w, w_h],
            "center": [w_x + w_w // 2, w_y + w_h // 2],
        })

        # Check Window Menu
        menu = u.GetMenu(hwnd)
        if menu:
            cnt = u.GetMenuItemCount(menu)
            for i in range(cnt):
                m_buf = ctypes.create_unicode_buffer(256)
                u.GetMenuStringW(menu, i, m_buf, 256, 0x0400)  # MF_BYPOSITION
                m_text = m_buf.value.replace("&", "").strip()
                m_rect = wintypes.RECT()
                if u.GetMenuItemRect(hwnd, menu, i, ctypes.byref(m_rect)):
                    mx, my, mw, mh = m_rect.left, m_rect.top, m_rect.right - m_rect.left, m_rect.bottom - m_rect.top
                    if mw > 0 and mh > 0:
                        controls.append({
                            "hwnd": int(hwnd),
                            "text": m_text,
                            "type": "menu_item",
                            "bounds": [mx, my, mw, mh],
                            "center": [mx + mw // 2, my + mh // 2],
                        })

        # Child controls (Buttons, Edits, Toolbars, etc.)
        def _enum_child(chwnd, _):
            if not u.IsWindowVisible(chwnd):
                return True
            clen = u.GetWindowTextLengthW(chwnd)
            c_title = ""
            if clen > 0:
                cb = ctypes.create_unicode_buffer(clen + 1)
                u.GetWindowTextW(chwnd, cb, clen + 1)
                c_title = cb.value.strip()

            c_cls_buf = ctypes.create_unicode_buffer(256)
            u.GetClassNameW(chwnd, c_cls_buf, 256)
            c_cls = c_cls_buf.value.strip()

            u.GetWindowRect(chwnd, ctypes.byref(rect))
            cx, cy, cw, ch = rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top
            if cw > 5 and ch > 5:
                controls.append({
                    "hwnd": int(chwnd),
                    "text": c_title or c_cls,
                    "type": f"control:{c_cls.lower()}",
                    "bounds": [cx, cy, cw, ch],
                    "center": [cx + cw // 2, cy + ch // 2],
                })
            return True

        u.EnumChildWindows(hwnd, ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)(_enum_child), 0)
        return True

    WNDENUMPROC = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    cb = WNDENUMPROC(_enum_win)
    if hdesk:
        u.EnumDesktopWindows(hdesk, cb, 0)
        u.CloseDesktop(hdesk)
    else:
        u.EnumWindows(cb, 0)

    return controls


def find_text_coordinates(
    query: str,
    image_path: str | Path | None = None,
    occurrence: int = 1,
) -> dict[str, Any]:
    """Find text on screen using OCR + UI controls and return exact bounding boxes and center click target."""
    q = (query or "").strip().lower()
    if not q:
        raise ValueError("query text cannot be empty.")

    # 1. If image provided or screenshot available, run OCR
    ocr_matches: list[dict[str, Any]] = []
    if image_path:
        ocr_res = run_ocr(image_path)
        if ocr_res.get("ok"):
            # Check lines first (handles multi-word queries like "Sign In" or "Admin Settings")
            for l in ocr_res.get("lines", []):
                lt = (l.get("text") or "").lower()
                if q in lt:
                    ocr_matches.append({
                        "text": l.get("text"),
                        "bounds": l.get("bounds"),
                        "center": l.get("center"),
                        "source": "ocr_line",
                    })

            # Check individual words
            if not ocr_matches:
                for w in ocr_res.get("words", []):
                    wt = (w.get("text") or "").lower()
                    if q in wt or wt in q:
                        ocr_matches.append({
                            "text": w.get("text"),
                            "bounds": [w.get("x"), w.get("y"), w.get("width"), w.get("height")],
                            "center": w.get("center"),
                            "source": "ocr_word",
                        })

    # 2. Check Win32 native controls
    ctrl_matches: list[dict[str, Any]] = []
    if platform.system() == "Windows":
        try:
            all_ctrls = list_win32_ui_controls()
            for c in all_ctrls:
                ct = (c.get("text") or "").lower()
                if q in ct:
                    ctrl_matches.append({
                        "text": c.get("text"),
                        "bounds": c.get("bounds"),
                        "center": c.get("center"),
                        "type": c.get("type"),
                        "source": "ui_control",
                    })
        except Exception as exc:
            logger.warning(f"Failed to enumerate Win32 UI controls: {exc}")

    # Combine matches (prioritize OCR if matched, or UI controls)
    all_matches = ocr_matches + ctrl_matches
    if not all_matches:
        return {
            "found": False,
            "query": query,
            "match": None,
            "count": 0,
            "matches": [],
        }

    idx = max(1, occurrence) - 1
    selected = all_matches[idx] if idx < len(all_matches) else all_matches[0]
    return {
        "found": True,
        "query": query,
        "match": selected,
        "x": selected["center"][0],
        "y": selected["center"][1],
        "count": len(all_matches),
        "matches": all_matches,
    }


def generate_set_of_marks(
    screenshot_image: Any,
    image_path: str | Path | None = None,
    max_marks: int = 50,
) -> tuple[Any, dict[str, Any]]:
    """Draw numbered Set-of-Marks tags over detected elements on screenshot and return (annotated_pil_image, mark_map)."""
    try:
        from PIL import ImageDraw, ImageFont
    except ImportError:
        raise RuntimeError("Pillow is required for set_of_marks annotations.")

    # 1. Gather elements from OCR
    elements: list[dict[str, Any]] = []
    if image_path:
        ocr_res = run_ocr(image_path)
        if ocr_res.get("ok"):
            for l in ocr_res.get("lines", []):
                t = (l.get("text") or "").strip()
                if len(t) >= 2 and l.get("bounds"):
                    elements.append({
                        "text": t,
                        "bounds": l["bounds"],
                        "center": l["center"],
                        "type": "text",
                    })

    # 2. Gather UI controls
    if platform.system() == "Windows":
        try:
            ctrls = list_win32_ui_controls()
            for c in ctrls:
                elements.append(c)
        except Exception:
            pass

    # Deduplicate elements by proximity
    filtered: list[dict[str, Any]] = []
    seen_centers: set[tuple[int, int]] = set()

    for el in elements:
        cx, cy = el["center"][0], el["center"][1]
        # Round to nearest 20px grid to filter overlapping badges
        grid_key = (cx // 20, cy // 20)
        if grid_key in seen_centers:
            continue
        seen_centers.add(grid_key)
        filtered.append(el)
        if len(filtered) >= max_marks:
            break

    annotated = screenshot_image.copy()
    draw = ImageDraw.Draw(annotated)
    mark_map: dict[str, Any] = {}

    try:
        font = ImageFont.load_default()
    except Exception:
        font = None

    for i, el in enumerate(filtered, start=1):
        mark_id = str(i)
        bx, by, bw, bh = el["bounds"]
        cx, cy = el["center"]

        # Tag pill
        tag_str = f"[{mark_id}]"
        tag_x = max(2, bx - 12)
        tag_y = max(2, by - 10)

        # Draw highlight box around element
        draw.rectangle([bx, by, bx + bw, by + bh], outline="#E3008C", width=2)

        # Draw badge pill
        badge_w = 24 if len(tag_str) <= 3 else 32
        badge_h = 16
        draw.rectangle([tag_x, tag_y, tag_x + badge_w, tag_y + badge_h], fill="#FFD800", outline="#000000", width=1)
        draw.text((tag_x + 3, tag_y + 2), tag_str, fill="#000000", font=font)

        mark_map[mark_id] = {
            "id": mark_id,
            "text": el.get("text", ""),
            "type": el.get("type", "unknown"),
            "bounds": el["bounds"],
            "center": [cx, cy],
            "x": cx,
            "y": cy,
        }

    return annotated, mark_map
