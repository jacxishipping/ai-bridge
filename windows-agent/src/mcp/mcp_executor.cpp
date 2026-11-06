#include "mcp_executor.hpp"

#include <algorithm>

#pragma comment(lib, "user32.lib")

namespace aibridge {
namespace mcp {

namespace {
std::string WideToUtf8(const wchar_t* wstr) {
    if (!wstr || !*wstr) return {};
    int len = WideCharToMultiByte(CP_UTF8, 0, wstr, -1, nullptr, 0, nullptr, nullptr);
    if (len <= 1) return {};
    std::string out(static_cast<size_t>(len - 1), '\0');
    WideCharToMultiByte(CP_UTF8, 0, wstr, -1, out.data(), len, nullptr, nullptr);
    return out;
}

std::wstring Utf8ToWide(const std::string& str) {
    if (str.empty()) return {};
    int len = MultiByteToWideChar(CP_UTF8, 0, str.c_str(), -1, nullptr, 0);
    if (len <= 1) return {};
    std::wstring out(static_cast<size_t>(len - 1), L'\0');
    MultiByteToWideChar(CP_UTF8, 0, str.c_str(), -1, out.data(), len);
    return out;
}

BOOL CALLBACK EnumWindowsCallback(HWND hwnd, LPARAM lParam) {
    if (!IsWindowVisible(hwnd)) return TRUE;
    int length = GetWindowTextLengthW(hwnd);
    if (length <= 0) return TRUE;

    std::wstring buf(static_cast<size_t>(length + 1), L'\0');
    GetWindowTextW(hwnd, buf.data(), length + 1);
    buf.resize(static_cast<size_t>(length));

    RECT rc{};
    GetWindowRect(hwnd, &rc);
    DWORD pid = 0;
    GetWindowThreadProcessId(hwnd, &pid);

    auto* list = reinterpret_cast<std::vector<WindowSummary>*>(lParam);
    WindowSummary ws{};
    ws.hwnd = static_cast<uint64_t>(reinterpret_cast<uintptr_t>(hwnd));
    ws.pid = pid;
    ws.title = WideToUtf8(buf.c_str());
    ws.left = rc.left;
    ws.top = rc.top;
    ws.width = rc.right - rc.left;
    ws.height = rc.bottom - rc.top;
    ws.minimized = IsIconic(hwnd) != FALSE;
    list->push_back(ws);
    return TRUE;
}
} // namespace

std::vector<WindowSummary> DesktopMcpExecutor::GetVisibleWindows() {
    std::vector<WindowSummary> windows;
    EnumWindows(EnumWindowsCallback, reinterpret_cast<LPARAM>(&windows));
    return windows;
}

bool DesktopMcpExecutor::LaunchApprovedApplication(const std::string& app_name, const std::vector<std::string>& allowlist) {
    if (app_name.empty()) return false;
    bool allowed = false;
    for (const auto& item : allowlist) {
        if (item == "*" || _stricmp(item.c_str(), app_name.c_str()) == 0) {
            allowed = true;
            break;
        }
    }
    if (!allowed) return false;

    // Reject shell metacharacters or path traversal
    if (app_name.find_first_of("&|;<>`$()") != std::string::npos) {
        return false;
    }

    std::wstring wapp = Utf8ToWide(app_name);
    STARTUPINFOW si{};
    si.cb = sizeof(STARTUPINFOW);
    PROCESS_INFORMATION pi{};
    if (!CreateProcessW(nullptr, wapp.data(), nullptr, nullptr, FALSE, CREATE_NEW_CONSOLE, nullptr, nullptr, &si, &pi)) {
        return false;
    }
    CloseHandle(pi.hThread);
    CloseHandle(pi.hProcess);
    return true;
}

} // namespace mcp
} // namespace aibridge
