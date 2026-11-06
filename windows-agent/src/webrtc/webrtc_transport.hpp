#pragma once

#include "../capture/dxgi_capture.hpp"
#include "../encoder/mf_h264_encoder.hpp"
#include "../input/sendinput_controller.hpp"

#include <atomic>
#include <cstdint>
#include <mutex>
#include <string>

namespace aibridge {
namespace webrtc {

struct StreamSessionStats {
    std::string session_id;
    std::string status = "idle";
    std::string codec = "H264";
    std::string encoder_backend = "Media Foundation H.264";
    bool hardware_encoding = false;
    int width = 1920;
    int height = 1080;
    int target_fps = 30;
    int target_bitrate_kbps = 4500;
    double capture_time_ms = 0.0;
    double encoder_queue_time_ms = 0.0;
    double encode_time_ms = 0.0;
    size_t encoded_frame_bytes = 0;
    uint64_t frames_captured = 0;
    uint64_t frames_encoded = 0;
    uint64_t dropped_frames = 0;
};

class NativeWebRtcPipeline {
public:
    NativeWebRtcPipeline();
    ~NativeWebRtcPipeline();

    bool StartSession(const std::string& session_id, int monitor_index, int width, int height, int fps, int bitrate_kbps);
    void StopSession();

    // Captures one frame via DXGI and encodes it via Media Foundation H.264, updating stage-by-stage latency stats
    bool StepCaptureAndEncode(capture::CapturedFrame& out_raw, encoder::EncodedAccessUnit& out_encoded);

    StreamSessionStats GetStats() const;
    input::WindowsInputController& InputController() { return input_controller_; }

private:
    mutable std::mutex mutex_;
    std::atomic<bool> active_{false};
    StreamSessionStats stats_{};

    capture::DxgiDesktopCapturer capturer_;
    encoder::MediaFoundationH264Encoder encoder_;
    input::WindowsInputController input_controller_;
};

} // namespace webrtc
} // namespace aibridge
