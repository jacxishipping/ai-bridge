# Changelog
## 0.3.0 — 2026-10-24 (security batch)
- Short-lived device tokens (7-day default) with expiry checks and rotation.
- Local users (PBKDF2), 8-hour sessions, viewer/operator/admin roles; legacy admin token retained unless disabled.
- Versioned, audited policies; Tier-3 tasks gated by the current policy.
- Ed25519 signed release verification + agent --check-update (no silent auto-install).
- Sandboxed task execution: minimal env, workspace cwd, CPU/memory/file-size limits.
- Dashboard username/password login and Policies view.
- Tests: 33 passed (4 new security-batch tests), ruff clean, dashboard build succeeded, live login/role/rotation checks verified.
- Still not implemented: OIDC, plane-side mTLS, network-namespace egress control, macOS agent, Windows-on-Windows execution.
## 0.2.0 — 2026-10-24
- Hardened starter core: secret-name blocking, redaction, output caps,
  resolved-root confinement, atomic writes, backups.
- Full MCP tool set (workspace writes, diagnostics, git, tests, linter,
  backup, staging deploy, tasks, approvals, desktop opt-in, devices).
- Streamable HTTP MCP entrypoint alongside stdio.
- Control plane: enrollment/revocation, task queue, agent polling with
  bounded backoff, approvals, audit, tenant filtering, emergency stop,
  rate limiting.
- Linux agent (systemd) + Windows agent + interactive desktop helper.
- React/TypeScript dashboard source.
- Tests: unit, integration, security, e2e, MCP stdio (see test report
  in the release notes / final delivery message).
- Test report for this build (2026-10-24, Linux, Python 3.12):
  `pytest -q` = 29 passed; `ruff check` = clean; dashboard
  `npm run build` = succeeded (31 modules, dist/index.html + assets);
  MCP stdio initialize + tools/list + tools/call verified by test;
  Streamable HTTP initialize verified live at /mcp; control plane +
  Linux agent `--once` round-trip verified live (enroll -> task ->
  agent execution -> completed result retrievable).
- Docs: architecture, threat model, security, install (Linux/Windows),
  MCP clients, remote access, operations, troubleshooting, API reference,
  honest implementation status, roadmap.
## 0.1.0 — starter (supplied ZIP)
- Stdio MCP server, 4 read-only tools, fixed diagnostics, path tests.
