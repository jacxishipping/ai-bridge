# Implementation status — v0.3.0 (honest report)

## v0.3.0 — security batch (this release)
- Short-lived device tokens (7 days by default, `AI_BRIDGE_DEVICE_TOKEN_TTL_DAYS`), checked on every agent call, with a rotation endpoint that invalidates the old token immediately.
- Local users with PBKDF2 password hashes, 8-hour sessions, and roles (viewer/operator/admin). The legacy shared admin token still works unless `AI_BRIDGE_DISABLE_LEGACY_ADMIN_TOKEN=1`.
- Versioned policies via `/api/policies` (audited); Tier-3 tasks now need approval unless the current versioned policy allows Tier 3.
- Signed releases: Ed25519 manifest signing/verification in `src/ai_bridge/updates.py` + agent `--check-update` (verifies before any download; installation remains an operator step).
- Sandboxed task execution: minimal env (secrets dropped), workspace cwd, CPU/memory/file-size rlimits.
- Dashboard: username/password login alongside the admin token, plus a Policies view.
- Implemented since v0.3 (needs activation or a machine to verify):
  OIDC login (provider-gated via AI_BRIDGE_OIDC_*; crypto verified offline,
  full flow needs a registered provider app), network-namespace egress
  control for the bounded task runner (AI_BRIDGE_TASK_NETNS=1, fail-closed),
  mTLS at the reverse proxy (optional client-cert verification on /api/,
  untrusted certs rejected), macOS agent code + launchd unit (not yet run
  on a Mac). Still NOT verified: Windows-on-Windows execution (the agent
  code imports and degrades honestly off Windows, but needs a Windows host
  to run), and plane-side mTLS (reverse proxy remains the mTLS layer).

Implemented and tested on Linux (this environment, pytest run — see CHANGELOG):
- MCP stdio server + Streamable HTTP entrypoint; tools list/call verified
  by an MCP stdio test; HTTP transport uses FastMCP's streamable_http_app
  (live HTTP round-trip is a v0.2.1 test item, not yet in the suite).
- Workspace confinement (traversal, absolute, NUL, symlink escape),
  secret-name blocking, redaction, atomic writes, backups.
- Risk tiers 1-4 with server-side enforcement, approval queue, emergency stop.
- Control plane: enrollment (hashed token, shown once), revocation,
  task queue, agent polling with bounded backoff, audit, tenant filtering.
- Linux agent (systemd unit, unprivileged), Docker/process/service/log/git
  diagnostics, allowlisted tests/linter, staging deploy with backup.
- Dashboard (React/TS/Vite): login, devices, tasks, approvals,
  audit, emergency stop, policies. Built output IS included in the release ZIP
  (`apps/dashboard/dist/`); rebuild with `npm install && npm run build`.
Not implemented / documented only:
- Signed agent updates: verification implemented in v0.3; silent auto-install is deliberately NOT implemented — verify, then install as an operator step.
- OIDC login (local accounts in v0.3 are the interim step), Postgres runtime wiring beyond the
  migration SQL (SQLite is the running store; see migrations/002_security_batch.sql), Redis/worker (unnecessary
  at this volume — the plane is a modular monolith by design).
- macOS agent (same tool contract; no macOS code yet).
- Windows: code written and import-tested on Linux, but NOT executed on
  Windows in this environment. Treat Windows service/desktop behaviour
  as documented-but-unverified until run on a Windows host.
- Production deployment from a clean environment is documented, not
  executed here (no second host was available).
