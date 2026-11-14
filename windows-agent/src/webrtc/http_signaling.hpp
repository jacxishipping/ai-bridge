#pragma once

#include <optional>
#include <string>
#include <vector>

namespace aibridge {
namespace webrtc {

struct IceCandidateJson {
    std::string candidate;
    std::string sdp_mid;
    int sdp_mline_index = 0;
};

struct SessionSnapshot {
    std::string status;
    std::string error;
    std::string answer_sdp;
    std::string answer_type;
    std::vector<IceCandidateJson> viewer_candidates;
};

// WinHTTP client for /api/agent/webrtc/* (same contract as Python HttpSignaling).
class HttpSignalingClient {
public:
    HttpSignalingClient(std::string control_url, std::string device_token, std::string session_id);

    bool PostOffer(const std::string& sdp, const std::string& type, std::string* error_out = nullptr);
    bool PostCandidate(const IceCandidateJson& candidate, std::string* error_out = nullptr);
    bool PostError(const std::string& message);
    std::optional<SessionSnapshot> PollSession(std::string* error_out = nullptr);

private:
    std::string control_url_;
    std::string device_token_;
    std::string session_id_;

    bool RequestJson(
        const std::string& method,
        const std::string& path,
        const std::string& body_json,
        std::string* response_body,
        std::string* error_out
    );
};

} // namespace webrtc
} // namespace aibridge
