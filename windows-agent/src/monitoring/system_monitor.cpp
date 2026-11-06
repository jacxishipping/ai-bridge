#include "system_monitor.hpp"

#include <wtsapi32.h>
#include <algorithm>
#include <cmath>

#pragma comment(lib, "wtsapi32.lib")

namespace aibridge {
namespace monitoring {

namespace {
uint64_t FileTimeToUInt64(const FILETIME& ft) {
    return (static_cast<uint64_t>(ft.dwHighDateTime) << 32) | static_cast<uint64_t>(ft.dwLowDateTime);
}

std::string WideToUtf8(const wchar_t* wstr) {
    if (!wstr || !*wstr) return {};
    int len = WideCharToMultiByte(CP_UTF8, 0, wstr, -1, nullptr, 0, nullptr, nullptr);
    if (len <= 1) return {};
    std::string out(static_cast<size_t>(len - 1), '\0');
    WideCharToMultiByte(CP_UTF8, 0, wstr, -1, out.data(), len, nullptr, nullptr);
    return out;
}
} // namespace

WindowsSystemMonitor::WindowsSystemMonitor() {
    FILETIME idle{}, kernel{}, user{};
    if (GetSystemTimes(&idle, &kernel, &user)) {
        prev_idle_ticks_ = FileTimeToUInt64(idle);
        prev_total_ticks_ = FileTimeToUInt64(kernel) + FileTimeToUInt64(user);
    }
}

SystemHealthSnapshot WindowsSystemMonitor::CollectSnapshot() {
    SystemHealthSnapshot snap{};

    // 1. CPU Usage via GetSystemTimes delta
    FILETIME idle{}, kernel{}, user{};
    if (GetSystemTimes(&idle, &kernel, &user)) {
        uint64_t idle_ticks = FileTimeToUInt64(idle);
        uint64_t total_ticks = FileTimeToUInt64(kernel) + FileTimeToUInt64(user);
        uint64_t total_diff = total_ticks - prev_total_ticks_;
        uint64_t idle_diff = idle_ticks - prev_idle_ticks_;
        prev_idle_ticks_ = idle_ticks;
        prev_total_ticks_ = total_ticks;
        if (total_diff > 0) {
            double busy = 1.0 - (static_cast<double>(idle_diff) / static_cast<double>(total_diff));
            snap.cpu_percent = std::round(std::clamp(busy * 100.0, 0.0, 100.0) * 10.0) / 10.0;
        }
    }

    // 2. Memory Usage via GlobalMemoryStatusEx
    MEMORYSTATUSEX mem{};
    mem.dwLength = sizeof(MEMORYSTATUSEX);
    if (GlobalMemoryStatusEx(&mem)) {
        snap.memory_percent = static_cast<double>(mem.dwMemoryLoad);
        snap.memory_total_gb = std::round((static_cast<double>(mem.ullTotalPhys) / (1024.0 * 1024.0 * 1024.0)) * 100.0) / 100.0;
        snap.memory_available_gb = std::round((static_cast<double>(mem.ullAvailPhys) / (1024.0 * 1024.0 * 1024.0)) * 100.0) / 100.0;
    }

    // 3. Disk Usage via GetDiskFreeSpaceExW
    ULARGE_INTEGER free_avail{}, total_bytes{}, total_free{};
    if (GetDiskFreeSpaceExW(L"C:\\", &free_avail, &total_bytes, &total_free) && total_bytes.QuadPart > 0) {
        double tot_gb = static_cast<double>(total_bytes.QuadPart) / (1024.0 * 1024.0 * 1024.0);
        double free_gb = static_cast<double>(total_free.QuadPart) / (1024.0 * 1024.0 * 1024.0);
        double used_pct = ((tot_gb - free_gb) / tot_gb) * 100.0;
        snap.disk_total_gb = std::round(tot_gb * 10.0) / 10.0;
        snap.disk_free_gb = std::round(free_gb * 10.0) / 10.0;
        snap.disk_percent = std::round(used_pct * 10.0) / 10.0;
    }

    // 4. Uptime
    snap.uptime_hours = std::round((static_cast<double>(GetTickCount64()) / (1000.0 * 3600.0)) * 10.0) / 10.0;

    // 5. Hostname & Active Console/Interactive User
    wchar_t comp_name[MAX_COMPUTERNAME_LENGTH + 1] = {0};
    DWORD comp_len = MAX_COMPUTERNAME_LENGTH + 1;
    if (GetComputerNameW(comp_name, &comp_len)) {
        snap.hostname = WideToUtf8(comp_name);
    }

    DWORD session_id = WTSGetActiveConsoleSessionId();
    snap.active_session_id = session_id;
    LPWSTR user_buf = nullptr;
    DWORD user_bytes = 0;
    if (session_id != 0xFFFFFFFF &&
        WTSQuerySessionInformationW(WTS_CURRENT_SERVER_HANDLE, session_id, WTSUserName, &user_buf, &user_bytes) &&
        user_buf) {
        snap.active_user = WideToUtf8(user_buf);
        WTSFreeMemory(user_buf);
    }
    if (snap.active_user.empty()) {
        wchar_t uname[256] = {0};
        DWORD ulen = 256;
        if (GetUserNameW(uname, &ulen)) {
            snap.active_user = WideToUtf8(uname);
        }
    }

    snap.windows_version = "Windows NT (x64)";
    auto sessions = EnumerateSessions();
    snap.interactive_session_count = static_cast<int>(sessions.size());
    for (const auto& s : sessions) {
        if (s.is_active && !s.username.empty()) {
            snap.active_session_id = s.session_id;
            snap.active_user = s.username;
            break;
        }
    }
    return snap;
}

std::vector<InteractiveSessionInfo> WindowsSystemMonitor::EnumerateSessions() const {
    std::vector<InteractiveSessionInfo> result;
    PWTS_SESSION_INFOW pSessionInfo = nullptr;
    DWORD count = 0;
    if (WTSEnumerateSessionsW(WTS_CURRENT_SERVER_HANDLE, 0, 1, &pSessionInfo, &count) && pSessionInfo) {
        for (DWORD i = 0; i < count; ++i) {
            const auto& si = pSessionInfo[i];
            if (si.SessionId == 0) continue; // Skip Session 0 non-interactive service session
            InteractiveSessionInfo info{};
            info.session_id = si.SessionId;
            info.station_name = WideToUtf8(si.pWinStationName);
            info.is_active = (si.State == WTSActive);
            switch (si.State) {
                case WTSActive: info.state = "Active"; break;
                case WTSConnected: info.state = "Connected"; break;
                case WTSDisconnected: info.state = "Disconnected"; break;
                default: info.state = "Idle"; break;
            }
            LPWSTR user_buf = nullptr;
            DWORD user_bytes = 0;
            if (WTSQuerySessionInformationW(WTS_CURRENT_SERVER_HANDLE, si.SessionId, WTSUserName, &user_buf, &user_bytes) && user_buf) {
                info.username = WideToUtf8(user_buf);
                WTSFreeMemory(user_buf);
            }
            if (!info.username.empty() || info.is_active) {
                result.push_back(info);
            }
        }
        WTSFreeMemory(pSessionInfo);
    }
    return result;
}

} // namespace monitoring
} // namespace aibridge
