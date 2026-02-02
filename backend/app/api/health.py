# backend/app/api/health.py
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.models import Metric
from app.db.health import HeartRateIngestIn
from app.logic.auth_deps import get_current_user_id

router = APIRouter()


@router.post("/health/heart-rate/ingest")
def ingest_heart_rate(
    payload: HeartRateIngestIn,
    db: Session = Depends(get_db),
    user_id=Depends(get_current_user_id),
):
    rows = []
    for s in payload.samples:
        rows.append(
            Metric(
                user_id=user_id,
                metric_type="heart_rate",
                ts=s.ts,
                value=s.bpm,
                unit="bpm",
            )
        )

    db.add_all(rows)
    db.commit()

    return {"ok": True, "inserted": len(rows)}
