"""Entrypoint: imports the assembled FastAPI app from src.app and runs it. All game data,
rules logic, and routing live under src/ and data/ - see CLAUDE.md for the module map.
"""
import os
import uvicorn

from src.app import app

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
