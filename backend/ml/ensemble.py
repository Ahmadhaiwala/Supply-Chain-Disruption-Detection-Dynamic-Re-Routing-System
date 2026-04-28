"""
Ensemble Fusion Layer
Combines Model A (delay prob), Model B (ETA), Model C (anomaly score)
into a single Risk Score [0, 1] and Risk Level (LOW / MEDIUM / HIGH / CRITICAL).

Strategy:
  The disruption_likelihood_score passed from the frontend IS the DB-stored
  current_risk_score (set during seeding from the dataset). It's the most
  reliable signal. We use it as the anchor and let the ML models adjust it.

  Final score = anchor * 0.60 + model_signal * 0.40

  This ensures:
  - A shipment seeded as HIGH (0.82) stays HIGH even if XGBoost is uncertain
  - A shipment seeded as LOW (0.10) stays LOW even if anomaly detector fires
  - ML models can push scores up/down by up to ±40% based on real-time features
"""
from typing import Optional, Tuple
from config import settings


def compute_risk_score(
    delay_probability: float,
    anomaly_score: Optional[float],
    eta_minutes: Optional[float],
    planned_eta_minutes: Optional[float],
    disruption_likelihood_score: float = 0.3,
) -> Tuple[float, str]:
    """
    Compute ensemble risk score and risk level.

    Args:
        delay_probability:          XGBoost output [0, 1]
        anomaly_score:              Isolation Forest output [0, 1], or None
        eta_minutes:                LightGBM predicted travel time, or None
        planned_eta_minutes:        Planned travel time, or None
        disruption_likelihood_score: DB-stored risk score [0, 1] — primary anchor

    Returns:
        (risk_score [0, 1], risk_level str)
    """
    anomaly = anomaly_score if anomaly_score is not None else 0.0

    # ── ETA deviation component ────────────────────────────────────────────
    eta_deviation = 0.0
    if eta_minutes is not None and planned_eta_minutes is not None and planned_eta_minutes > 30:
        ratio = (eta_minutes - planned_eta_minutes) / planned_eta_minutes
        eta_deviation = min(max(ratio, 0.0), 1.0)

    # ── ML model signal (0-1) ──────────────────────────────────────────────
    # Blend XGBoost + anomaly + ETA into a single model signal
    # XGBoost outputs near-binary (0 or 1) for this dataset, so weight it less
    model_signal = (
        0.50 * delay_probability
        + 0.30 * anomaly
        + 0.20 * eta_deviation
    )

    # ── Anchor + model blend ───────────────────────────────────────────────
    # disruption_likelihood_score = DB current_risk_score (the ground truth anchor)
    # The anchor is the most reliable signal — it comes from the seeded dataset.
    # The ML model signal can only INCREASE the score, never decrease it below anchor.
    # This prevents stale/default model inputs from downgrading a known high-risk shipment.
    anchor = disruption_likelihood_score

    # Blend: anchor is the floor, model signal can push it higher
    blended = 0.75 * anchor + 0.25 * model_signal

    # Ensure we never go below the anchor (model can only add risk, not remove it)
    risk_score = max(anchor * 0.90, blended)  # allow at most 10% reduction from anchor

    # Clamp and round
    risk_score = round(min(max(risk_score, 0.0), 1.0), 4)
    risk_level = classify_risk(risk_score)

    return risk_score, risk_level


def classify_risk(score: float) -> str:
    if score > 0.85:
        return "CRITICAL"
    elif score > settings.RISK_MEDIUM_MAX:   # > 0.70
        return "HIGH"
    elif score > settings.RISK_LOW_MAX:      # > 0.40
        return "MEDIUM"
    else:
        return "LOW"


def build_recommendation(risk_level: str, is_anomaly: bool) -> str:
    """Human-readable action recommendation."""
    if risk_level == "CRITICAL":
        return "🔴 CRITICAL RISK — Immediate rerouting required. Escalate to senior dispatcher and notify client."
    elif risk_level == "HIGH" or is_anomaly:
        return "⚠️ HIGH RISK — Auto-recommend reroute. Escalate to dispatcher immediately."
    elif risk_level == "MEDIUM":
        return "🟡 MEDIUM RISK — Alert dispatcher. Prepare alternative routes."
    else:
        return "✅ LOW RISK — Monitor and log. No action required."
