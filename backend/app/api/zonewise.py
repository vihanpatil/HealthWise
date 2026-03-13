# backend/app/api/zonewise.py
import asyncio
from datetime import datetime, timedelta, timezone
import json
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.models import Metric, User
from app.db.session import get_db
from app.logic.auth_deps import get_current_user_id
from app.logic.zonewise import stream_zonewise_response

router = APIRouter()


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def compute_heart_zones(
    db: Session,
    user_id: UUID,
    minutes: int,
    metric_type: str = "heart_rate",
) -> dict[str, Any]:
    user_uuid = user_id

    u = db.query(User.age).filter(User.id == user_uuid).first()
    age = int(u[0]) if u and u[0] is not None else 30
    max_hr = max(160, 220 - age)

    q = db.query(Metric.value).filter(
        Metric.user_id == user_uuid,
        Metric.metric_type == metric_type,
    )

    if minutes > 0:
        cutoff = _utcnow() - timedelta(minutes=minutes)
        q = q.filter(Metric.ts >= cutoff)

    rows = q.all()

    z1 = z2 = z3 = z4 = z5 = 0
    samples = 0

    for (val,) in rows:
        if val is None:
            continue
        samples += 1
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
        else:
            z1 += 1

    return {
        "ok": True,
        "metric_type": metric_type,
        "minutes_window": minutes,
        "max_hr": max_hr,
        "samples": samples,
        "zones": [
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


def heart_rate_series(db: Session, user_id, minutes=60):
    start = _utcnow() - timedelta(minutes=minutes)

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


def summarize_hr_window(db: Session, user_uuid: UUID, minutes: int):
    """
    Summarize heart rate using the minute-bucketed series for the requested window.
    For all-time, we use a large minutes span (10 years) to avoid a new query path.
    """
    span = minutes if minutes > 0 else 60 * 24 * 365 * 10
    rows = heart_rate_series(db, user_uuid, span)

    points = [(r.ts, float(r.bpm)) for r in rows if r.bpm is not None]
    if not points:
        return {"ok": True, "minutes": minutes, "empty": True, "samples": 0}

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


def _window_label(minutes: int) -> str:
    return "all_time" if minutes == 0 else f"{minutes}m"


def format_hr_context_block(
    active_minutes: int,
    windows: dict[str, dict[str, Any]],
) -> str:
    """
    windows[label] = { "hr": hr_summary, "zones": zones_payload }
    """
    lines = []
    lines.append("USER_METRIC_CONTEXT:")
    lines.append(
        f"- active_window: {'all_time' if active_minutes == 0 else str(active_minutes) + 'm'}"
    )
    lines.append("- metric: heart_rate")
    lines.append("- windows:")

    order = ["30m", "60m", "90m", "all_time"]
    for w in order:
        payload = windows.get(w) or {}
        hr = payload.get("hr") or {}
        z = payload.get("zones") or {}

        if hr.get("empty") or hr.get("samples", 0) == 0:
            lines.append(f"  - {w}: no_samples")
            continue

        zbits = []
        for zone in z.get("zones", []) or []:
            zbits.append(f"Z{zone['zone']}={zone['minutes']}")

        lines.append(
            f"  - {w}: "
            f"samples={hr.get('samples')}, "
            f"min={hr.get('min'):.1f}, avg={hr.get('avg'):.1f}, max={hr.get('max'):.1f}, "
            f"p95={hr.get('p95'):.1f} "
            f"trend={hr.get('trend_bpm'):.1f}bpm, "
            f"latest={hr.get('last', {}).get('bpm'):.1f} @ {hr.get('last', {}).get('ts')}, "
            f"max_hr={z.get('max_hr')}, "
            f"zones({', '.join(zbits)})"
        )

    return "\n".join(lines)


@router.post("/chat/stream")
async def chat_stream(
    payload: dict,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    message = payload.get("message", "")
    history = payload.get("history", [])
    minutes = int(payload.get("minutes", 0) or 0)
    user_uuid = UUID(user_id)

    window_minutes = [30, 60, 90, 0]
    windows: dict[str, dict[str, Any]] = {}

    for m in window_minutes:
        label = _window_label(m)
        hr_summary = summarize_hr_window(db, user_uuid, m)
        zones_payload = compute_heart_zones(db, user_uuid, m, "heart_rate")
        windows[label] = {"hr": hr_summary, "zones": zones_payload}

    metric_context = format_hr_context_block(minutes, windows)

    async def gen():
        try:
            for updated_history in stream_zonewise_response(
                message=message,
                history=history,
                metric_context=metric_context,
            ):
                yield sse("message", {"history": normalize_history(updated_history)})
                await asyncio.sleep(0)
            yield sse("done", {"ok": True})
        except Exception as e:
            yield sse("error", {"error": str(e)})

    return StreamingResponse(gen(), media_type="text/event-stream")


@router.get("/metrics/heart_rate/me")
def my_heart_rate(
    minutes: int = 60,
    db: Session = Depends(get_db),
    user_id=Depends(get_current_user_id),
):
    rows = heart_rate_series(db, user_id, minutes)
    return [{"ts": r.ts.isoformat(), "bpm": float(r.bpm)} for r in rows]
