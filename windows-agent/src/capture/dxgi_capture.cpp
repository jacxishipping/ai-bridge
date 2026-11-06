#include "dxgi_capture.hpp"

#include <chrono>
#include <cstring>

#pragma comment(lib, "d3d11.lib")
#pragma comment(lib, "dxgi.lib")
#pragma comment(lib, "user32.lib")
#pragma comment(lib, "gdi32.lib")

namespace aibridge {
namespace capture {

namespace {
std::string WideToUtf8(const wchar_t* wstr) {
    if (!wstr || !*wstr) return {};
    int len = WideCharToMultiByte(CP_UTF8, 0, wstr, -1, nullptr, 0, nullptr, nullptr);
    if (len <= 1) return {};
    std::string out(static_cast<size_t>(len - 1), '\0');
    WideCharToMultiByte(CP_UTF8, 0, wstr, -1, out.data(), len, nullptr, nullptr);
    return out;
}
} // namespace

DxgiDesktopCapturer::DxgiDesktopCapturer() = default;

DxgiDesktopCapturer::~DxgiDesktopCapturer() {
    Shutdown();
}

bool DxgiDesktopCapturer::IsSecureDesktopActive() const {
    HDESK hDesk = OpenInputDesktop(0, FALSE, DESKTOP_READOBJECTS);
    if (!hDesk) {
        // Unable to open input desktop -> often locked or UAC secure desktop (Winlogon)
        return true;
    }
    wchar_t name_buf[128] = {0};
    DWORD needed = 0;
    bool is_secure = false;
    if (GetUserObjectInformationW(hDesk, UOI_NAME, name_buf, sizeof(name_buf), &needed)) {
        if (_wcsicmp(name_buf, L"Default") != 0) {
            is_secure = true;
        }
    }
    CloseDesktop(hDesk);
    return is_secure;
}

std::vector<MonitorDescriptor> DxgiDesktopCapturer::EnumerateMonitors() const {
    std::vector<MonitorDescriptor> result;
    Microsoft::WRL::ComPtr<IDXGIFactory1> factory;
    if (SUCCEEDED(CreateDXGIFactory1(__uuidof(IDXGIFactory1), reinterpret_cast<void**>(factory.GetAddressOf())))) {
        int global_idx = 0;
        for (UINT adapter_idx = 0;; ++adapter_idx) {
            Microsoft::WRL::ComPtr<IDXGIAdapter1> adapter;
            if (factory->EnumAdapters1(adapter_idx, adapter.GetAddressOf()) == DXGI_ERROR_NOT_FOUND) {
                break;
            }
            DXGI_ADAPTER_DESC1 adapter_desc{};
            adapter->GetDesc1(&adapter_desc);
            std::string adapter_name = WideToUtf8(adapter_desc.Description);

            for (UINT output_idx = 0;; ++output_idx) {
                Microsoft::WRL::ComPtr<IDXGIOutput> output;
                if (adapter->EnumOutputs(output_idx, output.GetAddressOf()) == DXGI_ERROR_NOT_FOUND) {
                    break;
                }
                DXGI_OUTPUT_DESC out_desc{};
                if (SUCCEEDED(output->GetDesc(&out_desc)) && out_desc.AttachedToDesktop) {
                    MonitorDescriptor md;
                    md.index = global_idx;
                    md.device_name = WideToUtf8(out_desc.DeviceName);
                    md.adapter_name = adapter_name;
                    md.left = out_desc.DesktopCoordinates.left;
                    md.top = out_desc.DesktopCoordinates.top;
                    md.right = out_desc.DesktopCoordinates.right;
                    md.bottom = out_desc.DesktopCoordinates.bottom;
                    md.width = md.right - md.left;
                    md.height = md.bottom - md.top;
                    switch (out_desc.Rotation) {
                        case DXGI_MODE_ROTATION_ROTATE90: md.rotation_degrees = 90; break;
                        case DXGI_MODE_ROTATION_ROTATE180: md.rotation_degrees = 180; break;
                        case DXGI_MODE_ROTATION_ROTATE270: md.rotation_degrees = 270; break;
                        default: md.rotation_degrees = 0; break;
                    }
                    md.is_primary = (md.left == 0 && md.top == 0);
                    md.name = "Display " + std::to_string(global_idx + 1) + (md.is_primary ? " (Primary)" : "");
                    result.push_back(md);
                    ++global_idx;
                }
            }
        }
    }

    if (result.empty()) {
        MonitorDescriptor fallback;
        fallback.index = 0;
        fallback.name = "Display 1 (Primary)";
        fallback.device_name = "DISPLAY1";
        fallback.adapter_name = "Windows Display Adapter";
        fallback.left = 0;
        fallback.top = 0;
        fallback.width = GetSystemMetrics(SM_CXSCREEN) > 0 ? GetSystemMetrics(SM_CXSCREEN) : 1920;
        fallback.height = GetSystemMetrics(SM_CYSCREEN) > 0 ? GetSystemMetrics(SM_CYSCREEN) : 1080;
        fallback.right = fallback.width;
        fallback.bottom = fallback.height;
        fallback.is_primary = true;
        result.push_back(fallback);
    }
    return result;
}

bool DxgiDesktopCapturer::Initialize(int monitor_index) {
    std::lock_guard<std::mutex> lock(mutex_);
    return InitDuplicationLocked(monitor_index);
}

void DxgiDesktopCapturer::Shutdown() {
    std::lock_guard<std::mutex> lock(mutex_);
    staging_texture_.Reset();
    desk_dupl_.Reset();
    d3d_context_.Reset();
    d3d_device_.Reset();
    initialized_ = false;
}

bool DxgiDesktopCapturer::InitDuplicationLocked(int monitor_index) {
    staging_texture_.Reset();
    desk_dupl_.Reset();
    d3d_context_.Reset();
    d3d_device_.Reset();
    initialized_ = false;
    current_monitor_ = monitor_index >= 0 ? monitor_index : 0;

    Microsoft::WRL::ComPtr<IDXGIFactory1> factory;
    if (FAILED(CreateDXGIFactory1(__uuidof(IDXGIFactory1), reinterpret_cast<void**>(factory.GetAddressOf())))) {
        return false;
    }

    Microsoft::WRL::ComPtr<IDXGIAdapter1> target_adapter;
    Microsoft::WRL::ComPtr<IDXGIOutput> target_output;
    int seen_outputs = 0;

    for (UINT a = 0; !target_output; ++a) {
        Microsoft::WRL::ComPtr<IDXGIAdapter1> adapter;
        if (factory->EnumAdapters1(a, adapter.GetAddressOf()) == DXGI_ERROR_NOT_FOUND) {
            break;
        }
        for (UINT o = 0;; ++o) {
            Microsoft::WRL::ComPtr<IDXGIOutput> output;
            if (adapter->EnumOutputs(o, output.GetAddressOf()) == DXGI_ERROR_NOT_FOUND) {
                break;
            }
            DXGI_OUTPUT_DESC desc{};
            if (SUCCEEDED(output->GetDesc(&desc)) && desc.AttachedToDesktop) {
                if (seen_outputs == current_monitor_) {
                    target_adapter = adapter;
                    target_output = output;
                    break;
                }
                ++seen_outputs;
            }
        }
    }

    if (!target_adapter || !target_output) {
        return false;
    }

    D3D_FEATURE_LEVEL feature_levels[] = {
        D3D_FEATURE_LEVEL_11_1,
        D3D_FEATURE_LEVEL_11_0,
        D3D_FEATURE_LEVEL_10_1,
        D3D_FEATURE_LEVEL_10_0,
    };
    D3D_FEATURE_LEVEL selected_level = D3D_FEATURE_LEVEL_11_0;

    HRESULT hr = D3D11CreateDevice(
        target_adapter.Get(),
        D3D_DRIVER_TYPE_UNKNOWN,
        nullptr,
        D3D11_CREATE_DEVICE_BGRA_SUPPORT,
        feature_levels,
        ARRAYSIZE(feature_levels),
        D3D11_SDK_VERSION,
        d3d_device_.GetAddressOf(),
        &selected_level,
        d3d_context_.GetAddressOf()
    );
    if (FAILED(hr)) {
        return false;
    }

    Microsoft::WRL::ComPtr<IDXGIOutput1> output1;
    if (FAILED(target_output.As(&output1))) {
        return false;
    }

    hr = output1->DuplicateOutput(d3d_device_.Get(), desk_dupl_.GetAddressOf());
    if (FAILED(hr)) {
        // Common on Session 0, RDP virtual display, or UAC secure desktop; GDI fallback will be used
        return false;
    }

    DXGI_OUTDUPL_DESC dupl_desc{};
    desk_dupl_->GetDesc(&dupl_desc);
    output_width_ = static_cast<int>(dupl_desc.ModeDesc.Width);
    output_height_ = static_cast<int>(dupl_desc.ModeDesc.Height);
    switch (dupl_desc.Rotation) {
        case DXGI_MODE_ROTATION_ROTATE90: rotation_degrees_ = 90; break;
        case DXGI_MODE_ROTATION_ROTATE180: rotation_degrees_ = 180; break;
        case DXGI_MODE_ROTATION_ROTATE270: rotation_degrees_ = 270; break;
        default: rotation_degrees_ = 0; break;
    }

    initialized_ = true;
    return true;
}

bool DxgiDesktopCapturer::CaptureViaGdiFallbackLocked(int monitor_index, CapturedFrame& out_frame) {
    auto monitors = EnumerateMonitors();
    MonitorDescriptor mon = monitors[0];
    if (monitor_index >= 0 && monitor_index < static_cast<int>(monitors.size())) {
        mon = monitors[static_cast<size_t>(monitor_index)];
    }

    int width = (mon.width > 0 ? mon.width : 1920) & ~1;
    int height = (mon.height > 0 ? mon.height : 1080) & ~1;

    HDC screen_dc = GetDC(nullptr);
    if (!screen_dc) return false;
    HDC mem_dc = CreateCompatibleDC(screen_dc);
    HBITMAP bmp = CreateCompatibleBitmap(screen_dc, width, height);
    HGDIOBJ old_obj = SelectObject(mem_dc, bmp);

    BOOL blt_ok = BitBlt(mem_dc, 0, 0, width, height, screen_dc, mon.left, mon.top, SRCCOPY | CAPTUREBLT);

    BITMAPINFOHEADER bi{};
    bi.biSize = sizeof(BITMAPINFOHEADER);
    bi.biWidth = width;
    bi.biHeight = -height; // Top-down
    bi.biPlanes = 1;
    bi.biBitCount = 32;
    bi.biCompression = BI_RGB;

    out_frame.width = width;
    out_frame.height = height;
    out_frame.stride = width * 4;
    out_frame.monitor_index = monitor_index;
    out_frame.from_dxgi = false;
    out_frame.bgra_pixels.resize(static_cast<size_t>(width) * static_cast<size_t>(height) * 4);

    if (bmp) {
        GetDIBits(mem_dc, bmp, 0, static_cast<UINT>(height), out_frame.bgra_pixels.data(),
                  reinterpret_cast<BITMAPINFO*>(&bi), DIB_RGB_COLORS);
    }

    CURSORINFO ci{};
    ci.cbSize = sizeof(CURSORINFO);
    if (GetCursorInfo(&ci)) {
        out_frame.cursor_visible = (ci.flags == CURSOR_SHOWING);
        out_frame.cursor_x = ci.ptScreenPos.x - mon.left;
        out_frame.cursor_y = ci.ptScreenPos.y - mon.top;
    }

    SelectObject(mem_dc, old_obj);
    DeleteObject(bmp);
    DeleteDC(mem_dc);
    ReleaseDC(nullptr, screen_dc);

    out_frame.valid = (bmp != nullptr);
    return out_frame.valid;
}

bool DxgiDesktopCapturer::CaptureNextFrame(CapturedFrame& out_frame, int timeout_ms, bool copy_to_cpu) {
    auto t0 = std::chrono::steady_clock::now();
    std::lock_guard<std::mutex> lock(mutex_);

    out_frame = CapturedFrame{};
    out_frame.monitor_index = current_monitor_;
    out_frame.secure_desktop_detected = IsSecureDesktopActive();
    out_frame.timestamp_us = static_cast<uint64_t>(
        std::chrono::duration_cast<std::chrono::microseconds>(
            std::chrono::system_clock::now().time_since_epoch()
        ).count()
    );

    if (!initialized_ || !desk_dupl_) {
        InitDuplicationLocked(current_monitor_);
    }

    if (initialized_ && desk_dupl_) {
        DXGI_OUTDUPL_FRAME_INFO frame_info{};
        Microsoft::WRL::ComPtr<IDXGIResource> desktop_resource;
        HRESULT hr = desk_dupl_->AcquireNextFrame(static_cast<UINT>(timeout_ms), &frame_info, desktop_resource.GetAddressOf());

        if (hr == DXGI_ERROR_ACCESS_LOST || hr == DXGI_ERROR_DEVICE_REMOVED || hr == DXGI_ERROR_MODE_CHANGE_IN_PROGRESS) {
            // Display resolution changed, session switched, or GPU driver reset -> recover duplication
            InitDuplicationLocked(current_monitor_);
            if (initialized_ && desk_dupl_) {
                hr = desk_dupl_->AcquireNextFrame(static_cast<UINT>(timeout_ms), &frame_info, desktop_resource.GetAddressOf());
            }
        }

        if (hr == DXGI_ERROR_WAIT_TIMEOUT && !last_bgra_frame_.empty()) {
            // No screen pixels changed since previous frame -> reuse cached GPU/CPU frame (0 dirty rects)
            out_frame.valid = true;
            out_frame.from_dxgi = true;
            out_frame.width = output_width_;
            out_frame.height = output_height_;
            out_frame.stride = output_width_ * 4;
            if (copy_to_cpu) {
                out_frame.bgra_pixels = last_bgra_frame_;
            }
            auto t1 = std::chrono::steady_clock::now();
            out_frame.capture_time_ms = std::chrono::duration<double, std::milli>(t1 - t0).count();
            return true;
        }

        if (SUCCEEDED(hr) && desktop_resource) {
            out_frame.cursor_visible = frame_info.PointerPosition.Visible != FALSE;
            out_frame.cursor_x = frame_info.PointerPosition.Position.x;
            out_frame.cursor_y = frame_info.PointerPosition.Position.y;

            // Read dirty & move rectangles if metadata present
            if (frame_info.TotalMetadataBufferSize > 0) {
                std::vector<uint8_t> meta_buf(frame_info.TotalMetadataBufferSize);
                UINT buf_size = frame_info.TotalMetadataBufferSize;
                if (SUCCEEDED(desk_dupl_->GetFrameMoveRects(buf_size, reinterpret_cast<DXGI_OUTDUPL_MOVE_RECT*>(meta_buf.data()), &buf_size))) {
                    out_frame.move_rect_count = static_cast<int>(buf_size / sizeof(DXGI_OUTDUPL_MOVE_RECT));
                }
                buf_size = frame_info.TotalMetadataBufferSize;
                if (SUCCEEDED(desk_dupl_->GetFrameDirtyRects(buf_size, reinterpret_cast<RECT*>(meta_buf.data()), &buf_size))) {
                    size_t rect_count = buf_size / sizeof(RECT);
                    const RECT* rects = reinterpret_cast<const RECT*>(meta_buf.data());
                    out_frame.dirty_rects.reserve(rect_count);
                    for (size_t i = 0; i < rect_count; ++i) {
                        out_frame.dirty_rects.push_back(DirtyRect{
                            rects[i].left, rects[i].top, rects[i].right, rects[i].bottom
                        });
                    }
                }
            }

            Microsoft::WRL::ComPtr<ID3D11Texture2D> acquired_tex;
            if (SUCCEEDED(desktop_resource.As(&acquired_tex))) {
                D3D11_TEXTURE2D_DESC tex_desc{};
                acquired_tex->GetDesc(&tex_desc);
                output_width_ = static_cast<int>(tex_desc.Width);
                output_height_ = static_cast<int>(tex_desc.Height);

                out_frame.width = output_width_;
                out_frame.height = output_height_;
                out_frame.stride = output_width_ * 4;
                out_frame.from_dxgi = true;
                out_frame.gpu_texture = acquired_tex;

                if (copy_to_cpu) {
                    if (!staging_texture_) {
                        D3D11_TEXTURE2D_DESC stage_desc = tex_desc;
                        stage_desc.Usage = D3D11_USAGE_STAGING;
                        stage_desc.BindFlags = 0;
                        stage_desc.CPUAccessFlags = D3D11_CPU_ACCESS_READ;
                        stage_desc.MiscFlags = 0;
                        d3d_device_->CreateTexture2D(&stage_desc, nullptr, staging_texture_.GetAddressOf());
                    }
                    if (staging_texture_) {
                        d3d_context_->CopyResource(staging_texture_.Get(), acquired_tex.Get());
                        D3D11_MAPPED_SUBRESOURCE mapped{};
                        if (SUCCEEDED(d3d_context_->Map(staging_texture_.Get(), 0, D3D11_MAP_READ, 0, &mapped))) {
                            size_t row_bytes = static_cast<size_t>(output_width_) * 4;
                            out_frame.bgra_pixels.resize(row_bytes * static_cast<size_t>(output_height_));
                            const uint8_t* src = static_cast<const uint8_t*>(mapped.pData);
                            uint8_t* dst = out_frame.bgra_pixels.data();
                            for (int y = 0; y < output_height_; ++y) {
                                std::memcpy(dst + static_cast<size_t>(y) * row_bytes,
                                            src + static_cast<size_t>(y) * mapped.RowPitch,
                                            row_bytes);
                            }
                            d3d_context_->Unmap(staging_texture_.Get(), 0);
                            last_bgra_frame_ = out_frame.bgra_pixels;
                            out_frame.valid = true;
                        }
                    }
                } else {
                    out_frame.valid = true;
                }
            }
            desk_dupl_->ReleaseFrame();
            if (out_frame.valid) {
                auto t1 = std::chrono::steady_clock::now();
                out_frame.capture_time_ms = std::chrono::duration<double, std::milli>(t1 - t0).count();
                return true;
            }
        }
    }

    // Fallback to fast Win32 GDI capture (e.g., RDP virtual session or Session 0 test environment)
    bool ok = CaptureViaGdiFallbackLocked(current_monitor_, out_frame);
    auto t1 = std::chrono::steady_clock::now();
    out_frame.capture_time_ms = std::chrono::duration<double, std::milli>(t1 - t0).count();
    return ok;
}

bool DxgiDesktopCapturer::CaptureWindow(HWND hwnd, CapturedFrame& out_frame) const {
    auto t0 = std::chrono::steady_clock::now();
    out_frame = CapturedFrame{};
    if (!hwnd || !IsWindow(hwnd)) {
        return false;
    }

    RECT rc{};
    if (!GetWindowRect(hwnd, &rc)) {
        return false;
    }
    int width = (rc.right - rc.left) & ~1;
    int height = (rc.bottom - rc.top) & ~1;
    if (width <= 0 || height <= 0) {
        return false;
    }

    HDC win_dc = GetWindowDC(hwnd);
    if (!win_dc) return false;
    HDC mem_dc = CreateCompatibleDC(win_dc);
    HBITMAP bmp = CreateCompatibleBitmap(win_dc, width, height);
    HGDIOBJ old_obj = SelectObject(mem_dc, bmp);

    // PW_RENDERFULLCONTENT (0x00000002) renders DirectComposition / WGC / DWM hardware surfaces
    BOOL printed = PrintWindow(hwnd, mem_dc, 0x00000002);
    if (!printed) {
        BitBlt(mem_dc, 0, 0, width, height, win_dc, 0, 0, SRCCOPY);
    }

    BITMAPINFOHEADER bi{};
    bi.biSize = sizeof(BITMAPINFOHEADER);
    bi.biWidth = width;
    bi.biHeight = -height; // Top-down
    bi.biPlanes = 1;
    bi.biBitCount = 32;
    bi.biCompression = BI_RGB;

    out_frame.width = width;
    out_frame.height = height;
    out_frame.stride = width * 4;
    out_frame.from_dxgi = false;
    out_frame.bgra_pixels.resize(static_cast<size_t>(width) * static_cast<size_t>(height) * 4);

    if (bmp) {
        GetDIBits(mem_dc, bmp, 0, static_cast<UINT>(height), out_frame.bgra_pixels.data(),
                  reinterpret_cast<BITMAPINFO*>(&bi), DIB_RGB_COLORS);
    }

    SelectObject(mem_dc, old_obj);
    DeleteObject(bmp);
    DeleteDC(mem_dc);
    ReleaseDC(hwnd, win_dc);

    auto t1 = std::chrono::steady_clock::now();
    out_frame.capture_time_ms = std::chrono::duration<double, std::milli>(t1 - t0).count();
    out_frame.valid = (bmp != nullptr);
    return out_frame.valid;
}

} // namespace capture
} // namespace aibridge
