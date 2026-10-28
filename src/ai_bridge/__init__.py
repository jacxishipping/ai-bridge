"""AI Bridge — universal AI-to-computer control platform.

Security-first: workspace confinement is enforced in code, and risk policy is
enforced server-side, never by prompt text alone.
"""
from __future__ import annotations

from .client import AIBridgeClient, AIBridgeError

__version__ = "0.3.0"
__all__ = ["__version__", "AIBridgeClient", "AIBridgeError"]
