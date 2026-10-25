# macOS agent

Same polling contract as the Linux agent, launched via launchd as the
logged-in user (so desktop automation, when enabled, runs in that user's
session).

## Install

```sh
cp deployment/macos/com.aibridge.agent.plist ~/Library/LaunchAgents/
# Edit the plist: REPO_PATH, CONTROL_URL, DEVICE_TOKEN (from enrollment)
launchctl load ~/Library/LaunchAgents/com.aibridge.agent.plist
```

Logs: `/tmp/ai-bridge-agent.out` and `/tmp/ai-bridge-agent.err`.

## Status

Written from the Linux agent; the poller is pure HTTP and diagnostics are
cross-platform. **Not yet run on a Mac** — launchd behaviour still needs a
real macOS verification before this is claimed working.
