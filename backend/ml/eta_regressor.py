"""
Model B: LightGBM ETA Regressor
Predicts actual travel time in minutes with 80% confidence interval
using quantile regression.
"""
import numpy as np
import joblib
import logging
from pathlib import Path
from typing import Optional, Tuple

import lightgbm as lgb
from sklearn.metrics import mean_absolute_error, mean_squared_error

from config import settings

logger = logging.getLogger(__name__)

MODEL_PATH_MEDIAN = settings.MODEL_DIR / "lgbm_eta_median.joblib"
MODEL_PATH_LOWER = settings.MODEL_DIR / "lgbm_eta_lower.joblib"
MODEL_PATH_UPPER = settings.MODEL_DIR / "lgbm_eta_upper.joblib"


class ETARegressor:
    """
    Three LightGBM models for quantile regression:
      - median (q=0.5)  → point estimate
      - lower  (q=0.1)  → 80% CI lower bound
      - upper  (q=0.9)  → 80% CI upper bound
    """

    def __init__(self):
        self.model_median: Optional[lgb.LGBMRegressor] = None
        self.model_lower: Optional[lgb.LGBMRegressor] = None
        self.model_upper: Optional[lgb.LGBMRegressor] = None
        self._load()

    def _build_model(self, alpha: float) -> lgb.LGBMRegressor:
        return lgb.LGBMRegressor(
            objective="quantile",
            alpha=alpha,
            n_estimators=300,
            max_depth=6,
            learning_rate=0.05,
            subsample=0.8,
            colsample_bytree=0.8,
            random_state=42,
            n_jobs=-1,
            verbose=-1,
        )

    def _load(self):
        if MODEL_PATH_MEDIAN.exists():
            try:
                self.model_median = joblib.load(MODEL_PATH_MEDIAN)
                self.model_lower = joblib.load(MODEL_PATH_LOWER)
                self.model_upper = joblib.load(MODEL_PATH_UPPER)
                # Validate models work
                dummy = np.zeros((1, self.model_median.n_features_in_), dtype=np.float32)
                self.model_median.predict(dummy)
                logger.info("ETARegressor loaded from saved models")
                return
            except Exception as e:
                logger.warning("Failed to load ETARegressor: %s", e)
                self.model_median = None
                self.model_lower = None
                self.model_upper = None

        logger.warning("No usable ETARegressor found — model will return defaults. Train or deploy model file.")
        self.model_median = None
        self.model_lower = None
        self.model_upper = None

    def train(self, X: np.ndarray, y_minutes: np.ndarray) -> dict:
        """
        Train on feature matrix X and travel time labels y_minutes.
        """
        split_idx = int(len(X) * 0.8)
        X_train, X_test = X[:split_idx], X[split_idx:]
        y_train, y_test = y_minutes[:split_idx], y_minutes[split_idx:]

        for model, name in [
            (self.model_median, "median"),
            (self.model_lower, "lower"),
            (self.model_upper, "upper"),
        ]:
            model.fit(X_train, y_train)
            logger.info("ETARegressor %s fitted", name)

        y_pred = self.model_median.predict(X_test)
        mae = mean_absolute_error(y_test, y_pred)
        rmse = np.sqrt(mean_squared_error(y_test, y_pred))
        mape = np.mean(np.abs((y_test - y_pred) / np.maximum(y_test, 1))) * 100

        metrics = {
            "mae_hours": round(mae, 2),
            "rmse_hours": round(rmse, 2),
            "mape_pct": round(mape, 2),
        }

        self._save()
        logger.info("ETARegressor trained: %s", metrics)
        return metrics

    def predict(self, feature_vector: np.ndarray) -> Tuple[float, float, float]:
        """
        Returns (median_minutes, lower_minutes, upper_minutes).
        Falls back to None if model not trained.
        """
        if self.model_median is None:
            return None, None, None

        try:
            x = feature_vector.reshape(1, -1)
            median = float(self.model_median.predict(x)[0])
            lower = float(self.model_lower.predict(x)[0])
            upper = float(self.model_upper.predict(x)[0])
            return round(median, 1), round(lower, 1), round(upper, 1)
        except Exception as e:
            logger.error("ETA prediction failed: %s. Returning defaults.", e)
            return None, None, None

    def _save(self):
        settings.MODEL_DIR.mkdir(parents=True, exist_ok=True)
        joblib.dump(self.model_median, MODEL_PATH_MEDIAN)
        joblib.dump(self.model_lower, MODEL_PATH_LOWER)
        joblib.dump(self.model_upper, MODEL_PATH_UPPER)
        logger.info("ETARegressor saved")


_regressor: Optional[ETARegressor] = None


def get_eta_regressor() -> ETARegressor:
    global _regressor
    if _regressor is None:
        _regressor = ETARegressor()
    return _regressor
