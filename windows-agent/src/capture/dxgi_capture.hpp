#pragma once

#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>
#include <d3d11.h>
#include <dxgi1_2.h>
#include <wrl/client.h>

#include <cstdint>
#include <mutex>
#include <string>
#include <vector>

namespace aibridge {
namespace capture {

struct MonitorDescriptor {
    int index = 0;
    std::string name;
    std::string device_name;
    std::string adapter_name;
    int left = 0;
    int top = 0;
    int right = 1920;
    int bottom = 1080;
    int width = 1920;
    int height = 1080;
    int rotation_degrees = 0;
    bool is_primary = false;
};

struct DirtyRect {
    int left = 0;
    int top = 0;
    int right = 0;
    int bottom = 0;
};

struct CapturedFrame {
    bool valid = false;
    bool from_dxgi = false;
    bool secure_desktop_detected = false;
    int width = 0;
    int height = 0;
    int stride = 0;
    int monitor_index = 0;
    int cursor_x = 0;
    int cursor_y = 0;
    bool cursor_visible = false;
    double capture_time_ms = 0.0;
    uint64_t timestamp_us = 0;
    std::vector<DirtyRect> dirty_rects;
    int move_rect_count = 0;
    std::vector<uint8_t> bgra_pixels; // Populated when CPU staging readout is requested
    Microsoft::WRL::ComPtr<ID3D11Texture2D> gpu_texture;
};

class DxgiDesktopCapturer {
public:
    DxgiDesktopCapturer();
    ~DxgiDesktopCapturer();

    bool Initialize(int monitor_index = 0);
    void Shutdown();

    std::vector<MonitorDescriptor> EnumerateMonitors() const;
    bool CaptureNextFrame(CapturedFrame& out_frame, int timeout_ms = 50, bool copy_to_cpu = true);
    bool CaptureWindow(HWND hwnd, CapturedFrame& out_frame) const;
    bool IsSecureDesktopActive() const;

    int CurrentMonitorIndex() const { return current_monitor_; }
    ID3D11Device* GetD3D11Device() const { return d3d_device_.Get(); }
    ID3D11DeviceContext* GetD3D11Context() const { return d3d_context_.Get(); }

private:
    bool InitDuplicationLocked(int monitor_index);
    bool CaptureViaGdiFallbackLocked(int monitor_index, CapturedFrame& out_frame);

    mutable std::mutex mutex_;
    bool initialized_ = false;
    int current_monitor_ = 0;
    int output_width_ = 1920;
    int output_height_ = 1080;
    int rotation_degrees_ = 0;

    Microsoft::WRL::ComPtr<ID3D11Device> d3d_device_;
    Microsoft::WRL::ComPtr<ID3D11DeviceContext> d3d_context_;
    Microsoft::WRL::ComPtr<IDXGIOutputDuplication> desk_dupl_;
    Microsoft::WRL::ComPtr<ID3D11Texture2D> staging_texture_;
    std::vector<uint8_t> last_bgra_frame_;
};

} // namespace capture
} // namespace aibridge
