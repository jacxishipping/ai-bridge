#include "../src/capture/dxgi_capture.hpp"
#include "../src/encoder/mf_h264_encoder.hpp"
#include "../src/input/sendinput_controller.hpp"
#include "../src/monitoring/system_monitor.hpp"
#include "../src/security/local_security.hpp"
#include "../src/webrtc/webrtc_transport.hpp"
#include "../src/mcp/mcp_executor.hpp"

#include <cassert>
#include <iostream>
#include <thread>

int main() {
    std::cout << "[1/6] Testing DPAPI Secret Protection..." << std::endl;
    {
        std::string secret = "device-enroll-token-987654321";
        std::vector<uint8_t> encrypted;
        bool enc_ok = aibridge::security::DpapiSecretStore::ProtectSecret(secret, encrypted, false);
        assert(enc_ok && !encrypted.empty());

        std::string decrypted;
        bool dec_ok = aibridge::security::DpapiSecretStore::UnprotectSecret(encrypted, decrypted);
        assert(dec_ok && decrypted == secret);
    }

    std::cout << "[2/6] Testing Authenticated Restricted Named Pipe IPC..." << std::endl;
    {
        const wchar_t* test_pipe = L"\\\\.\\pipe\\AIBridgeTestPipeV1";
        const std::string ipc_key = "test-shared-hmac-secret";
        std::string server_received_type;
        std::string server_received_payload;

        std::thread server_thread([&]() {
            HANDLE hServer = aibridge::security::SecureNamedPipe::CreateRestrictedServerPipe(test_pipe);
            assert(hServer != INVALID_HANDLE_VALUE);
            BOOL connected = ConnectNamedPipe(hServer, nullptr) ? TRUE : (GetLastError() == ERROR_PIPE_CONNECTED);
            if (connected) {
                aibridge::security::SecureNamedPipe::ReadAuthenticatedMessage(
                    hServer, server_received_type, server_received_payload, ipc_key
                );
                aibridge::security::SecureNamedPipe::SendAuthenticatedMessage(
                    hServer, "HEARTBEAT_PONG", "{\"status\":\"verified\"}", ipc_key
                );
                DisconnectNamedPipe(hServer);
            }
            CloseHandle(hServer);
        });

        std::this_thread::sleep_for(std::chrono::milliseconds(80));
        HANDLE hClient = aibridge::security::SecureNamedPipe::ConnectClientPipe(test_pipe, 2000);
        assert(hClient != INVALID_HANDLE_VALUE);
        bool sent = aibridge::security::SecureNamedPipe::SendAuthenticatedMessage(
            hClient, "REGISTER_DESKTOP_AGENT", "{\"session\":1}", ipc_key
        );
        assert(sent);

        std::string reply_type, reply_payload;
        bool read_ok = aibridge::security::SecureNamedPipe::ReadAuthenticatedMessage(
            hClient, reply_type, reply_payload, ipc_key
        );
        assert(read_ok && reply_type == "HEARTBEAT_PONG");
        CloseHandle(hClient);
        server_thread.join();
        assert(server_received_type == "REGISTER_DESKTOP_AGENT");
    }

    std::cout << "[3/6] Testing SendInput Coordinate Transformation & Disconnect Key Release Safety..." << std::endl;
    {
        auto pt_origin = aibridge::input::WindowsInputController::TransformCoordinates(0.0, 0.0, true, 0, 0, 1920, 1080);
        assert(pt_origin.pixel_x == 0 && pt_origin.pixel_y == 0);

        auto pt_center = aibridge::input::WindowsInputController::TransformCoordinates(0.5, 0.5, true, 0, 0, 1920, 1080);
        assert(pt_center.pixel_x >= 959 && pt_center.pixel_x <= 961);
        assert(pt_center.pixel_y >= 539 && pt_center.pixel_y <= 541);
        assert(pt_center.normalized_dx > 0 && pt_center.normalized_dy > 0);

        aibridge::input::WindowsInputController input_ctrl;
        aibridge::input::SessionInputPermissions perms{true, true, false, true};
        input_ctrl.SetPermissions(perms);

        // Press Shift key down and verify held key tracking & release on disconnect
        input_ctrl.KeyEvent(VK_SHIFT, true, false);
        assert(input_ctrl.GetHeldKeyCount() == 1);
        int released = input_ctrl.ReleaseAllHeldKeys();
        assert(released >= 1 && input_ctrl.GetHeldKeyCount() == 0);

        // Verify permission enforcement blocks input when allow_mouse=false
        perms.allow_mouse = false;
        input_ctrl.SetPermissions(perms);
        assert(!input_ctrl.MoveMouse(0.5, 0.5, true));
    }

    std::cout << "[4/6] Testing DXGI Desktop Duplication & Multi-Monitor Enumeration..." << std::endl;
    {
        aibridge::capture::DxgiDesktopCapturer capturer;
        auto monitors = capturer.EnumerateMonitors();
        assert(!monitors.empty());
        assert(monitors[0].width > 0 && monitors[0].height > 0);

        aibridge::capture::CapturedFrame frame;
        bool cap_ok = capturer.CaptureNextFrame(frame, 50, true);
        assert(cap_ok && frame.valid);
        assert(frame.width > 0 && frame.height > 0);
        assert(frame.bgra_pixels.size() == static_cast<size_t>(frame.width) * static_cast<size_t>(frame.height) * 4);
    }

    std::cout << "[5/6] Testing Media Foundation H.264 Encoding Pipeline..." << std::endl;
    {
        aibridge::webrtc::NativeWebRtcPipeline pipeline;
        bool started = pipeline.StartSession("unit_test_sess", 0, 1920, 1080, 30, 4500);
        assert(started);

        aibridge::capture::CapturedFrame raw;
        aibridge::encoder::EncodedAccessUnit au;
        bool step_ok = pipeline.StepCaptureAndEncode(raw, au);
        assert(step_ok && au.valid);
        assert(!au.annexb_nal_bytes.empty());

        auto stats = pipeline.GetStats();
        assert(stats.frames_captured >= 1 && stats.frames_encoded >= 1);
        std::cout << "  -> Encoded H.264 frame: " << stats.encoded_frame_bytes << " bytes via ["
                  << stats.encoder_backend << "] (capture=" << stats.capture_time_ms
                  << "ms, encode=" << stats.encode_time_ms << "ms)" << std::endl;
        pipeline.StopSession();
    }

    std::cout << "[6/6] Testing Windows System Monitor, Multi-Session & Window Enumeration..." << std::endl;
    {
        aibridge::monitoring::WindowsSystemMonitor mon;
        auto snap = mon.CollectSnapshot();
        assert(snap.memory_total_gb > 0.0);
        assert(snap.disk_total_gb > 0.0);
        assert(!snap.hostname.empty());
        assert(snap.interactive_session_count >= 0);

        auto wins = aibridge::mcp::DesktopMcpExecutor::GetVisibleWindows();
        if (!wins.empty()) {
            aibridge::capture::DxgiDesktopCapturer cap;
            aibridge::capture::CapturedFrame wframe;
            bool w_ok = cap.CaptureWindow(reinterpret_cast<HWND>(static_cast<uintptr_t>(wins[0].hwnd)), wframe);
            assert(w_ok && wframe.valid && wframe.width > 0 && wframe.height > 0);
        }
    }

    std::cout << "ALL NATIVE WINDOWS AGENT C++ TESTS PASSED!" << std::endl;
    return 0;
}
