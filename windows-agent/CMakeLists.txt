cmake_minimum_required(VERSION 3.20)
project(ai_bridge_windows_agent VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

option(AIBRIDGE_WITH_LIBDATACHANNEL "Fetch/link libdatachannel for C++ PeerConnection E2E" OFF)
option(AIBRIDGE_WITH_LIBWEBRTC "Link Google libwebrtc from AIBRIDGE_LIBWEBRTC_ROOT" OFF)
set(AIBRIDGE_LIBWEBRTC_ROOT "" CACHE PATH "Path to a prebuilt Google libwebrtc tree")

if(MSVC)
    add_compile_options(/W3 /EHsc /utf-8)
    add_compile_definitions(_CRT_SECURE_NO_WARNINGS UNICODE _UNICODE WIN32_LEAN_AND_MEAN NOMINMAX)
endif()

set(AGENT_CORE_SOURCES
    src/capture/dxgi_capture.cpp
    src/encoder/mf_h264_encoder.cpp
    src/input/sendinput_controller.cpp
    src/security/local_security.cpp
    src/monitoring/system_monitor.cpp
    src/webrtc/webrtc_transport.cpp
    src/webrtc/http_signaling.cpp
    src/webrtc/peer_connection.cpp
    src/mcp/mcp_executor.cpp
)

set(WIN32_SYSTEM_LIBS
    d3d11
    dxgi
    mfplat
    mfuuid
    mf
    ole32
    oleaut32
    user32
    gdi32
    advapi32
    crypt32
    wtsapi32
    shcore
    winhttp
)

set(AIBRIDGE_WEBRTC_LIBS "")
if(AIBRIDGE_WITH_LIBDATACHANNEL)
    include(FetchContent)
    # CMake 4.x removed compatibility with <3.5; older transitive deps need this.
    set(CMAKE_POLICY_VERSION_MINIMUM 3.5 CACHE STRING "" FORCE)
    # Mbed TLS for libdatachannel (no system OpenSSL). libSRTP keeps built-in crypto
    # (ENABLE_OPENSSL/ENABLE_MBEDTLS off) so find_package(MbedTLS) is not required there.
    set(USE_MBEDTLS ON CACHE BOOL "" FORCE)
    set(ENABLE_MBEDTLS OFF CACHE BOOL "" FORCE)
    set(ENABLE_OPENSSL OFF CACHE BOOL "" FORCE)
    set(NO_WEBSOCKET ON CACHE BOOL "" FORCE)
    set(NO_MEDIA OFF CACHE BOOL "" FORCE)
    set(NO_EXAMPLES ON CACHE BOOL "" FORCE)
    set(NO_TESTS ON CACHE BOOL "" FORCE)
    FetchContent_Declare(
        mbedtls
        GIT_REPOSITORY https://github.com/Mbed-TLS/mbedtls.git
        GIT_TAG v3.6.2
    )
    set(ENABLE_PROGRAMS OFF CACHE BOOL "" FORCE)
    set(ENABLE_TESTING OFF CACHE BOOL "" FORCE)
    set(MBEDTLS_FATAL_WARNINGS OFF CACHE BOOL "" FORCE)
    FetchContent_GetProperties(mbedtls)
    if(NOT mbedtls_POPULATED)
        FetchContent_Populate(mbedtls)
        # libdatachannel media needs DTLS-SRTP APIs from Mbed TLS.
        set(_aibridge_mbedtls_user_cfg "${CMAKE_CURRENT_BINARY_DIR}/aibridge_mbedtls_user_config.h")
        file(WRITE "${_aibridge_mbedtls_user_cfg}" "#pragma once\n#define MBEDTLS_SSL_DTLS_SRTP\n")
        set(MBEDTLS_USER_CONFIG_FILE "${_aibridge_mbedtls_user_cfg}" CACHE FILEPATH "" FORCE)
        add_subdirectory(${mbedtls_SOURCE_DIR} ${mbedtls_BINARY_DIR} EXCLUDE_FROM_ALL)
    endif()
    if(NOT TARGET MbedTLS::MbedTLS)
        add_library(MbedTLS::MbedTLS INTERFACE IMPORTED GLOBAL)
        target_link_libraries(MbedTLS::MbedTLS INTERFACE mbedtls mbedx509 mbedcrypto)
        target_include_directories(MbedTLS::MbedTLS INTERFACE ${mbedtls_SOURCE_DIR}/include)
    endif()
    # Propagate user config into mbedtls compile definitions.
    foreach(_mbedtls_tgt mbedtls mbedx509 mbedcrypto)
        if(TARGET ${_mbedtls_tgt})
            target_compile_definitions(${_mbedtls_tgt} PUBLIC MBEDTLS_USER_CONFIG_FILE="${_aibridge_mbedtls_user_cfg}")
        endif()
    endforeach()
    FetchContent_Declare(
        libdatachannel
        GIT_REPOSITORY https://github.com/paullouisageneau/libdatachannel.git
        GIT_TAG v0.22.6
    )
    FetchContent_MakeAvailable(libdatachannel)
    list(APPEND AIBRIDGE_WEBRTC_LIBS datachannel-static)
    add_compile_definitions(AIBRIDGE_WITH_LIBDATACHANNEL=1)
endif()

if(AIBRIDGE_WITH_LIBWEBRTC)
    if(NOT AIBRIDGE_LIBWEBRTC_ROOT)
        message(FATAL_ERROR "AIBRIDGE_WITH_LIBWEBRTC requires AIBRIDGE_LIBWEBRTC_ROOT")
    endif()
    add_compile_definitions(AIBRIDGE_WITH_LIBWEBRTC=1)
    include_directories(${AIBRIDGE_LIBWEBRTC_ROOT}/include)
    link_directories(${AIBRIDGE_LIBWEBRTC_ROOT}/lib)
    list(APPEND AIBRIDGE_WEBRTC_LIBS webrtc)
endif()

# 1. Shared Library (ai_bridge_native.dll) for Python ctypes & standalone integration
add_library(ai_bridge_native SHARED
    ${AGENT_CORE_SOURCES}
    src/c_api.cpp
)
target_link_libraries(ai_bridge_native PRIVATE ${WIN32_SYSTEM_LIBS} ${AIBRIDGE_WEBRTC_LIBS})

# 2. Process A: Session 0 Windows Service / Supervisor (ai_bridge_service.exe)
add_executable(ai_bridge_service
    src/service/windows_service.cpp
    src/monitoring/system_monitor.cpp
    src/security/local_security.cpp
)
target_link_libraries(ai_bridge_service PRIVATE ${WIN32_SYSTEM_LIBS})

# 3. Process B: Interactive Desktop Agent (ai_bridge_desktop.exe)
add_executable(ai_bridge_desktop
    src/desktop/desktop_agent.cpp
    ${AGENT_CORE_SOURCES}
)
target_link_libraries(ai_bridge_desktop PRIVATE ${WIN32_SYSTEM_LIBS} ${AIBRIDGE_WEBRTC_LIBS})

# 4. C++ Unit & Integration Test Suite (ai_bridge_tests.exe)
enable_testing()
add_executable(ai_bridge_tests
    tests/test_windows_agent.cpp
    ${AGENT_CORE_SOURCES}
)
target_link_libraries(ai_bridge_tests PRIVATE ${WIN32_SYSTEM_LIBS} ${AIBRIDGE_WEBRTC_LIBS})
add_test(NAME NativeWindowsAgentTests COMMAND ai_bridge_tests)
