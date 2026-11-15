#include "http_signaling.hpp"

#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>
#include <winhttp.h>

#include <sstream>

#pragma comment(lib, "winhttp.lib")

namespace aibridge {
namespace webrtc {
namespace {

std::wstring Widen(const std::string& s) {
    if (s.empty()) return L"";
    int n = MultiByteToWideChar(CP_UTF8, 0, s.c_str(), -1, nullptr, 0);
    std::wstring out(n > 0 ? n - 1 : 0, L'\0');
    if (n > 1) MultiByteToWideChar(CP_UTF8, 0, s.c_str(), -1, out.data(), n);
    return out;
}

std::string Narrow(const std::wstring& s) {
    if (s.empty()) return "";
    int n = WideCharToMultiByte(CP_UTF8, 0, s.c_str(), -1, nullptr, 0, nullptr, nullptr);
    std::string out(n > 0 ? n - 1 : 0, '\0');
    if (n > 1) WideCharToMultiByte(CP_UTF8, 0, s.c_str(), -1, out.data(), n, nullptr, nullptr);
    return out;
}

bool ParseUrl(const std::string& url, bool* https, std::wstring* host, INTERNET_PORT* port, std::wstring* path) {
    URL_COMPONENTS uc{};
    uc.dwStructSize = sizeof(uc);
    wchar_t host_buf[256]{};
    wchar_t path_buf[1024]{};
    uc.lpszHostName = host_buf;
    uc.dwHostNameLength = 256;
    uc.lpszUrlPath = path_buf;
    uc.dwUrlPathLength = 1024;
    std::wstring wurl = Widen(url);
    if (!WinHttpCrackUrl(wurl.c_str(), 0, 0, &uc)) return false;
    *https = uc.nScheme == INTERNET_SCHEME_HTTPS;
    *host = host_buf;
    *port = uc.nPort;
    *path = path_buf;
    return true;
}

std::string EscapeJson(const std::string& in) {
    std::string out;
    out.reserve(in.size() + 8);
    for (unsigned char c : in) {
        switch (c) {
            case '\\': out += "\\\\"; break;
            case '"': out += "\\\""; break;
            case '\b': out += "\\b"; break;
            case '\f': out += "\\f"; break;
            case '\n': out += "\\n"; break;
            case '\r': out += "\\r"; break;
            case '\t': out += "\\t"; break;
            default:
                if (c < 0x20) {
                    char buf[7];
                    std::snprintf(buf, sizeof(buf), "\\u%04x", static_cast<unsigned int>(c));
                    out += buf;
                } else {
                    out.push_back(static_cast<char>(c));
                }
                break;
        }
    }
    return out;
}

std::string JsonGetString(const std::string& json, const std::string& key) {
    // Locate `"key": "..."` and unescape JSON string escapes so SDP newlines
    // (a=ice-ufrag / a=ice-pwd) survive into libdatachannel.
    const std::string needle = "\"" + key + "\"";
    size_t search = 0;
    while (search < json.size()) {
        auto pos = json.find(needle, search);
        if (pos == std::string::npos) return "";
        size_t after = pos + needle.size();
        while (after < json.size() && (json[after] == ' ' || json[after] == '\t')) ++after;
        if (after >= json.size() || json[after] != ':') {
            search = pos + 1;
            continue;
        }
        ++after;
        while (after < json.size() && (json[after] == ' ' || json[after] == '\t' || json[after] == '\n' || json[after] == '\r')) {
            ++after;
        }
        if (after >= json.size() || json[after] != '"') return "";
        ++after;
        std::string out;
        out.reserve(256);
        while (after < json.size()) {
            char c = json[after++];
            if (c == '"') return out;
            if (c == '\\' && after < json.size()) {
                char e = json[after++];
                switch (e) {
                    case 'n': out.push_back('\n'); break;
                    case 'r': out.push_back('\r'); break;
                    case 't': out.push_back('\t'); break;
                    case '"': out.push_back('"'); break;
                    case '\\': out.push_back('\\'); break;
                    case '/': out.push_back('/'); break;
                    case 'u':
                        if (after + 4 <= json.size()) after += 4;
                        break;
                    default: out.push_back(e); break;
                }
            } else {
                out.push_back(c);
            }
        }
        return out;
    }
    return "";
}

} // namespace

HttpSignalingClient::HttpSignalingClient(std::string control_url, std::string device_token, std::string session_id)
    : control_url_(std::move(control_url)),
      device_token_(std::move(device_token)),
      session_id_(std::move(session_id)) {
    while (!control_url_.empty() && (control_url_.back() == '/' || control_url_.back() == '\\')) {
        control_url_.pop_back();
    }
}

bool HttpSignalingClient::RequestJson(
    const std::string& method,
    const std::string& path,
    const std::string& body_json,
    std::string* response_body,
    std::string* error_out
) {
    bool https = false;
    std::wstring host, url_path;
    INTERNET_PORT port = 0;
    if (!ParseUrl(control_url_, &https, &host, &port, &url_path)) {
        if (error_out) *error_out = "invalid control_url";
        return false;
    }
    std::wstring full_path = url_path;
    if (!full_path.empty() && full_path.back() == L'/') full_path.pop_back();
    full_path += Widen(path);

    HINTERNET session = WinHttpOpen(L"AIBridgeNativeAgent/1.0", WINHTTP_ACCESS_TYPE_DEFAULT_PROXY,
                                    WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
    if (!session) {
        if (error_out) *error_out = "WinHttpOpen failed";
        return false;
    }
    HINTERNET connect = WinHttpConnect(session, host.c_str(), port, 0);
    if (!connect) {
        WinHttpCloseHandle(session);
        if (error_out) *error_out = "WinHttpConnect failed";
        return false;
    }
    DWORD flags = https ? WINHTTP_FLAG_SECURE : 0;
    HINTERNET request = WinHttpOpenRequest(connect, Widen(method).c_str(), full_path.c_str(),
                                           nullptr, WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES, flags);
    if (!request) {
        WinHttpCloseHandle(connect);
        WinHttpCloseHandle(session);
        if (error_out) *error_out = "WinHttpOpenRequest failed";
        return false;
    }

    std::wstring headers = L"Content-Type: application/json\r\nX-Device-Token: " + Widen(device_token_);
    BOOL ok = FALSE;
    if (body_json.empty()) {
        ok = WinHttpSendRequest(request, headers.c_str(), static_cast<DWORD>(-1),
                                WINHTTP_NO_REQUEST_DATA, 0, 0, 0);
    } else {
        ok = WinHttpSendRequest(
            request,
            headers.c_str(),
            static_cast<DWORD>(-1),
            (LPVOID)body_json.data(),
            static_cast<DWORD>(body_json.size()),
            static_cast<DWORD>(body_json.size()),
            0
        );
    }
    if (!ok || !WinHttpReceiveResponse(request, nullptr)) {
        WinHttpCloseHandle(request);
        WinHttpCloseHandle(connect);
        WinHttpCloseHandle(session);
        if (error_out) *error_out = "WinHttp send/receive failed";
        return false;
    }

    DWORD status = 0;
    DWORD status_size = sizeof(status);
    WinHttpQueryHeaders(request, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
                        WINHTTP_HEADER_NAME_BY_INDEX, &status, &status_size, WINHTTP_NO_HEADER_INDEX);

    std::string body;
    for (;;) {
        DWORD avail = 0;
        if (!WinHttpQueryDataAvailable(request, &avail) || avail == 0) break;
        std::string chunk(avail, '\0');
        DWORD read = 0;
        if (!WinHttpReadData(request, chunk.data(), avail, &read)) break;
        chunk.resize(read);
        body.append(chunk);
    }

    WinHttpCloseHandle(request);
    WinHttpCloseHandle(connect);
    WinHttpCloseHandle(session);

    if (response_body) *response_body = body;
    if (status < 200 || status >= 300) {
        if (error_out) *error_out = "HTTP " + std::to_string(status) + ": " + body.substr(0, 200);
        return false;
    }
    return true;
}

bool HttpSignalingClient::PostOffer(const std::string& sdp, const std::string& type, std::string* error_out) {
    std::ostringstream oss;
    oss << "{\"sdp\":\"" << EscapeJson(sdp) << "\",\"type\":\"" << EscapeJson(type) << "\"}";
    std::string resp;
    return RequestJson("POST", "/api/agent/webrtc/" + session_id_ + "/offer", oss.str(), &resp, error_out);
}

bool HttpSignalingClient::PostCandidate(const IceCandidateJson& candidate, std::string* error_out) {
    std::ostringstream oss;
    oss << "{\"from\":\"agent\",\"candidate\":{\"candidate\":\"" << EscapeJson(candidate.candidate)
        << "\",\"sdpMid\":\"" << EscapeJson(candidate.sdp_mid)
        << "\",\"sdpMLineIndex\":" << candidate.sdp_mline_index << "}}";
    std::string resp;
    return RequestJson("POST", "/api/agent/webrtc/" + session_id_ + "/candidates", oss.str(), &resp, error_out);
}

bool HttpSignalingClient::PostError(const std::string& message) {
    std::ostringstream oss;
    oss << "{\"error\":\"" << EscapeJson(message) << "\"}";
    std::string resp, err;
    return RequestJson("POST", "/api/agent/webrtc/" + session_id_ + "/error", oss.str(), &resp, &err);
}

std::optional<SessionSnapshot> HttpSignalingClient::PollSession(std::string* error_out) {
    std::string resp;
    if (!RequestJson("GET", "/api/agent/webrtc/" + session_id_, "", &resp, error_out)) {
        return std::nullopt;
    }
    SessionSnapshot snap;
    snap.status = JsonGetString(resp, "status");
    snap.error = JsonGetString(resp, "error");
    // Nested answer.sdp — best-effort parse
    auto answer_pos = resp.find("\"answer\"");
    if (answer_pos != std::string::npos) {
        auto sub = resp.substr(answer_pos);
        snap.answer_sdp = JsonGetString(sub, "sdp");
        snap.answer_type = JsonGetString(sub, "type");
        if (snap.answer_type.empty()) snap.answer_type = "answer";
    }
    return snap;
}

} // namespace webrtc
} // namespace aibridge
