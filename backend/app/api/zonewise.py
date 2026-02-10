# backend/app/api/zonewise.py
from fastapi import APIRouter, Query, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta, timezone
from uuid import UUID
import json, asyncio
from typing import Any, Optional, Dict

from app.db.session import get_db
from app.db.models import User, Metric
from app.logic.auth_deps import get_current_user_id
from app.logic.zonewise import stream_zonewise_response

router = APIRouter()

def compute_heart_zones(
    db: Session,
    user_id: UUID,
    minutes: int,
    metric_type: str = "heart_rate",
) -> Dict[str, Any]:
    user_uuid = user_id

    u = db.query(User.age).filter(User.id == user_uuid).first()
    age = int(u[0]) if u and u[0] is not None else 30
    max_hr = max(160, 220 - age)

    q = db.query(Metric.value).filter(
        Metric.user_id == user_uuid,
        Metric.metric_type == metric_type,
    )

    if minutes > 0:
        cutoff = datetime.now(timezone.utc) - timedelta(minutes=minutes)
        q = q.filter(Metric.ts >= cutoff)

    rows = q.all()

    z0 = z1 = z2 = z3 = z4 = z5 = 0
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
        else:
            z0 += 1

    return {
        "ok": True,
        "metric_type": metric_type,
        "minutes_window": minutes,
        "max_hr": max_hr,
        "zones": [
            {"zone": 0, "label": "Zone 0", "minutes": z0},
            {"zone": 1, "label": "Zone 1", "minutes": z1},
            {"zone": 2, "label": "Zone 2", "minutes": z2},
            {"zone": 3, "label": "Zone 3", "minutes": z3},
            {"zone": 4, "label": "Zone 4", "minutes": z4},
            {"zone": 5, "label": "Zone 5", "minutes": z5},
        ],
    }

@router.get("/metrics/heart_zones/me")
def get_heart_zones_me(
    minutes: int = Query(60, ge=0, le=1440),
    metric_type: str = Query("heart_rate"),
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    return compute_heart_zones(db, UUID(user_id), minutes, metric_type)


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


def summarize_hr_window(db: Session, user_uuid: UUID, minutes: int):
    # Reuse your series (minute-bucketed averages)
    rows = heart_rate_series(db, user_uuid, minutes if minutes > 0 else 60 * 24 * 365 * 10)

    points = [(r.ts, float(r.bpm)) for r in rows if r.bpm is not None]
    if not points:
        return {"ok": True, "minutes": minutes, "empty": True}

    bpms = [b for _, b in points]
    bpms_sorted = sorted(bpms)

    def pct(p):
        if not bpms_sorted:
            return None
        idx = int(round((p / 100) * (len(bpms_sorted) - 1)))
        idx = max(0, min(len(bpms_sorted) - 1, idx))
        return bpms_sorted[idx]

    first_ts, first_bpm = points[0]
    last_ts, last_bpm = points[-1]
    avg_bpm = sum(bpms) / len(bpms)

    return {
        "ok": True,
        "minutes": minutes,
        "samples": len(points),
        "min": min(bpms),
        "avg": avg_bpm,
        "max": max(bpms),
        "p95": pct(95),
        "first": {"ts": first_ts.isoformat(), "bpm": first_bpm},
        "last": {"ts": last_ts.isoformat(), "bpm": last_bpm},
        "trend_bpm": (last_bpm - first_bpm),
    }


def format_hr_context(hr_summary: dict, zones_payload: Optional[dict]) -> str:
    minutes = zones_payload.get("minutes_window", 0)
    window = "all time" if minutes == 0 else f"last {minutes} min"

    if not zones_payload or zones_payload.get("samples", 0) == 0:
        return (
            f"USER_HEART_RATE_CONTEXT ({window}): "
            f"No heart-rate samples were recorded in this window. "
            f"The user may be inactive or not wearing the device."
        )

    zbits = []
    for z in zones_payload["zones"]:
        zbits.append(f"Z{z['zone']}={z['minutes']}min")

    return (
        f"USER_HEART_RATE_CONTEXT ({window}): "
        f"samples={zones_payload['samples']}, "
        f"max_hr={zones_payload['max_hr']} bpm, "
        f"zones: " + ", ".join(zbits)
    )



@router.post("/chat/stream")
async def chat_stream(payload: dict,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    message = payload.get("message", "")
    history = payload.get("history", [])
    minutes = int(payload.get("minutes", 0) or 0)
    user_uuid = UUID(user_id)
    
    hr_summary = summarize_hr_window(db, user_uuid, minutes)
    zones_payload = compute_heart_zones(db, UUID(user_id), minutes, "heart_rate")
    context_str = format_hr_context(hr_summary, zones_payload)

    message_with_context = f"{context_str}\n\nUSER_MESSAGE: {message}"

    async def gen():
        try:
            for updated_history in stream_zonewise_response(message_with_context, history):
                yield sse("message", {"history": normalize_history(updated_history)})
                await asyncio.sleep(0)
            yield sse("done", {"ok": True})
        except Exception as e:
            yield sse("error", {"error": str(e)})

    return StreamingResponse(gen(), media_type="text/event-stream")


def heart_rate_series(db: Session, user_id, minutes=60):
    start = datetime.utcnow() - timedelta(minutes=minutes)

    return (
        db.query(
            func.date_trunc("minute", Metric.ts).label("ts"),
            func.avg(Metric.value).label("bpm"),
        )
        .filter(
            Metric.user_id == user_id,
            Metric.metric_type == "heart_rate",
            Metric.ts >= start,
        )
        .group_by("ts")
        .order_by("ts")
        .all()
    )


@router.get("/metrics/heart_rate/me")
def my_heart_rate(
    minutes: int = 60,
    db: Session = Depends(get_db),
    user_id=Depends(get_current_user_id),
):
    rows = heart_rate_series(db, user_id, minutes)
    return [{"ts": r.ts.isoformat(), "bpm": float(r.bpm)} for r in rows]
