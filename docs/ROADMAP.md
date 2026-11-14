# Roadmap (updated for v0.2.0)

For the source-verified technical audit and Phases 2–8 implementation roadmap, see [ai-bridge_ADVANCED_ROADMAP.md](./ai-bridge_ADVANCED_ROADMAP.md).
- [x] Milestone 1 — local MCP starter (starter ZIP) + hardening in v0.2
- [x] Milestone 2 — remote control plane: enrollment, revocation, polling, hashed tokens
- [x] Milestone 3 — autonomy: risk tiers, approvals, audit, backups, timeouts, cancellation
- [~] Milestone 4 — Windows agent: code written, NOT executed on Windows here
- [x] Milestone 5 — dashboard (source): login, devices, tasks, approvals, audit, emergency stop
- [x] Milestone 6 — integrations: Claude/Codex/Gemini/generic MCP configs + honest ChatGPT notes
- [~] v0.3 — OIDC, short-lived device tokens, signed updates, approval expiry/context, API append-only audit with export/retention, session revocation, policy simulation
- [~] Remaining validation — plane-side device mTLS, Postgres prod readiness, macOS `macos-agent` CI, MCP-over-HTTP + `deployment/smoke_check.py`, k6/locust soak scripts, and C++ PeerConnection dashboard-path E2E (`windows-native-webrtc` + `scripts/libwebrtc_e2e_checklist.md`) are in-tree; still open: Windows-on-Windows full installer E2E
