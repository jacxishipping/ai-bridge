#!/usr/bin/env bash
# Wrapper that delegates directly to deployment/linux/run-agent.sh
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TARGET="$REPO_ROOT/deployment/linux/run-agent.sh"

if [ -f "$TARGET" ]; then
    chmod +x "$TARGET" 2>/dev/null || true
    exec bash "$TARGET" "$@"
else
    echo "[ERROR] Cannot find $TARGET" >&2
    exit 1
fi
