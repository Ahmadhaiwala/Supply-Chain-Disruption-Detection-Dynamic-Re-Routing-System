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

MODEL_PATH = settings.MODEL_DIR / "xgb_delay_classifier.joblib"


class DelayClassifier:
    """XGBoost binary classifier: will shipment delay > 30 min?"""

    def __init__(self):
        self.model: Optional[xgb.XGBClassifier] = None
        self._load()

    def _load(self):
        if MODEL_PATH.exists():
            self.model = joblib.load(MODEL_PATH)
            logger.info("DelayClassifier loaded from %s", MODEL_PATH)
        else:
            logger.warning("No saved DelayClassifier found at %s — model will return defaults. Train or deploy model file.", MODEL_PATH)
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

        x = feature_vector.reshape(1, -1)
        return float(self.model.predict_proba(x)[0, 1])

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
        joblib.dump(self.model, MODEL_PATH)
        logger.info("DelayClassifier saved to %s", MODEL_PATH)


# Singleton
_classifier: Optional[DelayClassifier] = None


def get_delay_classifier() -> DelayClassifier:
    global _classifier
    if _classifier is None:
        _classifier = DelayClassifier()
    return _classifier
