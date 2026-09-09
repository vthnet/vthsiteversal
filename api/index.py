"""Vercel ASGI entrypoint for the VTH Network FastAPI backend."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from server import app  # noqa: E402

# Vercel's Python runtime detects the exported ASGI app.
