"""
Feature engineering pipeline.
Converts raw PredictionInput into a numpy array ready for model inference.
"""
import re
import numpy as np
import pandas as pd
from typing import Optional


# Ordered feature list — must match training column order
FEATURE_COLUMNS = [
    "hour_of_day",
    "day_of_week",
    "is_weekend",
    "is_peak_hour",
    "month",
    "distance_km",
    "planned_duration_hours",
    "vehicle_tonnage",
    "is_market_trip",
    "corridor_congestion_index",
    "nearby_disruptions_count",
    "carrier_ontime_rate",
    "route_historical_delay_rate",
    "weather_severity",
    "temperature_celsius",
    "precipitation_mm",
    "event_flag_accident",
    "delay_rate_t1h",
    "delay_rate_t2h",
    "delay_rate_t3h",
    # Derived
    "is_reefer",
    "origin_lat",
    "origin_lon",
    "destination_lat",
    "destination_lon",
]

# GPS trajectory features (for Isolation Forest only)
TRAJECTORY_FEATURES = [
    "speed_variance",
    "stop_count",
    "route_deviation_km",
]


def _extract_tonnage(vtype: str) -> float:
    """Extract numeric tonnage from vehicleType string, e.g. '32 FT 14MT' -> 14.0"""
    if not vtype or pd.isna(vtype):
        return 14.0
    match = re.search(r"(\d+(?:\.\d+)?)\s*MT", str(vtype), re.IGNORECASE)
    return float(match.group(1)) if match else 14.0


def build_feature_vector(data: dict) -> np.ndarray:
    """
    Build the tabular feature vector for XGBoost / LightGBM.

    Args:
        data: dict matching PredictionInput fields

    Returns:
        1-D numpy array of shape (len(FEATURE_COLUMNS),)
    """
    is_reefer = 1 if str(data.get("vehicle_type", "")).lower() in ("reefer", "refrigerated") else 0
    temp = data.get("temperature_celsius") or 25.0

    # Planned duration: distance / assumed avg speed (50 km/h for long-haul)
    distance_km = data.get("distance_km", 0) or 0
    planned_duration_hours = distance_km / 50.0

    row = {
        "hour_of_day": data["hour_of_day"],
        "day_of_week": data["day_of_week"],
        "is_weekend": data["is_weekend"],
        "is_peak_hour": data["is_peak_hour"],
        "month": data["month"],
        "distance_km": distance_km,
        "planned_duration_hours": planned_duration_hours,
        "vehicle_tonnage": _extract_tonnage(data.get("vehicle_type", "")),
        "is_market_trip": 0,
        "corridor_congestion_index": data["corridor_congestion_index"],
        "nearby_disruptions_count": data["nearby_disruptions_count"],
        "carrier_ontime_rate": data["carrier_ontime_rate"],
        "route_historical_delay_rate": data["route_historical_delay_rate"],
        "weather_severity": data["weather_severity"],
        "temperature_celsius": temp,
        "precipitation_mm": data["precipitation_mm"],
        "event_flag_accident": data["event_flag_accident"],
        "delay_rate_t1h": data["delay_rate_t1h"],
        "delay_rate_t2h": data["delay_rate_t2h"],
        "delay_rate_t3h": data["delay_rate_t3h"],
        "is_reefer": is_reefer,
        "origin_lat": data["origin_lat"],
        "origin_lon": data["origin_lon"],
        "destination_lat": data["destination_lat"],
        "destination_lon": data["destination_lon"],
    }

    return np.array([row[col] for col in FEATURE_COLUMNS], dtype=np.float32)


def build_trajectory_vector(data: dict) -> Optional[np.ndarray]:
    """
    Build the trajectory feature vector for Isolation Forest.
    Returns None if GPS features are missing.
    """
    speed_var = data.get("speed_variance")
    stop_count = data.get("stop_count")
    deviation = data.get("route_deviation_km")

    if any(v is None for v in [speed_var, stop_count, deviation]):
        return None

    return np.array([[speed_var, stop_count, deviation]], dtype=np.float32)


def engineer_from_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """
    Full feature engineering for training on the Kaggle Delivery Truck Trips dataset.
    """
    df = df.copy()

    # Parse timestamps
    for col in ["trip_start_date", "trip_end_date", "Planned_ETA", "actual_eta"]:
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], errors="coerce")

    # Temporal features (from trip start)
    df["hour_of_day"] = df["trip_start_date"].dt.hour.fillna(0).astype(int)
    df["day_of_week"] = df["trip_start_date"].dt.dayofweek.fillna(0).astype(int)
    df["is_weekend"] = (df["day_of_week"] >= 5).astype(int)
    df["is_peak_hour"] = df["hour_of_day"].apply(
        lambda h: 1 if h in range(8, 11) or h in range(17, 20) else 0
    )
    df["month"] = df["trip_start_date"].dt.month.fillna(1).astype(int)

    # Parse lat/lon strings "lat,lon"
    for prefix, col in [("origin", "Org_lat_lon"), ("destination", "Des_lat_lon")]:
        if col in df.columns:
            split = df[col].astype(str).str.split(",", expand=True)
            df[f"{prefix}_lat"] = pd.to_numeric(split[0], errors="coerce")
            df[f"{prefix}_lon"] = pd.to_numeric(split[1], errors="coerce")

    # Distance — fill NaN with median
    if "TRANSPORTATION_DISTANCE_IN_KM" in df.columns:
        dist = pd.to_numeric(df["TRANSPORTATION_DISTANCE_IN_KM"], errors="coerce")
        df["distance_km"] = dist.fillna(dist.median())
    else:
        df["distance_km"] = 0.0

    # Vehicle type features
    df["is_reefer"] = (
        df.get("vehicleType", pd.Series([""] * len(df)))
        .fillna("")
        .str.lower()
        .str.contains("reefer|refrigerated")
        .fillna(False)
        .astype(int)
    )
    if "vehicleType" in df.columns:
        df["vehicle_tonnage"] = df["vehicleType"].apply(_extract_tonnage)
    else:
        df["vehicle_tonnage"] = 14.0

    # Market vs Regular trip
    market_col = "Market/Regular " if "Market/Regular " in df.columns else "Market/Regular"
    if market_col in df.columns:
        df["is_market_trip"] = (
            df[market_col].astype(str).str.strip().str.lower() == "market"
        ).astype(int)
    else:
        df["is_market_trip"] = 0

    # Planned duration in hours
    if "Planned_ETA" in df.columns and "trip_start_date" in df.columns:
        planned_h = (df["Planned_ETA"] - df["trip_start_date"]).dt.total_seconds() / 3600
        df["planned_duration_hours"] = planned_h.clip(lower=0).fillna(df["distance_km"] / 50.0)
    else:
        df["planned_duration_hours"] = df["distance_km"] / 50.0

    # Delay label: 'delay' column (R = delayed) is ground truth
    if "delay" in df.columns:
        df["is_delayed"] = (
            df["delay"].astype(str).str.strip().str.upper() == "R"
        ).astype(int)
    elif "ontime" in df.columns:
        df["is_delayed"] = (
            df["ontime"].astype(str).str.strip().str.upper() != "G"
        ).astype(int)
    elif "actual_eta" in df.columns and "Planned_ETA" in df.columns:
        delay_h = (df["actual_eta"] - df["Planned_ETA"]).dt.total_seconds() / 3600
        df["is_delayed"] = (delay_h > 0.5).astype(int)

    # Trip duration in HOURS — ETA regression target
    if "actual_eta" in df.columns and "trip_start_date" in df.columns:
        duration_h = (df["actual_eta"] - df["trip_start_date"]).dt.total_seconds() / 3600
        df["trip_duration_hours"] = duration_h.clip(lower=0)
    elif "actual_eta" in df.columns and "Planned_ETA" in df.columns:
        duration_h = (df["actual_eta"] - df["Planned_ETA"]).dt.total_seconds() / 3600
        df["trip_duration_hours"] = duration_h.clip(lower=0)

    # Placeholder aggregated features (zeros at training time; enriched at inference)
    for col in ["corridor_congestion_index", "carrier_ontime_rate", "route_historical_delay_rate",
                "weather_severity", "temperature_celsius", "precipitation_mm",
                "event_flag_accident", "delay_rate_t1h", "delay_rate_t2h", "delay_rate_t3h",
                "nearby_disruptions_count"]:
        if col not in df.columns:
            df[col] = 0.0

    return df
