# backend/app/api/zonewise.py
from fastapi import APIRouter, Query, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import timedelta
from uuid import UUID
import json, asyncio

from app.db.session import get_db
from app.db.models import User, Metric
from app.logic.auth_deps import get_current_user_id
from app.logic.zonewise import stream_zonewise_response


router = APIRouter()


@router.get("/metrics/heart_zones/me")
def heart_zones_me(
    minutes: int = Query(60, ge=0, le=1440),  # <-- allow 0
    metric_type: str = Query("heart_rate"),
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    user_uuid = UUID(user_id)

    u = db.query(User.age).filter(User.id == user_uuid).first()
    age = u[0]
    max_hr = max(160, 220 - (age))

    q = (
        db.query(Metric.value)
        .filter(
            Metric.user_id == user_uuid,
            Metric.metric_type == metric_type,
        )
    )

    # only apply window if minutes > 0
    if minutes > 0:
        q = q.filter(Metric.ts >= func.now() - timedelta(minutes=minutes))

    rows = q.all()

    z1 = z2 = z3 = z4 = z5 = 0
    for (val,) in rows:
        if val is None:
            continue
        hr = float(val)
        pct = hr / float(max_hr)

        if pct >= 0.90:
            z5 += 1
        elif pct >= 0.80:
            z4 += 1
        elif pct >= 0.70:
            z3 += 1
        elif pct >= 0.60:
            z2 += 1
        elif pct >= 0.50:
            z1 += 1

    return {
        "ok": True,
        "metric_type": metric_type,
        "minutes_window": minutes,  # 0 means all-time
        "max_hr": max_hr,
        "zones": [
            {"zone": 1, "label": "Zone 1", "minutes": z1},
            {"zone": 2, "label": "Zone 2", "minutes": z2},
            {"zone": 3, "label": "Zone 3", "minutes": z3},
            {"zone": 4, "label": "Zone 4", "minutes": z4},
            {"zone": 5, "label": "Zone 5", "minutes": z5},
        ],
    }

def sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"

def normalize_history(history):
    out = []
    for item in history or []:
        if isinstance(item, (list, tuple)) and len(item) == 2:
            out.append([str(item[0]), str(item[1])])
        else:
            out.append([str(item), ""])
    return out

def sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"

@router.post("/chat/stream")
async def chat_stream(payload: dict):
    message = payload.get("message", "")
    history = payload.get("history", [])

    async def gen():
        try:
            for updated_history in stream_zonewise_response(message, history):
                yield sse("message", {"history": normalize_history(updated_history)})
                await asyncio.sleep(0)
            yield sse("done", {"ok": True})
        except Exception as e:
            yield sse("error", {"error": str(e)})

    return StreamingResponse(gen(), media_type="text/event-stream")