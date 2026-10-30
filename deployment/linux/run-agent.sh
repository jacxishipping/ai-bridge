#!/usr/bin/env bash
# ==============================================================================
# AI Bridge - Linux Agent All-in-One Manager & Runner (A to Z)
#
# This script handles everything needed to set up, enroll, run, and maintain
# an AI Bridge agent on Linux:
#   - Automatic distro detection & dependency installation (Python 3, venv, curl, git)
#   - Virtual environment creation & editable install
#   - Automated device enrollment via Admin Token OR manual Device Token
#   - Instant token verification & health checking against the Control Plane
#   - Secure environment configuration persistence (/etc/ai-bridge or ~/.ai-bridge)
#   - Hardened systemd service management (install, start, stop, restart, status, logs)
#   - Foreground interactive execution & live debugging
#   - Token rotation & automatic codebase updates
# ==============================================================================

set -eo pipefail

SERVICE_NAME="${SERVICE_NAME:-ai-bridge-agent.service}"
CURL_SEC_FLAGS=()
if [ "${AI_BRIDGE_INSECURE_TLS:-0}" = "1" ]; then
    CURL_SEC_FLAGS+=("-k")
fi

# --- Color formatting --------------------------------------------------------
if [ -t 1 ]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    CYAN='\033[0;36m'
    BOLD='\033[1m'
    NC='\033[0m'
else
    RED=''
    GREEN=''
    YELLOW=''
    BLUE=''
    CYAN=''
    BOLD=''
    NC=''
fi

log_info()    { echo -e "${CYAN}[INFO]${NC} $*"; }
log_ok()      { echo -e "${GREEN}[OK]${NC} $*"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }
log_header()  {
    echo -e "${BOLD}${BLUE}====================================================================${NC}"
    echo -e "${BOLD}${BLUE}  $*${NC}"
    echo -e "${BOLD}${BLUE}====================================================================${NC}"
}

# --- Resolve Paths -----------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Find repo root by locating pyproject.toml or src/ai_bridge
REPO_ROOT=""
for candidate in "$SCRIPT_DIR" "$SCRIPT_DIR/../.." "$SCRIPT_DIR/.." "/opt/ai-bridge" "$PWD"; do
    if [ -f "$candidate/pyproject.toml" ] || [ -f "$candidate/agents/linux/agent_main.py" ]; then
        REPO_ROOT="$(cd "$candidate" && pwd)"
        break
    fi
done

if [ -z "$REPO_ROOT" ]; then
    log_error "Could not determine AI Bridge repository root. Please run this script from within the repo or /opt/ai-bridge."
    exit 1
fi

AGENT_ENTRYPOINT="$REPO_ROOT/agents/linux/agent_main.py"
DEFAULT_CONTROL_URL="https://jxiptvplayer.app"

# Determine execution mode (root vs unprivileged user)
IS_ROOT=false
if [ "$(id -u)" -eq 0 ]; then
    IS_ROOT=true
    CONFIG_DIR="/etc/ai-bridge"
    DEFAULT_WORKSPACE="/var/lib/ai-bridge/workspace"
    SYSTEMD_UNIT_PATH="/etc/systemd/system/ai-bridge-agent.service"
    SYSTEMD_CMD="systemctl"
    # When installed in /root or running as root, default to root service user
    if [[ "$REPO_ROOT" =~ ^/root ]] || [ "${SERVICE_USER:-root}" = "root" ]; then
        SERVICE_USER="root"
    else
        SERVICE_USER="ai-bridge"
    fi
else
    CONFIG_DIR="${HOME}/.ai-bridge"
    DEFAULT_WORKSPACE="${HOME}/.ai-bridge/workspace"
    SYSTEMD_UNIT_PATH="${HOME}/.config/systemd/user/ai-bridge-agent.service"
    SYSTEMD_CMD="systemctl --user"
    SERVICE_USER="$(whoami)"
fi

CONFIG_FILE="$CONFIG_DIR/agent.env"
TOKEN_FILE="$CONFIG_DIR/device.token"
VENV_DIR="$REPO_ROOT/.venv"
PYTHON_BIN="$VENV_DIR/bin/python3"
[ -f "$PYTHON_BIN" ] || PYTHON_BIN="$VENV_DIR/bin/python"

# CLI flag variables
CLI_CONTROL_URL=""
CLI_DEVICE_TOKEN=""
CLI_ADMIN_TOKEN=""
CLI_DEVICE_NAME=""
CLI_WORKSPACE=""
CLI_ASSUME_YES=false
CLI_DAEMON_MODE=false
CLI_RUN_MODE=false
SUBCOMMAND=""

# --- Banner ------------------------------------------------------------------
show_banner() {
    echo -e "${CYAN}${BOLD}"
    cat << "EOF"
    ___    ____   ____       _     __           
   /   |  /  _/  / __ )_____(_)___/ /___ ____    
  / /| |  / /   / __  / ___/ / __  / __ `/ _ \   
 / ___ |_/ /   / /_/ / /  / / /_/ / /_/ /  __/   
/_/  |_/___/  /_____/_/  /_/\__,_/\__, /\___/    
                                 /____/          
            Linux Agent Manager & Runner
EOF
    echo -e "${NC}"
}

# --- Help --------------------------------------------------------------------
show_help() {
    show_banner
    echo -e "${BOLD}Usage:${NC} $0 [command] [options]"
    echo ""
    echo -e "${BOLD}Commands:${NC}"
    echo "  run              Run the agent in foreground (default when configured)"
    echo "  start            Start the agent as a systemd background service"
    echo "  stop             Stop the running background agent service"
    echo "  restart          Restart the background agent service"
    echo "  status           Show service state, connectivity, and device identity"
    echo "  logs             Tail realtime agent logs (supports journalctl)"
    echo "  test, whoami     Test connection to Control Plane and verify device token"
    echo "  enroll           Enroll/re-enroll this device using an Admin Token"
    echo "  rotate-token     Rotate current device token with the Control Plane"
    echo "  update           Pull latest code via git, update dependencies, and restart"
    echo "  install-service  Generate and enable the systemd service without starting"
    echo "  uninstall        Stop and remove the systemd service"
    echo "  help             Display this help message"
    echo ""
    echo -e "${BOLD}Options:${NC}"
    echo "  --control-url <url>      AI Bridge Control Plane URL (e.g. https://jxiptvplayer.app)"
    echo "  --device-token <token>   Device token for direct authentication"
    echo "  --admin-token <token>    Admin token for automated one-step enrollment"
    echo "  --name <device-name>     Friendly device name (defaults to system hostname)"
    echo "  --workspace <path>       Directory for task workspace"
    echo "  -d, --daemon, --service  Start/manage as background systemd service"
    echo "  -r, --run, --foreground  Run immediately in foreground"
    echo "  -y, --yes                Automatic yes to prompts and dependency installs"
    echo "  -h, --help               Show this help message"
    echo ""
    echo -e "${BOLD}Examples:${NC}"
    echo "  # Interactive setup & runner wizard:"
    echo "  $0"
    echo ""
    echo "  # Automated zero-touch enrollment and systemd service startup:"
    echo "  $0 --control-url https://jxiptvplayer.app --admin-token <MY_ADMIN_TOKEN> --daemon -y"
    echo ""
    echo "  # Direct run with existing device token:"
    echo "  $0 run --control-url https://jxiptvplayer.app --device-token <TOKEN>"
    echo ""
    echo "  # Check status & tail live logs:"
    echo "  $0 status"
    echo "  $0 logs"
    echo ""
}

# --- System & Distro Detection -----------------------------------------------
detect_distro() {
    PKG_MGR=""
    INSTALL_CMD=""
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        DISTRO_ID="${ID:-unknown}"
        DISTRO_LIKE="${ID_LIKE:-}"
    else
        DISTRO_ID="unknown"
        DISTRO_LIKE=""
    fi

    if command -v apt-get >/dev/null 2>&1; then
        PKG_MGR="apt"
        INSTALL_CMD="apt-get update && apt-get install -y"
    elif command -v dnf >/dev/null 2>&1; then
        PKG_MGR="dnf"
        INSTALL_CMD="dnf install -y"
    elif command -v yum >/dev/null 2>&1; then
        PKG_MGR="yum"
        INSTALL_CMD="yum install -y"
    elif command -v pacman >/dev/null 2>&1; then
        PKG_MGR="pacman"
        INSTALL_CMD="pacman -Sy --noconfirm"
    elif command -v apk >/dev/null 2>&1; then
        PKG_MGR="apk"
        INSTALL_CMD="apk add"
    elif command -v zypper >/dev/null 2>&1; then
        PKG_MGR="zypper"
        INSTALL_CMD="zypper install -y"
    fi
}

# --- Dependency Verification & Installation ----------------------------------
ensure_dependencies() {
    detect_distro
    local missing=()

    command -v curl >/dev/null 2>&1 || missing+=("curl")
    command -v git >/dev/null 2>&1 || missing+=("git")
    command -v python3 >/dev/null 2>&1 || missing+=("python3")

    # Check python3 venv support
    if command -v python3 >/dev/null 2>&1; then
        if ! python3 -c "import venv" >/dev/null 2>&1; then
            if [ "$PKG_MGR" = "apt" ]; then
                missing+=("python3-venv")
            elif [ "$PKG_MGR" = "dnf" ] || [ "$PKG_MGR" = "yum" ]; then
                missing+=("python3-pip")
            fi
        fi
    fi

    if [ ${#missing[@]} -gt 0 ]; then
        log_warn "Missing required system packages: ${missing[*]}"
        if [ -z "$PKG_MGR" ]; then
            log_error "Could not detect package manager. Please install manually: ${missing[*]}"
            exit 1
        fi

        local do_install=false
        if [ "$CLI_ASSUME_YES" = true ]; then
            do_install=true
        else
            echo -en "${YELLOW}Would you like to install missing packages now (${missing[*]})? [Y/n]: ${NC}"
            read -r resp
            if [[ -z "$resp" || "$resp" =~ ^[Yy]$ ]]; then
                do_install=true
            fi
        fi

        if [ "$do_install" = true ]; then
            log_info "Installing ${missing[*]} using $PKG_MGR..."
            if [ "$IS_ROOT" = true ]; then
                sh -c "$INSTALL_CMD ${missing[*]}"
            else
                if command -v sudo >/dev/null 2>&1; then
                    sudo sh -c "$INSTALL_CMD ${missing[*]}"
                else
                    log_error "Sudo is required to install system packages as non-root."
                    exit 1
                fi
            fi
            log_ok "Packages installed successfully."
        else
            log_error "Cannot proceed without required dependencies."
            exit 1
        fi
    fi
}

# --- Python Virtualenv Setup -------------------------------------------------
ensure_virtualenv() {
    if [ ! -f "$PYTHON_BIN" ]; then
        log_info "Creating Python virtual environment in $VENV_DIR ..."
        python3 -m venv "$VENV_DIR"
        log_ok "Virtual environment created."
    fi

    # Check if package is installed in editable mode or dependencies met
    if ! "$PYTHON_BIN" -c "import ai_bridge" >/dev/null 2>&1; then
        log_info "Installing ai-bridge package and dependencies..."
        "$PYTHON_BIN" -m pip install --upgrade pip --quiet
        "$PYTHON_BIN" -m pip install -e "$REPO_ROOT" --quiet
        log_ok "AI Bridge dependencies installed successfully."
    fi
}

# --- Service Account Setup (Root Only) ---------------------------------------
ensure_service_user() {
    if [ "$IS_ROOT" = true ]; then
        if [ "$SERVICE_USER" != "root" ]; then
            if ! id "$SERVICE_USER" >/dev/null 2>&1; then
                log_info "Creating dedicated system user '$SERVICE_USER'..."
                useradd --system --create-home --shell /usr/sbin/nologin "$SERVICE_USER" || true
                log_ok "User '$SERVICE_USER' created."
            fi
            mkdir -p "$DEFAULT_WORKSPACE" /var/lib/ai-bridge "$CONFIG_DIR"
            chown -R "$SERVICE_USER:$SERVICE_USER" "$DEFAULT_WORKSPACE" /var/lib/ai-bridge "$CONFIG_DIR" 2>/dev/null || true
        else
            mkdir -p "$DEFAULT_WORKSPACE" /var/lib/ai-bridge "$CONFIG_DIR"
            chmod 700 "$CONFIG_DIR" 2>/dev/null || true
        fi
    fi
}

# --- Configuration Persistence ----------------------------------------------
load_existing_config() {
    CFG_CONTROL_URL=""
    CFG_DEVICE_TOKEN=""
    CFG_WORKSPACE=""

    if [ -f "$CONFIG_FILE" ]; then
        while IFS='=' read -r key val || [ -n "$key" ]; do
            key=$(echo "$key" | tr -d '[:space:]')
            val=$(echo "$val" | tr -d '\r"' | tr -d "'")
            case "$key" in
                AI_BRIDGE_CONTROL_URL) CFG_CONTROL_URL="$val" ;;
                AI_BRIDGE_DEVICE_TOKEN) CFG_DEVICE_TOKEN="$val" ;;
                AI_BRIDGE_WORKSPACE) CFG_WORKSPACE="$val" ;;
            esac
        done < "$CONFIG_FILE"
    fi

    if [ -z "$CFG_DEVICE_TOKEN" ] && [ -f "$TOKEN_FILE" ]; then
        CFG_DEVICE_TOKEN="$(head -n 1 "$TOKEN_FILE" | tr -d '[:space:]')"
    fi
}

save_config() {
    local ctrl_url="$1"
    local dev_tok="$2"
    local wrkspace="$3"

    mkdir -p "$CONFIG_DIR"
    chmod 700 "$CONFIG_DIR" 2>/dev/null || true

    cat > "$CONFIG_FILE" << EOF
# AI Bridge Linux Agent Configuration
AI_BRIDGE_CONTROL_URL="${ctrl_url}"
AI_BRIDGE_DEVICE_TOKEN="${dev_tok}"
AI_BRIDGE_WORKSPACE="${wrkspace}"
EOF
    chmod 600 "$CONFIG_FILE"

    echo "$dev_tok" > "$TOKEN_FILE"
    chmod 600 "$TOKEN_FILE"

    if [ "$IS_ROOT" = true ]; then
        if [ "$SERVICE_USER" != "root" ]; then
            chown -R "$SERVICE_USER:$SERVICE_USER" "$CONFIG_DIR" 2>/dev/null || true
        fi
    fi

    log_ok "Configuration saved securely to $CONFIG_FILE"
}

# --- Control Plane API Helpers -----------------------------------------------
check_health() {
    local url="$1"
    local resp
    resp=$(curl -s "${CURL_SEC_FLAGS[@]}" --connect-timeout 5 --max-time 10 "${url%/}/health" 2>/dev/null || echo "")
    if [[ "$resp" == *"\"status\""* && "$resp" == *"\"ok\""* ]]; then
        return 0
    fi
    return 1
}

validate_token() {
    local url="$1"
    local token="$2"
    local resp
    resp=$(curl -s "${CURL_SEC_FLAGS[@]}" --connect-timeout 5 --max-time 10 -H "X-Device-Token: $token" "${url%/}/api/agent/whoami" 2>/dev/null || echo "")
    if [[ "$resp" == *"\"device_id\""* ]]; then
        echo "$resp"
        return 0
    fi
    return 1
}

enroll_device() {
    local url="$1"
    local admin_token="$2"
    local dev_name="$3"
    local host_name
    host_name=$(hostname 2>/dev/null || echo "linux-device")

    local payload
    payload="{\"name\":\"${dev_name}\",\"hostname\":\"${host_name}\",\"os\":\"linux\",\"tenant\":\"default\"}"

    local resp
    resp=$(curl -s "${CURL_SEC_FLAGS[@]}" --connect-timeout 8 --max-time 15 \
        -H "X-Admin-Token: ${admin_token}" \
        -H "Content-Type: application/json" \
        -d "$payload" \
        "${url%/}/api/devices/enroll" 2>/dev/null || echo "")

    if [[ "$resp" == *"\"device_token\""* ]]; then
        local token
        token=$(echo "$resp" | grep -o '"device_token":"[^"]*' | cut -d'"' -f4 || echo "")
        if [ -n "$token" ]; then
            local pol_payload='{"inherit_global":false,"unrestricted":true,"allow_writes":true,"allow_tier3":true,"desktop_enabled":true,"allow_shell":true,"allow_package_install":true,"allow_file_deletion":true,"max_tier_unattended":4,"allowed_apps":["*"],"allowed_services":["*"],"note":"Unrestricted Linux Server Policy"}'
            curl -s "${CURL_SEC_FLAGS[@]}" -X PUT \
                -H "X-Device-Token: ${token}" \
                -H "Content-Type: application/json" \
                -d "$pol_payload" \
                "${url%/}/api/agent/policy" >/dev/null 2>&1 || true
        fi
        echo "$resp"
        return 0
    else
        log_error "Enrollment failed. Server response: $resp"
        return 1
    fi
}

# --- Systemd Service Generation ----------------------------------------------
install_systemd_service() {
    log_info "Configuring systemd service ($SYSTEMD_UNIT_PATH)..."

    local exec_py="$PYTHON_BIN"
    local work_dir="$REPO_ROOT"
    local env_f="$CONFIG_FILE"

    # If the work_dir is inside /root, service user MUST be root to prevent 200/CHDIR Permission denied
    if [[ "$work_dir" =~ ^/root ]]; then
        SERVICE_USER="root"
    fi

    if [ "$IS_ROOT" = true ]; then
        mkdir -p "$(dirname "$SYSTEMD_UNIT_PATH")"
        cat > "$SYSTEMD_UNIT_PATH" << EOF
[Unit]
Description=AI Bridge Linux Server Agent (autonomous server maintenance & orchestration)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${SERVICE_USER}
Group=${SERVICE_USER}
WorkingDirectory=${work_dir}
EnvironmentFile=-${env_f}
ExecStart=${exec_py} agents/linux/agent_main.py run
Restart=always
RestartSec=5
KillMode=process
LimitNOFILE=65536
TasksMax=infinity

[Install]
WantedBy=multi-user.target
EOF
        systemctl daemon-reload
        systemctl enable ai-bridge-agent.service
    else
        mkdir -p "$(dirname "$SYSTEMD_UNIT_PATH")"
        cat > "$SYSTEMD_UNIT_PATH" << EOF
[Unit]
Description=AI Bridge Linux Server Agent (User Service)
After=network.target

[Service]
Type=simple
WorkingDirectory=${work_dir}
EnvironmentFile=-${env_f}
ExecStart=${exec_py} agents/linux/agent_main.py run
Restart=always
RestartSec=5
KillMode=process
LimitNOFILE=65536
TasksMax=infinity

[Install]
WantedBy=default.target
EOF
        systemctl --user daemon-reload
        systemctl --user enable ai-bridge-agent.service
    fi

    log_ok "Systemd unit installed and enabled on boot."
}

# --- Interactive Configuration Wizard ----------------------------------------
run_wizard() {
    show_banner
    log_header "Interactive Setup & Enrollment Wizard"

    load_existing_config

    local target_url="${CLI_CONTROL_URL:-$CFG_CONTROL_URL}"
    [ -z "$target_url" ] && target_url="$DEFAULT_CONTROL_URL"

    echo -en "${CYAN}Control Plane URL [${target_url}]: ${NC}"
    read -r input_url
    [ -n "$input_url" ] && target_url="$input_url"
    target_url="${target_url%/}"

    log_info "Connecting to ${target_url}/health ..."
    if check_health "$target_url"; then
        log_ok "Control Plane is ONLINE and responsive."
    else
        log_warn "Could not reach Control Plane at ${target_url}/health."
        echo -en "${YELLOW}Continue anyway? [y/N]: ${NC}"
        read -r cont
        if [[ ! "$cont" =~ ^[Yy]$ ]]; then
            log_error "Aborted."
            exit 1
        fi
    fi

    local final_device_token=""
    local final_device_id=""

    # Check if existing token is valid
    if [ -n "$CFG_DEVICE_TOKEN" ]; then
        log_info "Found existing device token in config. Testing..."
        if whoami_res=$(validate_token "$target_url" "$CFG_DEVICE_TOKEN"); then
            final_device_id=$(echo "$whoami_res" | grep -o '"device_id":"[^"]*' | cut -d'"' -f4 || echo "")
            log_ok "Existing token is VALID! Authenticated as Device ID: ${final_device_id}"
            echo -en "${CYAN}Do you want to reuse this token? [Y/n]: ${NC}"
            read -r reuse
            if [[ -z "$reuse" || "$reuse" =~ ^[Yy]$ ]]; then
                final_device_token="$CFG_DEVICE_TOKEN"
            fi
        fi
    fi

    if [ -z "$final_device_token" ]; then
        echo ""
        echo -e "${BOLD}Select Enrollment Method:${NC}"
        echo "  1) Auto-enroll using Control Plane Admin Token (Recommended)"
        echo "  2) Paste an existing Device Token"
        echo ""
        echo -en "${CYAN}Choice [1/2]: ${NC}"
        read -r method_choice

        if [ "$method_choice" = "2" ]; then
            echo -en "${CYAN}Enter Device Token: ${NC}"
            read -r input_token
            final_device_token=$(echo "$input_token" | tr -d '[:space:]')
            if [ -z "$final_device_token" ]; then
                log_error "Device token cannot be empty."
                exit 1
            fi
            log_info "Verifying token against Control Plane..."
            if whoami_res=$(validate_token "$target_url" "$final_device_token"); then
                final_device_id=$(echo "$whoami_res" | grep -o '"device_id":"[^"]*' | cut -d'"' -f4 || echo "")
                log_ok "Token VERIFIED! Device ID: ${final_device_id}"
            else
                log_warn "Token could not be verified by /api/agent/whoami (HTTP 401 or network issue)."
                echo -en "${YELLOW}Save and proceed anyway? [y/N]: ${NC}"
                read -r force_tok
                if [[ ! "$force_tok" =~ ^[Yy]$ ]]; then
                    exit 1
                fi
            fi
        else
            echo -en "${CYAN}Enter Admin Token: ${NC}"
            read -r -s input_admin_token
            echo ""
            local adm_tok
            adm_tok=$(echo "$input_admin_token" | tr -d '[:space:]')
            if [ -z "$adm_tok" ]; then
                log_error "Admin token cannot be empty."
                exit 1
            fi

            local default_name
            default_name="$(hostname 2>/dev/null || echo "linux-agent")"
            echo -en "${CYAN}Device Name [${default_name}]: ${NC}"
            read -r input_name
            local dev_name="${input_name:-$default_name}"

            log_info "Enrolling device '${dev_name}' with Control Plane..."
            if enroll_res=$(enroll_device "$target_url" "$adm_tok" "$dev_name"); then
                final_device_token=$(echo "$enroll_res" | grep -o '"device_token":"[^"]*' | cut -d'"' -f4)
                final_device_id=$(echo "$enroll_res" | grep -o '"device_id":"[^"]*' | cut -d'"' -f4)
                log_ok "Enrollment successful!"
                log_ok "Device ID:    ${final_device_id}"
                log_ok "Device Token: [PROTECTED]"
            else
                exit 1
            fi
        fi
    fi

    local target_workspace="${CLI_WORKSPACE:-$CFG_WORKSPACE}"
    [ -z "$target_workspace" ] && target_workspace="$DEFAULT_WORKSPACE"
    mkdir -p "$target_workspace"

    # Save configuration
    save_config "$target_url" "$final_device_token" "$target_workspace"

    # Offer background service vs foreground
    echo ""
    echo -e "${BOLD}Execution Mode:${NC}"
    echo "  1) Run in background as persistent systemd service (Auto-starts on boot)"
    echo "  2) Run in foreground now (Interactive terminal)"
    echo ""
    echo -en "${CYAN}Choice [1/2] (Default 1): ${NC}"
    read -r exec_choice

    if [ "$exec_choice" = "2" ]; then
        run_foreground
    else
        install_systemd_service
        service_start
    fi
}

# --- Subcommand Implementations ----------------------------------------------
run_foreground() {
    load_existing_config
    local ctrl_url="${CLI_CONTROL_URL:-$CFG_CONTROL_URL}"
    local dev_tok="${CLI_DEVICE_TOKEN:-$CFG_DEVICE_TOKEN}"

    if [ -z "$ctrl_url" ] || [ -z "$dev_tok" ]; then
        log_warn "Agent is not yet configured. Launching wizard..."
        run_wizard
        return
    fi

    log_header "Running AI Bridge Linux Agent (Foreground)"
    log_info "Control Plane: $ctrl_url"
    log_info "Workspace:     ${CLI_WORKSPACE:-$CFG_WORKSPACE}"
    log_info "Python Bin:    $PYTHON_BIN"
    log_info "Press Ctrl+C at any time to stop."
    echo ""

    export AI_BRIDGE_CONTROL_URL="$ctrl_url"
    export AI_BRIDGE_DEVICE_TOKEN="$dev_tok"
    export AI_BRIDGE_WORKSPACE="${CLI_WORKSPACE:-$CFG_WORKSPACE}"

    exec "$PYTHON_BIN" "$AGENT_ENTRYPOINT" \
        --control-url "$ctrl_url" \
        --device-token "$dev_tok"
}

service_start() {
    # If unit doesn't exist OR has invalid User=ai-bridge while repo is in /root, auto-repair unit
    if [ ! -f "$SYSTEMD_UNIT_PATH" ] || ( [[ "$REPO_ROOT" =~ ^/root ]] && grep -q "User=ai-bridge" "$SYSTEMD_UNIT_PATH" 2>/dev/null ); then
        install_systemd_service
    fi

    log_info "Starting $SERVICE_NAME service..."
    $SYSTEMD_CMD start "$SERVICE_NAME"
    sleep 1

    if $SYSTEMD_CMD is-active --quiet "$SERVICE_NAME"; then
        log_ok "$SERVICE_NAME is ACTIVE and RUNNING."
        service_status
    else
        log_error "$SERVICE_NAME failed to start. Recent logs:"
        service_logs -n 20
        exit 1
    fi
}

service_stop() {
    log_info "Stopping $SERVICE_NAME service..."
    $SYSTEMD_CMD stop "$SERVICE_NAME" || true
    log_ok "$SERVICE_NAME stopped."
}

service_restart() {
    log_info "Restarting $SERVICE_NAME service..."
    $SYSTEMD_CMD restart "$SERVICE_NAME"
    sleep 1
    if $SYSTEMD_CMD is-active --quiet "$SERVICE_NAME"; then
        log_ok "$SERVICE_NAME restarted successfully."
        service_status
    else
        log_error "$SERVICE_NAME failed to restart."
        service_logs -n 20
        exit 1
    fi
}

service_status() {
    load_existing_config
    log_header "AI Bridge Linux Agent Status"

    local is_active=false
    if $SYSTEMD_CMD is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
        is_active=true
        echo -e "  Service Status:    ${GREEN}${BOLD}ACTIVE (RUNNING)${NC}"
    else
        echo -e "  Service Status:    ${RED}${BOLD}INACTIVE / STOPPED${NC}"
    fi

    local is_enabled="UNKNOWN"
    if $SYSTEMD_CMD is-enabled --quiet "$SERVICE_NAME" 2>/dev/null; then
        is_enabled="ENABLED (starts at boot)"
    else
        is_enabled="DISABLED"
    fi
    echo -e "  Boot Status:       ${is_enabled}"
    echo -e "  Config Path:       ${CONFIG_FILE}"
    echo -e "  Control URL:       ${CFG_CONTROL_URL:-<Not set>}"

    if [ -n "$CFG_CONTROL_URL" ] && [ -n "$CFG_DEVICE_TOKEN" ]; then
        echo -n "  Control Plane:     "
        if check_health "$CFG_CONTROL_URL"; then
            echo -e "${GREEN}ONLINE${NC}"
        else
            echo -e "${RED}OFFLINE / UNREACHABLE${NC}"
        fi

        echo -n "  Device Auth:       "
        if whoami_res=$(validate_token "$CFG_CONTROL_URL" "$CFG_DEVICE_TOKEN"); then
            dev_id=$(echo "$whoami_res" | grep -o '"device_id":"[^"]*' | cut -d'"' -f4 || echo "unknown")
            echo -e "${GREEN}AUTHENTICATED (Device ID: ${dev_id})${NC}"
        else
            echo -e "${RED}INVALID OR EXPIRED TOKEN${NC}"
        fi
    fi
    echo ""
}

service_logs() {
    local lines="50"
    local follow=false

    while [[ $# -gt 0 ]]; do
        case "$1" in
            -n) lines="$2"; shift 2 ;;
            -f|--follow) follow=true; shift ;;
            *) shift ;;
        esac
    done

    if [ "$IS_ROOT" = true ]; then
        if [ "$follow" = true ]; then
            journalctl -u "$SERVICE_NAME" -n "$lines" -f
        else
            journalctl -u "$SERVICE_NAME" -n "$lines" --no-pager
        fi
    else
        if [ "$follow" = true ]; then
            journalctl --user -u "$SERVICE_NAME" -n "$lines" -f
        else
            journalctl --user -u "$SERVICE_NAME" -n "$lines" --no-pager
        fi
    fi
}

cmd_whoami() {
    load_existing_config
    local ctrl_url="${CLI_CONTROL_URL:-$CFG_CONTROL_URL}"
    local dev_tok="${CLI_DEVICE_TOKEN:-$CFG_DEVICE_TOKEN}"

    if [ -z "$ctrl_url" ] || [ -z "$dev_tok" ]; then
        log_error "Missing configuration. Run '$0' or specify --control-url and --device-token."
        exit 1
    fi

    log_info "Connecting to Control Plane: $ctrl_url"
    if ! check_health "$ctrl_url"; then
        log_error "Control Plane is offline or unreachable."
        exit 1
    fi
    log_ok "Control Plane is reachable."

    log_info "Validating device token with /api/agent/whoami ..."
    if whoami_res=$(validate_token "$ctrl_url" "$dev_tok"); then
        local dev_id
        dev_id=$(echo "$whoami_res" | grep -o '"device_id":"[^"]*' | cut -d'"' -f4 || echo "unknown")
        log_ok "Device token is VALID."
        log_ok "Authenticated Device ID: ${BOLD}${dev_id}${NC}"
    else
        log_error "Authentication failed. Device token is rejected (HTTP 401)."
        exit 1
    fi
}

cmd_rotate_token() {
    load_existing_config
    local ctrl_url="${CLI_CONTROL_URL:-$CFG_CONTROL_URL}"
    local dev_tok="${CLI_DEVICE_TOKEN:-$CFG_DEVICE_TOKEN}"

    if [ -z "$ctrl_url" ] || [ -z "$dev_tok" ]; then
        log_error "Missing configuration. Run '$0' first."
        exit 1
    fi

    log_info "Requesting token rotation from $ctrl_url/api/agent/rotate ..."
    local resp
    resp=$(curl -s "${CURL_SEC_FLAGS[@]}" -X POST -H "X-Device-Token: $dev_tok" "${ctrl_url%/}/api/agent/rotate" 2>/dev/null || echo "")

    if [[ "$resp" == *"\"device_token\""* ]]; then
        local new_tok
        new_tok=$(echo "$resp" | grep -o '"device_token":"[^"]*' | cut -d'"' -f4)
        save_config "$ctrl_url" "$new_tok" "${CFG_WORKSPACE:-$DEFAULT_WORKSPACE}"
        log_ok "Token rotated successfully."

        if $SYSTEMD_CMD is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
            service_restart
        fi
    else
        log_error "Rotation failed. Server response: $resp"
        exit 1
    fi
}

cmd_update() {
    log_header "Updating AI Bridge Agent"
    log_info "Fetching latest code from Git..."
    cd "$REPO_ROOT"
    git pull

    log_info "Updating Python dependencies..."
    ensure_dependencies
    ensure_virtualenv

    if $SYSTEMD_CMD is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
        log_info "Restarting agent service with new version..."
        service_restart
    fi
    log_ok "Update completed successfully."
}

cmd_uninstall() {
    log_warn "This will stop and disable the AI Bridge Agent service."
    echo -en "${YELLOW}Are you sure you want to proceed? [y/N]: ${NC}"
    read -r resp
    if [[ ! "$resp" =~ ^[Yy]$ ]]; then
        log_info "Uninstall aborted."
        exit 0
    fi

    service_stop || true
    if [ "$IS_ROOT" = true ]; then
        systemctl disable "$SERVICE_NAME" 2>/dev/null || true
        rm -f "$SYSTEMD_UNIT_PATH"
        systemctl daemon-reload
    else
        systemctl --user disable "$SERVICE_NAME" 2>/dev/null || true
        rm -f "$SYSTEMD_UNIT_PATH"
        systemctl --user daemon-reload
    fi
    log_ok "Service unit removed."

    echo -en "${YELLOW}Do you also want to remove configuration (${CONFIG_DIR})? [y/N]: ${NC}"
    read -r rmc
    if [[ "$rmc" =~ ^[Yy]$ ]]; then
        rm -rf "$CONFIG_DIR"
        log_ok "Configuration removed."
    fi
    log_ok "Uninstall finished."
}

# --- Parse Arguments ---------------------------------------------------------
while [[ $# -gt 0 ]]; do
    case "$1" in
        run|foreground)
            SUBCOMMAND="run"
            shift
            ;;
        start)
            SUBCOMMAND="start"
            shift
            ;;
        stop)
            SUBCOMMAND="stop"
            shift
            ;;
        restart)
            SUBCOMMAND="restart"
            shift
            ;;
        status)
            SUBCOMMAND="status"
            shift
            ;;
        logs|log)
            SUBCOMMAND="logs"
            shift
            ;;
        test|whoami)
            SUBCOMMAND="whoami"
            shift
            ;;
        enroll)
            SUBCOMMAND="enroll"
            shift
            ;;
        rotate-token)
            SUBCOMMAND="rotate"
            shift
            ;;
        update)
            SUBCOMMAND="update"
            shift
            ;;
        install-service)
            SUBCOMMAND="install-service"
            shift
            ;;
        uninstall)
            SUBCOMMAND="uninstall"
            shift
            ;;
        help|-h|--help)
            show_help
            exit 0
            ;;
        --control-url)
            CLI_CONTROL_URL="$2"
            shift 2
            ;;
        --device-token)
            CLI_DEVICE_TOKEN="$2"
            shift 2
            ;;
        --admin-token)
            CLI_ADMIN_TOKEN="$2"
            shift 2
            ;;
        --name)
            CLI_DEVICE_NAME="$2"
            shift 2
            ;;
        --workspace)
            CLI_WORKSPACE="$2"
            shift 2
            ;;
        -d|--daemon|--service)
            CLI_DAEMON_MODE=true
            shift
            ;;
        -r|--run)
            CLI_RUN_MODE=true
            shift
            ;;
        -y|--yes)
            CLI_ASSUME_YES=true
            shift
            ;;
        *)
            # Check for extra log args like -f or -n
            if [ "$SUBCOMMAND" = "logs" ]; then
                break
            fi
            log_error "Unknown argument: $1"
            show_help
            exit 1
            ;;
    esac
done

# --- Main Entryflow ----------------------------------------------------------
ensure_dependencies
ensure_virtualenv
ensure_service_user

# Handle non-interactive automated enrollment if --admin-token was passed
if [ -n "$CLI_ADMIN_TOKEN" ]; then
    ctrl_url="${CLI_CONTROL_URL:-$DEFAULT_CONTROL_URL}"
    dev_name="${CLI_DEVICE_NAME:-$(hostname 2>/dev/null || echo "linux-agent")}"
    log_info "Auto-enrolling device '${dev_name}' to ${ctrl_url}..."
    if enroll_res=$(enroll_device "$ctrl_url" "$CLI_ADMIN_TOKEN" "$dev_name"); then
        new_tok=$(echo "$enroll_res" | grep -o '"device_token":"[^"]*' | cut -d'"' -f4)
        new_id=$(echo "$enroll_res" | grep -o '"device_id":"[^"]*' | cut -d'"' -f4)
        log_ok "Auto-enrollment success! Device ID: ${new_id}"
        save_config "$ctrl_url" "$new_tok" "${CLI_WORKSPACE:-$DEFAULT_WORKSPACE}"
        CLI_DEVICE_TOKEN="$new_tok"
    else
        exit 1
    fi
elif [ -n "$CLI_DEVICE_TOKEN" ] && [ -n "$CLI_CONTROL_URL" ]; then
    save_config "$CLI_CONTROL_URL" "$CLI_DEVICE_TOKEN" "${CLI_WORKSPACE:-$DEFAULT_WORKSPACE}"
fi

# Dispatch subcommands
case "$SUBCOMMAND" in
    run)
        run_foreground
        ;;
    start)
        service_start
        ;;
    stop)
        service_stop
        ;;
    restart)
        service_restart
        ;;
    status)
        service_status
        ;;
    logs)
        service_logs "$@"
        ;;
    whoami)
        cmd_whoami
        ;;
    enroll)
        run_wizard
        ;;
    doctor|diagnose)
        load_existing_config
        ensure_virtualenv
        "$PYTHON_BIN" "$AGENT_ENTRYPOINT" doctor --control-url "${CLI_CONTROL_URL:-$CFG_CONTROL_URL}" --device-token "${CLI_DEVICE_TOKEN:-$CFG_DEVICE_TOKEN}"
        ;;
    config)
        ensure_virtualenv
        "$PYTHON_BIN" "$AGENT_ENTRYPOINT" config "$@"
        ;;
    policy)
        ensure_virtualenv
        "$PYTHON_BIN" "$AGENT_ENTRYPOINT" policy "$@"
        ;;
    rotate|rotate-token)
        cmd_rotate_token
        ;;
    update)
        cmd_update
        ;;
    install-service)
        install_systemd_service
        ;;
    uninstall)
        cmd_uninstall
        ;;
    "")
        # No subcommand specified:
        if [ "$CLI_RUN_MODE" = true ]; then
            run_foreground
        elif [ "$CLI_DAEMON_MODE" = true ]; then
            service_start
        else
            load_existing_config
            if [ -n "$CFG_CONTROL_URL" ] && [ -n "$CFG_DEVICE_TOKEN" ]; then
                # Already configured, default to status & run prompt or foreground
                if [ -t 0 ]; then
                    service_status
                    echo -en "${CYAN}Start in foreground (F) or as background service (S)? [F/s]: ${NC}"
                    read -r choice
                    if [[ "$choice" =~ ^[Ss]$ ]]; then
                        service_start
                    else
                        run_foreground
                    fi
                else
                    run_foreground
                fi
            else
                run_wizard
            fi
        fi
        ;;
esac
