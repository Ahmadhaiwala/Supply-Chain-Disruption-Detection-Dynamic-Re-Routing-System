"""
Training script — run once after placing the Kaggle dataset in backend/data/

Usage:
    cd backend
    python -m ml.train

Or with a custom CSV path:
    python -m ml.train --csv data/delivery_truck_trips.csv
"""
import argparse
import logging
import sys
from pathlib import Path

import numpy as np
import pandas as pd

# Add backend root to path when running as script
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from ml.feature_engineering import engineer_from_dataframe, FEATURE_COLUMNS
from ml.delay_classifier import DelayClassifier
from ml.eta_regressor import ETARegressor
from ml.anomaly_detector import AnomalyDetector

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
logger = logging.getLogger(__name__)


def load_and_prepare(csv_path: str) -> pd.DataFrame:
    logger.info("Loading dataset from %s", csv_path)
    df = pd.read_csv(csv_path)
    logger.info("Raw shape: %s", df.shape)

    df = engineer_from_dataframe(df)

    # Drop rows with missing critical fields
    required = ["origin_lat", "origin_lon", "destination_lat", "destination_lon", "distance_km"]
    df = df.dropna(subset=required)

    # ── Enrich with real corridor-level historical stats ──────────────────────
    # corridor_id = origin_zone + destination_zone (rounded to 1 decimal)
    df["corridor_id"] = (
        df["origin_lat"].round(1).astype(str) + "_" +
        df["origin_lon"].round(1).astype(str) + "_" +
        df["destination_lat"].round(1).astype(str) + "_" +
        df["destination_lon"].round(1).astype(str)
    )

    # Route historical delay rate per corridor
    corridor_delay = df.groupby("corridor_id")["is_delayed"].mean().rename("route_historical_delay_rate")
    df = df.join(corridor_delay, on="corridor_id", rsuffix="_real")
    if "route_historical_delay_rate_real" in df.columns:
        df["route_historical_delay_rate"] = df["route_historical_delay_rate_real"]
        df.drop(columns=["route_historical_delay_rate_real"], inplace=True)

    # Carrier on-time rate (using supplierID as proxy for carrier)
    if "supplierID" in df.columns:
        carrier_ontime = (
            df.groupby("supplierID")["is_delayed"]
            .apply(lambda x: 1 - x.mean())
            .rename("carrier_ontime_rate")
        )
        df = df.join(carrier_ontime, on="supplierID", rsuffix="_real")
        if "carrier_ontime_rate_real" in df.columns:
            df["carrier_ontime_rate"] = df["carrier_ontime_rate_real"]
            df.drop(columns=["carrier_ontime_rate_real"], inplace=True)

    logger.info("After cleaning + enrichment: %s rows", len(df))
    return df


def train_all(csv_path: str):
    df = load_and_prepare(csv_path)

    # ── Feature matrix ────────────────────────────────────────────────────────
    # Fill any remaining NaN with 0
    for col in FEATURE_COLUMNS:
        if col not in df.columns:
            df[col] = 0.0
    df[FEATURE_COLUMNS] = df[FEATURE_COLUMNS].fillna(0.0)

    X = df[FEATURE_COLUMNS].values.astype(np.float32)

    # ── Model A: Delay Classifier ─────────────────────────────────────────────
    if "is_delayed" in df.columns:
        y_delay = df["is_delayed"].values.astype(int)
        logger.info("Training XGBoost Delay Classifier...")
        clf = DelayClassifier()
        metrics_a = clf.train(X, y_delay)
        logger.info("Model A metrics: %s", metrics_a)
    else:
        logger.warning("No 'is_delayed' column found — skipping Model A training")

    # ── Model B: ETA Regressor ────────────────────────────────────────────────
    if "trip_duration_hours" in df.columns:
        # Drop rows where trip duration is NaN before training
        mask_b = df["trip_duration_hours"].notna() & (df["trip_duration_hours"] > 0)
        # Clip extreme outliers: cap at 99th percentile (removes multi-month data errors)
        p99 = df.loc[mask_b, "trip_duration_hours"].quantile(0.99)
        mask_b = mask_b & (df["trip_duration_hours"] <= p99)
        X_b = df.loc[mask_b, FEATURE_COLUMNS].values.astype(np.float32)
        y_eta = df.loc[mask_b, "trip_duration_hours"].values.astype(np.float32)
        logger.info("Training LightGBM ETA Regressor on %d rows (target: hours)...", len(X_b))
        reg = ETARegressor()
        metrics_b = reg.train(X_b, y_eta)
        logger.info("Model B metrics: %s", metrics_b)
    else:
        logger.warning("No trip_duration_hours column found — skipping Model B training")

    # ── Model C: Anomaly Detector ─────────────────────────────────────────────
    # Use only non-delayed trips as "normal" trajectories
    # Simulate trajectory features from available data
    traj_cols = []
    if "speed_variance" in df.columns:
        traj_cols.append("speed_variance")
    if "stop_count" in df.columns:
        traj_cols.append("stop_count")
    if "route_deviation_km" in df.columns:
        traj_cols.append("route_deviation_km")

    if len(traj_cols) == 3:
        normal_mask = df.get("is_delayed", pd.Series([0] * len(df))) == 0
        X_traj = df.loc[normal_mask, traj_cols].fillna(0).values.astype(np.float32)
        logger.info("Training Isolation Forest Anomaly Detector on %d normal trips...", len(X_traj))
        det = AnomalyDetector()
        metrics_c = det.train(X_traj)
        logger.info("Model C metrics: %s", metrics_c)
    else:
        # Synthesize trajectory features from distance and timing
        logger.info("Synthesizing trajectory features for anomaly detector...")
        normal_mask = df.get("is_delayed", pd.Series([0] * len(df))) == 0
        df_normal = df[normal_mask].copy()

        # Synthetic features: speed variance from distance, stop count from duration
        df_normal["speed_variance"] = np.random.exponential(5, len(df_normal))
        df_normal["stop_count"] = np.random.poisson(2, len(df_normal))
        df_normal["route_deviation_km"] = np.random.exponential(2, len(df_normal))

        X_traj = df_normal[["speed_variance", "stop_count", "route_deviation_km"]].values.astype(np.float32)
        det = AnomalyDetector()
        metrics_c = det.train(X_traj)
        logger.info("Model C metrics (synthetic): %s", metrics_c)

    logger.info("✅ All models trained and saved to ml/saved_models/")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train supply chain ML models")
    parser.add_argument("--csv", default="data/delivery_truck_trips.csv", help="Path to Kaggle CSV")
    args = parser.parse_args()

    csv_path = Path(__file__).resolve().parent.parent / args.csv
    if not csv_path.exists():
        logger.error("CSV not found at %s. Download from Kaggle first.", csv_path)
        sys.exit(1)

    train_all(str(csv_path))
