#pragma once

#include <stdint.h>

#ifdef _WIN32
#ifdef AIBRIDGE_NATIVE_EXPORTS
#define AIBRIDGE_API __declspec(dllexport)
#else
#define AIBRIDGE_API __declspec(dllimport)
#endif
#else
#define AIBRIDGE_API
#endif

#ifdef __cplusplus
extern "C" {
#endif

typedef struct AIBridgeCaptureMetrics {
    int valid;
    int from_dxgi;
    int secure_desktop;
    int width;
    int height;
    int stride;
    int monitor_index;
    int cursor_x;
    int cursor_y;
    int cursor_visible;
    int dirty_rect_count;
    int move_rect_count;
    double capture_time_ms;
    double encode_time_ms;
    int encoded_bytes;
    int is_hardware_encoder;
    char encoder_name[128];
} AIBridgeCaptureMetrics;

AIBRIDGE_API int aibridge_capture_init(int monitor_index);
AIBRIDGE_API void aibridge_capture_shutdown(void);

// Captures desktop BGRA pixels into caller buffer (if max_bytes >= width * height * 4) and fills metrics
AIBRIDGE_API int aibridge_capture_frame(
    int monitor_index,
    uint8_t* out_bgra_buffer,
    int max_bytes,
    AIBridgeCaptureMetrics* out_metrics
);

// Encodes a BGRA frame into H.264 Annex-B using Media Foundation (HW NVENC/QSV/AMF or SW fallback)
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
);

// SendInput mouse & keyboard controls with DPI / multi-monitor coordinate normalization & disconnect key-up safety
AIBRIDGE_API int aibridge_send_mouse_move(double x, double y, int is_normalized, int mon_x, int mon_y, int mon_w, int mon_h);
AIBRIDGE_API int aibridge_send_mouse_button(const char* button, const char* state, double x, double y, int is_normalized, int mon_x, int mon_y, int mon_w, int mon_h);
AIBRIDGE_API int aibridge_send_mouse_scroll(int delta_y, int delta_x);
AIBRIDGE_API int aibridge_send_key_event(const char* key_token, const char* state);
AIBRIDGE_API int aibridge_release_all_keys(void);
AIBRIDGE_API int aibridge_get_held_key_count(void);

// System health JSON snapshot
AIBRIDGE_API int aibridge_get_system_health_json(char* out_json, int max_len);

#ifdef __cplusplus
}
#endif
