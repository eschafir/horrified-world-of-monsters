"""Entrypoint: imports the assembled FastAPI app from src.app and runs it. All game data,
rules logic, and routing live under src/ and data/ - see CLAUDE.md for the module map.
"""
import uvicorn

from src.app import app

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
