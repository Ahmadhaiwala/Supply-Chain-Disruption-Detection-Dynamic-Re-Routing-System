"""
Training script — USA Dynamic Supply Chain Logistics Dataset

Usage:
    cd backend
    python -m ml.train
    python -m ml.train --csv data/dynamic_supply_chain_logistics_dataset.csv
"""
import argparse
import logging
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from ml.feature_engineering import engineer_from_dataframe, FEATURE_COLUMNS, TRAJECTORY_FEATURES
from ml.delay_classifier import DelayClassifier
from ml.eta_regressor import ETARegressor
from ml.anomaly_detector import AnomalyDetector

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
logger = logging.getLogger(__name__)

DEFAULT_CSV = "data/dynamic_supply_chain_logistics_dataset.csv"


def load_and_prepare(csv_path: str) -> pd.DataFrame:
    logger.info("Loading dataset from %s", csv_path)
    df = pd.read_csv(csv_path)
    logger.info("Raw shape: %s", df.shape)

    df = engineer_from_dataframe(df)

    # Ensure all feature columns exist
    for col in FEATURE_COLUMNS:
        if col not in df.columns:
            df[col] = 0.0

    df[FEATURE_COLUMNS] = df[FEATURE_COLUMNS].fillna(0.0)
    logger.info("After engineering: %d rows, %d feature cols", len(df), len(FEATURE_COLUMNS))
    return df


def train_all(csv_path: str):
    df = load_and_prepare(csv_path)
    X = df[FEATURE_COLUMNS].values.astype(np.float32)

    # ── Model A: XGBoost Delay Classifier ─────────────────────────────────────
    y_delay = df["is_delayed"].values.astype(int)
    logger.info("Class distribution — delayed: %d, on-time: %d",
                y_delay.sum(), len(y_delay) - y_delay.sum())
    logger.info("Training XGBoost Delay Classifier on %d samples...", len(X))
    clf = DelayClassifier()
    metrics_a = clf.train(X, y_delay)
    logger.info("Model A metrics: %s", metrics_a)

    # ── Model B: LightGBM ETA Regressor ───────────────────────────────────────
    mask_b = df["trip_duration_hours"].notna() & (df["trip_duration_hours"] > 0)
    p99 = df.loc[mask_b, "trip_duration_hours"].quantile(0.99)
    mask_b = mask_b & (df["trip_duration_hours"] <= p99)
    X_b = df.loc[mask_b, FEATURE_COLUMNS].values.astype(np.float32)
    y_eta = df.loc[mask_b, "trip_duration_hours"].values.astype(np.float32)
    logger.info("Training LightGBM ETA Regressor on %d samples (target: delivery_time_deviation hours)...", len(X_b))
    reg = ETARegressor()
    metrics_b = reg.train(X_b, y_eta)
    logger.info("Model B metrics: %s", metrics_b)

    # ── Model C: Isolation Forest Anomaly Detector ────────────────────────────
    # Train on Low Risk samples only as "normal" baseline
    normal_mask = df["risk_classification"] == "Low Risk"
    X_traj = df.loc[normal_mask, TRAJECTORY_FEATURES].fillna(0).values.astype(np.float32)
    logger.info("Training Isolation Forest on %d normal (Low Risk) samples...", len(X_traj))
    det = AnomalyDetector()
    metrics_c = det.train(X_traj)
    logger.info("Model C metrics: %s", metrics_c)

    logger.info("✅ All models trained and saved to ml/saved_models/")
    return metrics_a, metrics_b, metrics_c


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train supply chain ML models (USA dataset)")
    parser.add_argument("--csv", default=DEFAULT_CSV)
    args = parser.parse_args()

    csv_path = Path(__file__).resolve().parent.parent / args.csv
    if not csv_path.exists():
        logger.error("CSV not found at %s", csv_path)
        sys.exit(1)

    train_all(str(csv_path))
