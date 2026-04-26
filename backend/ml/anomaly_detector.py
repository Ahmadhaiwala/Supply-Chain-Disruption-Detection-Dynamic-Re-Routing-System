"""
Model C: Isolation Forest Anomaly Detector
Detects abnormal GPS trajectories without needing delay labels.
"""
import numpy as np
import joblib
import logging
from typing import Optional

from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler

from config import settings

logger = logging.getLogger(__name__)

MODEL_PATH = settings.MODEL_DIR / "isolation_forest.joblib"
SCALER_PATH = settings.MODEL_DIR / "anomaly_scaler.joblib"


class AnomalyDetector:
    """
    Isolation Forest on GPS trajectory features:
      - speed_variance
      - stop_count
      - route_deviation_km
    Outputs anomaly score in [0, 1]; threshold at settings.ANOMALY_THRESHOLD.
    """

    def __init__(self):
        self.model: Optional[IsolationForest] = None
        self.scaler: Optional[StandardScaler] = None
        self._load()

    def _build_model(self) -> IsolationForest:
        return IsolationForest(
            n_estimators=200,
            contamination=0.05,  # expect ~5% anomalies
            random_state=42,
            n_jobs=-1,
        )

    def _load(self):
        if MODEL_PATH.exists() and SCALER_PATH.exists():
            self.model = joblib.load(MODEL_PATH)
            self.scaler = joblib.load(SCALER_PATH)
            logger.info("AnomalyDetector loaded from saved models")
        else:
            logger.warning("No saved AnomalyDetector found — call train() first.")
            self.model = self._build_model()
            self.scaler = StandardScaler()

    def train(self, X_trajectory: np.ndarray) -> dict:
        """
        Train on normal trajectory data only.
        X_trajectory: shape (n_samples, 3) — [speed_variance, stop_count, route_deviation_km]
        """
        self.scaler = StandardScaler()
        X_scaled = self.scaler.fit_transform(X_trajectory)

        self.model = self._build_model()
        self.model.fit(X_scaled)

        # Score distribution on training data
        raw_scores = self.model.score_samples(X_scaled)
        # Normalize to [0, 1]: higher = more anomalous
        normalized = self._normalize_scores(raw_scores)

        metrics = {
            "train_samples": len(X_trajectory),
            "mean_anomaly_score": round(float(normalized.mean()), 4),
            "pct_flagged": round(float((normalized >= settings.ANOMALY_THRESHOLD).mean() * 100), 2),
        }

        self._save()
        logger.info("AnomalyDetector trained: %s", metrics)
        return metrics

    def score(self, trajectory_vector: np.ndarray) -> float:
        """
        Returns anomaly score in [0, 1].
        trajectory_vector: shape (1, 3)
        """
        if self.model is None or self.scaler is None:
            return 0.0

        try:
            X_scaled = self.scaler.transform(trajectory_vector)
            raw = self.model.score_samples(X_scaled)
            return float(self._normalize_scores(raw)[0])
        except Exception as e:
            logger.warning("Anomaly scoring failed: %s", e)
            return 0.0

    def is_anomaly(self, score: float) -> bool:
        return score >= settings.ANOMALY_THRESHOLD

    @staticmethod
    def _normalize_scores(raw_scores: np.ndarray) -> np.ndarray:
        """
        Isolation Forest score_samples returns negative values (more negative = more anomalous).
        Flip and normalize to [0, 1].
        """
        flipped = -raw_scores
        min_val, max_val = flipped.min(), flipped.max()
        if max_val == min_val:
            return np.zeros_like(flipped)
        return (flipped - min_val) / (max_val - min_val)

    def _save(self):
        settings.MODEL_DIR.mkdir(parents=True, exist_ok=True)
        joblib.dump(self.model, MODEL_PATH)
        joblib.dump(self.scaler, SCALER_PATH)
        logger.info("AnomalyDetector saved")


_detector: Optional[AnomalyDetector] = None


def get_anomaly_detector() -> AnomalyDetector:
    global _detector
    if _detector is None:
        _detector = AnomalyDetector()
    return _detector
