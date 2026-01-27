# backend/app/config.py
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[2]
ROOTWISE_DATA = BASE_DIR / "rootwise_data"
ZONEWISE_DATA = BASE_DIR / "zonewise_data"
USER_STATE_DIR = BASE_DIR / "user_journal"