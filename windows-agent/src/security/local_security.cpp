#include "local_security.hpp"

#include <wincrypt.h>
#include <sddl.h>

#include <cstring>
#include <sstream>
#include <iomanip>

#pragma comment(lib, "crypt32.lib")
#pragma comment(lib, "advapi32.lib")

namespace aibridge {
namespace security {

bool DpapiSecretStore::ProtectSecret(const std::string& plaintext, std::vector<uint8_t>& out_encrypted, bool machine_scope) {
    DATA_BLOB in_blob{};
    in_blob.pbData = reinterpret_cast<BYTE*>(const_cast<char*>(plaintext.data()));
    in_blob.cbData = static_cast<DWORD>(plaintext.size());

    DATA_BLOB out_blob{};
    DWORD flags = CRYPTPROTECT_UI_FORBIDDEN | (machine_scope ? CRYPTPROTECT_LOCAL_MACHINE : 0);

    if (!CryptProtectData(&in_blob, L"AIBridgeDeviceSecret", nullptr, nullptr, nullptr, flags, &out_blob)) {
        return false;
    }

    out_encrypted.assign(out_blob.pbData, out_blob.pbData + out_blob.cbData);
    LocalFree(out_blob.pbData);
    return true;
}

bool DpapiSecretStore::UnprotectSecret(const std::vector<uint8_t>& encrypted, std::string& out_plaintext) {
    if (encrypted.empty()) return false;
    DATA_BLOB in_blob{};
    in_blob.pbData = const_cast<BYTE*>(encrypted.data());
    in_blob.cbData = static_cast<DWORD>(encrypted.size());

    DATA_BLOB out_blob{};
    if (!CryptUnprotectData(&in_blob, nullptr, nullptr, nullptr, nullptr, CRYPTPROTECT_UI_FORBIDDEN, &out_blob)) {
        return false;
    }

    out_plaintext.assign(reinterpret_cast<const char*>(out_blob.pbData), out_blob.cbData);
    SecureZeroMemory(out_blob.pbData, out_blob.cbData);
    LocalFree(out_blob.pbData);
    return true;
}

std::string SecureNamedPipe::ComputeTag(const std::string& msg_type, const std::string& payload, const std::string& secret) {
    // FNV-1a / SipHash-style keyed 256-bit digest using Windows CryptoAPI SHA-256
    std::string combined = secret + "|" + msg_type + "|" + payload + "|" + secret;
    HCRYPTPROV hProv = 0;
    HCRYPTHASH hHash = 0;
    std::string hex_out;

    if (CryptAcquireContextW(&hProv, nullptr, nullptr, PROV_RSA_AES, CRYPT_VERIFYCONTEXT)) {
        if (CryptCreateHash(hProv, CALG_SHA_256, 0, 0, &hHash)) {
            if (CryptHashData(hHash, reinterpret_cast<const BYTE*>(combined.data()), static_cast<DWORD>(combined.size()), 0)) {
                BYTE hash[32] = {0};
                DWORD hash_len = sizeof(hash);
                if (CryptGetHashParam(hHash, HP_HASHVAL, hash, &hash_len, 0)) {
                    std::ostringstream oss;
                    for (DWORD i = 0; i < hash_len; ++i) {
                        oss << std::hex << std::setw(2) << std::setfill('0') << static_cast<int>(hash[i]);
                    }
                    hex_out = oss.str();
                }
            }
            CryptDestroyHash(hHash);
        }
        CryptReleaseContext(hProv, 0);
    }
    return hex_out;
}

HANDLE SecureNamedPipe::CreateRestrictedServerPipe(const wchar_t* pipe_name) {
    SECURITY_ATTRIBUTES sa{};
    sa.nLength = sizeof(SECURITY_ATTRIBUTES);
    sa.bInheritHandle = FALSE;

    // SDDL: Allow Generic All to LocalSystem (SY) and Built-in Admins (BA), and Generic Read/Write to Authenticated Users (AU)
    PSECURITY_DESCRIPTOR pSD = nullptr;
    const wchar_t* sddl = L"D:(A;;GA;;;SY)(A;;GA;;;BA)(A;;GRGW;;;AU)";
    if (ConvertStringSecurityDescriptorToSecurityDescriptorW(sddl, SDDL_REVISION_1, &pSD, nullptr)) {
        sa.lpSecurityDescriptor = pSD;
    }

    HANDLE hPipe = CreateNamedPipeW(
        pipe_name,
        PIPE_ACCESS_DUPLEX,
        PIPE_TYPE_MESSAGE | PIPE_READMODE_MESSAGE | PIPE_WAIT | PIPE_REJECT_REMOTE_CLIENTS,
        PIPE_UNLIMITED_INSTANCES,
        65536,
        65536,
        1000,
        pSD ? &sa : nullptr
    );

    if (pSD) {
        LocalFree(pSD);
    }
    return hPipe;
}

HANDLE SecureNamedPipe::ConnectClientPipe(const wchar_t* pipe_name, DWORD timeout_ms) {
    if (!WaitNamedPipeW(pipe_name, timeout_ms)) {
        return INVALID_HANDLE_VALUE;
    }
    HANDLE hPipe = CreateFileW(
        pipe_name,
        GENERIC_READ | GENERIC_WRITE,
        0,
        nullptr,
        OPEN_EXISTING,
        0,
        nullptr
    );
    if (hPipe != INVALID_HANDLE_VALUE) {
        DWORD mode = PIPE_READMODE_MESSAGE;
        SetNamedPipeHandleState(hPipe, &mode, nullptr, nullptr);
    }
    return hPipe;
}

bool SecureNamedPipe::SendAuthenticatedMessage(
    HANDLE pipe,
    const std::string& msg_type,
    const std::string& json_payload,
    const std::string& shared_secret
) {
    if (pipe == INVALID_HANDLE_VALUE || msg_type.empty()) return false;
    std::string tag = ComputeTag(msg_type, json_payload, shared_secret);
    std::string wire = msg_type + "\n" + tag + "\n" + json_payload;
    if (wire.size() > 65536) return false;

    DWORD written = 0;
    BOOL ok = WriteFile(pipe, wire.data(), static_cast<DWORD>(wire.size()), &written, nullptr);
    return ok && (written == wire.size());
}

bool SecureNamedPipe::ReadAuthenticatedMessage(
    HANDLE pipe,
    std::string& out_msg_type,
    std::string& out_json_payload,
    const std::string& shared_secret
) {
    if (pipe == INVALID_HANDLE_VALUE) return false;
    std::vector<char> buffer(65536);
    DWORD bytes_read = 0;
    if (!ReadFile(pipe, buffer.data(), static_cast<DWORD>(buffer.size()), &bytes_read, nullptr) || bytes_read == 0) {
        return false;
    }

    std::string wire(buffer.data(), bytes_read);
    size_t first_nl = wire.find('\n');
    if (first_nl == std::string::npos) return false;
    size_t second_nl = wire.find('\n', first_nl + 1);
    if (second_nl == std::string::npos) return false;

    std::string msg_type = wire.substr(0, first_nl);
    std::string recv_tag = wire.substr(first_nl + 1, second_nl - (first_nl + 1));
    std::string payload = wire.substr(second_nl + 1);

    std::string expected_tag = ComputeTag(msg_type, payload, shared_secret);
    if (recv_tag.size() != expected_tag.size() || expected_tag.empty()) {
        return false;
    }

    // Constant-time tag comparison
    unsigned char diff = 0;
    for (size_t i = 0; i < expected_tag.size(); ++i) {
        diff |= static_cast<unsigned char>(recv_tag[i] ^ expected_tag[i]);
    }
    if (diff != 0) {
        return false;
    }

    out_msg_type = msg_type;
    out_json_payload = payload;
    return true;
}

} // namespace security
} // namespace aibridge
