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
5. Set `VITE_API_URL` on the dashboard static site to that control URL
   and redeploy it, or run the dashboard locally:
   `cd apps/dashboard && VITE_API_URL=https://<your-service>.onrender.com npm run dev`.
6. Ensure the control service allows the dashboard origin (Blueprint sets
   `AI_BRIDGE_CORS_ORIGINS` / `AI_BRIDGE_DASHBOARD_URL`). Without that,
   the browser blocks sign-in with “Cannot reach the control plane.”
7. Enroll a device from the dashboard (admin token), then start a local
   agent pointed at the Render URL:
   `AI_BRIDGE_CONTROL_URL=https://<your-service>.onrender.com python agents/linux/agent_main.py --device-token <token> --once`.

## Caveats for testing
- Free web services sleep after inactivity and take a few seconds to wake.
- Set `DATABASE_URL` on `ai-bridge-control` to a Postgres/Timescale URL
  (`postgres://…` or `postgresql://…`, include `?sslmode=require` when
  required). Migrations in `migrations/` run on startup. Without
  `DATABASE_URL`, SQLite on the service disk is used and resets on redeploy.
- Do NOT set `AI_BRIDGE_ADMIN_TOKEN` or `DATABASE_URL` in `render.yaml` or in git.
  Both are `sync: false` secrets filled in the Render dashboard.
- The control plane on Render is public by URL: anyone who guesses the
  URL still needs the admin token or a user login, and device tokens
  expire in 7 days by default — but treat the admin token as the key to
  the whole plane and rotate it if it ever leaks.
