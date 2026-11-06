"""Thin entrypoint: uvicorn apps.control-api.main:app (see src/ai_bridge/control/app.py).

Dev usage:
    python apps/control-api/main.py
    # Manipulates sys.path to import from src/ directly — no pip install needed.

Production usage (Dockerfile.prod):
    pip install -e . && gunicorn -k uvicorn.workers.UvicornWorker ai_bridge.control.app:create_app()
    # Uses the installed package; no sys.path manipulation.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))

from ai_bridge.control.app import create_app  # noqa: E402

app = create_app()
