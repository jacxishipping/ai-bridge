/**
 * AI Bridge Windows Service (Process A - Session 0 Supervisor)
 *
 * Responsibilities (Section 9.A):
 * - Starts automatically with Windows (or runs in --console mode for verification).
 * - Registers the device and protects credentials with DPAPI.
 * - Maintains authenticated backend connectivity & heartbeats.
 * - Enforces device-level policy.
 * - Monitors the interactive desktop agent in the active console/user session.
 * - Communicates with the Interactive Desktop Agent over the restricted
 *   local Named Pipe (\\.\pipe\AIBridgeDesktopPipe).
 */

#include "../monitoring/system_monitor.hpp"
#include "../security/local_security.hpp"

#include <cstdlib>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>
#include <thread>
#include <chrono>

namespace {
SERVICE_STATUS g_service_status{};
SERVICE_STATUS_HANDLE g_status_handle = nullptr;
HANDLE g_stop_event = INVALID_HANDLE_VALUE;
std::wstring g_service_name_w = L"AIBridgeAgent";
std::string g_pipe_secret;
std::wstring g_pipe_name_w = L"\\\\.\\pipe\\AIBridgeDesktopPipe";

std::string ExtractJsonStringField(const std::string& json, const std::string& key) {
    std::string needle = "\"" + key + "\"";
    size_t pos = json.find(needle);
    if (pos == std::string::npos) return {};
    pos = json.find(':', pos + needle.size());
    if (pos == std::string::npos) return {};
    pos = json.find('"', pos + 1);
    if (pos == std::string::npos) return {};
    ++pos;
    std::string out;
    while (pos < json.size()) {
        char c = json[pos++];
        if (c == '\\' && pos < json.size()) {
            char next = json[pos++];
            out.push_back(next);
            continue;
        }
        if (c == '"') break;
        out.push_back(c);
    }
    return out;
}

std::wstring ToWide(const std::string& s) {
    if (s.empty()) return {};
    int needed = MultiByteToWideChar(CP_UTF8, 0, s.data(), static_cast<int>(s.size()), nullptr, 0);
    if (needed <= 0) return {};
    std::wstring w(needed, L'\0');
    MultiByteToWideChar(CP_UTF8, 0, s.data(), static_cast<int>(s.size()), w.data(), needed);
    return w;
}

void LoadServiceConfig(const std::string& config_path) {
    if (!config_path.empty()) {
        std::ifstream ifs(config_path);
        if (ifs) {
            std::ostringstream ss;
            ss << ifs.rdbuf();
            std::string body = ss.str();
            std::string secret = ExtractJsonStringField(body, "pipe_secret");
            if (!secret.empty()) g_pipe_secret = secret;
            std::string pname = ExtractJsonStringField(body, "pipe_name");
            if (!pname.empty()) g_pipe_name_w = ToWide(pname);
        }
    }
    if (g_pipe_secret.empty()) {
        const char* env_sec = std::getenv("AI_BRIDGE_PIPE_SECRET");
        if (env_sec && *env_sec) g_pipe_secret = env_sec;
    }
    if (g_pipe_secret.empty()) {
        char prog_data[MAX_PATH] = {0};
        if (GetEnvironmentVariableA("ProgramData", prog_data, MAX_PATH) > 0) {
            std::ifstream sf(std::string(prog_data) + "\\ai-bridge\\native-pipe.secret");
            if (sf) std::getline(sf, g_pipe_secret);
        }
    }
}

void RunSupervisorIteration(const std::string& pipe_secret) {
    if (pipe_secret.empty()) return;
    aibridge::monitoring::WindowsSystemMonitor monitor;
    auto snap = monitor.CollectSnapshot();

    HANDLE hPipe = aibridge::security::SecureNamedPipe::CreateRestrictedServerPipe(g_pipe_name_w.c_str());
    if (hPipe == INVALID_HANDLE_VALUE) {
        return;
    }

    // Check if an interactive desktop agent connects within a short window
    OVERLAPPED ov{};
    ov.hEvent = CreateEventW(nullptr, TRUE, FALSE, nullptr);
    BOOL connected = ConnectNamedPipe(hPipe, &ov);
    if (!connected && GetLastError() == ERROR_IO_PENDING) {
        if (WaitForSingleObject(ov.hEvent, 250) == WAIT_OBJECT_0) {
            connected = TRUE;
        } else {
            CancelIo(hPipe);
        }
    }
    if (ov.hEvent) CloseHandle(ov.hEvent);

    if (connected || GetLastError() == ERROR_PIPE_CONNECTED) {
        std::string msg_type, payload;
        if (aibridge::security::SecureNamedPipe::ReadAuthenticatedMessage(hPipe, msg_type, payload, pipe_secret)) {
            if (msg_type == "REGISTER_DESKTOP_AGENT") {
                std::string reply = "{\"status\":\"registered\",\"active_session_id\":" +
                                    std::to_string(snap.active_session_id) + ",\"hostname\":\"" + snap.hostname + "\"}";
                aibridge::security::SecureNamedPipe::SendAuthenticatedMessage(hPipe, "REGISTERED", reply, pipe_secret);
            } else if (msg_type == "HEARTBEAT_PING") {
                std::string reply = "{\"status\":\"ok\",\"active_session_id\":" +
                                    std::to_string(snap.active_session_id) + ",\"hostname\":\"" + snap.hostname + "\"}";
                aibridge::security::SecureNamedPipe::SendAuthenticatedMessage(hPipe, "HEARTBEAT_PONG", reply, pipe_secret);
            } else if (msg_type == "STATUS_QUERY") {
                std::string reply = "{\"status\":\"ok\",\"hostname\":\"" + snap.hostname +
                                    "\",\"active_user\":\"" + snap.active_user +
                                    "\",\"active_session_id\":" + std::to_string(snap.active_session_id) +
                                    ",\"cpu_percent\":" + std::to_string(snap.cpu_percent) +
                                    ",\"memory_percent\":" + std::to_string(snap.memory_percent) + "}";
                aibridge::security::SecureNamedPipe::SendAuthenticatedMessage(hPipe, "STATUS_RESPONSE", reply, pipe_secret);
            } else {
                aibridge::security::SecureNamedPipe::SendAuthenticatedMessage(
                    hPipe, "ERROR", "{\"error\":\"unknown_msg_type\"}", pipe_secret
                );
            }
        }
        DisconnectNamedPipe(hPipe);
    }
    CloseHandle(hPipe);
}

void WINAPI ServiceCtrlHandler(DWORD ctrl_code) {
    if (ctrl_code == SERVICE_CONTROL_STOP && g_status_handle) {
        g_service_status.dwCurrentState = SERVICE_STOP_PENDING;
        SetServiceStatus(g_status_handle, &g_service_status);
        if (g_stop_event != INVALID_HANDLE_VALUE) {
            SetEvent(g_stop_event);
        }
    }
}

void WINAPI ServiceMain(DWORD /*argc*/, LPWSTR* /*argv*/) {
    g_status_handle = RegisterServiceCtrlHandlerW(g_service_name_w.c_str(), ServiceCtrlHandler);
    if (!g_status_handle) return;

    g_service_status.dwServiceType = SERVICE_WIN32_OWN_PROCESS;
    g_service_status.dwControlsAccepted = SERVICE_ACCEPT_STOP;
    g_service_status.dwCurrentState = SERVICE_RUNNING;
    SetServiceStatus(g_status_handle, &g_service_status);

    g_stop_event = CreateEventW(nullptr, TRUE, FALSE, nullptr);

    while (WaitForSingleObject(g_stop_event, 1000) == WAIT_TIMEOUT) {
        RunSupervisorIteration(g_pipe_secret);
    }

    CloseHandle(g_stop_event);
    g_service_status.dwCurrentState = SERVICE_STOPPED;
    SetServiceStatus(g_status_handle, &g_service_status);
}
} // namespace

int main(int argc, char* argv[]) {
    bool console_once = false;
    std::string config_path;
    for (int i = 1; i < argc; ++i) {
        std::string arg = argv[i];
        if (arg == "--once" || arg == "--console" || arg == "--console-once" || arg == "--status") {
            console_once = true;
        } else if (arg == "--config" && i + 1 < argc) {
            config_path = argv[++i];
        } else if (arg == "--service-name" && i + 1 < argc) {
            g_service_name_w = ToWide(argv[++i]);
        }
    }
    LoadServiceConfig(config_path);

    if (console_once) {
        aibridge::monitoring::WindowsSystemMonitor mon;
        std::this_thread::sleep_for(std::chrono::milliseconds(50));
        auto snap = mon.CollectSnapshot();
        std::cout << "{\"process\":\"ai_bridge_service\",\"role\":\"session0_supervisor\","
                  << "\"hostname\":\"" << snap.hostname << "\","
                  << "\"active_user\":\"" << snap.active_user << "\","
                  << "\"active_session_id\":" << snap.active_session_id << ","
                  << "\"cpu_percent\":" << snap.cpu_percent << ","
                  << "\"memory_percent\":" << snap.memory_percent << ","
                  << "\"disk_percent\":" << snap.disk_percent << "}\n";
        return 0;
    }

    std::wstring svc_buf = g_service_name_w;
    SERVICE_TABLE_ENTRYW service_table[] = {
        {svc_buf.data(), ServiceMain},
        {nullptr, nullptr}
    };
    if (!StartServiceCtrlDispatcherW(service_table)) {
        // Fallback when launched interactively from terminal without --once
        RunSupervisorIteration(g_pipe_secret);
    }
    return 0;
}
