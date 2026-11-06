#pragma once

#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>

#include <cstdint>
#include <string>
#include <vector>

namespace aibridge {
namespace security {

inline constexpr const wchar_t* kDefaultNamedPipePath = L"\\\\.\\pipe\\AIBridgeDesktopPipe";

// Encrypts and decrypts local device enrollment tokens/secrets via Windows DPAPI (CryptProtectData)
class DpapiSecretStore {
public:
    static bool ProtectSecret(const std::string& plaintext, std::vector<uint8_t>& out_encrypted, bool machine_scope = false);
    static bool UnprotectSecret(const std::vector<uint8_t>& encrypted, std::string& out_plaintext);
};

// Creates and validates a Named Pipe with restricted ACLs (LocalSystem, Administrators, Authenticated Interactive User)
class SecureNamedPipe {
public:
    static HANDLE CreateRestrictedServerPipe(const wchar_t* pipe_name = kDefaultNamedPipePath);
    static HANDLE ConnectClientPipe(const wchar_t* pipe_name = kDefaultNamedPipePath, DWORD timeout_ms = 2000);

    static bool SendAuthenticatedMessage(HANDLE pipe, const std::string& msg_type, const std::string& json_payload, const std::string& shared_secret);
    static bool ReadAuthenticatedMessage(HANDLE pipe, std::string& out_msg_type, std::string& out_json_payload, const std::string& shared_secret);

    static std::string ComputeTag(const std::string& msg_type, const std::string& payload, const std::string& secret);
};

} // namespace security
} // namespace aibridge
