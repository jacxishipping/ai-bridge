#pragma once

#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>

#include <chrono>
#include <cstdint>
#include <mutex>
#include <string>
#include <unordered_set>
#include <vector>

namespace aibridge {
namespace input {

struct SessionInputPermissions {
    bool allow_mouse = false;
    bool allow_keyboard = false;
    bool allow_clipboard = false;
    bool session_active = false;
};

struct VirtualDesktopPoint {
    int pixel_x = 0;
    int pixel_y = 0;
    LONG normalized_dx = 0; // 0..65535 across virtual desktop
    LONG normalized_dy = 0; // 0..65535 across virtual desktop
};

class WindowsInputController {
public:
    WindowsInputController();
    ~WindowsInputController();

    void SetPermissions(const SessionInputPermissions& perms);
    SessionInputPermissions GetPermissions() const;

    // Converts normalized [0,1] or monitor-relative coordinates into virtual desktop & 0..65535 SendInput coordinates
    static VirtualDesktopPoint TransformCoordinates(
        double x,
        double y,
        bool is_normalized,
        int monitor_offset_x = 0,
        int monitor_offset_y = 0,
        int monitor_width = 0,
        int monitor_height = 0
    );

    bool MoveMouse(double x, double y, bool is_normalized, int mon_x = 0, int mon_y = 0, int mon_w = 0, int mon_h = 0);
    bool MouseButton(const std::string& button, const std::string& state, double x, double y, bool is_normalized, int mon_x = 0, int mon_y = 0, int mon_w = 0, int mon_h = 0);
    bool MouseScroll(int delta_y, int delta_x = 0);

    bool KeyEvent(WORD vk_code, bool is_down, bool is_extended = false);
    bool KeyTokenEvent(const std::string& key_token, const std::string& state);
    bool TypeUnicodeText(const std::wstring& text);

    // Releases all currently held keyboard keys and mouse buttons (critical on session disconnect)
    int ReleaseAllHeldKeys();
    size_t GetHeldKeyCount() const;

    static WORD MapKeyTokenToVk(const std::string& token);

private:
    bool CheckRateLimitLocked();

    mutable std::mutex mutex_;
    SessionInputPermissions permissions_{true, true, false, true};
    std::unordered_set<WORD> held_keys_;
    uint32_t held_mouse_buttons_mask_ = 0; // bit 0: left, bit 1: right, bit 2: middle

    // Token-bucket rate limiter (max 250 events/sec)
    double rate_tokens_ = 250.0;
    std::chrono::steady_clock::time_point last_token_refill_;
};

} // namespace input
} // namespace aibridge
