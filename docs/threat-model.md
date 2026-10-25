# Threat model
Assets: the device's workspace, its services, credentials, and the audit
trail. Adversaries: a compromised/misled AI client, prompt-injection
content in files/logs/web pages, a stolen device token, a malicious
workspace file, and a network attacker on an exposed endpoint.

| Threat | Mitigation in v0.2 | Residual / future |
|---|---|---|
| Prompt injection in file/log content overriding policy | Tool results are data; policy lives in frozen admin config, never in prompt text; Tier-4 needs a human approval record | Human must still review approval requests carefully |
| Path traversal / symlink escape | confined_path() resolves symlinks against the resolved root; escaping symlinks omitted from listings | Workspace root itself must not be / or home |
| Arbitrary command execution | No generic shell tool; allowlisted argv only, shell=False | Test/linter commands are fixed strings only |
| Stolen device token | Tokens hashed (SHA-256) at rest, shown once, revocable; revocation checked on every agent call | Rotate tokens periodically; add short-lived tokens + mTLS in v0.3 (see roadmap) |
| Stolen admin token | Fail-closed if unset; dashboard stores it only in browser localStorage | Add OIDC login in v0.3; do not share the token in chat |
| Secret leakage in logs/results | redact() on audit + tool output; secret-named files unreadable | Redaction is pattern-based; keep secrets out of the workspace entirely |
| Destructive writes | Backup before edit/delete/deploy; Tier-4 approval; staging-only deploy | Backups are local; copy them off-device for real recovery |
| Runaway tasks | Timeouts, output caps, concurrency semaphore, process-group cancellation | Resource (CPU/RAM) cgroups are a v0.3 hardening item |
| Unauthorized policy change | Policy is env/config-owned; no tool edits it; no tool grants privileges | Add signed config + admin audit alerts in v0.3 |
| Exposed plane on the internet | Loopback defaults; TLS + reverse proxy required for remote use (docs/remote-access.md) | Add rate-limit per tenant + WAF rules in production |

Out of scope for v0.2: signed agent updates (documented design in
docs/security.md, not yet implemented), multi-tenant OIDC, macOS agent
(interface-compatible, not yet implemented), and privileged operations
beyond the allowlisted set (deliberately excluded).
