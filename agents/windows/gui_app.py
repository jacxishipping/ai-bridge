"""AI Bridge Windows Agent — Native Fluent 2 Desktop Application.

Provides a zero-terminal graphical interface for configuring, enrolling,
starting/stopping, rotating tokens, and monitoring the AI Bridge Windows
agent in real time. Runs in the logged-in user session so desktop vision
(capture_desktop_screenshot) and UI automation (perform_approved_ui_action)
work out of the box.

Launch with:
    pythonw agents\\windows\\gui_app.py
"""
from __future__ import annotations

import ctypes
import json
import os
import platform
import queue
import re
import subprocess
import sys
import threading
import time
import tkinter as tk
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path
from tkinter import messagebox, simpledialog

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from common.poller import Poller  # noqa: E402

CONFIG_DIR = Path.home() / ".ai-bridge"
CONFIG_FILE = CONFIG_DIR / "agent_gui.json"
TOKEN_FILE = CONFIG_DIR / "device.token"

THEMES = {
    "dark": {
        "bg": "#141414",
        "card": "#242424",
        "card_alt": "#1f1f1f",
        "border": "#383838",
        "fg": "#ffffff",
        "fg_muted": "#adadad",
        "brand": "#0f6cbd",
        "brand_hover": "#115ea3",
        "success_bg": "#052505",
        "success_fg": "#54b054",
        "warn_bg": "#4a1e04",
        "warn_fg": "#f8965d",
        "danger_bg": "#c50f1f",
        "danger_fg": "#eeacb2",
        "log_bg": "#0f0f0f",
        "log_fg": "#e0e0e0",
        "input_bg": "#1a1a1a",
    },
    "light": {
        "bg": "#f5f5f5",
        "card": "#ffffff",
        "card_alt": "#fafafa",
        "border": "#e0e0e0",
        "fg": "#242424",
        "fg_muted": "#616161",
        "brand": "#0f6cbd",
        "brand_hover": "#115ea3",
        "success_bg": "#f1faf1",
        "success_fg": "#0e700e",
        "warn_bg": "#fff9f5",
        "warn_fg": "#bc4b09",
        "danger_bg": "#c50f1f",
        "danger_fg": "#b10e1c",
        "log_bg": "#1e1e1e",
        "log_fg": "#e0e0e0",
        "input_bg": "#ffffff",
    },
}


def _enable_dpi_awareness() -> None:
    if platform.system() != "Windows":
        return
    try:
        ctypes.windll.shcore.SetProcessDpiAwareness(2)
    except Exception:
        try:
            ctypes.windll.user32.SetProcessDPIAware()
        except Exception:
            pass


def _detect_scheduled_task_defaults() -> tuple[str, str]:
    """Read Control URL and Device Token from the existing 'AI Bridge Agent' Scheduled Task if present."""
    if platform.system() != "Windows":
        return "", ""
    try:
        cmd = [
            "powershell",
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "(Get-ScheduledTask -TaskName 'AI Bridge Agent' -ErrorAction SilentlyContinue).Actions.Arguments",
        ]
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=5,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        args_str = (proc.stdout or "").strip()
        url_m = re.search(r"--control-url\s+(\S+)", args_str)
        tok_m = re.search(r"--device-token\s+(\S+)", args_str)
        return (
            url_m.group(1).strip("\"'") if url_m else "",
            tok_m.group(1).strip("\"'") if tok_m else "",
        )
    except Exception:
        return "", ""


def load_agent_config() -> dict:
    cfg = {
        "control_url": os.environ.get("AI_BRIDGE_CONTROL_URL", "https://jxiptvplayer.app"),
        "device_token": os.environ.get("AI_BRIDGE_DEVICE_TOKEN", ""),
        "auto_start": True,
        "theme": "dark",
    }
    if CONFIG_FILE.exists():
        try:
            saved = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
            if isinstance(saved, dict):
                cfg.update(saved)
        except Exception:
            pass
    if TOKEN_FILE.exists():
        try:
            saved_tok = TOKEN_FILE.read_text(encoding="utf-8").strip()
            if saved_tok:
                cfg["device_token"] = saved_tok
        except Exception:
            pass
    if not cfg.get("device_token"):
        st_url, st_tok = _detect_scheduled_task_defaults()
        if st_url:
            cfg["control_url"] = st_url
        if st_tok:
            cfg["device_token"] = st_tok
    return cfg


def save_agent_config(cfg: dict) -> None:
    try:
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        CONFIG_FILE.write_text(json.dumps(cfg, indent=2), encoding="utf-8")
        if cfg.get("device_token"):
            TOKEN_FILE.write_text(cfg["device_token"].strip(), encoding="utf-8")
    except OSError:
        pass


class AgentGuiApp:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title("AI Bridge Windows Agent")
        self.root.geometry("820x660")
        self.root.minsize(720, 560)

        self.cfg = load_agent_config()
        self.theme_name = self.cfg.get("theme", "dark")
        if self.theme_name not in THEMES:
            self.theme_name = "dark"

        self.running = False
        self.stop_event = threading.Event()
        self.worker_thread: threading.Thread | None = None
        self.poller: Poller | None = None
        self.log_queue: queue.Queue[tuple[str, str]] = queue.Queue()

        self.device_id_var = tk.StringVar(value="—")
        self.status_var = tk.StringVar(value="Stopped")
        self.heartbeat_var = tk.StringVar(value="Never")
        self.expiry_var = tk.StringVar(value="—")
        self.tasks_count = 0
        self.tasks_var = tk.StringVar(value="0")

        self.url_var = tk.StringVar(value=self.cfg.get("control_url", "https://jxiptvplayer.app"))
        self.token_var = tk.StringVar(value=self.cfg.get("device_token", ""))
        self.auto_start_var = tk.BooleanVar(value=bool(self.cfg.get("auto_start", True)))
        self.show_token = False

        self._build_ui()
        self._apply_theme()
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)
        self.root.after(150, self._drain_logs)

        if self.auto_start_var.get() and self.token_var.get().strip():
            self.log("Auto-start enabled. Connecting to control plane...", "info")
            self.root.after(400, self.start_agent)
        else:
            self.log("AI Bridge Windows Agent ready. Click 'Start Agent' to begin polling.", "info")

    def _build_ui(self) -> None:
        for w in self.root.winfo_children():
            w.destroy()
        t = THEMES[self.theme_name]
        self.root.configure(bg=t["bg"])

        # Top Brand Bar
        top = tk.Frame(self.root, bg=t["card"], highlightthickness=1, highlightbackground=t["border"])
        top.pack(fill="x", padx=16, pady=(14, 10))

        brand_left = tk.Frame(top, bg=t["card"])
        brand_left.pack(side="left", padx=14, pady=12)

        logo = tk.Label(
            brand_left,
            text="✓",
            bg=t["brand"],
            fg="#ffffff",
            font=("Segoe UI", 12, "bold"),
            width=3,
            pady=2,
        )
        logo.pack(side="left", padx=(0, 10))

        titles = tk.Frame(brand_left, bg=t["card"])
        titles.pack(side="left")
        tk.Label(
            titles,
            text="AI Bridge Windows Agent",
            bg=t["card"],
            fg=t["fg"],
            font=("Segoe UI", 13, "bold"),
            anchor="w",
        ).pack(anchor="w")
        tk.Label(
            titles,
            text="Outbound Long-Polling • Desktop Vision & UI Automation • Auto Token Rotation",
            bg=t["card"],
            fg=t["fg_muted"],
            font=("Segoe UI", 9),
            anchor="w",
        ).pack(anchor="w")

        brand_right = tk.Frame(top, bg=t["card"])
        brand_right.pack(side="right", padx=14, pady=12)

        self.status_badge = tk.Label(
            brand_right,
            textvariable=self.status_var,
            bg=t["card_alt"],
            fg=t["fg"],
            font=("Segoe UI", 9, "bold"),
            padx=10,
            pady=4,
        )
        self.status_badge.pack(side="left", padx=(0, 8))

        tk.Button(
            brand_right,
            text="Web Dashboard ↗",
            command=self._open_dashboard,
            bg=t["card_alt"],
            fg=t["fg"],
            activebackground=t["border"],
            activeforeground=t["fg"],
            relief="flat",
            font=("Segoe UI", 9, "bold"),
            padx=10,
            pady=4,
            cursor="hand2",
        ).pack(side="left", padx=(0, 6))

        tk.Button(
            brand_right,
            text="Light Mode" if self.theme_name == "dark" else "Dark Mode",
            command=self._toggle_theme,
            bg=t["card_alt"],
            fg=t["fg"],
            activebackground=t["border"],
            activeforeground=t["fg"],
            relief="flat",
            font=("Segoe UI", 9),
            padx=10,
            pady=4,
            cursor="hand2",
        ).pack(side="left")

        # Telemetry KPI Row
        kpi_frame = tk.Frame(self.root, bg=t["bg"])
        kpi_frame.pack(fill="x", padx=16, pady=(0, 10))
        for col in range(4):
            kpi_frame.columnconfigure(col, weight=1)

        self._make_kpi_tile(kpi_frame, 0, "DEVICE ID", self.device_id_var, copy_btn=True)
        self._make_kpi_tile(kpi_frame, 1, "LAST HEARTBEAT", self.heartbeat_var)
        self._make_kpi_tile(kpi_frame, 2, "TOKEN EXPIRY", self.expiry_var)
        self._make_kpi_tile(kpi_frame, 3, "TASKS EXECUTED", self.tasks_var)

        # Connection Configuration Card
        cfg_card = tk.Frame(self.root, bg=t["card"], highlightthickness=1, highlightbackground=t["border"])
        cfg_card.pack(fill="x", padx=16, pady=(0, 10))

        cfg_inner = tk.Frame(cfg_card, bg=t["card"])
        cfg_inner.pack(fill="x", padx=14, pady=12)
        cfg_inner.columnconfigure(1, weight=1)

        tk.Label(
            cfg_inner,
            text="Control Plane URL:",
            bg=t["card"],
            fg=t["fg"],
            font=("Segoe UI", 9, "bold"),
        ).grid(row=0, column=0, sticky="w", pady=(0, 8), padx=(0, 10))

        self.url_entry = tk.Entry(
            cfg_inner,
            textvariable=self.url_var,
            bg=t["input_bg"],
            fg=t["fg"],
            insertbackground=t["fg"],
            relief="solid",
            bd=1,
            font=("Consolas", 10),
        )
        self.url_entry.grid(row=0, column=1, columnspan=3, sticky="ew", pady=(0, 8), ipady=4)

        tk.Label(
            cfg_inner,
            text="Device Token:",
            bg=t["card"],
            fg=t["fg"],
            font=("Segoe UI", 9, "bold"),
        ).grid(row=1, column=0, sticky="w", padx=(0, 10))

        self.tok_entry = tk.Entry(
            cfg_inner,
            textvariable=self.token_var,
            show="" if self.show_token else "•",
            bg=t["input_bg"],
            fg=t["fg"],
            insertbackground=t["fg"],
            relief="solid",
            bd=1,
            font=("Consolas", 10),
        )
        self.tok_entry.grid(row=1, column=1, sticky="ew", ipady=4)

        self.show_btn = tk.Button(
            cfg_inner,
            text="Hide" if self.show_token else "Show",
            command=self._toggle_token_vis,
            bg=t["card_alt"],
            fg=t["fg"],
            relief="flat",
            font=("Segoe UI", 9),
            padx=8,
            pady=3,
            cursor="hand2",
        )
        self.show_btn.grid(row=1, column=2, padx=(6, 0))

        tk.Button(
            cfg_inner,
            text="Copy Token",
            command=self._copy_token,
            bg=t["card_alt"],
            fg=t["fg"],
            relief="flat",
            font=("Segoe UI", 9),
            padx=8,
            pady=3,
            cursor="hand2",
        ).grid(row=1, column=3, padx=(6, 0))

        # Action Controls Row
        ctrl_row = tk.Frame(cfg_card, bg=t["card"])
        ctrl_row.pack(fill="x", padx=14, pady=(2, 12))

        self.start_stop_btn = tk.Button(
            ctrl_row,
            text="■ Stop Agent" if self.running else "▶ Start Agent",
            command=self.toggle_agent,
            bg=t["danger_bg"] if self.running else t["brand"],
            fg="#ffffff",
            activebackground=t["brand_hover"],
            activeforeground="#ffffff",
            relief="flat",
            font=("Segoe UI", 10, "bold"),
            padx=16,
            pady=6,
            cursor="hand2",
        )
        self.start_stop_btn.pack(side="left", padx=(0, 8))

        tk.Button(
            ctrl_row,
            text="Enroll New Device…",
            command=self._enroll_dialog,
            bg=t["card_alt"],
            fg=t["fg"],
            relief="flat",
            font=("Segoe UI", 9, "bold"),
            padx=12,
            pady=6,
            cursor="hand2",
        ).pack(side="left", padx=(0, 6))

        tk.Button(
            ctrl_row,
            text="Rotate Token",
            command=self._rotate_token_manual,
            bg=t["card_alt"],
            fg=t["fg"],
            relief="flat",
            font=("Segoe UI", 9),
            padx=10,
            pady=6,
            cursor="hand2",
        ).pack(side="left", padx=(0, 6))

        tk.Button(
            ctrl_row,
            text="Save Config",
            command=self._save_current_config,
            bg=t["card_alt"],
            fg=t["fg"],
            relief="flat",
            font=("Segoe UI", 9),
            padx=10,
            pady=6,
            cursor="hand2",
        ).pack(side="left", padx=(0, 10))

        tk.Checkbutton(
            ctrl_row,
            text="Auto-start on launch",
            variable=self.auto_start_var,
            command=self._save_current_config,
            bg=t["card"],
            fg=t["fg_muted"],
            selectcolor=t["card_alt"],
            activebackground=t["card"],
            activeforeground=t["fg"],
            font=("Segoe UI", 9),
        ).pack(side="right")

        # Live Activity Console Card
        log_card = tk.Frame(self.root, bg=t["card"], highlightthickness=1, highlightbackground=t["border"])
        log_card.pack(fill="both", expand=True, padx=16, pady=(0, 14))

        log_hdr = tk.Frame(log_card, bg=t["card"])
        log_hdr.pack(fill="x", padx=14, pady=(10, 6))

        tk.Label(
            log_hdr,
            text="Live Agent Telemetry & Task Execution Log",
            bg=t["card"],
            fg=t["fg"],
            font=("Segoe UI", 10, "bold"),
        ).pack(side="left")

        tk.Button(
            log_hdr,
            text="Clear Log",
            command=self._clear_log,
            bg=t["card_alt"],
            fg=t["fg_muted"],
            relief="flat",
            font=("Segoe UI", 8, "bold"),
            padx=8,
            pady=2,
            cursor="hand2",
        ).pack(side="right")

        log_body = tk.Frame(log_card, bg=t["log_bg"])
        log_body.pack(fill="both", expand=True, padx=14, pady=(0, 12))

        scrollbar = tk.Scrollbar(log_body)
        scrollbar.pack(side="right", fill="y")

        self.log_text = tk.Text(
            log_body,
            bg=t["log_bg"],
            fg=t["log_fg"],
            font=("Consolas", 9),
            relief="flat",
            wrap="word",
            yscrollcommand=scrollbar.set,
            padx=10,
            pady=8,
            state="disabled",
        )
        self.log_text.pack(side="left", fill="both", expand=True)
        scrollbar.config(command=self.log_text.yview)

        self.log_text.tag_config("info", foreground="#62abf5")
        self.log_text.tag_config("ok", foreground="#54b054")
        self.log_text.tag_config("warn", foreground="#f8965d")
        self.log_text.tag_config("err", foreground="#eeacb2")

    def _make_kpi_tile(
        self,
        parent: tk.Frame,
        col: int,
        title: str,
        var: tk.StringVar,
        *,
        copy_btn: bool = False,
    ) -> None:
        t = THEMES[self.theme_name]
        tile = tk.Frame(parent, bg=t["card"], highlightthickness=1, highlightbackground=t["border"])
        tile.grid(row=0, column=col, sticky="nsew", padx=(0 if col == 0 else 6, 0))

        top_row = tk.Frame(tile, bg=t["card"])
        top_row.pack(fill="x", padx=12, pady=(8, 2))
        tk.Label(
            top_row,
            text=title,
            bg=t["card"],
            fg=t["fg_muted"],
            font=("Segoe UI", 8, "bold"),
        ).pack(side="left")

        if copy_btn:
            tk.Button(
                top_row,
                text="Copy",
                command=self._copy_device_id,
                bg=t["card_alt"],
                fg=t["fg_muted"],
                relief="flat",
                font=("Segoe UI", 7, "bold"),
                padx=5,
                pady=0,
                cursor="hand2",
            ).pack(side="right")

        tk.Label(
            tile,
            textvariable=var,
            bg=t["card"],
            fg=t["fg"],
            font=("Segoe UI", 12, "bold"),
            anchor="w",
        ).pack(fill="x", padx=12, pady=(0, 8))

    def _apply_theme(self) -> None:
        t = THEMES[self.theme_name]
        if self.running:
            self.status_badge.configure(bg=t["success_bg"], fg=t["success_fg"])
        else:
            self.status_badge.configure(bg=t["card_alt"], fg=t["fg_muted"])

    def _toggle_theme(self) -> None:
        self.theme_name = "light" if self.theme_name == "dark" else "dark"
        self.cfg["theme"] = self.theme_name
        save_agent_config(self.cfg)
        self._build_ui()
        self._apply_theme()

    def _toggle_token_vis(self) -> None:
        self.show_token = not self.show_token
        self.tok_entry.configure(show="" if self.show_token else "•")
        self.show_btn.configure(text="Hide" if self.show_token else "Show")

    def _copy_token(self) -> None:
        tok = self.token_var.get().strip()
        if not tok:
            return
        self.root.clipboard_clear()
        self.root.clipboard_append(tok)
        self.log("Copied Device Token to clipboard.", "info")

    def _copy_device_id(self) -> None:
        did = self.device_id_var.get().strip()
        if not did or did == "—":
            return
        self.root.clipboard_clear()
        self.root.clipboard_append(did)
        self.log(f"Copied Device ID ({did}) to clipboard.", "info")

    def _open_dashboard(self) -> None:
        url = self.url_var.get().strip() or "https://jxiptvplayer.app"
        webbrowser.open(url)

    def _save_current_config(self) -> None:
        self.cfg["control_url"] = self.url_var.get().strip()
        self.cfg["device_token"] = self.token_var.get().strip()
        self.cfg["auto_start"] = bool(self.auto_start_var.get())
        self.cfg["theme"] = self.theme_name
        save_agent_config(self.cfg)
        self.log("Saved agent configuration to ~/.ai-bridge/agent_gui.json", "ok")

    def _clear_log(self) -> None:
        self.log_text.configure(state="normal")
        self.log_text.delete("1.0", "end")
        self.log_text.configure(state="disabled")

    def log(self, message: str, tag: str = "info") -> None:
        ts = time.strftime("%H:%M:%S")
        self.log_queue.put((f"[{ts}] {message}\n", tag))

    def _drain_logs(self) -> None:
        try:
            while True:
                line, tag = self.log_queue.get_nowait()
                self.log_text.configure(state="normal")
                self.log_text.insert("end", line, tag)
                self.log_text.see("end")
                self.log_text.configure(state="disabled")
        except queue.Empty:
            pass
        self.root.after(120, self._drain_logs)

    def toggle_agent(self) -> None:
        if self.running:
            self.stop_agent()
        else:
            self.start_agent()

    def start_agent(self) -> None:
        if self.running:
            return
        url = self.url_var.get().strip()
        tok = self.token_var.get().strip()
        if not url or not tok:
            messagebox.showwarning(
                "Missing Credentials",
                "Please enter both the Control Plane URL and a Device Token (or click 'Enroll New Device…').",
            )
            return
        self._save_current_config()
        self.running = True
        self.stop_event.clear()
        t = THEMES[self.theme_name]
        self.start_stop_btn.configure(text="■ Stop Agent", bg=t["danger_bg"])
        self.status_var.set("● Connecting…")
        self._apply_theme()

        self.worker_thread = threading.Thread(target=self._poll_loop, args=(url, tok), daemon=True)
        self.worker_thread.start()

    def stop_agent(self) -> None:
        if not self.running:
            return
        self.running = False
        self.stop_event.set()
        t = THEMES[self.theme_name]
        self.start_stop_btn.configure(text="▶ Start Agent", bg=t["brand"])
        self.status_var.set("Stopped")
        self._apply_theme()
        self.log("Stopping agent polling loop...", "warn")

    def _poll_loop(self, url: str, tok: str) -> None:
        poller = Poller(url, tok, token_file=TOKEN_FILE)
        self.poller = poller
        self.log(f"Agent started polling {url} (long-poll wait=15s)", "ok")
        had_error = False

        while not self.stop_event.is_set():
            try:
                hb = poller.heartbeat()
                if poller.device_token != self.token_var.get():
                    self.root.after(0, lambda nt=poller.device_token: self.token_var.set(nt))
                    self.log("Device token auto-rotated and saved.", "ok")

                did = hb.get("device_id") or "—"
                exp = hb.get("token_expires_at")
                exp_str = f"in {max(0, int((exp - time.time()) / 3600))}h" if isinstance(exp, (int, float)) else "—"
                now_str = time.strftime("%H:%M:%S")

                self.root.after(0, lambda d=did, n=now_str, e=exp_str: self._update_telemetry(d, n, e))

                if had_error:
                    self.log("Agent reconnected to control plane (OK).", "ok")
                    had_error = False

                nxt = poller._req("GET", "/api/agent/tasks/next?wait=10", timeout=16)
                if self.stop_event.is_set():
                    break
                task = nxt.get("task")
                if not task:
                    poller.backoff = 2.0
                    continue

                task_id = task["id"]
                tool_name = task["tool"]
                self.root.after(0, lambda tl=tool_name: self.status_var.set(f"● Running {tl}"))
                self.log(f"Executing task {task_id} -> {tool_name}", "info")
                t0 = time.time()

                try:
                    from ai_bridge.control.dispatch import dispatch

                    args = json.loads(task.get("args_json") or "{}")
                    eff_policy = poller._effective_policy(task.get("policy"))
                    result = dispatch(
                        tool_name,
                        args,
                        policy=eff_policy,
                        approval_granted=bool(task.get("approval_granted")),
                    )
                    status = "completed"
                    text = json.dumps(result, default=str)[:512_000]
                except PermissionError as exc:
                    status, text = "failed", f"denied: {exc}"
                except Exception as exc:
                    status, text = "failed", f"{type(exc).__name__}: {exc}"

                elapsed = time.time() - t0
                poller._req("POST", f"/api/agent/tasks/{task_id}/result", {"status": status, "result": text})
                self.tasks_count += 1
                self.root.after(0, lambda c=self.tasks_count: self.tasks_var.set(str(c)))
                self.root.after(0, lambda: self.status_var.set("● Online & Polling"))
                self.log(
                    f"Task {task_id} ({tool_name}) -> {status} ({elapsed:.2f}s)",
                    "ok" if status == "completed" else "err",
                )
                poller.backoff = 2.0
            except Exception as exc:
                if self.stop_event.is_set():
                    break
                had_error = True
                wait_s = poller.backoff
                self.root.after(0, lambda w=wait_s: self.status_var.set(f"● Retry in {w:.0f}s"))
                self.log(f"Connection issue (retry in {wait_s:.0f}s): {exc}", "warn")
                self.stop_event.wait(wait_s)
                poller.backoff = min(poller.backoff * 2, 60.0)

        self.log("Agent polling loop stopped.", "info")

    def _update_telemetry(self, did: str, hb_time: str, exp_str: str) -> None:
        self.device_id_var.set(did)
        self.heartbeat_var.set(hb_time)
        self.expiry_var.set(exp_str)
        if self.running:
            self.status_var.set("● Online & Polling")

    def _rotate_token_manual(self) -> None:
        url = self.url_var.get().strip()
        tok = self.token_var.get().strip()
        if not url or not tok:
            messagebox.showwarning("Rotate Token", "Control Plane URL and Device Token are required.")
            return
        try:
            poller = Poller(url, tok, token_file=TOKEN_FILE)
            new_tok = poller.rotate_token()
            self.token_var.set(new_tok)
            self._save_current_config()
            self.log("Successfully rotated Device Token and saved to disk.", "ok")
            messagebox.showinfo("Token Rotated", "A new Device Token has been issued and saved automatically.")
        except Exception as exc:
            self.log(f"Token rotation failed: {exc}", "err")
            messagebox.showerror("Rotation Failed", str(exc))

    def _enroll_dialog(self) -> None:
        url = self.url_var.get().strip().rstrip("/")
        if not url:
            messagebox.showwarning("Control Plane URL", "Enter the Control Plane URL first.")
            return
        admin_tok = simpledialog.askstring(
            "Enroll New Device",
            "Enter your Administrator Token (AI_BRIDGE_ADMIN_TOKEN):",
            parent=self.root,
            show="•",
        )
        if not admin_tok:
            return
        default_name = f"{platform.node() or 'windows'}-agent"
        dev_name = simpledialog.askstring(
            "Enroll New Device",
            "Enter a friendly name for this Windows device:",
            parent=self.root,
            initialvalue=default_name,
        )
        if not dev_name:
            return

        payload = json.dumps(
            {
                "name": dev_name.strip(),
                "hostname": platform.node(),
                "os": f"Windows {platform.release()}",
            }
        ).encode("utf-8")
        req = urllib.request.Request(
            f"{url}/api/devices/enroll",
            data=payload,
            method="POST",
            headers={
                "X-Admin-Token": admin_tok.strip(),
                "Content-Type": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            new_tok = data["device_token"]
            new_id = data["device_id"]
            self.token_var.set(new_tok)
            self.device_id_var.set(new_id)
            self._save_current_config()
            self.log(f"Enrolled device '{dev_name}' (ID: {new_id}) and saved token!", "ok")
            if not self.running:
                self.start_agent()
        except urllib.error.HTTPError as exc:
            messagebox.showerror("Enrollment Failed", f"Control plane returned HTTP {exc.code}")
        except Exception as exc:
            messagebox.showerror("Enrollment Failed", str(exc))

    def _on_close(self) -> None:
        self.stop_event.set()
        self.running = False
        self.root.destroy()


def main() -> None:
    _enable_dpi_awareness()
    root = tk.Tk()
    AgentGuiApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
