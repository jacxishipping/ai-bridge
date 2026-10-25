# Desktop automation enablement

Desktop automation is **off by default** and must be enabled explicitly,
per machine. It is a GUI capability: it only does anything on a machine
with a real logged-in desktop session. On a headless server (like the
droplet) there is no desktop to control, so enabling it there is
meaningless — use headless Chrome via the shell instead.

## Enable on a desktop device

1. Run the agent/MCP host as the **logged-in user in that user's session**.
   Never as a Windows service running as SYSTEM, which cannot see the
   user's desktop.
2. Set the environment flag on the host running the MCP server:
   `AI_BRIDGE_DESKTOP_ENABLED=1`
3. Create a versioned policy with desktop access (dashboard Policies view,
   or `POST /api/policies` with an admin token):
   `{"desktop_enabled": true, "allowed_apps": ["chrome"], ...}`
   Only apps on `allowed_apps` can be launched; anything else is refused.
4. For screenshots, Pillow must be installed on that host. Without it,
   `screenshot()` honestly reports `available=False`.

## What it unlocks

- `get_desktop_status` — whether a desktop session is available.
- `launch_approved_application` — launch only allowlisted apps.
- `capture_desktop_screenshot` — screenshot when Pillow is present.

## What it does NOT do

- It does not grant shell access (that is a separate tool) and does not
  bypass the app allowlist.
- On the droplet, browser work goes through `run_shell` with headless
  Chrome (`google-chrome --headless ...`), which needs no desktop.
