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

#include <atomic>
#include <csignal>
#include <iostream>
#include <string>

namespace {
std::atomic<bool> g_stop{false};
void on_signal(int) { g_stop.store(true); }
}

int main(int argc, char* argv[]) {
    int monitor_index = 0;
    std::string control_url;
    std::string device_token;
    std::string session_id;
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
        } else if (arg == "--fps" && i + 1 < argc) {
            fps = std::atoi(argv[++i]);
        } else if (arg == "--bitrate-kbps" && i + 1 < argc) {
            bitrate_kbps = std::atoi(argv[++i]);
        } else if (arg == "--help") {
            std::cout << "Usage:\n  ai_bridge_desktop [--monitor N]\n"
                      << "  ai_bridge_desktop --control-url URL --device-token TOK --session-id ID\n";
            return 0;
        }
    }

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
