# Security policy
- Report vulnerabilities privately to the repository maintainer; do not
  open a public issue with exploit details.
- Supported version: v0.2.x (this release). See docs/security.md for the
  model and docs/threat-model.md for residual risks.
- Never run AI Bridge as root/SYSTEM, never expose :8000/:8001 without
  TLS + token auth, and never put secrets in the workspace.
