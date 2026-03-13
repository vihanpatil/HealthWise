# backend/app/schemas/health.py
from datetime import datetime

from pydantic import BaseModel, Field


class HeartRateSampleIn(BaseModel):
    ts: datetime
    bpm: float = Field(gt=0, lt=300)


class HeartRateIngestIn(BaseModel):
    samples: list[HeartRateSampleIn]
