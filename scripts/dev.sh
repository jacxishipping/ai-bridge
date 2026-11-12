#!/usr/bin/env bash
# ==============================================================================
# AI Bridge - local development runner
#
# Loads .env WITHOUT overriding variables already present in the environment,
# refuses to start unless both credentials are supplied, then runs the control
# plane and the dashboard together and shuts them both down on Ctrl+C.
#
# Usage:
#   scripts/dev.sh
#
# Secrets are never read from .env and never printed. Supply them through the
# project's secret store (Settings -> Secrets), an exported shell variable, or
# a systemd EnvironmentFile=. .env carries non-secret configuration only.
#
# Environment precedence (highest first):
#   1. variables already exported in your shell / injected by the platform
#   2. values from .env (only for keys that are unset or empty)
# ==============================================================================
set -eo pipefail

if [ -t 1 ]; then
    RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
else
    RED=''; GREEN=''; YELLOW=''; CYAN=''; NC=''
fi

log_info()  { echo -e "${CYAN}[INFO]${NC} $*"; }
log_ok()    { echo -e "${GREEN}[ OK ]${NC} $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error() { echo -e "${RED}[FAIL]${NC} $*" >&2; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

ENV_FILE="${AI_BRIDGE_ENV_FILE:-$REPO_ROOT/.env}"
DASH_PORT="${AI_BRIDGE_DASHBOARD_PORT:-5173}"
API_PID=""; DASH_PID=""; STOPPING=0

# --- Load .env without clobbering the real environment -----------------------
load_env() {
    if [ ! -f "$ENV_FILE" ]; then
        log_warn "No env file at $ENV_FILE; using the current environment only."
        return 0
    fi
    local line key val current
    while IFS= read -r line || [ -n "$line" ]; do
        case "$line" in ''|'#'*) continue ;; esac
        key="${line%%=*}"
        [ "$key" = "$line" ] && continue
        key="$(printf '%s' "$key" | tr -d '[:space:]')"
        [ -n "$key" ] || continue
        val="${line#*=}"
        case "$val" in
            \"*\") val="${val#\"}"; val="${val%\"}" ;;
            \'*\') val="${val#\'}"; val="${val%\'}" ;;
        esac
        current="$(printenv "$key" || true)"
        if [ -z "$current" ]; then
            export "$key=$val"
        fi
    done < "$ENV_FILE"
}

# --- Refuse to start without the two credentials -----------------------------
require_secrets() {
    local missing="" var
    for var in AI_BRIDGE_ADMIN_TOKEN AI_BRIDGE_OIDC_CLIENT_SECRET; do
        if [ -z "$(printenv "$var" || true)" ]; then
            missing="$missing $var"
        fi
    done
    if [ -n "$missing" ]; then
        log_error "Refusing to start: required secret(s) not set:${missing}"
        echo "" >&2
        echo "  These are intentionally NOT stored in .env. Supply them with one of:" >&2
        echo "    - this project's secret store: Settings -> Secrets (injected at runtime)" >&2
        echo "    - an exported shell variable:  export AI_BRIDGE_ADMIN_TOKEN=... (etc.)" >&2
        echo "    - a root-owned 0600 systemd EnvironmentFile= outside the repo" >&2
        echo "" >&2
        exit 1
    fi
}

# --- Toolchain checks --------------------------------------------------------
detect_toolchain() {
    if [ -x "$REPO_ROOT/.venv/bin/python" ]; then
        PYTHON="$REPO_ROOT/.venv/bin/python"
    else
        PYTHON="$(command -v python3 || true)"
    fi
    if [ -z "$PYTHON" ]; then
        log_error "python3 not found. Install Python 3.11+ and retry."
        exit 1
    fi
    if ! "$PYTHON" -c "import ai_bridge" >/dev/null 2>&1; then
        log_error "The ai_bridge package is not importable by $PYTHON."
        echo "  Install it first:  python3 -m venv .venv && . .venv/bin/activate && pip install -e '.[dev]'" >&2
        exit 1
    fi
    if [ ! -d "$REPO_ROOT/apps/dashboard/node_modules" ]; then
        log_error "Dashboard dependencies are missing."
        echo "  Install them first:  npm --prefix apps/dashboard ci" >&2
        exit 1
    fi
    if ! command -v curl >/dev/null 2>&1; then
        log_error "curl is required for the readiness checks."
        exit 1
    fi
}

# --- Shutdown ----------------------------------------------------------------
cleanup() {
    [ "$STOPPING" = "1" ] && return 0
    STOPPING=1
    trap - EXIT INT TERM
    log_info "Shutting down..."
    # Job control (set -m below) puts the dashboard job in its own process
    # group, so signal the whole group: npm -> vite. Never the script's group.
    if [ -n "$DASH_PID" ]; then
        kill -TERM -"$DASH_PID" 2>/dev/null || true
    fi
    if [ -n "$API_PID" ]; then
        kill -TERM "$API_PID" 2>/dev/null || true
    fi
    if [ -n "$API_PID" ]; then wait "$API_PID" 2>/dev/null || true; fi
    if [ -n "$DASH_PID" ]; then wait "$DASH_PID" 2>/dev/null || true; fi
    log_ok "Stopped."
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# --- Readiness ---------------------------------------------------------------
wait_for_http() {
    local url="$1" pid="$2"
    local i
    for i in $(seq 1 120); do
        if curl -fsS -o /dev/null "$url" 2>/dev/null; then
            return 0
        fi
        if ! kill -0 "$pid" 2>/dev/null; then
            return 1
        fi
        sleep 0.5
    done
    return 1
}

# --- Run ---------------------------------------------------------------------
load_env
require_secrets
detect_toolchain

API_PORT="${PORT:-${AI_BRIDGE_CONTROL_PORT:-8000}}"
if [ -n "${PORT:-}" ]; then
    log_warn "PORT is set, so the control plane binds 0.0.0.0:$API_PORT (reachable off-host)."
fi

log_info "Starting control plane on 127.0.0.1:$API_PORT (writes to ~/.ai-bridge unless AI_BRIDGE_DATA_DIR is set)"
"$PYTHON" -m ai_bridge.control &
API_PID=$!

if ! wait_for_http "http://127.0.0.1:$API_PORT/health" "$API_PID"; then
    log_error "Control plane did not become healthy on port $API_PORT."
    echo "  Check for a port conflict, or run it directly:  $PYTHON -m ai_bridge.control" >&2
    exit 1
fi
log_ok "Control plane healthy at http://127.0.0.1:$API_PORT"

log_info "Starting dashboard on localhost:$DASH_PORT"
# Job control so the dashboard job gets its own process group (see cleanup).
set -m
( cd "$REPO_ROOT/apps/dashboard" && npm run dev -- --port "$DASH_PORT" --strictPort ) &
DASH_PID=$!
set +m

# Vite binds "localhost", which may resolve to ::1; probe the same name it prints.
if ! wait_for_http "http://localhost:$DASH_PORT/" "$DASH_PID"; then
    log_error "Dashboard did not become ready on port $DASH_PORT."
    echo "  Check for a port conflict, or run it directly:  npm --prefix apps/dashboard run dev" >&2
    exit 1
fi
log_ok "Dashboard ready at http://localhost:$DASH_PORT"
echo ""
log_info "Press Ctrl+C to stop both processes."

while kill -0 "$API_PID" 2>/dev/null && kill -0 "$DASH_PID" 2>/dev/null; do
    sleep 1
done
log_warn "One process exited; shutting down the other."
exit 1
