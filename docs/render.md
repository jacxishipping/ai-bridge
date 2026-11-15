# Deploying AI Bridge on Render (test deployment)

## What this deploys
- `ai-bridge-control`: the FastAPI control plane as a native Python web
  service (`pip install -e .`, then `python -m ai_bridge.control`). It
  binds `0.0.0.0:$PORT` when Render sets `$PORT`, and serves `/health`.
  With `AI_BRIDGE_EMBED_MCP=1` (default when `PORT` is set), the same
  process also serves Streamable HTTP MCP at `/mcp` and the OAuth 2.1
  gateway (`/oauth/*`, `/.well-known/*`) so ChatGPT, Claude, Gemini,
  Cursor, and similar clients can connect to one public URL.
  Python is pinned to 3.12 via `PYTHON_VERSION` / `.python-version`
  (avoid Render's default 3.14 for this stack).
- `ai-bridge-dashboard`: the React dashboard as a static site
  (`type: web` + `runtime: static` in the Blueprint). Its API URL is
  baked in at build time via `VITE_API_URL`, so set that to the control
  service's URL and redeploy the static site after the control service
  first exists.

## MCP clients (ChatGPT, Claude, Gemini, …)
Public MCP URL after deploy: `https://ai-bridge-control.onrender.com/mcp`

Quick test (admin bearer):
```bash
curl -H "Authorization: Bearer $AI_BRIDGE_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
  https://ai-bridge-control.onrender.com/mcp
```

Register per-chatbot OAuth clients:
```bash
python scripts/setup_mcp_chatbots.py \
  --url https://ai-bridge-control.onrender.com \
  --token "$AI_BRIDGE_ADMIN_TOKEN"
```

See `docs/MCP_CHATBOT_SETUP.md` for Claude / ChatGPT / Gemini / Grok / Cursor configs
(replace `https://jxiptvplayer.app` with your Render control URL).

## Steps
1. Push this repo to GitHub/GitLab and connect the account in Render.
2. In Render: New → Blueprint → select the repo → `render.yaml`.
3. When prompted, set `AI_BRIDGE_ADMIN_TOKEN` (generate one locally:
   `python -c "import secrets; print(secrets.token_urlsafe(32))"`).
   Never commit this value.
4. Wait for the control service to become live, then check
   `https://<your-service>.onrender.com/health` — expect
   `{"status":"ok","version":"0.3.0","emergency_stop":false}`.
5. The Blueprint sets `VITE_API_URL` to the control service URL so the
   static dashboard build talks to the API. If you rename the control
   service, update `VITE_API_URL` (and the other hardcoded URLs) and
   redeploy the dashboard. Locally:
   `cd apps/dashboard && VITE_API_URL=https://<your-service>.onrender.com npm run dev`.
6. Ensure the control service allows the dashboard origin (Blueprint sets
   `AI_BRIDGE_CORS_ORIGINS` / `AI_BRIDGE_DASHBOARD_URL`). Without that,
   the browser blocks sign-in with “Cannot reach the control plane.”
7. Smoke MCP after deploy:
   `curl -H "Authorization: Bearer $AI_BRIDGE_ADMIN_TOKEN" -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' https://<control>/mcp`
   and open `https://<control>/.well-known/oauth-authorization-server`.
8. Enroll a device from the dashboard (admin token). Installers are
   served from the control plane (`/install.sh`, `/install.ps1`):
   `curl -sSL https://<control>/install.sh | bash -s -- -y --device-token <token> --control-url https://<control>`
   Then open Live home and wait for the first heartbeat.

## Caveats for testing
- Free web services sleep after inactivity. Cold start commonly takes
  30–60 seconds; the dashboard health probe waits and retries once.
  Open `/health` or use **Retry connection check** if the first load
  timed out while the dyno was waking.
- The Blueprint provisions managed Postgres (`ai-bridge-db`, basic-256mb)
  and wires `DATABASE_URL` via `fromDatabase`. To use external Timescale
  instead, replace that env binding in the Render dashboard with your
  URL (`postgres://…` / `postgresql://…`, include `?sslmode=require`
  when required). Migrations in `migrations/` run on startup. Without
  `DATABASE_URL`, SQLite on the service disk is used and resets on redeploy.
- Do NOT put `AI_BRIDGE_ADMIN_TOKEN` in git. It remains `sync: false`.
- The control plane on Render is public by URL: anyone who guesses the
  URL still needs the admin token or a user login, and device tokens
  expire in 7 days by default — but treat the admin token as the key to
  the whole plane and rotate it if it ever leaks.
