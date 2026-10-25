# Deploying AI Bridge on Render (test deployment)

## What this deploys
- `ai-bridge-control`: the FastAPI control plane as a Docker web service
  (`deployment/docker/Dockerfile`, `python -m ai_bridge.control`). It
  binds `0.0.0.0:$PORT` when Render sets `$PORT`, and serves `/health`.
- `ai-bridge-dashboard`: the React dashboard as a static site. Its API
  URL is baked in at build time via `VITE_API_URL`, so set that to the
  control service's URL and redeploy the static site after the control
  service first exists.

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
6. Enroll a device from the dashboard (admin token), then start a local
   agent pointed at the Render URL:
   `AI_BRIDGE_CONTROL_URL=https://<your-service>.onrender.com python agents/linux/agent_main.py --device-token <token> --once`.

## Caveats for testing
- Free web services sleep after inactivity and take a few seconds to wake.
- SQLite state on the service disk is ephemeral: devices, tasks, users,
  and audit history reset on redeploy. This is fine for a smoke test;
  for anything durable, use Render Postgres + the migrations in
  `migrations/` (Postgres runtime wiring is still a v0.3 follow-up —
  see docs/implementation-status.md).
- Do NOT set `AI_BRIDGE_ADMIN_TOKEN` in `render.yaml` or in git.
- The control plane on Render is public by URL: anyone who guesses the
  URL still needs the admin token or a user login, and device tokens
  expire in 7 days by default — but treat the admin token as the key to
  the whole plane and rotate it if it ever leaks.
