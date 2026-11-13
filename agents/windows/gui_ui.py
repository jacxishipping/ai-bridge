"""Design system and view builders for the AI Bridge Windows client.

The application shell is split into:

* tokens + type scale (``THEMES``, ``ui_font``, ``mono_font``)
* primitives (``card``, ``button``, ``entry``, ``switch``, ``pill``, ``kpi``,
  ``scroll_area``, ``draw_icon``)
* views (``build_shell``, ``build_overview``, ``build_tasks``,
  ``build_monitor``, ``build_vision``)

``AgentGuiApp`` keeps every state, worker and policy concern; these builders
only compose widgets and read/write the attributes the app already owns.
"""
from __future__ import annotations

import re
import tkinter as tk
from tkinter import font as tkfont
from tkinter import ttk

# ---------------------------------------------------------------------------
# Design tokens
# ---------------------------------------------------------------------------
THEMES: dict[str, dict[str, str]] = {
    "dark": {
        "bg": "#0B0F19",
        "sidebar": "#0A0E17",
        "card": "#111827",
        "card_alt": "#1B2537",
        "card_subtle": "#0F1725",
        "elev": "#141D2E",
        "border": "#22304A",
        "border_subtle": "#1A2334",
        "fg": "#E8EEF9",
        "fg_muted": "#93A4BE",
        "fg_subtle": "#63748F",
        "brand": "#3B82F6",
        "brand_hover": "#5B9BFF",
        "brand_active": "#2F6FD8",
        "brand_light": "#16233A",
        "brand_fg": "#FFFFFF",
        "accent_soft": "#132340",
        "success_bg": "#0F2A1D",
        "success_fg": "#4ADE80",
        "success_border": "#1C5334",
        "warn_bg": "#2C2110",
        "warn_fg": "#F5B851",
        "danger_bg": "#B42318",
        "danger_fg": "#FFFFFF",
        "danger_light": "#2A1215",
        "log_bg": "#070B12",
        "log_fg": "#D7E2F2",
        "log_info": "#7FB2F0",
        "log_ok": "#5FD08A",
        "log_warn": "#F0B45C",
        "log_err": "#F08A8A",
        "input_bg": "#0D1420",
        "nav_active": "#16233A",
        "tab_active_bg": "#16233A",
        "tab_inactive_bg": "#0A0E17",
        "table_header_bg": "#0F1725",
        "table_row_even": "#111827",
        "table_row_odd": "#0F1622",
        "gauge_track": "#1B2537",
        "switch_off": "#2A374D",
        "chip_bg": "#16233A",
    },
    "light": {
        "bg": "#F4F6FB",
        "sidebar": "#FFFFFF",
        "card": "#FFFFFF",
        "card_alt": "#EEF2F9",
        "card_subtle": "#F8FAFD",
        "elev": "#FFFFFF",
        "border": "#DCE3EF",
        "border_subtle": "#E8EDF5",
        "fg": "#0F1B2D",
        "fg_muted": "#5A6B85",
        "fg_subtle": "#64748B",
        "brand": "#2563EB",
        "brand_hover": "#1D4ED8",
        "brand_active": "#1E40AF",
        "brand_light": "#EAF1FE",
        "brand_fg": "#FFFFFF",
        "accent_soft": "#EAF1FE",
        "success_bg": "#E7F7EE",
        "success_fg": "#0F7B3F",
        "success_border": "#B9E4CB",
        "warn_bg": "#FEF5E7",
        "warn_fg": "#9A5B00",
        "danger_bg": "#C0271B",
        "danger_fg": "#FFFFFF",
        "danger_light": "#FCEDEC",
        "log_bg": "#0F1725",
        "log_fg": "#DCE6F5",
        "log_info": "#8AB8F5",
        "log_ok": "#6BD79A",
        "log_warn": "#F3BE69",
        "log_err": "#F49A9A",
        "input_bg": "#FFFFFF",
        "nav_active": "#EAF1FE",
        "tab_active_bg": "#EAF1FE",
        "tab_inactive_bg": "#FFFFFF",
        "table_header_bg": "#F2F6FC",
        "table_row_even": "#FFFFFF",
        "table_row_odd": "#FAFCFF",
        "gauge_track": "#E7EDF7",
        "switch_off": "#CBD6E6",
        "chip_bg": "#EEF2F9",
    },
}

PAD = 16
GAP = 12

NAV_PAGES = (
    ("Overview", "Agent status, connection and live activity"),
    ("Tasks", "Every task this device received, with full payloads"),
    ("Monitor", "Live hardware telemetry from this machine"),
    ("Vision", "What the agent can see in your desktop session"),
    ("Security", "Execution guardrails synced to the control plane"),
    ("Settings", "Client preferences and Windows integration"),
)


# ---------------------------------------------------------------------------
# Typography
# ---------------------------------------------------------------------------
_FAMILY_CACHE: dict[str, str] = {}


COMMON_WINDOWS_APPS = [
    ("Google Chrome", "chrome"),
    ("Microsoft Edge", "msedge"),
    ("Notepad", "notepad"),
    ("Calculator", "calc"),
    ("VS Code", "code"),
    ("PowerShell", "powershell"),
    ("Command Prompt", "cmd"),
    ("File Explorer", "explorer"),
    ("MS Paint", "mspaint"),
    ("Windows Terminal", "wt"),
]


def _installed_families() -> set[str]:
    try:
        return {name.lower() for name in tkfont.families()}
    except Exception:  # noqa: BLE001 - font enumeration can fail before Tk init
        return set()


def ui_family() -> str:
    if "ui" not in _FAMILY_CACHE:
        fams = _installed_families()
        for candidate in ("Segoe UI Variable Text", "Segoe UI", "Inter", "Arial"):
            if candidate.lower() in fams:
                _FAMILY_CACHE["ui"] = candidate
                break
        else:
            _FAMILY_CACHE["ui"] = "Segoe UI"
    return _FAMILY_CACHE["ui"]


def mono_family() -> str:
    if "mono" not in _FAMILY_CACHE:
        fams = _installed_families()
        for candidate in ("Cascadia Mono", "Cascadia Code", "Consolas", "Courier New"):
            if candidate.lower() in fams:
                _FAMILY_CACHE["mono"] = candidate
                break
        else:
            _FAMILY_CACHE["mono"] = "Consolas"
    return _FAMILY_CACHE["mono"]


def ui_font(size: int, weight: str = "normal") -> tuple[str, int, str]:
    return (ui_family(), size, weight)


def mono_font(size: int, weight: str = "normal") -> tuple[str, int, str]:
    return (mono_family(), size, weight)


# ---------------------------------------------------------------------------
# Primitives
# ---------------------------------------------------------------------------
def apply_ttk_theme(root: tk.Tk, t: dict[str, str]) -> None:
    """Style the ttk widgets we use (treeview + scrollbars) to match the shell."""
    style = ttk.Style(root)
    try:
        style.theme_use("clam")
    except tk.TclError:
        pass
    style.configure(
        "Treeview",
        background=t["table_row_even"],
        fieldbackground=t["table_row_even"],
        foreground=t["fg"],
        borderwidth=0,
        rowheight=30,
        font=ui_font(9),
    )
    style.configure(
        "Treeview.Heading",
        background=t["table_header_bg"],
        foreground=t["fg_muted"],
        relief="flat",
        borderwidth=0,
        font=ui_font(8, "bold"),
        padding=(10, 7),
    )
    style.map(
        "Treeview.Heading",
        background=[("active", t["card_alt"])],
        foreground=[("active", t["fg"])],
    )
    style.map(
        "Treeview",
        background=[("selected", t["accent_soft"])],
        foreground=[("selected", t["fg"])],
    )
    style.configure(
        "Vertical.TScrollbar",
        background=t["card_alt"],
        troughcolor=t["bg"],
        bordercolor=t["bg"],
        arrowcolor=t["fg_subtle"],
        borderwidth=0,
        width=10,
        arrowsize=0,
        gripcount=0,
        sliderthickness=8,
        sliderlength=28,
        darkcolor=t["card_alt"],
        lightcolor=t["card_alt"],
    )
    style.map(
        "Vertical.TScrollbar",
        background=[("active", t["border"])],
        darkcolor=[("active", t["border"])],
        lightcolor=[("active", t["border"])],
    )


def card(parent: tk.Widget, t: dict[str, str], *, pad: int = PAD, subtle: bool = False):
    """A bordered surface. Returns (outer, body) so callers can add a footer."""
    fill = t["card_subtle"] if subtle else t["card"]
    border = t["border_subtle"] if subtle else t["border"]
    outer = tk.Frame(parent, bg=fill, highlightthickness=1, highlightbackground=border, bd=0)
    body = tk.Frame(outer, bg=fill)
    body.pack(fill="both", expand=True, padx=pad, pady=pad)
    return outer, body


def micro(parent: tk.Widget, t: dict[str, str], text: str, *, fg: str | None = None) -> tk.Label:
    return tk.Label(
        parent,
        text=text.upper(),
        bg=parent["bg"],
        fg=fg or t["fg_subtle"],
        font=ui_font(8, "bold"),
        anchor="w",
    )


def heading(parent: tk.Widget, t: dict[str, str], text: str, size: int = 12) -> tk.Label:
    return tk.Label(
        parent, text=text, bg=parent["bg"], fg=t["fg"], font=ui_font(size, "bold"), anchor="w"
    )


def caption(parent: tk.Widget, t: dict[str, str], text: str, *, wrap: int = 0) -> tk.Label:
    return tk.Label(
        parent,
        text=text,
        bg=parent["bg"],
        fg=t["fg_muted"],
        font=ui_font(9),
        anchor="w",
        justify="left",
        wraplength=wrap,
    )


def divider(parent: tk.Widget, t: dict[str, str]) -> tk.Frame:
    line = tk.Frame(parent, bg=t["border_subtle"], height=1, bd=0, highlightthickness=0)
    line.pack(fill="x", pady=GAP)
    return line


_BUTTON_VARIANTS = {
    "primary": ("brand", "brand_fg", "brand_hover", "brand_fg"),
    "secondary": ("card_alt", "fg", "border", "fg"),
    "ghost": ("card", "fg_muted", "card_alt", "fg"),
    "danger": ("danger_bg", "danger_fg", "brand_active", "danger_fg"),
}


def button(
    parent: tk.Widget,
    t: dict[str, str],
    text: str,
    command,
    *,
    variant: str = "secondary",
    size: str = "md",
    width: int | None = None,
) -> tk.Button:
    bg_key, fg_key, hover_key, hover_fg_key = _BUTTON_VARIANTS.get(variant, _BUTTON_VARIANTS["secondary"])
    pad_x, pad_y, font_size = (14, 7, 9) if size == "md" else (10, 4, 8)
    btn = tk.Button(
        parent,
        text=text,
        command=command,
        bg=t[bg_key],
        fg=t[fg_key],
        activebackground=t[hover_key],
        activeforeground=t[hover_fg_key],
        relief="flat",
        bd=0,
        highlightthickness=0,
        font=ui_font(font_size, "bold" if variant in ("primary", "danger") else "normal"),
        padx=pad_x,
        pady=pad_y,
        cursor="hand2",
        overrelief="flat",
    )
    if width:
        btn.configure(width=width)
    hover_bg = t[hover_key]
    hover_fg = t[hover_fg_key]

    def _enter(_event):
        btn.configure(bg=hover_bg, fg=hover_fg)

    def _leave(_event):
        btn.configure(bg=t[bg_key] if not btn.cget("state") == "disabled" else t[bg_key], fg=t[fg_key])

    btn.bind("<Enter>", _enter)
    btn.bind("<Leave>", _leave)
    return btn


def entry(
    parent: tk.Widget,
    t: dict[str, str],
    variable: tk.Variable,
    *,
    mono: bool = True,
    show: str = "",
    width: int = 0,
) -> tk.Entry:
    widget = tk.Entry(
        parent,
        textvariable=variable,
        show=show,
        bg=t["input_bg"],
        fg=t["fg"],
        insertbackground=t["fg"],
        relief="flat",
        bd=0,
        highlightthickness=1,
        highlightbackground=t["border"],
        highlightcolor=t["brand"],
        font=mono_font(9) if mono else ui_font(9),
        width=width,
    )
    return widget


def pill(
    parent: tk.Widget,
    t: dict[str, str],
    textvariable: tk.StringVar,
    *,
    kind: str = "neutral",
) -> tuple[tk.Frame, tk.Label]:
    """Small status capsule. Returns (container, label)."""
    bg, fg, border = _pill_colors(t, kind)
    frame = tk.Frame(parent, bg=bg, highlightthickness=1, highlightbackground=border, bd=0)
    label = tk.Label(
        frame,
        textvariable=textvariable,
        bg=bg,
        fg=fg,
        font=ui_font(8, "bold"),
        padx=9,
        pady=3,
    )
    label.pack()
    return frame, label


def _pill_colors(t: dict[str, str], kind: str) -> tuple[str, str, str]:
    palette = {
        "neutral": (t["card_alt"], t["fg_muted"], t["border"]),
        "ok": (t["success_bg"], t["success_fg"], t["success_border"]),
        "warn": (t["warn_bg"], t["warn_fg"], t["border"]),
        "bad": (t["danger_light"], t["danger_bg"], t["border"]),
        "brand": (t["accent_soft"], t["brand"], t["border"]),
    }
    return palette.get(kind, palette["neutral"])


def status_kind(text: str) -> str:
    """Map an agent status string onto a pill kind."""
    value = (text or "").lower()
    if any(word in value for word in ("fail", "error", "unauthorized", "401", "offline", "disconnect", "denied")):
        return "bad"
    if any(word in value for word in ("online", "polling", "connected", "running")):
        return "ok"
    return "neutral"


def paint_status_pill(app) -> None:
    """Repaint the header status capsule and its dot from the status text."""
    t = THEMES[app.theme_name]
    kind = status_kind(app.status_var.get())
    bg, fg, border = _pill_colors(t, kind)
    frame = getattr(app, "_status_pill", None)
    if frame is not None and frame.winfo_exists():
        frame.configure(bg=bg, highlightbackground=border)
    badge_label = getattr(app, "status_badge", None)
    if badge_label is not None and badge_label.winfo_exists():
        badge_label.configure(bg=bg, fg=fg)
    dot = getattr(app, "_status_dot", None)
    if dot is not None and dot.winfo_exists():
        colour = {"ok": t["success_fg"], "bad": t["danger_bg"], "neutral": t["fg_subtle"]}[kind]
        dot.delete("all")
        dot.create_oval(1, 1, 7, 7, fill=colour, outline=colour)


def badge(parent: tk.Widget, t: dict[str, str], text: str, *, kind: str = "neutral") -> tk.Frame:
    """A status capsule for fixed text (the var-bound counterpart is pill())."""
    bg, fg, border = _pill_colors(t, kind)
    frame = tk.Frame(parent, bg=bg, highlightthickness=1, highlightbackground=border, bd=0)
    tk.Label(frame, text=text, bg=bg, fg=fg, font=ui_font(8, "bold"), padx=9, pady=3).pack()
    return frame


def switch(
    parent: tk.Widget,
    t: dict[str, str],
    text: str,
    variable: tk.BooleanVar,
    command=None,
) -> tk.Frame:
    """An accessible toggle switch bound to a BooleanVar."""
    row = tk.Frame(parent, bg=parent["bg"])
    canvas = tk.Canvas(row, width=36, height=20, bg=parent["bg"], highlightthickness=0, cursor="hand2")
    label = tk.Label(row, text=text, bg=parent["bg"], fg=t["fg_muted"], font=ui_font(9), cursor="hand2")

    def paint(*_args):
        canvas.delete("all")
        on = bool(variable.get())
        track = t["brand"] if on else t["switch_off"]
        canvas.create_oval(1, 3, 15, 17, fill=track, outline=track)
        canvas.create_oval(21, 3, 35, 17, fill=track, outline=track)
        canvas.create_rectangle(8, 3, 28, 17, fill=track, outline=track)
        knob_x = 25 if on else 11
        canvas.create_oval(knob_x - 6, 4, knob_x + 6, 16, fill="#FFFFFF", outline="#FFFFFF")

    def toggle(_event=None):
        variable.set(not variable.get())
        paint()
        if command is not None:
            command()

    canvas.pack(side="left")
    label.pack(side="left", padx=(8, 0))
    for widget in (canvas, label):
        widget.bind("<Button-1>", toggle)
    variable.trace_add("write", paint)
    paint()
    return row


def kpi(
    parent: tk.Widget,
    t: dict[str, str],
    label: str,
    variable: tk.StringVar,
    *,
    copy_command=None,
    mono: bool = False,
) -> tk.Frame:
    outer, body = card(parent, t, pad=PAD)
    head = tk.Frame(body, bg=t["card"])
    head.pack(fill="x")
    tk.Label(
        head, text=label.upper(), bg=t["card"], fg=t["fg_subtle"], font=ui_font(8, "bold"), anchor="w"
    ).pack(side="left")
    if copy_command is not None:
        button(head, t, "Copy", copy_command, variant="ghost", size="sm").pack(side="right")
    tk.Label(
        body,
        textvariable=variable,
        bg=t["card"],
        fg=t["fg"],
        font=mono_font(13, "bold") if mono else ui_font(15, "bold"),
        anchor="w",
    ).pack(fill="x", pady=(8, 0))
    return outer


def scroll_area(parent: tk.Widget, t: dict[str, str]) -> tk.Frame:
    """Vertically scrollable content frame sized to the parent."""
    canvas = tk.Canvas(parent, bg=t["bg"], highlightthickness=0, bd=0)
    bar = ttk.Scrollbar(parent, orient="vertical", command=canvas.yview)
    inner = tk.Frame(canvas, bg=t["bg"])
    window = canvas.create_window((0, 0), window=inner, anchor="nw")

    inner.bind("<Configure>", lambda _e: canvas.configure(scrollregion=canvas.bbox("all")))
    canvas.bind("<Configure>", lambda e: canvas.itemconfigure(window, width=e.width))
    canvas.configure(yscrollcommand=bar.set)
    bar.pack(side="right", fill="y")
    canvas.pack(side="left", fill="both", expand=True)

    def _wheel(event):
        canvas.yview_scroll(int(-event.delta / 120), "units")

    canvas.bind("<Enter>", lambda _e: canvas.bind_all("<MouseWheel>", _wheel))
    canvas.bind("<Leave>", lambda _e: canvas.unbind_all("<MouseWheel>"))
    return inner


def draw_icon(canvas: tk.Canvas, kind: str, color: str, active: bool = False) -> None:
    """Hand-drawn 18x18 navigation glyphs (no font dependency)."""
    canvas.delete("all")
    w = 1.8 if active else 1.5
    if kind == "overview":
        for dx, dy in ((0, 0), (9, 0), (0, 9), (9, 9)):
            canvas.create_rectangle(2 + dx, 2 + dy, 8 + dx, 8 + dy, outline=color, width=w)
    elif kind == "tasks":
        for i in range(3):
            y = 4 + i * 5
            canvas.create_oval(2, y - 1, 4, y + 1, fill=color, outline=color)
            canvas.create_line(7, y, 16, y, fill=color, width=w)
    elif kind == "monitor":
        for i, h in enumerate((5, 10, 7)):
            x = 3 + i * 5
            canvas.create_line(x, 16, x, 16 - h, fill=color, width=w + 0.9)
    elif kind == "vision":
        canvas.create_rectangle(1, 3, 17, 14, outline=color, width=w)
        canvas.create_line(6, 16, 12, 16, fill=color, width=w)
        canvas.create_line(9, 14, 9, 16, fill=color, width=w)
    elif kind == "security":
        canvas.create_polygon(9, 1, 16, 4, 16, 10, 9, 17, 2, 10, 2, 4, outline=color, fill="", width=w)
    elif kind == "settings":
        canvas.create_oval(6, 6, 12, 12, outline=color, width=w)
        for dx, dy in ((0, -7), (0, 7), (-7, 0), (7, 0), (-5, -5), (5, -5), (-5, 5), (5, 5)):
            canvas.create_line(9 + dx * 0.62, 9 + dy * 0.62, 9 + dx, 9 + dy, fill=color, width=w)
    else:
        canvas.create_oval(4, 4, 14, 14, outline=color, width=w)


# ---------------------------------------------------------------------------
# Shell
# ---------------------------------------------------------------------------
def build_shell(app) -> None:
    """Sidebar navigation + header + content area + persistent activity dock."""
    if not getattr(app, "tab_titles", None):
        app.tab_titles = [
            ("Overview", app._build_overview_tab),
            ("Tasks", app._build_tasks_tab),
            ("Monitor", app._build_monitor_tab),
            ("Vision", app._build_vision_tab),
            ("Security", app._build_security_tab),
            ("Settings", app._build_settings_tab),
        ]
    for child in app.root.winfo_children():
        child.destroy()
    t = THEMES[app.theme_name]
    app.root.configure(bg=t["bg"])
    apply_ttk_theme(app.root, t)

    shell = tk.Frame(app.root, bg=t["bg"])
    shell.pack(fill="both", expand=True)

    # ---- sidebar -----------------------------------------------------------
    sidebar = tk.Frame(shell, bg=t["sidebar"], width=228, bd=0)
    sidebar.pack(side="left", fill="y")
    sidebar.pack_propagate(False)
    tk.Frame(shell, bg=t["border_subtle"], width=1).pack(side="left", fill="y")

    brand_row = tk.Frame(sidebar, bg=t["sidebar"])
    brand_row.pack(fill="x", padx=18, pady=(20, 18))

    mark = tk.Canvas(brand_row, width=30, height=30, bg=t["sidebar"], highlightthickness=0)
    mark.pack(side="left")
    mark.create_rectangle(1, 1, 29, 29, fill=t["brand"], outline=t["brand"])
    mark.create_line(8, 21, 15, 9, fill="#FFFFFF", width=2.4)
    mark.create_line(15, 9, 22, 21, fill="#FFFFFF", width=2.4)
    mark.create_line(11, 17, 19, 17, fill="#FFFFFF", width=2.0)

    brand_text = tk.Frame(brand_row, bg=t["sidebar"])
    brand_text.pack(side="left", padx=(10, 0))
    tk.Label(
        brand_text, text="AI Bridge", bg=t["sidebar"], fg=t["fg"], font=ui_font(12, "bold"), anchor="w"
    ).pack(anchor="w")
    tk.Label(
        brand_text,
        text="Windows client",
        bg=t["sidebar"],
        fg=t["fg_subtle"],
        font=ui_font(8),
        anchor="w",
    ).pack(anchor="w")

    tk.Label(
        sidebar,
        text="WORKSPACE",
        bg=t["sidebar"],
        fg=t["fg_subtle"],
        font=ui_font(8, "bold"),
        anchor="w",
    ).pack(fill="x", padx=20, pady=(6, 8))

    icons = ("overview", "tasks", "monitor", "vision", "security", "settings")
    app._tab_rows = []
    app._tab_buttons = []
    for idx, (label, _builder) in enumerate(app.tab_titles):
        row = tk.Frame(sidebar, bg=t["sidebar"], cursor="hand2")
        row.pack(fill="x", padx=8, pady=1)
        bar = tk.Frame(row, bg=t["sidebar"], width=3)
        bar.pack(side="left", fill="y")
        canvas = tk.Canvas(row, width=18, height=18, bg=t["sidebar"], highlightthickness=0)
        canvas.pack(side="left", padx=(11, 10), pady=9)
        text = tk.Label(
            row, text=label, bg=t["sidebar"], fg=t["fg_muted"], font=ui_font(10), anchor="w", cursor="hand2"
        )
        text.pack(side="left", fill="x", expand=True)
        entry_row = {"frame": row, "bar": bar, "icon": canvas, "label": text, "kind": icons[idx]}
        app._tab_rows.append(entry_row)
        app._tab_buttons.append(row)
        for widget in (row, canvas, text):
            widget.bind("<Button-1>", lambda _e, i=idx: app.select_tab(i))

    spacer = tk.Frame(sidebar, bg=t["sidebar"])
    spacer.pack(fill="both", expand=True)

    # device summary + primary action live in the rail so they survive tab switches
    summary = tk.Frame(sidebar, bg=t["card_alt"], highlightthickness=1, highlightbackground=t["border"])
    summary.pack(fill="x", padx=12, pady=(0, 12))
    s_inner = tk.Frame(summary, bg=t["card_alt"])
    s_inner.pack(fill="x", padx=12, pady=10)
    tk.Label(
        s_inner, text="DEVICE", bg=t["card_alt"], fg=t["fg_subtle"], font=ui_font(8, "bold"), anchor="w"
    ).pack(fill="x")
    tk.Label(
        s_inner,
        textvariable=app.device_id_var,
        bg=t["card_alt"],
        fg=t["fg"],
        font=mono_font(9),
        anchor="w",
    ).pack(fill="x", pady=(3, 6))
    status_row = tk.Frame(s_inner, bg=t["card_alt"])
    status_row.pack(fill="x")
    app._status_dot = tk.Canvas(status_row, width=8, height=8, bg=t["card_alt"], highlightthickness=0)
    app._status_dot.pack(side="left", pady=2)
    app._status_dot.create_oval(1, 1, 7, 7, fill=t["fg_subtle"], outline=t["fg_subtle"])
    tk.Label(
        status_row,
        textvariable=app.status_var,
        bg=t["card_subtle"],
        fg=t["fg_muted"],
        font=ui_font(9),
        anchor="w",
    ).pack(side="left", padx=(6, 0))

    app.start_stop_btn = button(
        sidebar,
        t,
        "■  Stop agent" if app.running else "▶  Start agent",
        app.toggle_agent,
        variant="danger" if app.running else "primary",
        size="md",
    )
    app.start_stop_btn.pack(fill="x", padx=12, pady=(0, 8))
    tk.Label(
        sidebar,
        text="Unprivileged user session",
        bg=t["sidebar"],
        fg=t["fg_subtle"],
        font=ui_font(8),
    ).pack(pady=(0, 14))

    # ---- right column ------------------------------------------------------
    right = tk.Frame(shell, bg=t["bg"])
    right.pack(side="left", fill="both", expand=True)

    header = tk.Frame(right, bg=t["bg"])
    header.pack(fill="x", padx=24, pady=(18, 10))

    titles = tk.Frame(header, bg=t["bg"])
    titles.pack(side="left", anchor="w")
    app.page_title_var = tk.StringVar(value=NAV_PAGES[app.active_tab_idx][0])
    app.page_sub_var = tk.StringVar(value=NAV_PAGES[app.active_tab_idx][1])
    tk.Label(
        titles, textvariable=app.page_title_var, bg=t["bg"], fg=t["fg"], font=ui_font(18, "bold"), anchor="w"
    ).pack(anchor="w")
    tk.Label(
        titles, textvariable=app.page_sub_var, bg=t["bg"], fg=t["fg_muted"], font=ui_font(9), anchor="w"
    ).pack(anchor="w", pady=(3, 0))

    actions = tk.Frame(header, bg=t["bg"])
    actions.pack(side="right", anchor="e")

    status_frame, app.status_badge = pill(actions, t, app.status_var, kind="neutral")
    status_frame.pack(side="left", padx=(0, 6))
    app._status_pill = status_frame
    previous_trace = getattr(app, "_status_trace", None)
    if previous_trace:
        try:
            app.status_var.trace_remove("write", previous_trace)
        except Exception:  # noqa: BLE001 - stale trace id is harmless
            pass
    app._status_trace = app.status_var.trace_add("write", lambda *_args: paint_status_pill(app))
    paint_status_pill(app)

    latency_frame, app.latency_label = pill(actions, t, app.latency_var, kind="neutral")
    latency_frame.pack(side="left", padx=(0, 10))
    app._latency_pill = latency_frame

    button(actions, t, "Dashboard ↗", app.open_dashboard, variant="secondary", size="sm").pack(side="left", padx=(0, 6))
    button(
        actions,
        t,
        "Light" if app.theme_name == "dark" else "Dark",
        app.toggle_theme,
        variant="ghost",
        size="sm",
    ).pack(side="left", padx=(0, 6))
    button(actions, t, "Minimize", app.minimize_to_tray, variant="ghost", size="sm").pack(side="left")

    tk.Frame(right, bg=t["border_subtle"], height=1).pack(fill="x", padx=24)

    # activity dock is persistent: logs survive tab switches
    dock = tk.Frame(right, bg=t["card_subtle"], highlightthickness=1, highlightbackground=t["border_subtle"])
    dock.pack(side="bottom", fill="x", padx=24, pady=(6, 10))

    dock_head = tk.Frame(dock, bg=t["card_subtle"])
    dock_head.pack(fill="x", padx=12, pady=(8, 4))
    tk.Label(
        dock_head, text="ACTIVITY", bg=t["card_subtle"], fg=t["fg_subtle"], font=ui_font(8, "bold")
    ).pack(side="left")
    button(dock_head, t, "Clear", app._clear_log, variant="ghost", size="sm").pack(side="right")
    button(dock_head, t, "Export…", app.export_logs, variant="ghost", size="sm").pack(side="right", padx=(0, 4))

    log_body = tk.Frame(dock, bg=t["log_bg"])
    log_body.pack(fill="both", expand=True, padx=12, pady=(0, 10))
    log_scroll = ttk.Scrollbar(log_body, orient="vertical")
    log_scroll.pack(side="right", fill="y")
    app.log_text = tk.Text(
        log_body,
        bg=t["log_bg"],
        fg=t["log_fg"],
        font=mono_font(9),
        relief="flat",
        bd=0,
        highlightthickness=0,
        wrap="word",
        height=4,
        yscrollcommand=log_scroll.set,
        padx=10,
        pady=8,
        state="disabled",
        insertbackground=t["fg"],
    )
    app.log_text.pack(side="left", fill="both", expand=True)
    log_scroll.config(command=app.log_text.yview)
    app.log_text.tag_config("info", foreground=t["log_info"])
    app.log_text.tag_config("ok", foreground=t["log_ok"])
    app.log_text.tag_config("warn", foreground=t["log_warn"])
    app.log_text.tag_config("err", foreground=t["log_err"])

    app.content_container = tk.Frame(right, bg=t["bg"])
    app.content_container.pack(fill="both", expand=True, padx=24, pady=(10, 0))

    select_tab(app, app.active_tab_idx)


def select_tab(app, idx: int) -> None:
    """Switch the active page and repaint the navigation rail."""
    app.active_tab_idx = idx
    t = THEMES[app.theme_name]

    if hasattr(app, "page_title_var"):
        app.page_title_var.set(NAV_PAGES[idx][0])
        app.page_sub_var.set(NAV_PAGES[idx][1])

    for i, row in enumerate(getattr(app, "_tab_rows", [])):
        active = i == idx
        bg = t["nav_active"] if active else t["sidebar"]
        fg = t["fg"] if active else t["fg_muted"]
        row["frame"].configure(bg=bg)
        row["bar"].configure(bg=t["brand"] if active else bg)
        row["icon"].configure(bg=bg)
        row["label"].configure(bg=bg, fg=fg, font=ui_font(10, "bold" if active else "normal"))
        draw_icon(row["icon"], row["kind"], t["brand"] if active else t["fg_subtle"], active)

    paint_status_pill(app)

    for child in app.content_container.winfo_children():
        child.destroy()

    _, builder = app.tab_titles[idx]
    builder(app.content_container)


# ---------------------------------------------------------------------------
# Overview
# ---------------------------------------------------------------------------
def build_overview(app, parent: tk.Widget) -> None:
    t = THEMES[app.theme_name]
    page = scroll_area(parent, t)
    page.columnconfigure(0, weight=3, uniform="ov")
    page.columnconfigure(1, weight=2, uniform="ov")

    # connection -------------------------------------------------------------
    conn_outer, conn = card(page, t)
    conn_outer.grid(row=0, column=0, sticky="nsew", padx=(0, GAP), pady=(0, GAP))
    micro(conn, t, "Control plane").pack(fill="x")
    heading(conn, t, "Connection", 13).pack(fill="x", pady=(2, 2))
    caption(conn, t, "Where this device enrols, polls for tasks and posts results.").pack(fill="x")

    tk.Label(
        conn, text="Endpoint URL", bg=t["card"], fg=t["fg_muted"], font=ui_font(9, "bold"), anchor="w"
    ).pack(fill="x", pady=(14, 4))
    url_row = tk.Frame(conn, bg=t["card"])
    url_row.pack(fill="x")
    app.url_entry = entry(url_row, t, app.url_var)
    app.url_entry.pack(side="left", fill="x", expand=True, ipady=5)
    button(url_row, t, "Ping", app.ping_server, variant="secondary", size="sm").pack(side="left", padx=(8, 0))

    tk.Label(
        conn, text="Device token", bg=t["card"], fg=t["fg_muted"], font=ui_font(9, "bold"), anchor="w"
    ).pack(fill="x", pady=(12, 4))
    tok_row = tk.Frame(conn, bg=t["card"])
    tok_row.pack(fill="x")
    app.tok_entry = entry(tok_row, t, app.token_var, show="" if app.show_token else "•")
    app.tok_entry.pack(side="left", fill="x", expand=True, ipady=5)
    app.show_btn = button(
        tok_row, t, "Hide" if app.show_token else "Show", app._toggle_token_vis, variant="secondary", size="sm"
    )
    app.show_btn.pack(side="left", padx=(8, 0))
    button(tok_row, t, "Copy", app._copy_token, variant="ghost", size="sm").pack(side="left", padx=(4, 0))
    button(tok_row, t, "Reload", app.reload_token_from_disk, variant="ghost", size="sm").pack(side="left", padx=(4, 0))

    # session ----------------------------------------------------------------
    sess_outer, sess = card(page, t)
    sess_outer.grid(row=0, column=1, sticky="nsew", pady=(0, GAP))
    micro(sess, t, "Session").pack(fill="x")
    heading(sess, t, "Agent", 13).pack(fill="x", pady=(2, 10))
    tk.Label(
        sess,
        textvariable=app.status_var,
        bg=t["card"],
        fg=t["fg"],
        font=ui_font(20, "bold"),
        anchor="w",
    ).pack(fill="x")
    tk.Label(
        sess,
        textvariable=app.latency_var,
        bg=t["card"],
        fg=t["fg_muted"],
        font=mono_font(9),
        anchor="w",
    ).pack(fill="x", pady=(2, 12))
    switch(sess, t, "Auto-start with app", app.auto_start_var, app.save_current_config).pack(fill="x", pady=(0, 10))
    button(sess, t, "Save configuration", app.save_current_config, variant="secondary").pack(fill="x", pady=(0, 6))
    button(sess, t, "Rotate token", app.rotate_token_manual, variant="ghost").pack(fill="x")

    # KPIs -------------------------------------------------------------------
    kpi_row = tk.Frame(page, bg=t["bg"])
    kpi_row.grid(row=1, column=0, columnspan=2, sticky="ew")
    for col in range(4):
        kpi_row.columnconfigure(col, weight=1, uniform="kpi")
    kpi(kpi_row, t, "Device ID", app.device_id_var, copy_command=app._copy_device_id, mono=True).grid(
        row=0, column=0, sticky="nsew", padx=(0, 6)
    )
    kpi(kpi_row, t, "Last heartbeat", app.heartbeat_var).grid(row=0, column=1, sticky="nsew", padx=6)
    kpi(kpi_row, t, "Token expiry", app.expiry_var).grid(row=0, column=2, sticky="nsew", padx=6)
    kpi(kpi_row, t, "Tasks completed", app.tasks_var).grid(row=0, column=3, sticky="nsew", padx=(6, 0))

    # guardrails summary -----------------------------------------------------
    guard_outer, guard = card(page, t)
    guard_outer.grid(row=2, column=0, columnspan=2, sticky="ew", pady=(GAP, 0))
    micro(guard, t, "Local guardrails").pack(fill="x")
    chips = tk.Frame(guard, bg=t["card"])
    chips.pack(fill="x", pady=(8, 0))
    flags = (
        ("Desktop vision", app.policy_desktop_enabled, "permission"),
        ("Tier 3 tools", app.policy_allow_tier3, "approval"),
        ("Workspace writes", app.policy_allow_writes, "permission"),
        ("Shell access", app.policy_allow_shell, "approval"),
    )
    for label, var, _ in flags:
        on = bool(var.get())
        bg = t["success_bg"] if on else t["card_alt"]
        fg = t["success_fg"] if on else t["fg_subtle"]
        chip = tk.Label(
            chips,
            text=f"{label}: {'on' if on else 'off'}",
            bg=bg,
            fg=fg,
            font=ui_font(8, "bold"),
            padx=10,
            pady=4,
        )
        chip.pack(side="left", padx=(0, 6))
    tk.Label(
        chips,
        text=f"Max unattended tier {app.policy_max_tier.get()}",
        bg=t["card_alt"],
        fg=t["fg_muted"],
        font=ui_font(8, "bold"),
        padx=10,
        pady=4,
    ).pack(side="left")


# ---------------------------------------------------------------------------
# Tasks
# ---------------------------------------------------------------------------
def build_tasks(app, parent: tk.Widget) -> None:
    t = THEMES[app.theme_name]

    bar_outer, bar = card(parent, t, pad=12)
    bar_outer.pack(fill="x", pady=(0, GAP))
    left = tk.Frame(bar, bg=t["card"])
    left.pack(side="left")
    heading(left, t, "Task history", 12).pack(side="left")
    tk.Label(
        left,
        text=f"{len(app.task_history)} received",
        bg=t["card"],
        fg=t["fg_subtle"],
        font=ui_font(9),
    ).pack(side="left", padx=(10, 0))
    button(bar, t, "Clear history", app._clear_task_history, variant="ghost", size="sm").pack(side="right")

    split = tk.Frame(parent, bg=t["bg"])
    split.pack(fill="both", expand=True)
    split.columnconfigure(0, weight=3)
    split.columnconfigure(1, weight=4)
    split.rowconfigure(0, weight=1)

    table_outer = tk.Frame(split, bg=t["card"], highlightthickness=1, highlightbackground=t["border"], bd=0)
    table_outer.grid(row=0, column=0, sticky="nsew", padx=(0, GAP))
    holder = tk.Frame(table_outer, bg=t["card"])
    holder.pack(fill="both", expand=True, padx=1, pady=1)

    cols = ("time", "id", "tool", "duration", "status")
    app.task_tree = ttk.Treeview(holder, columns=cols, show="headings", selectmode="browse")
    for key, label, width, anchor in (
        ("time", "TIME", 78, "w"),
        ("id", "TASK", 86, "w"),
        ("tool", "TOOL", 150, "w"),
        ("duration", "TOOK", 70, "center"),
        ("status", "STATUS", 88, "center"),
    ):
        app.task_tree.heading(key, text=label)
        app.task_tree.column(key, width=width, anchor=anchor, stretch=(key == "tool"))
    tree_scroll = ttk.Scrollbar(holder, orient="vertical", command=app.task_tree.yview)
    app.task_tree.configure(yscrollcommand=tree_scroll.set)
    tree_scroll.pack(side="right", fill="y")
    app.task_tree.pack(side="left", fill="both", expand=True)
    app.task_tree.tag_configure("odd", background=t["table_row_odd"])
    app.task_tree.tag_configure("even", background=t["table_row_even"])
    app.task_tree.bind("<<TreeviewSelect>>", app._on_task_tree_select)

    for index, item in enumerate(reversed(app.task_history)):
        app.task_tree.insert(
            "",
            "end",
            iid=item["id"],
            values=(
                item["time"],
                item["id"][:8],
                item["tool"],
                f"{item.get('duration_s', 0):.2f}s",
                item["status"].upper(),
            ),
            tags=("even" if index % 2 == 0 else "odd",),
        )

    insp_outer, insp = card(split, t)
    insp_outer.grid(row=0, column=1, sticky="nsew")
    head = tk.Frame(insp, bg=t["card"])
    head.pack(fill="x")
    heading(head, t, "Payload inspector", 12).pack(side="left")
    app.copy_payload_btn = button(head, t, "Copy JSON", app._copy_inspector_payload, variant="secondary", size="sm")
    app.copy_payload_btn.pack(side="right")

    app.insp_meta_label = tk.Label(
        insp,
        text="Select a task to inspect its arguments and returned result.",
        bg=t["card"],
        fg=t["fg_muted"],
        font=ui_font(9),
        anchor="w",
    )
    app.insp_meta_label.pack(fill="x", pady=(6, 10))

    text_wrap = tk.Frame(insp, bg=t["log_bg"], highlightthickness=1, highlightbackground=t["border_subtle"])
    text_wrap.pack(fill="both", expand=True)
    scroll = ttk.Scrollbar(text_wrap, orient="vertical")
    scroll.pack(side="right", fill="y")
    app.insp_text = tk.Text(
        text_wrap,
        bg=t["log_bg"],
        fg=t["log_fg"],
        font=mono_font(9),
        relief="flat",
        bd=0,
        highlightthickness=0,
        wrap="word",
        padx=10,
        pady=8,
        yscrollcommand=scroll.set,
    )
    app.insp_text.pack(side="left", fill="both", expand=True)
    scroll.config(command=app.insp_text.yview)


# ---------------------------------------------------------------------------
# Monitor
# ---------------------------------------------------------------------------
def build_monitor(app, parent: tk.Widget) -> None:
    import os
    import platform as platform_mod

    t = THEMES[app.theme_name]
    app._refresh_system_monitor()
    page = scroll_area(parent, t)
    page.columnconfigure(0, weight=1)

    bar_outer, bar = card(page, t, pad=12)
    bar_outer.grid(row=0, column=0, sticky="ew", pady=(0, GAP))
    heading(bar, t, "Live hardware telemetry", 12).pack(side="left")
    button(bar, t, "Refresh", app._refresh_system_monitor, variant="secondary", size="sm").pack(side="right")
    switch(bar, t, "Auto-refresh", app.auto_refresh_monitor_var).pack(side="right", padx=(0, 14))

    gauges_outer, gauges = card(page, t, pad=18)
    gauges_outer.grid(row=1, column=0, sticky="ew", pady=(0, GAP))
    for col in range(3):
        gauges.columnconfigure(col, weight=1, uniform="gauge")

    app._gauges = []
    for col, (title, var, kind) in enumerate(
        (
            ("CPU utilization", app.cpu_var, "brand"),
            ("System RAM", app.ram_var, "ok"),
            ("Primary disk (C:)", app.disk_var, "warn"),
        )
    ):
        cell = tk.Frame(gauges, bg=t["card"])
        cell.grid(row=0, column=col, sticky="nsew", padx=(0 if col == 0 else 10, 0))
        tk.Label(
            cell, text=title.upper(), bg=t["card"], fg=t["fg_subtle"], font=ui_font(8, "bold"), anchor="w"
        ).pack(fill="x")
        canvas = tk.Canvas(cell, width=150, height=150, bg=t["card"], highlightthickness=0)
        canvas.pack(pady=(6, 2))
        tk.Label(
            cell,
            textvariable=var,
            bg=t["card"],
            fg=t["fg_muted"],
            font=mono_font(9),
            anchor="center",
        ).pack(fill="x")
        app._gauges.append({"canvas": canvas, "var": var, "kind": kind})

    specs_outer, specs = card(page, t)
    specs_outer.grid(row=2, column=0, sticky="ew")
    heading(specs, t, "Host environment", 12).pack(fill="x", pady=(0, 12))

    grid = tk.Frame(specs, bg=t["card"])
    grid.pack(fill="x")
    grid.columnconfigure(1, weight=1)
    grid.columnconfigure(3, weight=1)

    rows = [
        ("Machine", platform_mod.node()),
        ("Operating system", f"{platform_mod.system()} {platform_mod.release()}"),
        ("Architecture", f"{platform_mod.machine()} / {os.cpu_count() or 1} cores"),
        ("Processor", platform_mod.processor() or "x86-64 compatible"),
        ("Address", app.ip_var.get()),
        ("Uptime", app.uptime_var.get()),
        ("Python", platform_mod.python_version()),
        ("Privileges", "Interactive user / standard"),
    ]
    for idx, (label, value) in enumerate(rows):
        row, col = divmod(idx, 2)
        tk.Label(
            grid, text=label.upper(), bg=t["card"], fg=t["fg_subtle"], font=ui_font(8, "bold"), anchor="w"
        ).grid(row=row, column=col * 2, sticky="w", pady=5, padx=(0, 10))
        tk.Label(
            grid, text=value, bg=t["card"], fg=t["fg"], font=mono_font(9), anchor="w"
        ).grid(row=row, column=col * 2 + 1, sticky="w", pady=5, padx=(0, 24))

    redraw_gauges(app)


def redraw_gauges(app) -> None:
    """Repaint the monitor donut gauges from the current telemetry strings."""
    t = THEMES[app.theme_name]
    colours = {"brand": t["brand"], "ok": t["success_fg"], "warn": t["warn_fg"]}
    for gauge in getattr(app, "_gauges", []):
        canvas = gauge["canvas"]
        if not canvas.winfo_exists():
            continue
        text = gauge["var"].get()
        match = re.match(r"\s*([\d.]+)", text)
        value = max(0.0, min(100.0, float(match.group(1)) if match else 0.0))
        colour = colours.get(gauge["kind"], t["brand"])
        canvas.delete("all")
        canvas.create_oval(14, 14, 136, 136, outline=t["gauge_track"], width=12)
        if value > 0:
            canvas.create_arc(
                14,
                14,
                136,
                136,
                start=90,
                extent=-359.9 * (value / 100.0),
                style="arc",
                outline=colour,
                width=12,
            )
        canvas.create_text(75, 70, text=f"{value:.0f}%", fill=t["fg"], font=ui_font(20, "bold"))
        canvas.create_text(75, 94, text="used", fill=t["fg_subtle"], font=ui_font(8))


# ---------------------------------------------------------------------------
# Vision
# ---------------------------------------------------------------------------
def build_vision(app, parent: tk.Widget) -> None:
    t = THEMES[app.theme_name]

    bar_outer, bar = card(parent, t, pad=12)
    bar_outer.pack(fill="x", pady=(0, GAP))
    heading(bar, t, "Desktop vision", 12).pack(side="left")
    caption(bar, t, "Capture exactly what an agent sees in this session.", wrap=420).pack(
        side="left", padx=(12, 0)
    )
    button(bar, t, "Capture screenshot", app.capture_preview_screenshot, variant="primary", size="sm").pack(
        side="right"
    )

    split = tk.Frame(parent, bg=t["bg"])
    split.pack(fill="both", expand=True)
    split.columnconfigure(0, weight=5)
    split.columnconfigure(1, weight=3)
    split.rowconfigure(0, weight=1)

    view_outer, view = card(split, t, pad=12)
    view_outer.grid(row=0, column=0, sticky="nsew", padx=(0, GAP))
    v_head = tk.Frame(view, bg=t["card"])
    v_head.pack(fill="x")
    heading(v_head, t, "Viewport", 11).pack(side="left")
    tk.Label(
        v_head, text="JPEG · scaled · session-local", bg=t["card"], fg=t["fg_subtle"], font=ui_font(8)
    ).pack(side="right")

    frame = tk.Frame(view, bg=t["log_bg"], highlightthickness=1, highlightbackground=t["border_subtle"])
    frame.pack(fill="both", expand=True, pady=(10, 0))
    app.vision_canvas = tk.Canvas(frame, bg=t["log_bg"], highlightthickness=0)
    app.vision_canvas.pack(fill="both", expand=True)
    app.vision_canvas.create_text(
        10,
        10,
        text="No frame captured.\nUse “Capture screenshot” to preview this session.",
        fill=t["fg_subtle"],
        font=ui_font(9),
        anchor="nw",
        tags="placeholder",
    )

    side = tk.Frame(split, bg=t["bg"])
    side.grid(row=0, column=1, sticky="nsew")
    side.rowconfigure(1, weight=1)

    meta_outer, meta = card(side, t)
    meta_outer.grid(row=0, column=0, sticky="ew", pady=(0, GAP))
    micro(meta, t, "Last capture").pack(fill="x")
    app.vision_meta_label = tk.Label(
        meta,
        text="Nothing captured yet.",
        bg=t["card"],
        fg=t["fg"],
        font=mono_font(8),
        justify="left",
        anchor="w",
        wraplength=280,
    )
    app.vision_meta_label.pack(fill="x", pady=(8, 10))
    button(meta, t, "Open in viewer", app._open_screenshot_in_viewer, variant="secondary").pack(
        fill="x", pady=(0, 6)
    )
    button(meta, t, "Copy path", app._copy_screenshot_path, variant="ghost").pack(fill="x")

    guard_outer, guard = card(side, t)
    guard_outer.grid(row=1, column=0, sticky="nsew")
    micro(guard, t, "Guardrails").pack(fill="x")
    for title, body in (
        ("Interactive session only", "Capture and UI actions run in your logged-in desktop session."),
        ("Never SYSTEM", "The agent has no background access to other user accounts."),
        ("Privacy", "Frames are downscaled JPEGs; the token is never rendered into the image."),
    ):
        block = tk.Frame(guard, bg=t["card"])
        block.pack(fill="x", pady=(10, 0))
        tk.Label(
            block, text=title, bg=t["card"], fg=t["fg"], font=ui_font(9, "bold"), anchor="w"
        ).pack(fill="x")
        caption(block, t, body, wrap=280).pack(fill="x")


# ---------------------------------------------------------------------------
# Security
# ---------------------------------------------------------------------------
def build_security(app, parent: tk.Widget) -> None:
    t = THEMES[app.theme_name]
    page = scroll_area(parent, t)
    page.columnconfigure(0, weight=3, uniform="sec")
    page.columnconfigure(1, weight=2, uniform="sec")

    # ---- policy state + actions -------------------------------------------
    bar_outer, bar = card(page, t, pad=12)
    bar_outer.grid(row=0, column=0, columnspan=2, sticky="ew", pady=(0, GAP))
    left = tk.Frame(bar, bg=t["card"])
    left.pack(side="left")
    micro(left, t, "Policy state").pack(anchor="w")
    state_row = tk.Frame(left, bg=t["card"])
    state_row.pack(anchor="w", pady=(6, 0))
    status_pill, status_text = pill(state_row, t, app.policy_status_var, kind="neutral")
    status_pill.pack(side="left")

    def paint_policy_state(*_args) -> None:
        text = app.policy_status_var.get().lower()
        if "fail" in text:
            kind = "bad"
        elif "sync" in text:
            kind = "ok"
        else:
            kind = "neutral"
        bg, fg, border = _pill_colors(t, kind)
        status_pill.configure(bg=bg, highlightbackground=border)
        status_text.configure(bg=bg, fg=fg)

    app.policy_status_var.trace_add("write", paint_policy_state)
    paint_policy_state()
    caption(state_row, t, "Applies to this device only.").pack(side="left", padx=(10, 0))
    right = tk.Frame(bar, bg=t["card"])
    right.pack(side="right")
    button(
        right,
        t,
        "Sync from cloud",
        lambda: app.fetch_policy_from_server(notify_ui=True),
        variant="secondary",
    ).pack(side="left", padx=(0, 8))
    button(right, t, "Save & apply", app.save_and_apply_policy, variant="primary").pack(side="left")

    # ---- presets ----------------------------------------------------------
    pre_outer, pre = card(page, t)
    pre_outer.grid(row=1, column=0, columnspan=2, sticky="ew", pady=(0, GAP))
    micro(pre, t, "Quick presets").pack(fill="x")
    heading(pre, t, "Set the guardrails in one click", 13).pack(fill="x", pady=(2, 2))
    caption(pre, t, "Tuned for ChatGPT, Claude and MCP agents driving this desktop.").pack(fill="x")
    preset_row = tk.Frame(pre, bg=t["card"])
    preset_row.pack(fill="x", pady=(12, 0))
    button(preset_row, t, "Full AI desktop control", app.apply_full_desktop_preset, variant="primary").pack(
        side="left", padx=(0, 8)
    )
    button(preset_row, t, "Standard workstation", app.apply_workstation_preset, variant="secondary").pack(
        side="left", padx=(0, 8)
    )
    button(preset_row, t, "Read-only lockdown", app.apply_lockdown_preset, variant="secondary").pack(side="left")

    # ---- guardrails -------------------------------------------------------
    g_outer, g = card(page, t)
    g_outer.grid(row=2, column=0, sticky="nsew", padx=(0, GAP))
    micro(g, t, "Autonomous execution").pack(fill="x")
    heading(g, t, "Guardrails", 13).pack(fill="x", pady=(2, 2))
    caption(g, t, "What an agent may do without a human in the loop.").pack(fill="x", pady=(0, 4))
    toggles = (
        ("Desktop vision & automation", app.policy_desktop_enabled, "Screenshots, window inspection, approved UI actions."),
        ("Unattended tier-3 execution", app.policy_allow_tier3, "Edits and tests run without an approval prompt."),
        ("Shell commands", app.policy_allow_shell, "run_shell may execute argv commands on this host."),
        ("Workspace file writes", app.policy_allow_writes, "Writes stay inside the configured workspace root."),
        ("Package installation", app.policy_allow_package_install, "pip, npm and similar installers may run."),
    )
    for index, (label, variable, hint) in enumerate(toggles):
        if index:
            divider(g, t)
        block = tk.Frame(g, bg=t["card"])
        block.pack(fill="x")
        switch(block, t, label, variable, app.save_current_config).pack(fill="x")
        caption(block, t, hint).pack(fill="x", pady=(2, 0))

    # ---- risk ceiling -----------------------------------------------------
    c_outer, c = card(page, t)
    c_outer.grid(row=2, column=1, sticky="nsew")
    micro(c, t, "Risk ceiling").pack(fill="x")
    heading(c, t, "Unattended tier", 13).pack(fill="x", pady=(2, 2))
    caption(c, t, "The highest risk tier allowed without approval.").pack(fill="x", pady=(0, 10))

    tiers = (
        (1, "Read-only", "Diagnostics and discovery only."),
        (2, "Safe writes", "Workspace edits, no execution."),
        (3, "Autonomous", "Edits, tests and vision, unattended."),
        (4, "Unconfined", "High-risk operations, admin approval."),
    )
    tier_rows = []

    def paint_tiers() -> None:
        for item in tier_rows:
            selected = app.policy_max_tier.get() == item["value"]
            bg = t["accent_soft"] if selected else t["card"]
            for key in ("row", "inner", "dot", "col", "title", "hint"):
                item[key].configure(bg=bg)
            item["row"].configure(highlightbackground=t["brand"] if selected else t["border"])
            item["dot"].delete("all")
            if selected:
                item["dot"].create_oval(1, 1, 13, 13, outline=t["brand"], width=2)
                item["dot"].create_oval(4, 4, 10, 10, fill=t["brand"], outline=t["brand"])
            else:
                item["dot"].create_oval(1, 1, 13, 13, outline=t["fg_subtle"], width=1)

    def choose(value: int) -> None:
        app.policy_max_tier.set(value)
        app.save_current_config()
        paint_tiers()

    for value, name, hint in tiers:
        row = tk.Frame(
            c,
            bg=t["card"],
            highlightthickness=1,
            highlightbackground=t["border"],
            cursor="hand2",
        )
        row.pack(fill="x", pady=2)
        inner = tk.Frame(row, bg=t["card"], cursor="hand2")
        inner.pack(fill="x", padx=10, pady=7)
        dot = tk.Canvas(inner, width=14, height=14, bg=t["card"], highlightthickness=0, cursor="hand2")
        dot.pack(side="left", padx=(0, 9))
        col = tk.Frame(inner, bg=t["card"], cursor="hand2")
        col.pack(side="left", fill="x", expand=True)
        title = tk.Label(col, text=name, bg=t["card"], fg=t["fg"], font=ui_font(9, "bold"), anchor="w")
        title.pack(fill="x")
        note = tk.Label(col, text=hint, bg=t["card"], fg=t["fg_muted"], font=ui_font(8), anchor="w")
        note.pack(fill="x")
        for widget in (row, inner, dot, col, title, note):
            widget.bind("<Button-1>", lambda _event, v=value: choose(v))
        tier_rows.append(
            {"value": value, "row": row, "inner": inner, "dot": dot, "col": col, "title": title, "hint": note}
        )
    paint_tiers()

    # ---- allowlist --------------------------------------------------------
    a_outer, a = card(page, t)
    a_outer.grid(row=3, column=0, columnspan=2, sticky="ew", pady=(GAP, 0))
    micro(a, t, "Desktop automation").pack(fill="x")
    heading(a, t, "Allowed applications", 13).pack(fill="x", pady=(2, 2))
    caption(
        a,
        t,
        "launch_approved_application can only start executables listed here.",
        wrap=760,
    ).pack(fill="x")

    quick_head = tk.Frame(a, bg=t["card"])
    quick_head.pack(fill="x", pady=(12, 6))
    micro(quick_head, t, "Quick toggles").pack(side="left")
    button(
        quick_head, t, "Disallow all", app.disallow_all_apps, variant="ghost", size="sm"
    ).pack(side="right")
    button(
        quick_head, t, "Allow all standard", app.allow_all_standard_apps, variant="ghost", size="sm"
    ).pack(side="right", padx=(0, 4))

    quick_grid = tk.Frame(a, bg=t["card"])
    quick_grid.pack(fill="x")
    for column in range(5):
        quick_grid.columnconfigure(column, weight=1, uniform="app")
    app._quick_app_buttons.clear()
    for index, (label, app_id) in enumerate(COMMON_WINDOWS_APPS):
        btn = tk.Button(
            quick_grid,
            text=label,
            command=lambda aid=app_id: app.toggle_quick_app(aid),
            relief="flat",
            bd=0,
            highlightthickness=1,
            highlightbackground=t["border"],
            activeforeground=t["fg"],
            font=ui_font(8),
            padx=8,
            pady=5,
            cursor="hand2",
        )
        btn.grid(
            row=index // 5,
            column=index % 5,
            sticky="ew",
            padx=(0 if index % 5 == 0 else 6, 0),
            pady=(0, 6),
        )
        app._quick_app_buttons[app_id] = btn

    micro(a, t, "Custom executable").pack(fill="x", pady=(8, 4))
    add_row = tk.Frame(a, bg=t["card"])
    add_row.pack(fill="x")
    app._custom_app_var = tk.StringVar()
    field = entry(add_row, t, app._custom_app_var, mono=True)
    field.pack(side="left", fill="x", expand=True, ipady=5)

    def add_custom() -> None:
        value = app._custom_app_var.get().strip()
        if value:
            app.add_custom_app(value)
            app._custom_app_var.set("")

    field.bind("<Return>", lambda _event: add_custom())
    button(add_row, t, "Add application", add_custom, variant="secondary").pack(side="left", padx=(8, 0))

    micro(a, t, "Currently allowed").pack(fill="x", pady=(14, 6))
    app._app_chips_frame = tk.Frame(a, bg=t["card"])
    app._app_chips_frame.pack(fill="x")
    app._render_allowed_app_chips()
    app._update_quick_app_buttons()

    # ---- risk matrix ------------------------------------------------------
    m_outer, m = card(page, t)
    m_outer.grid(row=4, column=0, columnspan=2, sticky="ew", pady=(GAP, 4))
    micro(m, t, "Reference").pack(fill="x")
    heading(m, t, "Tool risk classification", 13).pack(fill="x", pady=(2, 2))
    caption(m, t, "What each tier unlocks and how it is gated.").pack(fill="x", pady=(0, 10))
    matrix = (
        ("Tier 1 - Read-only diagnostics", "Pre-authorized", "ok", "get_system_info, get_resource_usage, list_processes, get_service_status"),
        ("Tier 2 - Workspace navigation", "Confined", "ok", "read_workspace_file, search_workspace, list_workspace"),
        ("Tier 3 - Local modification & vision", "Policy governed", "warn", "capture_desktop_screenshot, launch_approved_application, file edits, tests"),
        ("Tier 4 - Critical deployments", "Approval required", "bad", "deploy_application and unconfined high-risk operations"),
    )
    for name, state, kind, tools in matrix:
        row = tk.Frame(m, bg=t["card_subtle"], highlightthickness=1, highlightbackground=t["border_subtle"])
        row.pack(fill="x", pady=2)
        inner = tk.Frame(row, bg=t["card_subtle"])
        inner.pack(fill="x", padx=12, pady=8)
        top = tk.Frame(inner, bg=t["card_subtle"])
        top.pack(fill="x")
        tk.Label(top, text=name, bg=t["card_subtle"], fg=t["fg"], font=ui_font(9, "bold"), anchor="w").pack(
            side="left"
        )
        badge(top, t, state, kind=kind).pack(side="right")
        tk.Label(
            inner,
            text=tools,
            bg=t["card_subtle"],
            fg=t["fg_muted"],
            font=mono_font(8),
            anchor="w",
            justify="left",
        ).pack(fill="x", pady=(4, 0))


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------
def build_settings(app, parent: tk.Widget) -> None:
    t = THEMES[app.theme_name]
    page = scroll_area(parent, t)
    page.columnconfigure(0, weight=1)

    bar_outer, bar = card(page, t, pad=12)
    bar_outer.grid(row=0, column=0, sticky="ew", pady=(0, GAP))
    left = tk.Frame(bar, bg=t["card"])
    left.pack(side="left")
    micro(left, t, "Preferences").pack(anchor="w")
    heading(left, t, "Client & Windows integration", 13).pack(anchor="w", pady=(2, 0))
    button(bar, t, "Save settings", app.save_current_config, variant="primary").pack(side="right")

    columns = tk.Frame(page, bg=t["bg"])
    columns.grid(row=1, column=0, sticky="ew")
    columns.columnconfigure(0, weight=3, uniform="set")
    columns.columnconfigure(1, weight=2, uniform="set")

    # ---- Windows integration ---------------------------------------------
    w_outer, w = card(columns, t)
    w_outer.grid(row=0, column=0, sticky="nsew", padx=(0, GAP))
    micro(w, t, "Windows").pack(fill="x")
    heading(w, t, "System integration", 13).pack(fill="x", pady=(2, 2))
    caption(w, t, "How the client behaves with the operating system.").pack(fill="x", pady=(0, 6))
    switch(w, t, "Launch on Windows login", app.windows_autostart_var, app._on_autostart_toggle).pack(
        fill="x", pady=(8, 0)
    )
    caption(w, t, "Adds an HKCU Run entry so the agent starts with your session.").pack(fill="x", pady=(2, 4))
    divider(w, t)
    switch(w, t, "Minimize to tray on close", app.minimize_to_tray_var, app.save_current_config).pack(fill="x")
    caption(w, t, "Closing the window keeps the agent polling in the background.").pack(fill="x", pady=(2, 4))
    divider(w, t)
    switch(w, t, "Desktop notifications", app.notifications_var, app.save_current_config).pack(fill="x")
    caption(w, t, "Raise a Windows notification when a task finishes.").pack(fill="x", pady=(2, 0))

    # ---- poller ----------------------------------------------------------
    side = tk.Frame(columns, bg=t["bg"])
    side.grid(row=0, column=1, sticky="nsew")

    p_outer, p = card(side, t)
    p_outer.pack(fill="x")
    micro(p, t, "Poller").pack(fill="x")
    heading(p, t, "Long-poll timeout", 13).pack(fill="x", pady=(2, 2))
    caption(p, t, "How long a task request waits before returning empty.", wrap=320).pack(
        fill="x", pady=(0, 10)
    )
    spin_row = tk.Frame(p, bg=t["card"])
    spin_row.pack(fill="x")
    tk.Spinbox(
        spin_row,
        from_=5,
        to=60,
        textvariable=app.poll_wait_var,
        width=6,
        bg=t["input_bg"],
        fg=t["fg"],
        buttonbackground=t["card_alt"],
        insertbackground=t["fg"],
        relief="flat",
        bd=0,
        highlightthickness=1,
        highlightbackground=t["border"],
        highlightcolor=t["brand"],
        font=mono_font(10),
        justify="center",
    ).pack(side="left", ipady=3)
    tk.Label(
        spin_row, text="seconds (5-60)", bg=t["card"], fg=t["fg_muted"], font=ui_font(9)
    ).pack(side="left", padx=(8, 0))

    # ---- diagnostics -----------------------------------------------------
    d_outer, d = card(side, t)
    d_outer.pack(fill="x", pady=(GAP, 0))
    micro(d, t, "Diagnostics").pack(fill="x")
    heading(d, t, "Configuration & logs", 13).pack(fill="x", pady=(2, 2))
    caption(d, t, "Back up the log stream or return every preference to its default.", wrap=320).pack(
        fill="x", pady=(0, 10)
    )
    button(d, t, "Export logs to file", app.export_logs, variant="secondary").pack(fill="x", pady=(0, 6))
    button(d, t, "Reset to defaults", app._reset_defaults, variant="ghost").pack(fill="x")
