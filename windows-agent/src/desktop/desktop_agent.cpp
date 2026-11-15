/**
 * AI Bridge Interactive Desktop Agent (Process B - User Session)
 *
 * Modes:
 *  1) Probe (default): one DXGI+MF capture/encode sample → JSON stdout.
 *  2) Session: --control-url --device-token --session-id → C++ PeerConnection
 *     signaling against /api/agent/webrtc/* (requires AIBRIDGE_WITH_LIBDATACHANNEL
 *     or AIBRIDGE_WITH_LIBWEBRTC at build time).
 */

#include "../webrtc/webrtc_transport.hpp"
#include "../webrtc/peer_connection.hpp"
#include "../mcp/mcp_executor.hpp"
#include "../security/local_security.hpp"

#include <atomic>
#include <csignal>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>

namespace {
std::atomic<bool> g_stop{false};
void on_signal(int) { g_stop.store(true); }

std::string ExtractJsonField(const std::string& json, const std::string& key) {
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
            out.push_back(json[pos++]);
            continue;
        }
        if (c == '"') break;
        out.push_back(c);
    }
    return out;
}

void RegisterWithSupervisorPipe(const std::string& pipe_name_utf8, const std::string& pipe_secret) {
    if (pipe_secret.empty()) return;
    std::wstring pipe_w = L"\\\\.\\pipe\\AIBridgeDesktopPipe";
    if (!pipe_name_utf8.empty()) {
        int needed = MultiByteToWideChar(CP_UTF8, 0, pipe_name_utf8.data(), static_cast<int>(pipe_name_utf8.size()), nullptr, 0);
        if (needed > 0) {
            pipe_w.assign(needed, L'\0');
            MultiByteToWideChar(CP_UTF8, 0, pipe_name_utf8.data(), static_cast<int>(pipe_name_utf8.size()), pipe_w.data(), needed);
        }
    }
    HANDLE hPipe = aibridge::security::SecureNamedPipe::ConnectClientPipe(pipe_w.c_str(), 1000);
    if (hPipe != INVALID_HANDLE_VALUE) {
        DWORD sess_id = 0;
        ProcessIdToSessionId(GetCurrentProcessId(), &sess_id);
        std::string payload = "{\"session\":" + std::to_string(sess_id) + "}";
        aibridge::security::SecureNamedPipe::SendAuthenticatedMessage(
            hPipe, "REGISTER_DESKTOP_AGENT", payload, pipe_secret
        );
        CloseHandle(hPipe);
    }
}
}

int main(int argc, char* argv[]) {
    int monitor_index = 0;
    std::string control_url;
    std::string device_token;
    std::string session_id;
    std::string config_path;
    std::string pipe_name;
    std::string pipe_secret;
    int fps = 30;
    int bitrate_kbps = 4500;

    for (int i = 1; i < argc; ++i) {
        std::string arg = argv[i];
        if (arg == "--monitor" && i + 1 < argc) {
            monitor_index = std::atoi(argv[++i]);
        } else if (arg == "--control-url" && i + 1 < argc) {
            control_url = argv[++i];
        } else if (arg == "--device-token" && i + 1 < argc) {
            device_token = argv[++i];
        } else if (arg == "--session-id" && i + 1 < argc) {
            session_id = argv[++i];
        } else if (arg == "--config" && i + 1 < argc) {
            config_path = argv[++i];
        } else if (arg == "--fps" && i + 1 < argc) {
            fps = std::atoi(argv[++i]);
        } else if (arg == "--bitrate-kbps" && i + 1 < argc) {
            bitrate_kbps = std::atoi(argv[++i]);
        } else if (arg == "--help") {
            std::cout << "Usage:\n  ai_bridge_desktop [--monitor N] [--config PATH]\n"
                      << "  ai_bridge_desktop --control-url URL --device-token TOK --session-id ID\n";
            return 0;
        }
    }

    if (!config_path.empty()) {
        std::ifstream ifs(config_path);
        if (ifs) {
            std::ostringstream ss;
            ss << ifs.rdbuf();
            std::string body = ss.str();
            if (control_url.empty()) control_url = ExtractJsonField(body, "control_url");
            if (device_token.empty()) device_token = ExtractJsonField(body, "device_token");
            pipe_name = ExtractJsonField(body, "pipe_name");
            pipe_secret = ExtractJsonField(body, "pipe_secret");
        }
    }
    RegisterWithSupervisorPipe(pipe_name, pipe_secret);

    if (!control_url.empty() && !device_token.empty() && !session_id.empty()) {
        std::signal(SIGINT, on_signal);
        std::signal(SIGTERM, on_signal);
        aibridge::webrtc::PeerConnectionConfig cfg;
        cfg.control_url = control_url;
        cfg.device_token = device_token;
        cfg.session_id = session_id;
        cfg.monitor_index = monitor_index;
        cfg.fps = fps;
        cfg.bitrate_kbps = bitrate_kbps;

        auto backend = aibridge::webrtc::DescribeAvailablePeerBackend();
        auto session = aibridge::webrtc::CreatePeerConnectionSession(cfg);
        if (!session) {
            std::cout << "{\"ok\":false,\"error\":\"no_cpp_webrtc_backend\","
                      << "\"backend\":\"" << aibridge::webrtc::PeerBackendName(backend) << "\","
                      << "\"hint\":\"Build with -DAIBRIDGE_WITH_LIBDATACHANNEL=ON (or libwebrtc root)\"}\n";
            return 2;
        }
        std::string err;
        // Auto-stop after a short E2E window unless interrupted — CI harness sets stop via timeout kill.
        bool ok = session->RunUntilStopped(&g_stop, &err);
        std::cout << "{\"ok\":" << (ok ? "true" : "false")
                  << ",\"backend\":\"" << aibridge::webrtc::PeerBackendName(session->Backend()) << "\""
                  << ",\"ice_state\":\"" << session->IceState() << "\""
                  << ",\"frames_sent\":" << session->FramesSent()
                  << ",\"error\":\"" << err << "\"}\n";
        return ok ? 0 : 1;
    }

    aibridge::webrtc::NativeWebRtcPipeline pipeline;
    pipeline.StartSession("desktop_probe_session", monitor_index, 1920, 1080, 30, 4500);

    aibridge::capture::CapturedFrame raw_frame;
    aibridge::encoder::EncodedAccessUnit encoded_au;
    bool ok = pipeline.StepCaptureAndEncode(raw_frame, encoded_au);
    auto stats = pipeline.GetStats();
    auto windows = aibridge::mcp::DesktopMcpExecutor::GetVisibleWindows();
    auto backend = aibridge::webrtc::DescribeAvailablePeerBackend();

    std::cout << "{\"process\":\"ai_bridge_desktop\",\"role\":\"interactive_desktop_agent\","
              << "\"capture_ok\":" << (ok ? "true" : "false") << ","
              << "\"from_dxgi\":" << (raw_frame.from_dxgi ? "true" : "false") << ","
              << "\"width\":" << stats.width << ","
              << "\"height\":" << stats.height << ","
              << "\"codec\":\"" << stats.codec << "\","
              << "\"encoder_backend\":\"" << stats.encoder_backend << "\","
              << "\"hardware_encoding\":" << (stats.hardware_encoding ? "true" : "false") << ","
              << "\"peer_backend\":\"" << aibridge::webrtc::PeerBackendName(backend) << "\","
              << "\"capture_time_ms\":" << stats.capture_time_ms << ","
              << "\"encode_time_ms\":" << stats.encode_time_ms << ","
              << "\"encoded_frame_bytes\":" << stats.encoded_frame_bytes << ","
              << "\"visible_windows\":" << windows.size() << "}\n";

    pipeline.StopSession();
    return ok ? 0 : 1;
}
