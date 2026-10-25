"""Thin entrypoint: uvicorn apps.control-api.main:app (see src/ai_bridge/control/app.py)."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))
from ai_bridge.control.app import create_app  # noqa: E402
app = create_app()
