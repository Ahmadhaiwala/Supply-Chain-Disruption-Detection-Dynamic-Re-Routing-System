"""
Model A: XGBoost Delay Classifier
Predicts probability of delay > 30 minutes.
"""
import numpy as np
import joblib
import logging
from pathlib import Path
from typing import Optional, List, Tuple

import xgboost as xgb
from sklearn.model_selection import train_test_split
from sklearn.metrics import f1_score, roc_auc_score, precision_recall_curve, auc

from config import settings
from ml.feature_engineering import FEATURE_COLUMNS

logger = logging.getLogger(__name__)

MODEL_PATH = settings.MODEL_DIR / "xgb_delay_classifier.json"
MODEL_PATH_JOBLIB = settings.MODEL_DIR / "xgb_delay_classifier.joblib"


class DelayClassifier:
    """XGBoost binary classifier: will shipment delay > 30 min?"""

    def __init__(self):
        self.model: Optional[xgb.XGBClassifier] = None
        self._load()

    def _load(self):
        # Try native XGBoost JSON format first (portable across versions)
        if MODEL_PATH.exists():
            try:
                self.model = self._build_model()
                self.model.load_model(str(MODEL_PATH))
                # Validate the model actually works
                dummy = np.zeros((1, len(FEATURE_COLUMNS)), dtype=np.float32)
                self.model.predict_proba(dummy)
                logger.info("DelayClassifier loaded from native format %s", MODEL_PATH)
                return
            except Exception as e:
                logger.warning("Failed to load native model from %s: %s", MODEL_PATH, e)
                self.model = None

        # Fallback: try joblib (legacy format, version-sensitive)
        if MODEL_PATH_JOBLIB.exists():
            try:
                self.model = joblib.load(MODEL_PATH_JOBLIB)
                # Validate the loaded model works
                dummy = np.zeros((1, len(FEATURE_COLUMNS)), dtype=np.float32)
                self.model.predict_proba(dummy)
                logger.info("DelayClassifier loaded from joblib %s", MODEL_PATH_JOBLIB)
                # Re-save in native format for next load
                self._save()
                return
            except Exception as e:
                logger.warning("Failed to load joblib model from %s: %s", MODEL_PATH_JOBLIB, e)
                self.model = None

        logger.warning("No usable DelayClassifier found — model will return defaults. Train or deploy model file.")
        self.model = None

    def _build_model(self) -> xgb.XGBClassifier:
        return xgb.XGBClassifier(
            n_estimators=300,
            max_depth=6,
            learning_rate=0.05,
            subsample=0.8,
            colsample_bytree=0.8,
            eval_metric="logloss",
            random_state=42,
            n_jobs=-1,
        )

    def train(self, X: np.ndarray, y: np.ndarray) -> dict:
        """
        Train on feature matrix X and binary labels y.
        Uses time-based split (last 20% as test).
        """
        split_idx = int(len(X) * 0.8)
        X_train, X_test = X[:split_idx], X[split_idx:]
        y_train, y_test = y[:split_idx], y[split_idx:]

        # Handle class imbalance
        pos_count = y_train.sum()
        neg_count = len(y_train) - pos_count
        scale_pos_weight = neg_count / max(pos_count, 1)

        self.model = self._build_model()
        self.model.set_params(scale_pos_weight=scale_pos_weight)

        self.model.fit(
            X_train, y_train,
            eval_set=[(X_test, y_test)],
            verbose=False,
        )

        # Metrics
        y_pred_proba = self.model.predict_proba(X_test)[:, 1]
        y_pred = (y_pred_proba >= 0.5).astype(int)
        precision, recall, _ = precision_recall_curve(y_test, y_pred_proba)
        pr_auc = auc(recall, precision)

        metrics = {
            "f1_score": round(f1_score(y_test, y_pred), 4),
            "roc_auc": round(roc_auc_score(y_test, y_pred_proba), 4),
            "pr_auc": round(pr_auc, 4),
            "train_samples": len(X_train),
            "test_samples": len(X_test),
        }

        self._save()
        logger.info("DelayClassifier trained: %s", metrics)
        return metrics

    def predict_proba(self, feature_vector: np.ndarray) -> float:
        """
        Returns probability of delay [0.0, 1.0].
        feature_vector: shape (n_features,) or (1, n_features)
        """
        if self.model is None:
            logger.error("Model not trained. Returning default 0.5")
            return 0.5

        try:
            import pandas as pd
            x = pd.DataFrame(feature_vector.reshape(1, -1), columns=FEATURE_COLUMNS)
            return float(self.model.predict_proba(x)[0, 1])
        except Exception as e:
            logger.error("Prediction failed: %s. Returning default 0.5", e)
            return 0.5

    def get_shap_values(self, feature_vector: np.ndarray) -> List[dict]:
        """Returns top-5 SHAP feature contributions."""
        try:
            import shap
            explainer = shap.TreeExplainer(self.model)
            x = feature_vector.reshape(1, -1)
            shap_vals = explainer.shap_values(x)[0]
            pairs = sorted(
                zip(FEATURE_COLUMNS, shap_vals),
                key=lambda kv: abs(kv[1]),
                reverse=True,
            )
            return [{"feature": k, "shap_value": round(float(v), 4)} for k, v in pairs[:5]]
        except Exception as e:
            logger.warning("SHAP computation failed: %s", e)
            return []

    def _save(self):
        settings.MODEL_DIR.mkdir(parents=True, exist_ok=True)
        # Use XGBoost native JSON format (portable across library versions)
        self.model.save_model(str(MODEL_PATH))
        logger.info("DelayClassifier saved to %s", MODEL_PATH)


# Singleton
_classifier: Optional[DelayClassifier] = None


def get_delay_classifier() -> DelayClassifier:
    global _classifier
    if _classifier is None:
        _classifier = DelayClassifier()
    return _classifier
