#pragma once

#include "http_signaling.hpp"
#include "webrtc_transport.hpp"

#include <atomic>
#include <memory>
#include <string>

namespace aibridge {
namespace webrtc {

struct PeerConnectionConfig {
    std::string control_url;
    std::string device_token;
    std::string session_id;
    int monitor_index = 0;
    int width = 1280;
    int height = 720;
    int fps = 30;
    int bitrate_kbps = 4500;
};

enum class PeerBackend {
    None,
    LibDataChannel,  // C++ WebRTC (libdatachannel) when AIBRIDGE_WITH_LIBDATACHANNEL=1
    LibWebRTC,       // Google libwebrtc when AIBRIDGE_LIBWEBRTC_ROOT is provided
};

// Factory selects an available C++ WebRTC backend. Returns nullptr if none linked.
std::unique_ptr<class PeerConnectionSession> CreatePeerConnectionSession(const PeerConnectionConfig& cfg);

class PeerConnectionSession {
public:
    virtual ~PeerConnectionSession() = default;
    virtual PeerBackend Backend() const = 0;
    // Runs offer→answer→ICE loop, pumping encoded frames into the RTP sender when connected.
    virtual bool RunUntilStopped(std::atomic<bool>* stop_flag, std::string* error_out) = 0;
    virtual std::string IceState() const = 0;
    virtual uint64_t FramesSent() const = 0;
};

PeerBackend DescribeAvailablePeerBackend();
std::string PeerBackendName(PeerBackend b);

} // namespace webrtc
} // namespace aibridge
