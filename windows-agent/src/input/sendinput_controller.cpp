#include "sendinput_controller.hpp"

#include <algorithm>
#include <cctype>
#include <cmath>
#include <unordered_map>

#pragma comment(lib, "user32.lib")

namespace aibridge {
namespace input {

WindowsInputController::WindowsInputController()
    : last_token_refill_(std::chrono::steady_clock::now()) {
    // Enable Per-Monitor v2 DPI awareness so GetSystemMetrics and SendInput operate in physical desktop pixels
    SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
}

WindowsInputController::~WindowsInputController() {
    ReleaseAllHeldKeys();
}

void WindowsInputController::SetPermissions(const SessionInputPermissions& perms) {
    bool should_release = false;
    {
        std::lock_guard<std::mutex> lock(mutex_);
        if (!perms.session_active || !perms.allow_keyboard || !perms.allow_mouse) {
            should_release = true;
        }
        permissions_ = perms;
    }
    if (should_release) {
        ReleaseAllHeldKeys();
    }
}

SessionInputPermissions WindowsInputController::GetPermissions() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return permissions_;
}

bool WindowsInputController::CheckRateLimitLocked() {
    auto now = std::chrono::steady_clock::now();
    double elapsed_sec = std::chrono::duration<double>(now - last_token_refill_).count();
    last_token_refill_ = now;
    rate_tokens_ = std::min(250.0, rate_tokens_ + elapsed_sec * 250.0);
    if (rate_tokens_ < 1.0) {
        return false;
    }
    rate_tokens_ -= 1.0;
    return true;
}

VirtualDesktopPoint WindowsInputController::TransformCoordinates(
    double x,
    double y,
    bool is_normalized,
    int monitor_offset_x,
    int monitor_offset_y,
    int monitor_width,
    int monitor_height
) {
    int v_left = GetSystemMetrics(SM_XVIRTUALSCREEN);
    int v_top = GetSystemMetrics(SM_YVIRTUALSCREEN);
    int v_width = GetSystemMetrics(SM_CXVIRTUALSCREEN);
    int v_height = GetSystemMetrics(SM_CYVIRTUALSCREEN);
    if (v_width <= 1) v_width = GetSystemMetrics(SM_CXSCREEN) > 0 ? GetSystemMetrics(SM_CXSCREEN) : 1920;
    if (v_height <= 1) v_height = GetSystemMetrics(SM_CYSCREEN) > 0 ? GetSystemMetrics(SM_CYSCREEN) : 1080;

    int mon_w = monitor_width > 0 ? monitor_width : v_width;
    int mon_h = monitor_height > 0 ? monitor_height : v_height;

    int px = 0;
    int py = 0;
    if (is_normalized) {
        double clamped_x = std::clamp(x, 0.0, 1.0);
        double clamped_y = std::clamp(y, 0.0, 1.0);
        px = monitor_offset_x + static_cast<int>(std::lround(clamped_x * std::max(1, mon_w - 1)));
        py = monitor_offset_y + static_cast<int>(std::lround(clamped_y * std::max(1, mon_h - 1)));
    } else {
        px = monitor_offset_x + static_cast<int>(std::lround(x));
        py = monitor_offset_y + static_cast<int>(std::lround(y));
    }

    px = std::clamp(px, v_left, v_left + v_width - 1);
    py = std::clamp(py, v_top, v_top + v_height - 1);

    // SendInput MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK maps [v_left, v_left + v_width - 1] -> [0, 65535]
    LONG norm_dx = static_cast<LONG>(std::lround(((px - v_left) * 65535.0) / std::max(1, v_width - 1)));
    LONG norm_dy = static_cast<LONG>(std::lround(((py - v_top) * 65535.0) / std::max(1, v_height - 1)));

    return VirtualDesktopPoint{
        px,
        py,
        std::clamp<LONG>(norm_dx, 0, 65535),
        std::clamp<LONG>(norm_dy, 0, 65535)
    };
}

bool WindowsInputController::MoveMouse(double x, double y, bool is_normalized, int mon_x, int mon_y, int mon_w, int mon_h) {
    {
        std::lock_guard<std::mutex> lock(mutex_);
        if (!permissions_.session_active || !permissions_.allow_mouse || !CheckRateLimitLocked()) {
            return false;
        }
    }
    auto pt = TransformCoordinates(x, y, is_normalized, mon_x, mon_y, mon_w, mon_h);
    INPUT inp{};
    inp.type = INPUT_MOUSE;
    inp.mi.dx = pt.normalized_dx;
    inp.mi.dy = pt.normalized_dy;
    inp.mi.dwFlags = MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK;
    return SendInput(1, &inp, sizeof(INPUT)) == 1;
}

bool WindowsInputController::MouseButton(
    const std::string& button,
    const std::string& state,
    double x,
    double y,
    bool is_normalized,
    int mon_x,
    int mon_y,
    int mon_w,
    int mon_h
) {
    auto pt = TransformCoordinates(x, y, is_normalized, mon_x, mon_y, mon_w, mon_h);

    DWORD down_flag = MOUSEEVENTF_LEFTDOWN;
    DWORD up_flag = MOUSEEVENTF_LEFTUP;
    uint32_t btn_bit = 1u;

    if (button == "right") {
        down_flag = MOUSEEVENTF_RIGHTDOWN;
        up_flag = MOUSEEVENTF_RIGHTUP;
        btn_bit = 2u;
    } else if (button == "middle") {
        down_flag = MOUSEEVENTF_MIDDLEDOWN;
        up_flag = MOUSEEVENTF_MIDDLEUP;
        btn_bit = 4u;
    }

    std::vector<INPUT> inputs;
    auto make_mouse_input = [&](DWORD flags) {
        INPUT inp{};
        inp.type = INPUT_MOUSE;
        inp.mi.dx = pt.normalized_dx;
        inp.mi.dy = pt.normalized_dy;
        inp.mi.dwFlags = MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK | flags;
        return inp;
    };

    {
        std::lock_guard<std::mutex> lock(mutex_);
        if (!permissions_.session_active || !permissions_.allow_mouse || !CheckRateLimitLocked()) {
            return false;
        }
        if (state == "down") {
            held_mouse_buttons_mask_ |= btn_bit;
            inputs.push_back(make_mouse_input(down_flag));
        } else if (state == "up") {
            held_mouse_buttons_mask_ &= ~btn_bit;
            inputs.push_back(make_mouse_input(up_flag));
        } else if (state == "double_click") {
            held_mouse_buttons_mask_ &= ~btn_bit;
            inputs.push_back(make_mouse_input(down_flag));
            inputs.push_back(make_mouse_input(up_flag));
            inputs.push_back(make_mouse_input(down_flag));
            inputs.push_back(make_mouse_input(up_flag));
        } else {
            // Standard single click
            held_mouse_buttons_mask_ &= ~btn_bit;
            inputs.push_back(make_mouse_input(down_flag));
            inputs.push_back(make_mouse_input(up_flag));
        }
    }

    if (inputs.empty()) return false;
    return SendInput(static_cast<UINT>(inputs.size()), inputs.data(), sizeof(INPUT)) == inputs.size();
}

bool WindowsInputController::MouseScroll(int delta_y, int delta_x) {
    {
        std::lock_guard<std::mutex> lock(mutex_);
        if (!permissions_.session_active || !permissions_.allow_mouse || !CheckRateLimitLocked()) {
            return false;
        }
    }
    std::vector<INPUT> inputs;
    if (delta_y != 0) {
        INPUT inp{};
        inp.type = INPUT_MOUSE;
        inp.mi.dwFlags = MOUSEEVENTF_WHEEL;
        inp.mi.mouseData = static_cast<DWORD>(delta_y);
        inputs.push_back(inp);
    }
    if (delta_x != 0) {
        INPUT inp{};
        inp.type = INPUT_MOUSE;
        inp.mi.dwFlags = MOUSEEVENTF_HWHEEL;
        inp.mi.mouseData = static_cast<DWORD>(delta_x);
        inputs.push_back(inp);
    }
    if (inputs.empty()) return true;
    return SendInput(static_cast<UINT>(inputs.size()), inputs.data(), sizeof(INPUT)) == inputs.size();
}

WORD WindowsInputController::MapKeyTokenToVk(const std::string& token) {
    std::string lower;
    lower.reserve(token.size());
    for (unsigned char c : token) {
        lower.push_back(static_cast<char>(std::tolower(c)));
    }

    static const std::unordered_map<std::string, WORD> kVkTable = {
        {"backspace", VK_BACK}, {"tab", VK_TAB}, {"enter", VK_RETURN}, {"return", VK_RETURN},
        {"shift", VK_SHIFT}, {"shiftleft", VK_LSHIFT}, {"shiftright", VK_RSHIFT},
        {"ctrl", VK_CONTROL}, {"control", VK_CONTROL}, {"controlleft", VK_LCONTROL}, {"controlright", VK_RCONTROL},
        {"alt", VK_MENU}, {"altleft", VK_LMENU}, {"altright", VK_RMENU},
        {"pause", VK_PAUSE}, {"capslock", VK_CAPITAL}, {"esc", VK_ESCAPE}, {"escape", VK_ESCAPE},
        {"space", VK_SPACE}, {" ", VK_SPACE},
        {"pageup", VK_PRIOR}, {"pagedown", VK_NEXT}, {"end", VK_END}, {"home", VK_HOME},
        {"arrowleft", VK_LEFT}, {"left", VK_LEFT},
        {"arrowup", VK_UP}, {"up", VK_UP},
        {"arrowright", VK_RIGHT}, {"right", VK_RIGHT},
        {"arrowdown", VK_DOWN}, {"down", VK_DOWN},
        {"insert", VK_INSERT}, {"delete", VK_DELETE}, {"del", VK_DELETE},
        {"meta", VK_LWIN}, {"metaleft", VK_LWIN}, {"metaright", VK_RWIN}, {"win", VK_LWIN}, {"super", VK_LWIN},
        {"f1", VK_F1}, {"f2", VK_F2}, {"f3", VK_F3}, {"f4", VK_F4},
        {"f5", VK_F5}, {"f6", VK_F6}, {"f7", VK_F7}, {"f8", VK_F8},
        {"f9", VK_F9}, {"f10", VK_F10}, {"f11", VK_F11}, {"f12", VK_F12},
    };

    auto it = kVkTable.find(lower);
    if (it != kVkTable.end()) {
        return it->second;
    }
    if (lower.size() == 1) {
        char ch = lower[0];
        if (ch >= 'a' && ch <= 'z') return static_cast<WORD>(std::toupper(ch));
        if (ch >= '0' && ch <= '9') return static_cast<WORD>(ch);
        SHORT vk_scan = VkKeyScanA(ch);
        if (vk_scan != -1) {
            return static_cast<WORD>(vk_scan & 0xFF);
        }
    }
    return 0;
}

bool WindowsInputController::KeyEvent(WORD vk_code, bool is_down, bool is_extended) {
    if (vk_code == 0) return false;
    {
        std::lock_guard<std::mutex> lock(mutex_);
        if (!permissions_.session_active || !permissions_.allow_keyboard || !CheckRateLimitLocked()) {
            return false;
        }
        if (is_down) {
            held_keys_.insert(vk_code);
        } else {
            held_keys_.erase(vk_code);
        }
    }

    INPUT inp{};
    inp.type = INPUT_KEYBOARD;
    inp.ki.wVk = vk_code;
    inp.ki.wScan = static_cast<WORD>(MapVirtualKeyW(vk_code, MAPVK_VK_TO_VSC));
    inp.ki.dwFlags = (is_down ? 0 : KEYEVENTF_KEYUP) | (is_extended ? KEYEVENTF_EXTENDEDKEY : 0);
    return SendInput(1, &inp, sizeof(INPUT)) == 1;
}

bool WindowsInputController::KeyTokenEvent(const std::string& key_token, const std::string& state) {
    WORD vk = MapKeyTokenToVk(key_token);
    if (vk == 0) return false;
    bool extended = (vk == VK_UP || vk == VK_DOWN || vk == VK_LEFT || vk == VK_RIGHT ||
                     vk == VK_HOME || vk == VK_END || vk == VK_PRIOR || vk == VK_NEXT ||
                     vk == VK_INSERT || vk == VK_DELETE || vk == VK_LWIN || vk == VK_RWIN);
    if (state == "down") {
        return KeyEvent(vk, true, extended);
    }
    if (state == "up") {
        return KeyEvent(vk, false, extended);
    }
    bool ok1 = KeyEvent(vk, true, extended);
    bool ok2 = KeyEvent(vk, false, extended);
    return ok1 && ok2;
}

bool WindowsInputController::TypeUnicodeText(const std::wstring& text) {
    if (text.empty()) return true;
    {
        std::lock_guard<std::mutex> lock(mutex_);
        if (!permissions_.session_active || !permissions_.allow_keyboard || !CheckRateLimitLocked()) {
            return false;
        }
    }
    std::vector<INPUT> inputs;
    inputs.reserve(text.size() * 2);
    for (wchar_t ch : text) {
        INPUT down{};
        down.type = INPUT_KEYBOARD;
        down.ki.wScan = static_cast<WORD>(ch);
        down.ki.dwFlags = KEYEVENTF_UNICODE;
        inputs.push_back(down);

        INPUT up = down;
        up.ki.dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP;
        inputs.push_back(up);
    }
    return SendInput(static_cast<UINT>(inputs.size()), inputs.data(), sizeof(INPUT)) == inputs.size();
}

int WindowsInputController::ReleaseAllHeldKeys() {
    std::vector<WORD> keys_to_release;
    uint32_t mouse_mask = 0;
    {
        std::lock_guard<std::mutex> lock(mutex_);
        keys_to_release.assign(held_keys_.begin(), held_keys_.end());
        held_keys_.clear();
        mouse_mask = held_mouse_buttons_mask_;
        held_mouse_buttons_mask_ = 0;
    }

    std::vector<INPUT> release_inputs;
    for (WORD vk : keys_to_release) {
        INPUT inp{};
        inp.type = INPUT_KEYBOARD;
        inp.ki.wVk = vk;
        inp.ki.wScan = static_cast<WORD>(MapVirtualKeyW(vk, MAPVK_VK_TO_VSC));
        inp.ki.dwFlags = KEYEVENTF_KEYUP;
        release_inputs.push_back(inp);
    }

    if (mouse_mask & 1u) {
        INPUT inp{};
        inp.type = INPUT_MOUSE;
        inp.mi.dwFlags = MOUSEEVENTF_LEFTUP;
        release_inputs.push_back(inp);
    }
    if (mouse_mask & 2u) {
        INPUT inp{};
        inp.type = INPUT_MOUSE;
        inp.mi.dwFlags = MOUSEEVENTF_RIGHTUP;
        release_inputs.push_back(inp);
    }
    if (mouse_mask & 4u) {
        INPUT inp{};
        inp.type = INPUT_MOUSE;
        inp.mi.dwFlags = MOUSEEVENTF_MIDDLEUP;
        release_inputs.push_back(inp);
    }

    if (!release_inputs.empty()) {
        SendInput(static_cast<UINT>(release_inputs.size()), release_inputs.data(), sizeof(INPUT));
    }
    return static_cast<int>(release_inputs.size());
}

size_t WindowsInputController::GetHeldKeyCount() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return held_keys_.size();
}

} // namespace input
} // namespace aibridge
