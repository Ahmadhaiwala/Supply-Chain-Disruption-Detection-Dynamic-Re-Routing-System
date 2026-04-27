"""
Ensemble Fusion Layer
Combines Model A (delay prob), Model B (ETA), Model C (anomaly score)
into a single Risk Score [0, 1] and Risk Level (LOW / MEDIUM / HIGH).
"""
from typing import Optional, Tuple
from config import settings


# Weights for ensemble fusion
WEIGHT_DELAY = 0.55
WEIGHT_ANOMALY = 0.30
WEIGHT_ETA_DEVIATION = 0.15  # contribution from ETA model


def compute_risk_score(
    delay_probability: float,
    anomaly_score: Optional[float],
    eta_minutes: Optional[float],
    planned_eta_minutes: Optional[float],
    disruption_likelihood_score: float = 0.3,
) -> Tuple[float, str]:
    """
    Compute ensemble risk score and risk level.

    Blends:
      - XGBoost delay probability (Model A) — weight 0.35
      - Dataset disruption_likelihood_score — weight 0.40 (ground truth from real data)
      - Isolation Forest anomaly score      — weight 0.15
      - ETA deviation component             — weight 0.10

    The disruption_likelihood_score is weighted heavily because the XGBoost
    model may be poorly calibrated for low-delay datasets.
    """
    anomaly = anomaly_score if anomaly_score is not None else 0.0

    # ETA deviation component: how much longer than planned?
    eta_deviation_score = 0.0
    if eta_minutes is not None and planned_eta_minutes is not None and planned_eta_minutes > 0:
        # Only use ETA deviation if the ETA prediction looks realistic (> 30 min)
        if eta_minutes > 30:
            deviation_ratio = (eta_minutes - planned_eta_minutes) / planned_eta_minutes
            eta_deviation_score = min(max(deviation_ratio, 0.0), 1.0)

    # Weighted fusion — disruption_likelihood_score carries real dataset signal
    risk_score = (
        0.35 * delay_probability
        + 0.40 * disruption_likelihood_score
        + 0.15 * anomaly
        + 0.10 * eta_deviation_score
    )

    risk_score = round(min(max(risk_score, 0.0), 1.0), 4)
    risk_level = classify_risk(risk_score)

    return risk_score, risk_level



def classify_risk(score: float) -> str:
    if score > 0.85:
        return "CRITICAL"
    elif score > settings.RISK_MEDIUM_MAX:
        return "HIGH"
    elif score > settings.RISK_LOW_MAX:
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

