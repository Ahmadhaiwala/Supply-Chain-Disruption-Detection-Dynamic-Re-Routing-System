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
) -> Tuple[float, str]:
    """
    Compute ensemble risk score and risk level.

    Args:
        delay_probability:   XGBoost output [0, 1]
        anomaly_score:       Isolation Forest output [0, 1], or None
        eta_minutes:         LightGBM predicted travel time in minutes, or None
        planned_eta_minutes: Planned travel time in minutes, or None

    Returns:
        (risk_score [0, 1], risk_level str)
    """
    anomaly = anomaly_score if anomaly_score is not None else 0.0

    # ETA deviation component: how much longer than planned?
    eta_deviation_score = 0.0
    if eta_minutes is not None and planned_eta_minutes is not None and planned_eta_minutes > 0:
        deviation_ratio = (eta_minutes - planned_eta_minutes) / planned_eta_minutes
        # Clip to [0, 1]: 0 = on time, 1 = 100%+ over planned
        eta_deviation_score = min(max(deviation_ratio, 0.0), 1.0)

    # Weighted fusion
    if eta_minutes is not None and planned_eta_minutes is not None:
        risk_score = (
            WEIGHT_DELAY * delay_probability
            + WEIGHT_ANOMALY * anomaly
            + WEIGHT_ETA_DEVIATION * eta_deviation_score
        )
    else:
        # Redistribute ETA weight to delay when ETA model unavailable
        adjusted_delay_weight = WEIGHT_DELAY + WEIGHT_ETA_DEVIATION
        risk_score = adjusted_delay_weight * delay_probability + WEIGHT_ANOMALY * anomaly

    risk_score = round(min(max(risk_score, 0.0), 1.0), 4)
    risk_level = classify_risk(risk_score)

    return risk_score, risk_level


def classify_risk(score: float) -> str:
    if score <= settings.RISK_LOW_MAX:
        return "LOW"
    elif score <= settings.RISK_MEDIUM_MAX:
        return "MEDIUM"
    else:
        return "HIGH"


def build_recommendation(risk_level: str, is_anomaly: bool) -> str:
    """Human-readable action recommendation."""
    if risk_level == "HIGH" or is_anomaly:
        return "⚠️ HIGH RISK — Auto-recommend reroute. Escalate to dispatcher immediately."
    elif risk_level == "MEDIUM":
        return "🟡 MEDIUM RISK — Alert dispatcher. Prepare alternative routes."
    else:
        return "✅ LOW RISK — Monitor and log. No action required."
