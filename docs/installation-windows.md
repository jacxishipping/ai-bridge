# Installation — Windows
1. Install Python 3.11+ from python.org (tick "Add to PATH").
2. Copy this repo to e.g. `C:\ai-bridge`.
3. `py -3 -m venv C:\ai-bridge\.venv` then `C:\ai-bridge\.venv\Scripts\pip install -e C:\ai-bridge`.
4. Create a workspace folder, e.g. `C:\Users\YOUR_USER\ai-bridge-workspace`, and set
   `AI_BRIDGE_WORKSPACE` to it in the agent's environment.
5. Choose the account the agent runs as: your own main account (default),
   or a dedicated low-privilege local user (e.g. `ai-bridge`, create it
   first) passed with `-User`.
6. Run `deployment/windows/install-agent.ps1 -ControlUrl <plane-url> -DeviceToken <token>`
   in an elevated PowerShell (token from the dashboard, shown once).
   Add `-User <account>` to run as a different existing account.
7. Logs: check the scheduled task's history and the agent's stdout log;
   the control plane's /api/audit shows every task decision.
8. Desktop automation (optional, separate): start
   `agents/windows/desktop_helper.py` in a LOGGED-IN user session with
   `AI_BRIDGE_DESKTOP_ENABLED=1`. Never run it as SYSTEM — SYSTEM cannot
   see the user's desktop, and this project does not try to bypass that.
9. Remove/revoke: run `deployment/windows/uninstall-agent.ps1`, then
   revoke the device in the dashboard so its token stops working.
Windows agent execution was verified end to end on 2026-10-25
(Windows Server 2025: heartbeat, task dispatch, system-info and
service-status tasks completing); see docs/implementation-status.md.

## Support report (`-Diagnose`)

The Windows installers can print a machine-readable report of what this host looks
like without installing, elevating or opening a window:

```powershell
deployment\windows\install-agent.ps1 -Diagnose
powershell -ExecutionPolicy Bypass -File deployment\windows\Install-AIBridge.ps1 -Diagnose
deployment\windows\Setup.bat -Diagnose
.\magic-install.ps1 -Diagnose          # runs unelevated
```

The same report is printed automatically when an install fails, under a `Reason:`
line, immediately before the installer exits 1:

| Installer | Prints the report when |
| :--- | :--- |
| `install-agent.ps1` | the `-User` account does not exist, `-ControlUrl`/`-DeviceToken` are missing, or any terminating error occurs |
| `Install-AIBridge.ps1` | Python 3.11+ is unavailable, the virtualenv is incomplete, or any terminating error occurs |
| `magic-install.ps1` | the enrollment call fails, or any terminating error occurs |

Diagnostics never mask the real outcome: the report exits 0 on its own, and a
failing install still exits 1. To attach one to a ticket:

```powershell
powershell -ExecutionPolicy Bypass -File deployment\windows\Install-AIBridge.ps1 -Silent 2>&1 |
    Tee-Object -FilePath ai-bridge-install.log
```

A report is also available from an installed client, with no window:

```powershell
.venv\Scripts\python.exe agents\windows\gui_app.py --diagnose
```

If neither `gui_app.py` nor a Python interpreter can be found, the helper says so
and exits 0 instead of failing the install a second time.

### What it does and does not touch

It reads the config, reads the token file and performs one `GET /health` against
the configured control plane. It opens no window, starts no service and writes no
configuration. The one write it can cause is the same token migration a normal
launch performs: on Windows, a legacy plaintext `device.token` is upgraded to
DPAPI when the config is loaded.

### Report fields

The device token is never printed in full — only a `tok-de…3456` hint — so the
output is safe to paste into a ticket.

| Field | Meaning |
| :--- | :--- |
| `app` | Report producer; always `ai-bridge-windows-agent`. |
| `generated_at` | Local timestamp including the UTC offset. |
| `ok` | `true` only when every entry in `checks` passed. Informational: it never changes the exit code. |
| `errors` | Problems hit while building the report, e.g. an unreadable config or a sealed token. Empty on a normal host. |

`platform` — `system`, `release`, `machine` identify the OS; `python` and
`implementation` identify the interpreter that produced the report; `is_windows`
is `false` when the report did not come from Windows, in which case DPAPI and the
graphical client cannot work there.

`capabilities` — `dpapi_available` says whether the device token can be sealed to
the current Windows user (always `false` off Windows); `gui_available` says whether
Tkinter imported, so a server without the toolkit still reports even though it
cannot show a window.

`paths` — where state lives: `config_file` (`agent_gui.json`), `token_file`
(`device.token`) and `log_dir` (`logs/` beside the config). Compare these with what
you expect when the app appears to have forgotten its settings; a different user
or `HOME` produces a different set.

`token` — `path` and `file_exists` locate the file; `present` means a non-empty
token was read; `readable` is `false` when the file exists but cannot be opened,
typically because another Windows user sealed it; `backend` is `dpapi` when the
token is sealed to the current user and `file` when it is plaintext (also the
value reported when no token file exists yet); `masked` is the comparison hint;
`error` explains an unreadable token.

`config` — `path`/`file_exists` for `agent_gui.json`; `control_url` currently in
use; `settings` holds the non-secret settings that matter for support (`theme`,
`poll_wait_s`, `desktop_enabled`, `allow_tier3`, `max_tier_unattended`,
`allow_writes`, `allow_shell`); `device_token_in_json` being `true` means an older
config still stores the credential — the app scrubs it on the next save, and the
token should be rotated.

`connectivity` — the result of `GET <control_url>/health`. `url` is the exact
endpoint probed (a bare host gains `https://` and `/health`); `ok` is a 2xx/3xx
response; `http_status` is the status code, `null` if the connection never
completed; `health_status` echoes the plane's own `status` field; `latency_ms`
includes DNS and TLS; `error` is `HTTP 401`, a `URLError` message, or
`control_url is not configured`.

`checks` — four rows of `{name, ok, detail}`: `device_token_present`,
`device_token_readable`, `control_url_configured`, `control_plane_reachable`. The
top-level `ok` is their logical AND, so the first failing row is why the machine is
not ready.

### Reading the common failures

| Symptom | Meaning | Next step |
| :--- | :--- | :--- |
| `token.present: false` | No token file at `token.path`. | Not enrolled, or enrolled under another user/`HOME`. Re-run the installer with `-DeviceToken`. |
| `token.readable: false`, `backend: dpapi` | Sealed for a different Windows account. | Re-enroll as the account that runs the agent, or restore the original profile. |
| `connectivity.http_status: 401` | The plane rejected the token. | Rotate the device token in the dashboard and re-run the installer. |
| `connectivity.error` starts with `URLError` | DNS, proxy, firewall or the plane is down. | Confirm `https://<plane>/health` opens in a browser on that host. |
| `config.device_token_in_json: true` | Legacy config still holds the credential. | Let the app save once, then rotate the token. |
| `capabilities.gui_available: false` | The toolkit is missing, so only `--diagnose` works. | Install the Python tkinter package for that interpreter. |
