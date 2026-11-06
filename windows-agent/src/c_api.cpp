#define AIBRIDGE_NATIVE_EXPORTS
#include "c_api.h"

#include "capture/dxgi_capture.hpp"
#include "encoder/mf_h264_encoder.hpp"
#include "input/sendinput_controller.hpp"
#include "monitoring/system_monitor.hpp"

#include <cstdio>
#include <cstring>
#include <mutex>

namespace {
std::mutex g_api_mutex;
aibridge::capture::DxgiDesktopCapturer g_capturer;
aibridge::encoder::MediaFoundationH264Encoder g_encoder;
aibridge::input::WindowsInputController g_input;
aibridge::monitoring::WindowsSystemMonitor g_monitor;
bool g_encoder_initialized = false;
int g_enc_w = 0;
int g_enc_h = 0;
int g_enc_fps = 30;
int g_enc_kbps = 4500;
} // namespace

extern "C" {

AIBRIDGE_API int aibridge_capture_init(int monitor_index) {
    std::lock_guard<std::mutex> lock(g_api_mutex);
    return g_capturer.Initialize(monitor_index) ? 1 : 0;
}

AIBRIDGE_API void aibridge_capture_shutdown(void) {
    std::lock_guard<std::mutex> lock(g_api_mutex);
    g_encoder.Shutdown();
    g_capturer.Shutdown();
    g_encoder_initialized = false;
}

AIBRIDGE_API int aibridge_capture_frame(
    int monitor_index,
    uint8_t* out_bgra_buffer,
    int max_bytes,
    AIBridgeCaptureMetrics* out_metrics
) {
    std::lock_guard<std::mutex> lock(g_api_mutex);
    if (monitor_index >= 0 && monitor_index != g_capturer.CurrentMonitorIndex()) {
        g_capturer.Initialize(monitor_index);
    }

    aibridge::capture::CapturedFrame frame;
    bool ok = g_capturer.CaptureNextFrame(frame, 35, out_bgra_buffer != nullptr);

    if (out_metrics) {
        std::memset(out_metrics, 0, sizeof(AIBridgeCaptureMetrics));
        out_metrics->valid = frame.valid ? 1 : 0;
        out_metrics->from_dxgi = frame.from_dxgi ? 1 : 0;
        out_metrics->secure_desktop = frame.secure_desktop_detected ? 1 : 0;
        out_metrics->width = frame.width;
        out_metrics->height = frame.height;
        out_metrics->stride = frame.stride;
        out_metrics->monitor_index = frame.monitor_index;
        out_metrics->cursor_x = frame.cursor_x;
        out_metrics->cursor_y = frame.cursor_y;
        out_metrics->cursor_visible = frame.cursor_visible ? 1 : 0;
        out_metrics->dirty_rect_count = static_cast<int>(frame.dirty_rects.size());
        out_metrics->move_rect_count = frame.move_rect_count;
        out_metrics->capture_time_ms = frame.capture_time_ms;
    }

    if (!ok || !frame.valid) {
        return 0;
    }

    if (out_bgra_buffer && max_bytes >= static_cast<int>(frame.bgra_pixels.size()) && !frame.bgra_pixels.empty()) {
        std::memcpy(out_bgra_buffer, frame.bgra_pixels.data(), frame.bgra_pixels.size());
    }
    return 1;
}

AIBRIDGE_API int aibridge_encode_h264_frame(
    const uint8_t* bgra_buffer,
    int width,
    int height,
    int fps,
    int bitrate_kbps,
    int force_keyframe,
    uint8_t* out_nal_buffer,
    int max_nal_bytes,
    AIBridgeCaptureMetrics* io_metrics
) {
    if (!bgra_buffer || width <= 0 || height <= 0) return 0;
    std::lock_guard<std::mutex> lock(g_api_mutex);

    int target_fps = fps > 0 ? fps : 30;
    int target_kbps = bitrate_kbps > 0 ? bitrate_kbps : 4500;
    if (!g_encoder_initialized || width != g_enc_w || height != g_enc_h || target_fps != g_enc_fps) {
        aibridge::encoder::EncoderConfig cfg{};
        cfg.width = width;
        cfg.height = height;
        cfg.fps = target_fps;
        cfg.bitrate_bps = target_kbps * 1000;
        cfg.keyframe_interval_sec = 2;
        cfg.prefer_hardware = true;
        cfg.adaptive_bitrate = true;
        g_encoder.Initialize(cfg);
        g_encoder_initialized = true;
        g_enc_w = width;
        g_enc_h = height;
        g_enc_fps = target_fps;
        g_enc_kbps = target_kbps;
    } else if (target_kbps != g_enc_kbps) {
        g_encoder.UpdateBitrate(target_kbps * 1000);
        g_enc_kbps = target_kbps;
    }

    aibridge::encoder::EncodedAccessUnit au;
    bool ok = g_encoder.EncodeBgraFrame(bgra_buffer, width, height, 0, force_keyframe != 0, au);
    auto tel = g_encoder.GetTelemetry();

    if (io_metrics) {
        io_metrics->encode_time_ms = au.encode_time_ms;
        io_metrics->encoded_bytes = static_cast<int>(au.annexb_nal_bytes.size());
        io_metrics->is_hardware_encoder = tel.is_hardware ? 1 : 0;
        std::snprintf(io_metrics->encoder_name, sizeof(io_metrics->encoder_name), "%s", tel.backend_name.c_str());
    }

    if (!ok || !au.valid) return 0;
    if (out_nal_buffer && max_nal_bytes >= static_cast<int>(au.annexb_nal_bytes.size())) {
        std::memcpy(out_nal_buffer, au.annexb_nal_bytes.data(), au.annexb_nal_bytes.size());
    }
    return static_cast<int>(au.annexb_nal_bytes.size());
}

AIBRIDGE_API int aibridge_send_mouse_move(double x, double y, int is_normalized, int mon_x, int mon_y, int mon_w, int mon_h) {
    return g_input.MoveMouse(x, y, is_normalized != 0, mon_x, mon_y, mon_w, mon_h) ? 1 : 0;
}

AIBRIDGE_API int aibridge_send_mouse_button(const char* button, const char* state, double x, double y, int is_normalized, int mon_x, int mon_y, int mon_w, int mon_h) {
    std::string btn = button ? button : "left";
    std::string st = state ? state : "click";
    return g_input.MouseButton(btn, st, x, y, is_normalized != 0, mon_x, mon_y, mon_w, mon_h) ? 1 : 0;
}

AIBRIDGE_API int aibridge_send_mouse_scroll(int delta_y, int delta_x) {
    return g_input.MouseScroll(delta_y, delta_x) ? 1 : 0;
}

AIBRIDGE_API int aibridge_send_key_event(const char* key_token, const char* state) {
    if (!key_token) return 0;
    std::string st = state ? state : "press";
    return g_input.KeyTokenEvent(key_token, st) ? 1 : 0;
}

AIBRIDGE_API int aibridge_release_all_keys(void) {
    return g_input.ReleaseAllHeldKeys();
}

AIBRIDGE_API int aibridge_get_held_key_count(void) {
    return static_cast<int>(g_input.GetHeldKeyCount());
}

AIBRIDGE_API int aibridge_get_system_health_json(char* out_json, int max_len) {
    if (!out_json || max_len <= 0) return 0;
    std::lock_guard<std::mutex> lock(g_api_mutex);
    auto snap = g_monitor.CollectSnapshot();
    int written = std::snprintf(
        out_json,
        static_cast<size_t>(max_len),
        "{\"cpu_percent\":%.1f,\"memory_percent\":%.1f,\"memory_total_gb\":%.2f,\"memory_available_gb\":%.2f,"
        "\"disk_percent\":%.1f,\"disk_total_gb\":%.1f,\"disk_free_gb\":%.1f,\"uptime_hours\":%.1f,"
        "\"hostname\":\"%s\",\"active_user\":\"%s\",\"active_session_id\":%u}",
        snap.cpu_percent,
        snap.memory_percent,
        snap.memory_total_gb,
        snap.memory_available_gb,
        snap.disk_percent,
        snap.disk_total_gb,
        snap.disk_free_gb,
        snap.uptime_hours,
        snap.hostname.c_str(),
        snap.active_user.c_str(),
        snap.active_session_id
    );
    return (written > 0 && written < max_len) ? written : 0;
}

} // extern "C"
