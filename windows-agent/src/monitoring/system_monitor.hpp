#pragma once

#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>

#include <cstdint>
#include <string>
#include <vector>

namespace aibridge {
namespace monitoring {

struct InteractiveSessionInfo {
    uint32_t session_id = 0;
    std::string username;
    std::string station_name;
    std::string state;
    bool is_active = false;
};

struct SystemHealthSnapshot {
    double cpu_percent = 0.0;
    double memory_percent = 0.0;
    double memory_total_gb = 0.0;
    double memory_available_gb = 0.0;
    double disk_percent = 0.0;
    double disk_total_gb = 0.0;
    double disk_free_gb = 0.0;
    double uptime_hours = 0.0;
    std::string hostname;
    std::string windows_version;
    std::string active_user;
    uint32_t active_session_id = 0;
    int interactive_session_count = 1;
};

class WindowsSystemMonitor {
public:
    WindowsSystemMonitor();
    SystemHealthSnapshot CollectSnapshot();
    std::vector<InteractiveSessionInfo> EnumerateSessions() const;

private:
    uint64_t prev_idle_ticks_ = 0;
    uint64_t prev_total_ticks_ = 0;
};

} // namespace monitoring
} // namespace aibridge
