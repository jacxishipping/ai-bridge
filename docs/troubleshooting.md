# Troubleshooting
- MCP server exits immediately: run `python -m ai_bridge.server` in a
  terminal — stdio servers are meant to be driven by the client; an
  immediate exit usually means a bad `AI_BRIDGE_WORKSPACE` path or a
  missing venv. Check the client's MCP log.
- "Path escapes the configured workspace": the path is outside
  `AI_BRIDGE_WORKSPACE`, or a symlink inside it points outside. Move
  the file into the workspace or fix the symlink.
- "File exceeds the read limit": raise `AI_BRIDGE_MAX_READ_BYTES` or
  read a smaller file; the limit is a safety feature, not a bug.
- Task stuck in `queued`: the agent is offline or its token was revoked.
  Check the dashboard's last-seen, restart the agent, re-enroll if revoked.
- Tier-3 denied: set `AI_BRIDGE_ALLOW_TIER3=1` (admin decision) or use
  the approval queue in the dashboard.
- Tier-4 denied: approve the request in the dashboard first.
- Windows Event Log "unavailable": you are not on Windows, or the
  PowerShell cmdlet failed — see docs/implementation-status.md.
- Dashboard "401": the admin token in the browser does not match
  `AI_BRIDGE_ADMIN_TOKEN` on the plane; re-enter it.
