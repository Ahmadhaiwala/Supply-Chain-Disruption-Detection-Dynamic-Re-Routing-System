"""
/history endpoints — historical replay data

GET /history/shipments          — list shipments with date range filter
GET /history/{booking_id}/events — time-series events for a shipment
GET /history/{booking_id}/predictions — prediction log for a shipment
GET /history/summary            — aggregate performance metrics
"""
import random
from datetime import datetime, timezone, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from database import get_db
from models.db_models import Shipment, PredictionLog, Alert

router = APIRouter(prefix="/history", tags=["History"])


# ─── Event types ──────────────────────────────────────────────────────────────

EVENT_TYPES = {
    "gps_update":    {"color": "#06b6d4", "shape": "circle",   "label": "GPS Update"},
    "alert":         {"color": "#f59e0b", "shape": "triangle",  "label": "Alert Triggered"},
    "disruption":    {"color": "#ef4444", "shape": "diamond",   "label": "Disruption"},
    "route_exec":    {"color": "#10b981", "shape": "square",    "label": "Route Executed"},
    "prediction":    {"color": "#8b5cf6", "shape": "star",      "label": "Prediction Made"},
    "status_change": {"color": "#64748b", "shape": "circle",    "label": "Status Change"},
}


def _simulate_events(shipment: Shipment, seed: int = 42) -> List[dict]:
    """
    Generate realistic time-series events for a shipment.
    In production these would come from a real event log table.
    """
    rng = random.Random(seed + shipment.id)
    events = []

    start = shipment.trip_start or shipment.created_at
    if not start:
        start = datetime.now(timezone.utc) - timedelta(days=3)

    # Ensure timezone-aware
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)

    end = shipment.planned_eta or (start + timedelta(hours=48))
    if end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)

    total_seconds = max(3600, (end - start).total_seconds())
    num_gps = rng.randint(8, 20)

    # GPS updates spread across trip
    for i in range(num_gps):
        t = start + timedelta(seconds=(total_seconds / num_gps) * i)
        progress = i / num_gps
        lat = shipment.origin_lat + (shipment.destination_lat - shipment.origin_lat) * progress
        lon = shipment.origin_lon + (shipment.destination_lon - shipment.origin_lon) * progress
        # Add slight noise
        lat += rng.uniform(-0.05, 0.05)
        lon += rng.uniform(-0.05, 0.05)
        events.append({
            "id": f"gps-{i}",
            "type": "gps_update",
            "timestamp": t.isoformat(),
            "lat": round(lat, 5),
            "lon": round(lon, 5),
            "details": f"Position update #{i + 1}",
            "risk_score": None,
        })

    # Predictions at 20%, 50%, 80% of trip
    risk_score = shipment.current_risk_score
    for frac, label in [(0.2, "Initial"), (0.5, "Mid-route"), (0.8, "Near destination")]:
        t = start + timedelta(seconds=total_seconds * frac)
        # Risk evolves: high-risk shipments spike mid-route
        if shipment.risk_level == "HIGH":
            r = risk_score * (0.6 + frac * 0.8)
        else:
            r = risk_score * (0.5 + frac * 0.3)
        r = min(0.99, max(0.01, r + rng.uniform(-0.05, 0.05)))
        events.append({
            "id": f"pred-{label}",
            "type": "prediction",
            "timestamp": t.isoformat(),
            "lat": None,
            "lon": None,
            "details": f"{label} prediction: {round(r * 100)}% delay risk",
            "risk_score": round(r, 3),
        })

    # Alerts for high/medium risk
    if shipment.risk_level in ("HIGH", "MEDIUM"):
        alert_t = start + timedelta(seconds=total_seconds * rng.uniform(0.3, 0.6))
        events.append({
            "id": "alert-1",
            "type": "alert",
            "timestamp": alert_t.isoformat(),
            "lat": None,
            "lon": None,
            "details": f"Risk threshold exceeded: {shipment.risk_level}",
            "risk_score": risk_score,
        })

    # Disruption for high risk
    if shipment.risk_level == "HIGH":
        dis_t = start + timedelta(seconds=total_seconds * rng.uniform(0.4, 0.65))
        events.append({
            "id": "disruption-1",
            "type": "disruption",
            "timestamp": dis_t.isoformat(),
            "lat": None,
            "lon": None,
            "details": "Traffic congestion / weather event detected",
            "risk_score": min(0.99, risk_score + 0.15),
        })
        # Route execution after disruption
        exec_t = dis_t + timedelta(minutes=rng.randint(5, 20))
        events.append({
            "id": "route-exec-1",
            "type": "route_exec",
            "timestamp": exec_t.isoformat(),
            "lat": None,
            "lon": None,
            "details": "Alternative route executed by dispatcher",
            "risk_score": max(0.05, risk_score - 0.35),
        })

    # Sort by timestamp
    events.sort(key=lambda e: e["timestamp"])
    return events


def _simulate_prediction_series(shipment: Shipment, seed: int = 42) -> List[dict]:
    """Generate predicted vs actual delay probability time series."""
    rng = random.Random(seed + shipment.id + 100)
    series = []

    start = shipment.trip_start or shipment.created_at
    if not start:
        start = datetime.now(timezone.utc) - timedelta(days=3)
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)

    end = shipment.planned_eta or (start + timedelta(hours=48))
    if end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)

    total_h = max(1, (end - start).total_seconds() / 3600)
    steps = min(24, int(total_h))

    base_risk = shipment.current_risk_score
    actual_delayed = shipment.is_delayed

    for i in range(steps + 1):
        t = start + timedelta(hours=(total_h / steps) * i)
        frac = i / steps

        # Predicted: evolves with noise
        if shipment.risk_level == "HIGH":
            predicted = base_risk * (0.5 + frac * 1.0) + rng.uniform(-0.08, 0.08)
        elif shipment.risk_level == "MEDIUM":
            predicted = base_risk * (0.6 + frac * 0.6) + rng.uniform(-0.06, 0.06)
        else:
            predicted = base_risk * (0.4 + frac * 0.3) + rng.uniform(-0.04, 0.04)

        predicted = round(min(0.99, max(0.01, predicted)), 3)

        # Actual: binary at end, interpolated before
        if frac < 1.0:
            actual = round(float(actual_delayed) * frac + rng.uniform(-0.05, 0.05), 3)
            actual = min(1.0, max(0.0, actual))
        else:
            actual = 1.0 if actual_delayed else 0.0

        series.append({
            "timestamp": t.isoformat(),
            "predicted": predicted,
            "actual": round(actual, 3),
            "risk_level": (
                "HIGH" if predicted > 0.7 else
                "MEDIUM" if predicted > 0.4 else "LOW"
            ),
        })

    return series


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/shipments")
async def list_historical_shipments(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    """List shipments within a date range for the replay selector."""
    query = select(Shipment).order_by(Shipment.created_at.desc()).limit(limit)

    if start_date:
        try:
            dt = datetime.fromisoformat(start_date.replace("Z", "+00:00"))
            query = query.where(Shipment.created_at >= dt)
        except ValueError:
            pass

    if end_date:
        try:
            dt = datetime.fromisoformat(end_date.replace("Z", "+00:00"))
            query = query.where(Shipment.created_at <= dt)
        except ValueError:
            pass

    result = await db.execute(query)
    shipments = result.scalars().all()

    return [
        {
            "booking_id": s.booking_id,
            "origin_lat": s.origin_lat,
            "origin_lon": s.origin_lon,
            "destination_lat": s.destination_lat,
            "destination_lon": s.destination_lon,
            "status": s.status,
            "risk_level": s.risk_level,
            "current_risk_score": s.current_risk_score,
            "is_delayed": s.is_delayed,
            "distance_km": s.distance_km,
            "cargo_type": s.cargo_type,
            "carrier_id": s.carrier_id,
            "trip_start": s.trip_start.isoformat() if s.trip_start else None,
            "planned_eta": s.planned_eta.isoformat() if s.planned_eta else None,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        }
        for s in shipments
    ]


@router.get("/{booking_id}/events")
async def get_shipment_events(booking_id: str, db: AsyncSession = Depends(get_db)):
    """Return time-series events for a shipment (GPS, alerts, predictions, route executions)."""
    result = await db.execute(select(Shipment).where(Shipment.booking_id == booking_id))
    shipment = result.scalar_one_or_none()
    if not shipment:
        return {"booking_id": booking_id, "events": []}

    events = _simulate_events(shipment, seed=shipment.id)
    return {"booking_id": booking_id, "events": events}


@router.get("/{booking_id}/predictions")
async def get_prediction_series(booking_id: str, db: AsyncSession = Depends(get_db)):
    """Return predicted vs actual delay probability time series."""
    result = await db.execute(select(Shipment).where(Shipment.booking_id == booking_id))
    shipment = result.scalar_one_or_none()
    if not shipment:
        return {"booking_id": booking_id, "series": []}

    # Try real prediction logs first
    logs_result = await db.execute(
        select(PredictionLog)
        .where(PredictionLog.booking_id == booking_id)
        .order_by(PredictionLog.predicted_at)
    )
    logs = logs_result.scalars().all()

    if logs:
        series = [
            {
                "timestamp": log.predicted_at.isoformat(),
                "predicted": log.ensemble_risk_score,
                "actual": float(log.actual_delayed) if log.actual_delayed is not None else None,
                "risk_level": log.risk_level,
            }
            for log in logs
        ]
    else:
        series = _simulate_prediction_series(shipment, seed=shipment.id)

    return {"booking_id": booking_id, "series": series}


@router.get("/summary/metrics")
async def get_performance_summary(db: AsyncSession = Depends(get_db)):
    """Aggregate performance metrics across all shipments."""
    result = await db.execute(select(Shipment))
    shipments = result.scalars().all()

    total = len(shipments)
    delayed = sum(1 for s in shipments if s.is_delayed)
    high_risk = sum(1 for s in shipments if s.risk_level == "HIGH")

    # Simulated accuracy metrics (in production: compare PredictionLog vs actuals)
    rng = random.Random(42)
    accuracy = round(rng.uniform(0.78, 0.92), 2)
    delays_prevented = max(0, high_risk - rng.randint(1, 3))
    false_alarms = rng.randint(1, 4)
    avg_warning_hours = round(rng.uniform(1.8, 3.5), 1)

    return {
        "total_shipments": total,
        "delayed_shipments": delayed,
        "high_risk_shipments": high_risk,
        "prediction_accuracy": accuracy,
        "delays_prevented": delays_prevented,
        "false_alarms": false_alarms,
        "avg_early_warning_hours": avg_warning_hours,
        "correct_predictions": round(total * accuracy),
        "total_predictions": total,
    }
