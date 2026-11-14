#include "peer_connection.hpp"

#include <atomic>
#include <chrono>
#include <memory>
#include <thread>

#if defined(AIBRIDGE_WITH_LIBDATACHANNEL)
#include <rtc/rtc.hpp>
#endif

namespace aibridge {
namespace webrtc {

std::string PeerBackendName(PeerBackend b) {
    switch (b) {
        case PeerBackend::LibDataChannel: return "libdatachannel";
        case PeerBackend::LibWebRTC: return "libwebrtc";
        default: return "none";
    }
}

PeerBackend DescribeAvailablePeerBackend() {
#if defined(AIBRIDGE_WITH_LIBWEBRTC)
    return PeerBackend::LibWebRTC;
#elif defined(AIBRIDGE_WITH_LIBDATACHANNEL)
    return PeerBackend::LibDataChannel;
#else
    return PeerBackend::None;
#endif
}

#if defined(AIBRIDGE_WITH_LIBDATACHANNEL)
namespace {

class LibDataChannelSession : public PeerConnectionSession {
public:
    explicit LibDataChannelSession(PeerConnectionConfig cfg) : cfg_(std::move(cfg)) {}

    PeerBackend Backend() const override { return PeerBackend::LibDataChannel; }
    std::string IceState() const override { return ice_state_; }
    uint64_t FramesSent() const override { return frames_sent_.load(); }

    bool RunUntilStopped(std::atomic<bool>* stop_flag, std::string* error_out) override {
        HttpSignalingClient signaling(cfg_.control_url, cfg_.device_token, cfg_.session_id);
        rtc::Configuration rtc_cfg;
        rtc_cfg.iceServers.emplace_back("stun:stun.l.google.com:19302");

        auto pc = std::make_shared<rtc::PeerConnection>(rtc_cfg);
        pc->onStateChange([this](rtc::PeerConnection::State state) {
            ice_state_ = std::string(rtc::to_string(state));
        });
        pc->onLocalCandidate([&signaling](rtc::Candidate cand) {
            IceCandidateJson j;
            j.candidate = std::string(cand);
            j.sdp_mid = cand.mid();
            j.sdp_mline_index = 0;
            signaling.PostCandidate(j, nullptr);
        });

        auto video = rtc::Description::Video("video", rtc::Description::Direction::SendOnly);
        video.addH264Codec(96);
        auto track = pc->addTrack(video);

        pc->setLocalDescription();
        bool posted_offer = false;
        for (int i = 0; i < 50; ++i) {
            auto desc = pc->localDescription();
            if (desc) {
                std::string err;
                if (!signaling.PostOffer(std::string(desc.value()), "offer", &err)) {
                    if (error_out) *error_out = err;
                    return false;
                }
                posted_offer = true;
                break;
            }
            std::this_thread::sleep_for(std::chrono::milliseconds(20));
        }
        if (!posted_offer) {
            if (error_out) *error_out = "local_description_timeout";
            return false;
        }

        NativeWebRtcPipeline pipeline;
        pipeline.StartSession(cfg_.session_id, cfg_.monitor_index, cfg_.width, cfg_.height, cfg_.fps, cfg_.bitrate_kbps);

        bool answer_applied = false;
        while (stop_flag == nullptr || !stop_flag->load()) {
            auto snap = signaling.PollSession(nullptr);
            if (snap && !answer_applied && !snap->answer_sdp.empty()) {
                try {
                    pc->setRemoteDescription(
                        rtc::Description(snap->answer_sdp, snap->answer_type.empty() ? "answer" : snap->answer_type)
                    );
                    answer_applied = true;
                } catch (const std::exception& ex) {
                    if (error_out) *error_out = ex.what();
                    pipeline.StopSession();
                    return false;
                }
            }

            capture::CapturedFrame raw;
            encoder::EncodedAccessUnit au;
            if (pipeline.StepCaptureAndEncode(raw, au) && au.valid && track && track->isOpen()) {
                try {
                    track->send(
                        reinterpret_cast<const std::byte*>(au.annexb_nal_bytes.data()),
                        au.annexb_nal_bytes.size()
                    );
                    frames_sent_.fetch_add(1);
                } catch (...) {
                }
            }
            int sleep_ms = 1000 / (cfg_.fps > 0 ? cfg_.fps : 30);
            std::this_thread::sleep_for(std::chrono::milliseconds(sleep_ms > 0 ? sleep_ms : 1));
        }
        pipeline.StopSession();
        return true;
    }

private:
    PeerConnectionConfig cfg_;
    std::string ice_state_ = "new";
    std::atomic<uint64_t> frames_sent_{0};
};

} // namespace
#endif

std::unique_ptr<PeerConnectionSession> CreatePeerConnectionSession(const PeerConnectionConfig& cfg) {
#if defined(AIBRIDGE_WITH_LIBDATACHANNEL)
    return std::make_unique<LibDataChannelSession>(cfg);
#else
    (void)cfg;
    return nullptr;
#endif
}

} // namespace webrtc
} // namespace aibridge
