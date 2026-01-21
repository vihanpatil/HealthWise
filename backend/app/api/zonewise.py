from fastapi import APIRouter, Query, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, cast, Date, String
from datetime import timedelta
from uuid import UUID

from app.db.session import get_db
from app.db.models import User, Metric
from app.logic.auth_deps import get_current_user_id

router = APIRouter()


@router.get("/users")
def list_users(db: Session = Depends(get_db)):
    rows = (
        db.query(
            User.id.label("id"),
            func.coalesce(User.name, User.email, cast(User.id, String)).label("label"),
        )
        .order_by(User.created_at.asc())
        .all()
    )

    users = []
    for id_val, label_val in rows:
        users.append(
            {
                "id": str(id_val),
                "label": label_val if label_val is not None else str(id_val),
            }
        )

    return {"ok": True, "users": users}


def _metrics_daily_for_user_uuid(*, user_uuid: UUID, days: int, db: Session):
    day_col = cast(func.date_trunc("day", Metric.ts), Date)

    rows = (
        db.query(
            Metric.metric_type.label("metric_type"),
            day_col.label("day"),
            func.avg(Metric.value).label("avg_value"),
            func.sum(Metric.value).label("sum_value"),
            func.min(Metric.value).label("min_value"),
            func.max(Metric.value).label("max_value"),
            func.count().label("n"),
            func.max(Metric.unit).label("unit"),
        )
        .filter(
            Metric.user_id == user_uuid,
            Metric.ts >= func.now() - timedelta(days=days),
        )
        .group_by(Metric.metric_type, day_col)
        .order_by(Metric.metric_type.asc(), day_col.asc())
        .all()
    )

    out = {}
    for metric_type, day, avg_value, sum_value, min_value, max_value, n, unit in rows:
        out.setdefault(metric_type, []).append(
            {
                "metric_type": metric_type,
                "day": day.isoformat() if day else None,
                "avg_value": float(avg_value) if avg_value is not None else None,
                "sum_value": float(sum_value) if sum_value is not None else None,
                "min_value": float(min_value) if min_value is not None else None,
                "max_value": float(max_value) if max_value is not None else None,
                "n": int(n) if n is not None else 0,
                "unit": unit,
            }
        )

    return {"ok": True, "user_id": str(user_uuid), "days": days, "series": out}


@router.get("/metrics/daily/me")
def metrics_daily_me(
    days: int = Query(7, ge=1, le=90),
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    user_uuid = UUID(user_id)
    return _metrics_daily_for_user_uuid(user_uuid=user_uuid, days=days, db=db)


@router.get("/metrics/daily")
def metrics_daily(
    user_id: str = Query(...),
    days: int = Query(7, ge=1, le=90),
    db: Session = Depends(get_db),
):
    user_uuid = UUID(user_id)
    return _metrics_daily_for_user_uuid(user_uuid=user_uuid, days=days, db=db)
