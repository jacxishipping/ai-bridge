cmake_minimum_required(VERSION 3.20)
project(ai_bridge_windows_agent VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

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
)

# 1. Shared Library (ai_bridge_native.dll) for Python ctypes & standalone integration
add_library(ai_bridge_native SHARED
    ${AGENT_CORE_SOURCES}
    src/c_api.cpp
)
target_link_libraries(ai_bridge_native PRIVATE ${WIN32_SYSTEM_LIBS})

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
target_link_libraries(ai_bridge_desktop PRIVATE ${WIN32_SYSTEM_LIBS})

# 4. C++ Unit & Integration Test Suite (ai_bridge_tests.exe)
enable_testing()
add_executable(ai_bridge_tests
    tests/test_windows_agent.cpp
    ${AGENT_CORE_SOURCES}
)
target_link_libraries(ai_bridge_tests PRIVATE ${WIN32_SYSTEM_LIBS})
add_test(NAME NativeWindowsAgentTests COMMAND ai_bridge_tests)
