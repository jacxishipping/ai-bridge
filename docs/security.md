# Security
- Run agents as a dedicated unprivileged user (`ai-bridge`), never root/SYSTEM.
- Workspace confinement: see `src/ai_bridge/security.py`. Keep secrets,
  SSH keys, `.env`, and production data OUTSIDE the workspace.
- Risk tiers: 1 read-only (unattended OK), 2 low-risk writes (unattended
  if writes enabled), 3 sensitive (needs `AI_BRIDGE_ALLOW_TIER3=1` or an
  approval), 4 high-risk (always needs a human approval record + admin).
- Approvals: created by `request_approval`, decided only in the
  dashboard or with the admin token. An AI asking for approval does not
  grant it. A task cannot approve itself. Tier-3 tasks also need approval
  unless the current versioned policy (`/api/policies`) allows Tier 3.
  Control-plane approvals expire after one hour by default (configurable
  with `AI_BRIDGE_APPROVAL_TTL_SECONDS`); expired tasks are cancelled and
  cannot be re-queued without creating a fresh request.
- Accounts (v0.3): local users with PBKDF2 hashes and 8-hour sessions;
  roles viewer/operator/admin. Device tokens expire (7 days default) and
  rotate via `/api/agent/rotate` (old token dies immediately).
- Signed updates (v0.3): release manifests are Ed25519-signed
  (`python -m ai_bridge.updates sign`); the agent's `--check-update`
  verifies the signature before downloading anything. No silent auto-install.
- Sandboxing (v0.3): tasks run with a minimal environment, workspace cwd,
  and CPU/memory/file-size limits. Network egress control is opt-in via
  AI_BRIDGE_TASK_NETNS=1, which runs bounded-runner tasks in a fresh
  network namespace with only loopback (fail-closed if `unshare` is
  unavailable). The ungated MCP shell is intentionally outside this sandbox.
- OIDC is implemented (provider-gated: set AI_BRIDGE_OIDC_* to activate).
  Plane-side mTLS is still not native; use a TLS reverse proxy with
  client-cert verification for mTLS, as deployed in operations.
- Audit: every control-plane decision is stored in `audit` (SQLite dev,
  Postgres prod) and every local tool decision can be appended via
  `ai_bridge.audit.audit_event` to a JSONL file. Results are redacted.
  The control-plane API is append-only for audit events, offers an admin
  JSONL export, and supports explicit retention pruning (30-day minimum).
- Secrets: never committed, never in logs, never returned by tools.
  `.env` is gitignored; use `chmod 600 .env`. Tokens are hashed at rest.
- TLS: remote endpoints must sit behind a TLS reverse proxy with a
  bearer/admin token; see docs/remote-access.md. Never expose :8000 or
  :8001 directly to the internet.
- Updates: verify a signed manifest first (`--check-update`), then install
  the new code and restart the service (docs/operations.md). Do not
  auto-update from an unsigned channel.
- Incident response: revoke the device in the dashboard (token stops
  working immediately), hit Emergency stop, review /api/audit, rotate the
  admin token, restore from `.ai-bridge-backups/` if needed.
