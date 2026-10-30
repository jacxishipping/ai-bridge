#!/usr/bin/env bash
# AI Bridge Linux Installer — delegates directly to universal magic-install.sh
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="$SCRIPT_DIR/magic-install.sh"
if [ ! -f "$TARGET" ]; then
    TARGET="$SCRIPT_DIR/../../magic-install.sh"
fi

if [ -f "$TARGET" ]; then
    chmod +x "$TARGET" 2>/dev/null || true
    exec bash "$TARGET" "$@"
else
    echo "[ERROR] Cannot find magic-install.sh in $SCRIPT_DIR or root" >&2
    exit 1
fi
