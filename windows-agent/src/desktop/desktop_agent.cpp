/**
 * AI Bridge Interactive Desktop Agent (Process B - User Session)
 *
 * Responsibilities (Section 9.B):
 * - Runs in the logged-in user's interactive Windows session.
 * - Captures the actual desktop via DXGI Desktop Duplication (with GDI/WGC fallback).
 * - Encodes frames into H.264 via Media Foundation (HW NVENC/QSV/AMF or SW fallback).
 * - Streams video and receives authorized mouse/keyboard events via SendInput.
 * - Communicates with Process A (Windows Service) over the authenticated Named Pipe.
 */

#include "../webrtc/webrtc_transport.hpp"
#include "../mcp/mcp_executor.hpp"
#include "../security/local_security.hpp"

#include <iostream>
#include <string>

int main(int argc, char* argv[]) {
    int monitor_index = 0;
    for (int i = 1; i < argc; ++i) {
        std::string arg = argv[i];
        if (arg == "--monitor" && i + 1 < argc) {
            monitor_index = std::atoi(argv[++i]);
        }
    }

    aibridge::webrtc::NativeWebRtcPipeline pipeline;
    pipeline.StartSession("desktop_probe_session", monitor_index, 1920, 1080, 30, 4500);

    aibridge::capture::CapturedFrame raw_frame;
    aibridge::encoder::EncodedAccessUnit encoded_au;
    bool ok = pipeline.StepCaptureAndEncode(raw_frame, encoded_au);
    auto stats = pipeline.GetStats();
    auto windows = aibridge::mcp::DesktopMcpExecutor::GetVisibleWindows();

    std::cout << "{\"process\":\"ai_bridge_desktop\",\"role\":\"interactive_desktop_agent\","
              << "\"capture_ok\":" << (ok ? "true" : "false") << ","
              << "\"from_dxgi\":" << (raw_frame.from_dxgi ? "true" : "false") << ","
              << "\"width\":" << stats.width << ","
              << "\"height\":" << stats.height << ","
              << "\"codec\":\"" << stats.codec << "\","
              << "\"encoder_backend\":\"" << stats.encoder_backend << "\","
              << "\"hardware_encoding\":" << (stats.hardware_encoding ? "true" : "false") << ","
              << "\"capture_time_ms\":" << stats.capture_time_ms << ","
              << "\"encode_time_ms\":" << stats.encode_time_ms << ","
              << "\"encoded_frame_bytes\":" << stats.encoded_frame_bytes << ","
              << "\"visible_windows\":" << windows.size() << "}\n";

    pipeline.StopSession();
    return ok ? 0 : 1;
}
