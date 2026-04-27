"""
/predict endpoints
POST /predict          — full prediction pipeline for a shipment
POST /predict/batch    — batch predictions
GET  /predict/explain/{booking_id} — SHAP explanation for last prediction
"""
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db
from models.schemas import PredictionInput, PredictionResponse, RiskLevel
from models.db_models import PredictionLog, Shipment
from ml.feature_engineering import build_feature_vector, build_trajectory_vector
from ml.delay_classifier import get_delay_classifier
from ml.eta_regressor import get_eta_regressor
from ml.anomaly_detector import get_anomaly_detector
from ml.ensemble import compute_risk_score, build_recommendation

router = APIRouter(prefix="/predict", tags=["Prediction"])


@router.post("", response_model=PredictionResponse)
async def predict_shipment(payload: PredictionInput, db: AsyncSession = Depends(get_db)):
    """
    Run the full 3-model prediction pipeline and return a risk assessment.
    """
    data = payload.model_dump()

    # ── Feature vectors ──────────────────────────────────────────────────────
    feature_vec = build_feature_vector(data)
    trajectory_vec = build_trajectory_vector(data)

    # ── Model A: Delay probability ────────────────────────────────────────────
    classifier = get_delay_classifier()
    delay_prob = classifier.predict_proba(feature_vec)
    shap_features = classifier.get_shap_values(feature_vec)

    # ── Model B: ETA regression ───────────────────────────────────────────────
    regressor = get_eta_regressor()
    eta_median, eta_lower, eta_upper = regressor.predict(feature_vec)

    # Planned ETA in minutes (distance / assumed avg speed)
    planned_eta_minutes = (data["distance_km"] / 60) * 60 if data["distance_km"] else None

    # ── Model C: Anomaly detection ────────────────────────────────────────────
    detector = get_anomaly_detector()
    anomaly_score = None
    is_anomaly = False
    if trajectory_vec is not None:
        anomaly_score = detector.score(trajectory_vec)
        is_anomaly = detector.is_anomaly(anomaly_score)

    # ── Ensemble fusion ───────────────────────────────────────────────────────
    risk_score, risk_level = compute_risk_score(
        delay_probability=delay_prob,
        anomaly_score=anomaly_score,
        eta_minutes=eta_median,
        planned_eta_minutes=planned_eta_minutes,
        disruption_likelihood_score=float(data.get("disruption_likelihood_score", 0.3)),
    )
    recommendation = build_recommendation(risk_level, is_anomaly)


    # ── Persist prediction log ────────────────────────────────────────────────
    log = PredictionLog(
        booking_id=payload.booking_id,
        delay_probability=delay_prob,
        eta_prediction_minutes=eta_median,
        anomaly_score=anomaly_score,
        ensemble_risk_score=risk_score,
        risk_level=risk_level,
        shap_values=shap_features,
        features_used=data,
    )
    db.add(log)

    # Update shipment risk score if it exists
    result = await db.execute(select(Shipment).where(Shipment.booking_id == payload.booking_id))
    shipment = result.scalar_one_or_none()
    if shipment:
        shipment.current_risk_score = risk_score
        shipment.risk_level = risk_level

    await db.commit()

    return PredictionResponse(
        booking_id=payload.booking_id,
        delay_probability=round(delay_prob, 4),
        eta_prediction_minutes=eta_median,
        eta_lower_bound_minutes=eta_lower,
        eta_upper_bound_minutes=eta_upper,
        anomaly_score=round(anomaly_score, 4) if anomaly_score is not None else None,
        is_anomaly=is_anomaly,
        ensemble_risk_score=risk_score,
        risk_level=RiskLevel(risk_level),
        shap_top_features=shap_features,
        recommendation=recommendation,
        predicted_at=datetime.now(timezone.utc),
    )


@router.post("/batch", response_model=List[PredictionResponse])
async def predict_batch(payloads: List[PredictionInput], db: AsyncSession = Depends(get_db)):
    """Batch prediction for multiple shipments."""
    results = []
    for payload in payloads:
        result = await predict_shipment(payload, db)
        results.append(result)
    return results


@router.get("/explain/{booking_id}")
async def explain_prediction(booking_id: str, db: AsyncSession = Depends(get_db)):
    """Return the latest SHAP explanation for a booking."""
    result = await db.execute(
        select(PredictionLog)
        .where(PredictionLog.booking_id == booking_id)
        .order_by(PredictionLog.predicted_at.desc())
        .limit(1)
    )
    log = result.scalar_one_or_none()
    if not log:
        raise HTTPException(status_code=404, detail=f"No prediction found for booking_id={booking_id}")

    return {
        "booking_id": booking_id,
        "ensemble_risk_score": log.ensemble_risk_score,
        "risk_level": log.risk_level,
        "delay_probability": log.delay_probability,
        "anomaly_score": log.anomaly_score,
        "shap_top_features": log.shap_values or [],
        "predicted_at": log.predicted_at,
    }
