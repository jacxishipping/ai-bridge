import os

import uvicorn

from .app import create_app


def main() -> None:
    # Render (and most PaaS hosts) set $PORT and require 0.0.0.0.
    port = int(os.environ.get("PORT") or os.environ.get("AI_BRIDGE_CONTROL_PORT", "8000"))
    host = os.environ.get("AI_BRIDGE_CONTROL_HOST", "0.0.0.0" if "PORT" in os.environ else "127.0.0.1")
    uvicorn.run(create_app(), host=host, port=port)

if __name__ == "__main__":
    main()
