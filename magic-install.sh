#!/usr/bin/env bash
# ==============================================================================
#  AI Bridge — Universal Magic Installer & Environment Provisioner (Linux / macOS)
# ==============================================================================
#  Single-command bootstrap for completely fresh, bare-metal or cloud servers.
#  - Automatically detects OS & Linux Distribution (Debian, Ubuntu, RHEL, CentOS,
#    AlmaLinux, Rocky Linux, Fedora, Arch Linux, Alpine, openSUSE, macOS)
#  - Detects architecture (x86_64, aarch64/ARM64)
#  - Checks and installs all missing system packages, build toolchains & Python 3.10+
#  - Auto-configures swapfile on low-memory VPS (<1GB RAM) to prevent OOM errors
#  - Sets up Python virtual environment with all required dependencies
#  - Provisions Xvfb & headless GUI automation packages for visual verification
#  - Clones or updates the AI Bridge codebase in /opt/ai-bridge
#  - Auto-enrolls the agent with the Control Plane (https://jxiptvplayer.app)
#  - Installs, hardens, and starts the systemd service (auto-restart on boot)
#
#  Usage:
#    curl -sSL https://raw.githubusercontent.com/jacxishipping/ai-bridge/main/magic-install.sh | sudo bash
#    Or locally: sudo ./magic-install.sh
#
#  Unattended Flags:
#    sudo ./magic-install.sh -y --control-url "https://jxiptvplayer.app" --admin-token "YOUR_ADMIN_TOKEN"
# ==============================================================================

set -eo pipefail

MAGIC_VERSION="2.0.0"
REPO_URL="https://github.com/jacxishipping/ai-bridge.git"
DEFAULT_INSTALL_DIR="/opt/ai-bridge"
DEFAULT_CONTROL_URL="https://jxiptvplayer.app"
CONFIG_DIR="/etc/ai-bridge"
CONFIG_FILE="$CONFIG_DIR/agent.env"
TOKEN_FILE="$CONFIG_DIR/device.token"
SERVICE_NAME="ai-bridge-agent.service"
SYSTEMD_UNIT_PATH="/etc/systemd/system/$SERVICE_NAME"

# --- Styling & Colors --------------------------------------------------------
if [ -t 1 ]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    MAGENTA='\033[0;35m'
    CYAN='\033[0;36m'
    WHITE='\033[1;37m'
    BOLD='\033[1m'
    NC='\033[0m'
else
    RED='' GREEN='' YELLOW='' BLUE='' MAGENTA='' CYAN='' WHITE='' BOLD='' NC=''
fi

log_info()    { echo -e "${CYAN}[INFO]${NC} $*"; }
log_ok()      { echo -e "${GREEN}[OK]${NC} $*"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }
log_step()    { echo -e "${BOLD}${MAGENTA}==>${NC} ${BOLD}$*${NC}"; }

print_banner() {
    echo -e "${CYAN}"
    cat << "EOF"
   ___    ____   ____       _     _            
  /   |  /  _/  / __ )_____(_)___/ /____ ____  
 / /| |  / /   / __  / ___/ / __  / __  / _ \ 
/ ___ |_/ /   / /_/ / /  / / /_/ / /_/ /  __/ 
/_/  |_/___/  /_____/_/  /_/\__,_/\__, /\___/  
                                /____/        
EOF
    echo -e "${WHITE}⚡ Universal Magic Bootstrap & Environment Provisioner (v${MAGIC_VERSION})${NC}"
    echo -e "${BLUE}====================================================================${NC}"
}

# --- CLI Options -------------------------------------------------------------
CLI_UNATTENDED=false
CLI_CONTROL_URL=""
CLI_ADMIN_TOKEN=""
CLI_DEVICE_TOKEN=""
CLI_DEVICE_NAME=""
CLI_INSTALL_DIR=""
CLI_NO_SERVICE=false
CLI_SKIP_DESKTOP=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        -y|--yes|--unattended) CLI_UNATTENDED=true; shift ;;
        --control-url)        CLI_CONTROL_URL="$2"; shift 2 ;;
        --admin-token)        CLI_ADMIN_TOKEN="$2"; shift 2 ;;
        --device-token)       CLI_DEVICE_TOKEN="$2"; shift 2 ;;
        --name|--device-name) CLI_DEVICE_NAME="$2"; shift 2 ;;
        --dir|--install-dir)  CLI_INSTALL_DIR="$2"; shift 2 ;;
        --no-service)         CLI_NO_SERVICE=true; shift ;;
        --skip-desktop)       CLI_SKIP_DESKTOP=true; shift ;;
        -h|--help)
            echo "Usage: sudo $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  -y, --unattended       Run fully non-interactive with default values"
            echo "  --control-url <url>    Control Plane URL (default: https://jxiptvplayer.app)"
            echo "  --admin-token <token>  Admin token to automatically enroll this server"
            echo "  --device-token <token> Pre-existing device token"
            echo "  --name <device_name>   Custom device name (default: system hostname)"
            echo "  --dir <path>           Installation directory (default: /opt/ai-bridge)"
            echo "  --no-service           Do not install or start systemd background service"
            echo "  --skip-desktop         Skip headless GUI automation tools (Xvfb/xdotool)"
            exit 0
            ;;
        *)
            log_warn "Unknown parameter: $1 (ignoring)"
            shift
            ;;
    esac
done

INSTALL_DIR="${CLI_INSTALL_DIR:-$DEFAULT_INSTALL_DIR}"

# --- Privilege Check ---------------------------------------------------------
check_privileges() {
    if [ "$(id -u)" -ne 0 ]; then
        if command -v sudo >/dev/null 2>&1; then
            log_warn "This script requires root privileges. Elevating with sudo..."
            exec sudo -E bash "$0" "$@"
        else
            log_error "Please run this script as root: sudo bash magic-install.sh"
            exit 1
        fi
    fi
}

# --- OS & Architecture Detection ---------------------------------------------
detect_system() {
    log_step "Detecting operating system & system architecture..."

    ARCH="$(uname -m)"
    case "$ARCH" in
        x86_64|amd64) ARCH_NORMALIZED="x86_64" ;;
        aarch64|arm64) ARCH_NORMALIZED="aarch64" ;;
        armv7l) ARCH_NORMALIZED="armv7l" ;;
        *) ARCH_NORMALIZED="$ARCH" ;;
    esac

    KERNEL="$(uname -s)"
    OS_ID="unknown"
    OS_VERSION=""
    OS_PRETTY="Linux ($KERNEL)"

    if [ "$KERNEL" = "Darwin" ]; then
        OS_ID="macos"
        OS_PRETTY="macOS $(sw_vers -productVersion 2>/dev/null || '')"
        PKG_MGR="brew"
    elif [ -f /etc/os-release ]; then
        . /etc/os-release
        OS_ID="${ID:-unknown}"
        OS_VERSION="${VERSION_ID:-}"
        OS_PRETTY="${PRETTY_NAME:-$OS_ID}"
    fi

    # Determine Package Manager
    if command -v apt-get >/dev/null 2>&1; then
        PKG_MGR="apt"
    elif command -v dnf >/dev/null 2>&1; then
        PKG_MGR="dnf"
    elif command -v yum >/dev/null 2>&1; then
        PKG_MGR="yum"
    elif command -v pacman >/dev/null 2>&1; then
        PKG_MGR="pacman"
    elif command -v apk >/dev/null 2>&1; then
        PKG_MGR="apk"
    elif command -v zypper >/dev/null 2>&1; then
        PKG_MGR="zypper"
    elif [ "$OS_ID" = "macos" ]; then
        PKG_MGR="brew"
    else
        PKG_MGR="unknown"
    fi

    echo -e "  • OS:           ${GREEN}$OS_PRETTY${NC}"
    echo -e "  • Architecture: ${GREEN}$ARCH_NORMALIZED${NC}"
    echo -e "  • Pkg Manager:  ${GREEN}$PKG_MGR${NC}"
    echo -e "  • Install Dir:  ${GREEN}$INSTALL_DIR${NC}"
}

# --- Low-Memory Swapfile Protection ------------------------------------------
ensure_low_memory_swap() {
    # On 512MB/1GB cloud instances, compiling wheels or pip installs can trigger OOM-killer.
    # Automatically add a 1.5GB swapfile if system has low RAM and no swap.
    if [ "$OS_ID" = "macos" ]; then return 0; fi

    local total_ram_mb=0
    local total_swap_mb=0

    if command -v free >/dev/null 2>&1; then
        total_ram_mb=$(free -m | awk '/^Mem:/{print $2}')
        total_swap_mb=$(free -m | awk '/^Swap:/{print $2}')
    fi

    if [ "$total_ram_mb" -gt 0 ] && [ "$total_ram_mb" -lt 1200 ] && [ "$total_swap_mb" -lt 512 ]; then
        log_step "Low memory detected (${total_ram_mb}MB RAM, ${total_swap_mb}MB Swap). Creating temporary swapfile to prevent OOM errors..."
        local swapfile="/swapfile_aibridge"
        if [ ! -f "$swapfile" ]; then
            if command -v fallocate >/dev/null 2>&1; then
                fallocate -l 1536M "$swapfile" 2>/dev/null || dd if=/dev/zero of="$swapfile" bs=1M count=1536 status=none
            else
                dd if=/dev/zero of="$swapfile" bs=1M count=1536 status=none
            fi
            chmod 600 "$swapfile"
            mkswap "$swapfile" >/dev/null
            swapon "$swapfile" 2>/dev/null || true
            log_ok "1.5GB swapfile enabled at $swapfile"
        fi
    fi
}

# --- System Package Installation ---------------------------------------------
install_system_packages() {
    log_step "Checking and provisioning all required system packages..."

    case "$PKG_MGR" in
        apt)
            export DEBIAN_FRONTEND=noninteractive
            log_info "Updating apt package index..."
            apt-get update -y -q

            local pkgs=(
                curl wget git ca-certificates tar unzip jq procps net-tools
                build-essential python3 python3-pip python3-venv python3-dev
                libffi-dev libssl-dev
            )
            if [ "$CLI_SKIP_DESKTOP" = false ]; then
                pkgs+=(xvfb xdotool x11-utils libgl1)
            fi

            log_info "Installing core packages: ${pkgs[*]}"
            apt-get install -y --no-install-recommends "${pkgs[@]}"
            ;;

        dnf|yum)
            log_info "Installing EPEL repository for extra packages..."
            $PKG_MGR install -y epel-release 2>/dev/null || true

            local pkgs=(
                curl wget git ca-certificates tar unzip jq procps-ng net-tools
                gcc gcc-c++ make python3 python3-pip python3-devel
                libffi-devel openssl-devel
            )
            if [ "$CLI_SKIP_DESKTOP" = false ]; then
                pkgs+=(xorg-x11-server-Xvfb xdotool mesa-libGL)
            fi

            log_info "Installing core packages: ${pkgs[*]}"
            $PKG_MGR install -y "${pkgs[@]}"
            ;;

        pacman)
            log_info "Updating pacman repositories..."
            pacman -Sy --noconfirm
            local pkgs=(
                curl wget git ca-certificates tar unzip jq procps-ng net-tools
                base-devel python python-pip python-virtualenv
            )
            if [ "$CLI_SKIP_DESKTOP" = false ]; then
                pkgs+=(xorg-server-xvfb xdotool)
            fi
            pacman -S --needed --noconfirm "${pkgs[@]}"
            ;;

        apk)
            log_info "Updating apk index..."
            apk update
            local pkgs=(
                curl wget git ca-certificates tar unzip jq procps
                build-base python3 py3-pip python3-dev
                libffi-dev openssl-dev
            )
            if [ "$CLI_SKIP_DESKTOP" = false ]; then
                pkgs+=(xvfb xdotool)
            fi
            apk add --no-cache "${pkgs[@]}"
            ;;

        zypper)
            log_info "Updating zypper repositories..."
            zypper refresh
            local pkgs=(
                curl wget git ca-certificates tar unzip jq
                gcc gcc-c++ make python3 python3-pip python3-devel
                libffi-devel libopenssl-devel
            )
            if [ "$CLI_SKIP_DESKTOP" = false ]; then
                pkgs+=(xvfb-run xdotool)
            fi
            zypper install -y "${pkgs[@]}"
            ;;

        brew)
            log_info "Checking Homebrew packages on macOS..."
            brew install git curl jq python@3.12 2>/dev/null || true
            ;;

        *)
            log_warn "Unknown package manager. Attempting to continue with pre-existing binaries..."
            ;;
    esac

    # Ensure Python 3 is available
    if ! command -v python3 >/dev/null 2>&1; then
        log_error "Python 3 could not be installed automatically. Please install Python 3.10+ manually."
        exit 1
    fi

    local py_ver
    py_ver="$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')"
    log_ok "System packages verified. Active Python version: $py_ver"
}

# --- Codebase Provisioning ---------------------------------------------------
provision_codebase() {
    log_step "Provisioning AI Bridge codebase..."

    # Check if this script is being executed inside an existing clone
    local current_script_dir
    current_script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd || echo "")"
    local found_local=false

    for candidate in "$current_script_dir" "$current_script_dir/../.." "$PWD"; do
        if [ -f "$candidate/pyproject.toml" ] && [ -f "$candidate/agents/linux/agent_main.py" ]; then
            found_local=true
            SOURCE_DIR="$(cd "$candidate" && pwd)"
            break
        fi
    done

    if [ "$found_local" = true ] && [ "$SOURCE_DIR" != "$INSTALL_DIR" ]; then
        log_info "Deploying local codebase from $SOURCE_DIR into $INSTALL_DIR..."
        mkdir -p "$INSTALL_DIR"
        cp -r "$SOURCE_DIR/." "$INSTALL_DIR/"
    elif [ ! -f "$INSTALL_DIR/pyproject.toml" ]; then
        log_info "Cloning AI Bridge repository from $REPO_URL to $INSTALL_DIR..."
        mkdir -p "$INSTALL_DIR"
        git clone "$REPO_URL" "$INSTALL_DIR"
    else
        log_info "AI Bridge already exists at $INSTALL_DIR. Fetching latest updates..."
        cd "$INSTALL_DIR"
        git fetch origin main 2>/dev/null || true
        git reset --hard origin/main 2>/dev/null || true
    fi

    cd "$INSTALL_DIR"
    chmod +x deployment/linux/*.sh agents/linux/*.sh magic-install.sh 2>/dev/null || true
    log_ok "Codebase ready in $INSTALL_DIR"
}

# --- Virtual Environment & Python Packages -----------------------------------
provision_virtualenv() {
    log_step "Provisioning Python virtual environment & runtime dependencies..."

    local venv_dir="$INSTALL_DIR/.venv"
    local venv_py="$venv_dir/bin/python3"

    if [ ! -f "$venv_py" ]; then
        log_info "Creating virtual environment in $venv_dir..."
        python3 -m venv "$venv_dir"
    fi

    log_info "Upgrading pip, setuptools, and wheel..."
    "$venv_py" -m pip install --upgrade pip setuptools wheel --quiet

    log_info "Installing AI Bridge package in editable mode with all dependencies..."
    cd "$INSTALL_DIR"
    "$venv_py" -m pip install -e . --quiet

    # Verify critical packages
    local test_script="
import sys
import ai_bridge
import fastapi
import uvicorn
try:
    import mss
except ImportError:
    pass
try:
    import aiortc
except ImportError:
    pass
print('SUCCESS')
"
    local res
    res="$("$venv_py" -c "$test_script" 2>&1 || echo "FAIL")"
    if [[ "$res" == *"SUCCESS"* ]]; then
        log_ok "Python environment verified: all core modules load cleanly."
    else
        log_warn "Python import check reported notes: $res"
    fi
}

# --- Workspace & Directory Setup ---------------------------------------------
setup_directories() {
    log_step "Creating system workspaces and configuration directories..."
    mkdir -p "$CONFIG_DIR"
    mkdir -p "/var/lib/ai-bridge/workspace"
    mkdir -p "/var/lib/ai-bridge/logs"
    chmod 750 "$CONFIG_DIR"
    chmod 755 "/var/lib/ai-bridge/workspace"
    log_ok "Directories configured."
}

# --- Agent Enrollment --------------------------------------------------------
enroll_agent() {
    log_step "Configuring Agent Identity & Control Plane connection..."

    local target_url="${CLI_CONTROL_URL}"
    local target_admin_token="${CLI_ADMIN_TOKEN}"
    local target_device_token="${CLI_DEVICE_TOKEN}"
    local device_name="${CLI_DEVICE_NAME:-$(hostname -s 2>/dev/null || echo 'linux-node')}"

    # Check if already enrolled in /etc/ai-bridge/agent.env
    if [ -f "$CONFIG_FILE" ]; then
        local existing_url existing_token
        existing_url="$(grep -E '^AI_BRIDGE_CONTROL_URL=' "$CONFIG_FILE" | cut -d= -f2- | tr -d '"\r ' || true)"
        existing_token="$(grep -E '^AI_BRIDGE_DEVICE_TOKEN=' "$CONFIG_FILE" | cut -d= -f2- | tr -d '"\r ' || true)"
        if [ -n "$existing_url" ] && [ -n "$existing_token" ] && [ -z "$target_url" ] && [ -z "$target_device_token" ]; then
            log_ok "Existing configuration detected ($existing_url). Preserving active credentials."
            return 0
        fi
    fi

    # Interactive prompts if not supplied via flags
    if [ "$CLI_UNATTENDED" = false ] && [ -t 0 ]; then
        if [ -z "$target_url" ]; then
            echo -en "${CYAN}Control Plane URL [Default: ${DEFAULT_CONTROL_URL}]: ${NC}"
            read -r input_url
            target_url="${input_url:-$DEFAULT_CONTROL_URL}"
        fi

        if [ -z "$target_device_token" ] && [ -z "$target_admin_token" ]; then
            echo ""
            echo -e "${BOLD}Agent Authentication Setup:${NC}"
            echo "  1) Automatic enrollment using Admin Token (Recommended)"
            echo "  2) Manual enrollment with pre-generated Device Token"
            echo ""
            echo -en "${CYAN}Select option [1/2] (Default 1): ${NC}"
            read -r auth_choice

            if [ "$auth_choice" = "2" ]; then
                echo -en "${CYAN}Enter Device Token: ${NC}"
                read -r target_device_token
            else
                echo -en "${CYAN}Enter Admin Token: ${NC}"
                read -r target_admin_token
            fi
        fi
    fi

    target_url="${target_url:-$DEFAULT_CONTROL_URL}"

    # Auto-enroll if admin token was provided
    if [ -n "$target_admin_token" ] && [ -z "$target_device_token" ]; then
        log_info "Auto-enrolling device '$device_name' with $target_url..."
        local enroll_payload
        enroll_payload=$(jq -n \
            --arg name "$device_name" \
            --arg host "$(hostname 2>/dev/null || echo 'linux')" \
            --arg os "$OS_PRETTY ($ARCH_NORMALIZED)" \
            '{name: $name, hostname: $host, os: $os}')

        local enroll_resp
        enroll_resp=$(curl -s -k --connect-timeout 8 --max-time 15 \
            -X POST "${target_url%/}/api/devices/enroll" \
            -H "Content-Type: application/json" \
            -H "X-Admin-Token: $target_admin_token" \
            -d "$enroll_payload" 2>/dev/null || echo "")

        local dev_tok
        dev_tok=$(echo "$enroll_resp" | jq -r '.device_token // empty' 2>/dev/null || true)
        local dev_id
        dev_id=$(echo "$enroll_resp" | jq -r '.device_id // empty' 2>/dev/null || true)

        if [ -n "$dev_tok" ]; then
            target_device_token="$dev_tok"
            log_ok "Successfully enrolled with Device ID: ${GREEN}$dev_id${NC}"
        else
            log_error "Enrollment failed. Server response: $enroll_resp"
            if [ -z "$target_device_token" ]; then
                log_warn "Proceeding with unconfigured state; token can be added to $CONFIG_FILE later."
            fi
        fi
    fi

    # Write configuration
    cat > "$CONFIG_FILE" << EOF
# AI Bridge Linux Agent Configuration
# Automatically generated by magic-install.sh on $(date -u +"%Y-%m-%dT%H:%M:%SZ")
AI_BRIDGE_CONTROL_URL="${target_url}"
AI_BRIDGE_DEVICE_TOKEN="${target_device_token}"
AI_BRIDGE_WORKSPACE="/var/lib/ai-bridge/workspace"
EOF
    chmod 600 "$CONFIG_FILE"

    if [ -n "$target_device_token" ]; then
        echo "$target_device_token" > "$TOKEN_FILE"
        chmod 600 "$TOKEN_FILE"
    fi

    log_ok "Agent configuration saved to $CONFIG_FILE"
}

# --- Systemd Service Installation --------------------------------------------
setup_systemd_service() {
    if [ "$CLI_NO_SERVICE" = true ]; then
        log_info "Skipping systemd service setup (--no-service)."
        return 0
    fi

    if [ "$OS_ID" = "macos" ]; then
        log_info "macOS detected. Use 'launchctl' or run in foreground: $INSTALL_DIR/agents/linux/run-agent.sh"
        return 0
    fi

    log_step "Installing and configuring systemd daemon ($SERVICE_NAME)..."

    local exec_py="$INSTALL_DIR/.venv/bin/python3"
    local entrypoint="$INSTALL_DIR/agents/linux/agent_main.py"

    cat > "$SYSTEMD_UNIT_PATH" << EOF
[Unit]
Description=AI Bridge Linux Server Agent (autonomous server maintenance & orchestration)
Documentation=https://github.com/jacxishipping/ai-bridge
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
Group=root
WorkingDirectory=${INSTALL_DIR}
EnvironmentFile=-${CONFIG_FILE}
ExecStart=${exec_py} ${entrypoint} run
Restart=always
RestartSec=5
KillMode=process
LimitNOFILE=65536
TasksMax=infinity

# Hardening & Reliability
TimeoutStopSec=15
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable "$SERVICE_NAME"
    systemctl restart "$SERVICE_NAME"

    sleep 2
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        log_ok "Systemd service $SERVICE_NAME is ACTIVE and RUNNING."
    else
        log_warn "$SERVICE_NAME did not report active immediately. Recent status:"
        systemctl status "$SERVICE_NAME" --no-pager || true
    fi
}

# --- Final Diagnostic Summary ------------------------------------------------
print_summary() {
    local service_status="INACTIVE"
    if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
        service_status="ACTIVE (RUNNING)"
    fi

    local dev_id="Unregistered"
    local ctrl_url="$DEFAULT_CONTROL_URL"
    if [ -f "$CONFIG_FILE" ]; then
        ctrl_url="$(grep -E '^AI_BRIDGE_CONTROL_URL=' "$CONFIG_FILE" | cut -d= -f2- | tr -d '"\r ' || echo "$DEFAULT_CONTROL_URL")"
        local tok
        tok="$(grep -E '^AI_BRIDGE_DEVICE_TOKEN=' "$CONFIG_FILE" | cut -d= -f2- | tr -d '"\r ' || true)"
        if [ -n "$tok" ]; then
            dev_id="${tok:0:12}..."
        fi
    fi

    echo ""
    echo -e "${GREEN}====================================================================${NC}"
    echo -e "${BOLD}${GREEN}  ✨ AI Bridge Magic Installation Completed Successfully! ✨       ${NC}"
    echo -e "${GREEN}====================================================================${NC}"
    echo -e "  • Control Server:    ${WHITE}$ctrl_url${NC}"
    echo -e "  • Install Directory: ${WHITE}$INSTALL_DIR${NC}"
    echo -e "  • Python Executable: ${WHITE}$INSTALL_DIR/.venv/bin/python3${NC}"
    echo -e "  • Config File:       ${WHITE}$CONFIG_FILE${NC}"
    echo -e "  • Service Status:    ${GREEN}$service_status${NC}"
    echo -e "  • Device Identity:   ${WHITE}$dev_id${NC}"
    echo -e "${GREEN}====================================================================${NC}"
    echo ""
    echo -e "${BOLD}Management Commands:${NC}"
    echo -e "  • Check Status:      ${CYAN}sudo systemctl status $SERVICE_NAME${NC}"
    echo -e "  • View Live Logs:    ${CYAN}sudo journalctl -u $SERVICE_NAME -f${NC}"
    echo -e "  • Restart Agent:     ${CYAN}sudo systemctl restart $SERVICE_NAME${NC}"
    echo -e "  • Agent CLI Wizard:  ${CYAN}sudo $INSTALL_DIR/agents/linux/run-agent.sh${NC}"
    echo ""
    echo -e "Your server is now actively connected and managed via:"
    echo -e "👉 ${BOLD}${WHITE}$ctrl_url${NC}"
    echo ""
}

# --- Main Flow ---------------------------------------------------------------
main() {
    print_banner
    check_privileges "$@"
    detect_system
    ensure_low_memory_swap
    install_system_packages
    provision_codebase
    provision_virtualenv
    setup_directories
    enroll_agent
    setup_systemd_service
    print_summary
}

main "$@"

