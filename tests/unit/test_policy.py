import pytest

from ai_bridge.policy import Policy, decide


def test_tier1_allowed():
    assert decide(Policy(), "get_system_info").allowed

def test_tier4_needs_approval_and_admin():
    d = decide(Policy(), "delete_workspace_file")
    assert not d.allowed and d.needs_approval
    assert decide(Policy(), "delete_workspace_file", approval_granted=True, is_admin=True).allowed
    # Approval without admin role is NOT enough.
    assert not decide(Policy(), "delete_workspace_file", approval_granted=True, is_admin=False).allowed

def test_policy_cannot_be_widened_by_tool_args():
    # A frozen Policy: tool code receives it, it cannot mutate tier rules.
    p = Policy(allow_tier3=False)
    with pytest.raises(Exception):
        p.allow_tier3 = True  # type: ignore
    assert not decide(p, "edit_workspace_file").allowed

def test_unknown_tool_denied_by_default():
    assert not decide(Policy(), "run_any_command").allowed

def test_desktop_disabled_by_default():
    assert not decide(Policy(desktop_enabled=False), "capture_desktop_screenshot").allowed

def test_revoked_device_denied():
    assert not decide(Policy(), "get_system_info", device_revoked=True).allowed
