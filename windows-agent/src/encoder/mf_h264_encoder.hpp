#pragma once

#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>
#include <mfapi.h>
#include <mfidl.h>
#include <mftransform.h>
#include <wrl/client.h>

#include <cstdint>
#include <mutex>
#include <string>
#include <vector>

namespace aibridge {
namespace encoder {

struct EncoderConfig {
    int width = 1920;
    int height = 1080;
    int fps = 30;
    int bitrate_bps = 4500000; // 4.5 Mbps (within 3-6 Mbps starting target)
    int keyframe_interval_sec = 2;
    bool prefer_hardware = true;
    bool adaptive_bitrate = true;
};

struct EncodedAccessUnit {
    bool valid = false;
    bool is_keyframe = false;
    double queue_time_ms = 0.0;
    double encode_time_ms = 0.0;
    uint64_t timestamp_us = 0;
    std::vector<uint8_t> annexb_nal_bytes;
};

struct EncoderTelemetry {
    std::string backend_name = "Uninitialized";
    bool is_hardware = false;
    int width = 1920;
    int height = 1080;
    int fps = 30;
    int target_bitrate_bps = 4500000;
    uint64_t frames_encoded = 0;
    uint64_t dropped_frames = 0;
    double avg_encode_time_ms = 0.0;
    double last_encode_time_ms = 0.0;
    size_t last_frame_bytes = 0;
};

class MediaFoundationH264Encoder {
public:
    MediaFoundationH264Encoder();
    ~MediaFoundationH264Encoder();

    bool Initialize(const EncoderConfig& config);
    void Shutdown();

    bool UpdateBitrate(int new_bitrate_bps);
    bool EncodeBgraFrame(const uint8_t* bgra_data, int width, int height, uint64_t timestamp_us, bool force_keyframe, EncodedAccessUnit& out_au);
    EncoderTelemetry GetTelemetry() const;

    static void ConvertBgraToNv12(const uint8_t* bgra, int width, int height, std::vector<uint8_t>& out_nv12);

private:
    bool CreateEncoderTransformLocked(bool allow_hardware);
    bool ConfigureMediaTypesLocked();

    mutable std::mutex mutex_;
    bool mf_started_ = false;
    bool initialized_ = false;
    EncoderConfig config_{};
    EncoderTelemetry telemetry_{};
    uint64_t frame_index_ = 0;

    Microsoft::WRL::ComPtr<IMFTransform> encoder_mft_;
    DWORD input_stream_id_ = 0;
    DWORD output_stream_id_ = 0;
    std::vector<uint8_t> nv12_buffer_;
};

} // namespace encoder
} // namespace aibridge
