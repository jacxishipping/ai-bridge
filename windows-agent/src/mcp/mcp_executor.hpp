#pragma once

#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>

#include <string>
#include <vector>

namespace aibridge {
namespace mcp {

struct WindowSummary {
    uint64_t hwnd = 0;
    uint32_t pid = 0;
    std::string title;
    int left = 0;
    int top = 0;
    int width = 0;
    int height = 0;
    bool minimized = false;
};

class DesktopMcpExecutor {
public:
    static std::vector<WindowSummary> GetVisibleWindows();
    static bool LaunchApprovedApplication(const std::string& app_name, const std::vector<std::string>& allowlist);
};

} // namespace mcp
} // namespace aibridge
