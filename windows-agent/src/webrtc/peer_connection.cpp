#include "peer_connection.hpp"
#include "../input/sendinput_controller.hpp"

#include <atomic>
#include <chrono>
#include <cstring>
#include <future>
#include <iostream>
#include <memory>
#include <mutex>
#include <string>
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

std::string ExtractJsonStr(const std::string& json, const std::string& key) {
    std::string needle = "\"" + key + "\"";
    size_t pos = json.find(needle);
    if (pos == std::string::npos) return {};
    pos = json.find(':', pos + needle.size());
    if (pos == std::string::npos) return {};
    pos = json.find('"', pos + 1);
    if (pos == std::string::npos) return {};
    ++pos;
    std::string out;
    while (pos < json.size()) {
        char c = json[pos++];
        if (c == '\\' && pos < json.size()) {
            out.push_back(json[pos++]);
            continue;
        }
        if (c == '"') break;
        out.push_back(c);
    }
    return out;
}

double ExtractJsonNum(const std::string& json, const std::string& key, double fallback = 0.0) {
    std::string needle = "\"" + key + "\"";
    size_t pos = json.find(needle);
    if (pos == std::string::npos) return fallback;
    pos = json.find(':', pos + needle.size());
    if (pos == std::string::npos) return fallback;
    ++pos;
    while (pos < json.size() && (json[pos] == ' ' || json[pos] == '\t')) ++pos;
    try {
        return std::stod(json.substr(pos));
    } catch (...) {
        return fallback;
    }
}

class LibDataChannelSession : public PeerConnectionSession {
public:
    explicit LibDataChannelSession(PeerConnectionConfig cfg) : cfg_(std::move(cfg)) {}

    PeerBackend Backend() const override { return PeerBackend::LibDataChannel; }
    std::string IceState() const override {
        std::lock_guard<std::mutex> lock(state_mutex_);
        return ice_state_;
    }
    uint64_t FramesSent() const override { return frames_sent_.load(); }

    bool RunUntilStopped(std::atomic<bool>* stop_flag, std::string* error_out) override {
        HttpSignalingClient signaling(cfg_.control_url, cfg_.device_token, cfg_.session_id);
        rtc::Configuration rtc_cfg;
        rtc_cfg.iceServers.emplace_back("stun:stun.l.google.com:19302");

        aibridge::input::WindowsInputController input_ctrl;
        input_ctrl.SetPermissions(aibridge::input::SessionInputPermissions{true, true, false, true});

        auto pc = std::make_shared<rtc::PeerConnection>(rtc_cfg);
        pc->onStateChange([this, &input_ctrl](rtc::PeerConnection::State state) {
            {
                std::lock_guard<std::mutex> lock(state_mutex_);
                ice_state_ = std::to_string(static_cast<int>(state));
            }
            if (state == rtc::PeerConnection::State::Disconnected ||
                state == rtc::PeerConnection::State::Failed ||
                state == rtc::PeerConnection::State::Closed) {
                input_ctrl.ReleaseAllHeldKeys();
            }
        });
        pc->onLocalCandidate([&signaling](rtc::Candidate cand) {
            IceCandidateJson j;
            j.candidate = std::string(cand);
            j.sdp_mid = cand.mid();
            j.sdp_mline_index = 0;
            signaling.PostCandidate(j, nullptr);
        });

        // Create the local offer, then post it to the plane (same contract as Python HttpSignaling).
        std::string err;
        std::string local_sdp;
        std::promise<void> local_ready;
        auto local_future = local_ready.get_future();
        pc->onLocalDescription([&](rtc::Description desc) {
            local_sdp = std::string(desc);
            try {
                local_ready.set_value();
            } catch (...) {
            }
        });

        auto video = rtc::Description::Video("video", rtc::Description::Direction::SendOnly);
        video.addH264Codec(96);
        auto track = pc->addTrack(std::move(video));

        // Same contract as Python webrtc_stream: agent-offerred "input" datachannel.
        auto input_dc = pc->createDataChannel("input");
        input_dc->onClosed([&input_ctrl]() {
            input_ctrl.ReleaseAllHeldKeys();
        });
        input_dc->onMessage([input_dc, &input_ctrl](rtc::message_variant msg) {
            std::string text;
            if (std::holds_alternative<std::string>(msg)) {
                text = std::get<std::string>(msg);
            } else if (std::holds_alternative<rtc::binary>(msg)) {
                const auto& bin = std::get<rtc::binary>(msg);
                text.assign(reinterpret_cast<const char*>(bin.data()), bin.size());
            }
            std::string mtype = ExtractJsonStr(text, "type");
            if (mtype.empty()) mtype = ExtractJsonStr(text, "action");
            if (mtype == "ping" || (mtype.empty() && text.find("ping") != std::string::npos)) {
                try {
                    input_dc->send(std::string("{\"type\":\"pong\",\"action\":\"pong\"}"));
                } catch (...) {
                }
                return;
            }
            if (mtype == "mouse_move") {
                double x = ExtractJsonNum(text, "x", 0.5);
                double y = ExtractJsonNum(text, "y", 0.5);
                input_ctrl.MoveMouse(x, y, true);
            } else if (mtype == "mouse_down" || mtype == "mouse_up" || mtype == "click") {
                double x = ExtractJsonNum(text, "x", 0.5);
                double y = ExtractJsonNum(text, "y", 0.5);
                std::string btn = ExtractJsonStr(text, "button");
                if (btn.empty()) btn = "left";
                if (mtype == "click") {
                    input_ctrl.MouseButton(btn, "down", x, y, true);
                    input_ctrl.MouseButton(btn, "up", x, y, true);
                } else {
                    input_ctrl.MouseButton(btn, mtype == "mouse_down" ? "down" : "up", x, y, true);
                }
            } else if (mtype == "scroll") {
                int dy = static_cast<int>(ExtractJsonNum(text, "delta_y", 0.0));
                int dx = static_cast<int>(ExtractJsonNum(text, "delta_x", 0.0));
                input_ctrl.MouseScroll(dy, dx);
            } else if (mtype == "key_down" || mtype == "key_up") {
                std::string key = ExtractJsonStr(text, "key");
                if (!key.empty()) {
                    input_ctrl.KeyTokenEvent(key, mtype == "key_down" ? "down" : "up");
                }
            } else if (mtype == "type") {
                std::string chars = ExtractJsonStr(text, "text");
                if (!chars.empty()) {
                    int wlen = MultiByteToWideChar(CP_UTF8, 0, chars.data(), static_cast<int>(chars.size()), nullptr, 0);
                    if (wlen > 0) {
                        std::wstring wtext(wlen, L'\0');
                        MultiByteToWideChar(CP_UTF8, 0, chars.data(), static_cast<int>(chars.size()), wtext.data(), wlen);
                        input_ctrl.TypeUnicodeText(wtext);
                    }
                }
            }
        });

        pc->setLocalDescription();

        if (local_future.wait_for(std::chrono::seconds(5)) != std::future_status::ready || local_sdp.empty()) {
            if (error_out) *error_out = "local_description_timeout";
            return false;
        }
        if (!signaling.PostOffer(local_sdp, "offer", &err)) {
            if (error_out) *error_out = err;
            return false;
        }
        // Visible progress for harnesses that scrape stdout before ICE completes.
        std::cout << "{\"event\":\"offer_posted\",\"backend\":\"libdatachannel\",\"sdp_bytes\":"
                  << local_sdp.size() << "}" << std::endl;

        NativeWebRtcPipeline pipeline;
        pipeline.StartSession(cfg_.session_id, cfg_.monitor_index, cfg_.width, cfg_.height, cfg_.fps, cfg_.bitrate_kbps);

        bool answer_applied = false;
        while (stop_flag == nullptr || !stop_flag->load()) {
            auto snap = signaling.PollSession(nullptr);
            if (snap && !answer_applied && !snap->answer_sdp.empty()) {
                try {
                    // Reject truncated/empty-looking answers before libdatachannel throws.
                    if (snap->answer_sdp.find("ice-ufrag") == std::string::npos) {
                        if (error_out) *error_out = "answer_missing_ice_ufrag";
                        pipeline.StopSession();
                        return false;
                    }
                    pc->setRemoteDescription(
                        rtc::Description(snap->answer_sdp, snap->answer_type.empty() ? "answer" : snap->answer_type)
                    );
                    answer_applied = true;
                    std::cout << "{\"event\":\"answer_applied\",\"sdp_bytes\":" << snap->answer_sdp.size()
                              << "}" << std::endl;
                } catch (const std::exception& ex) {
                    if (error_out) *error_out = ex.what();
                    pipeline.StopSession();
                    return false;
                }
            }

            capture::CapturedFrame raw;
            encoder::EncodedAccessUnit au;
            if (pipeline.StepCaptureAndEncode(raw, au) && au.valid && track) {
                try {
                    // Count encoded frames even before ICE opens the track; send when open.
                    frames_sent_.fetch_add(1);
                    if (track->isOpen() && !au.annexb_nal_bytes.empty()) {
                        rtc::binary payload(au.annexb_nal_bytes.size());
                        std::memcpy(
                            payload.data(),
                            au.annexb_nal_bytes.data(),
                            au.annexb_nal_bytes.size()
                        );
                        track->send(std::move(payload));
                    }
                } catch (...) {
                }
            }
            int sleep_ms = 1000 / (cfg_.fps > 0 ? cfg_.fps : 30);
            std::this_thread::sleep_for(std::chrono::milliseconds(sleep_ms > 0 ? sleep_ms : 1));
        }
        input_ctrl.ReleaseAllHeldKeys();
        pipeline.StopSession();
        return true;
    }

private:
    PeerConnectionConfig cfg_;
    mutable std::mutex state_mutex_;
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
