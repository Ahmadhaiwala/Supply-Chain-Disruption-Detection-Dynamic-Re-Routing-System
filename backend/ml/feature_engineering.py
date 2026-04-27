"""
Feature engineering pipeline — USA Dynamic Supply Chain Logistics Dataset.

Dataset columns (all numeric, no nulls):
  timestamp, vehicle_gps_latitude, vehicle_gps_longitude,
  fuel_consumption_rate, eta_variation_hours, traffic_congestion_level,
  warehouse_inventory_level, loading_unloading_time,
  handling_equipment_availability, order_fulfillment_status,
  weather_condition_severity, port_congestion_level, shipping_costs,
  supplier_reliability_score, lead_time_days, historical_demand,
  iot_temperature, cargo_condition_status, route_risk_level,
  customs_clearance_time, driver_behavior_score, fatigue_monitoring_score,
  disruption_likelihood_score, delay_probability, risk_classification,
  delivery_time_deviation
"""
import numpy as np
import pandas as pd
from typing import Optional

# ─── Feature columns — must match training order exactly ──────────────────────
FEATURE_COLUMNS = [
    # Real-time sensor / operational
    "traffic_congestion_level",      # 0-10 scale
    "weather_condition_severity",    # 0-10 scale
    "fuel_consumption_rate",         # litres/100km
    "eta_variation_hours",           # hours ahead/behind schedule
    "loading_unloading_time",        # hours
    "handling_equipment_availability",  # 0-1
    "order_fulfillment_status",      # 0-1
    "port_congestion_level",         # 0-10
    "shipping_costs",                # USD
    "supplier_reliability_score",    # 0-1
    "lead_time_days",                # days
    "iot_temperature",               # celsius
    "cargo_condition_status",        # 0-1
    "route_risk_level",              # 0-10
    "customs_clearance_time",        # hours
    "driver_behavior_score",         # 0-1
    "fatigue_monitoring_score",      # 0-1
    "disruption_likelihood_score",   # 0-1
    # Temporal
    "hour_of_day",
    "day_of_week",
    "is_weekend",
    "is_peak_hour",
    "month",
    # Spatial
    "vehicle_gps_latitude",
    "vehicle_gps_longitude",
]

# Trajectory features for Isolation Forest
TRAJECTORY_FEATURES = [
    "traffic_congestion_level",
    "fuel_consumption_rate",
    "driver_behavior_score",
    "fatigue_monitoring_score",
    "route_risk_level",
]


def build_feature_vector(data: dict) -> np.ndarray:
    """
    Build feature vector from a PredictionInput dict.
    Maps frontend field names → dataset column names.

    Scaling notes:
      - corridor_congestion_index: frontend sends [0,1] → multiply by 10 to get dataset scale
      - weather_severity: frontend sends value/2 (0-5 range) → multiply by 2 to get 0-10
      - route_historical_delay_rate: frontend sends [0,1] → multiply by 10
    """
    now_hour = data.get("hour_of_day", 12)
    row = {
        "traffic_congestion_level":        data.get("corridor_congestion_index", 0.4) * 10,
        "weather_condition_severity":      data.get("weather_severity", 1.0) * 2,
        "fuel_consumption_rate":           data.get("fuel_consumption_rate", 5.0),
        "eta_variation_hours":             data.get("eta_variation_hours", 0.0),
        "loading_unloading_time":          data.get("loading_unloading_time", 2.0),
        "handling_equipment_availability": data.get("handling_equipment_availability", 0.8),
        "order_fulfillment_status":        data.get("order_fulfillment_status", 0.9),
        "port_congestion_level":           data.get("port_congestion_level", 3.0),
        "shipping_costs":                  data.get("shipping_costs", 400.0),
        "supplier_reliability_score":      data.get("carrier_ontime_rate", 0.85),
        "lead_time_days":                  data.get("lead_time_days", 3.0),
        "iot_temperature":                 data.get("temperature_celsius", 20.0),
        "cargo_condition_status":          data.get("cargo_condition_status", 0.9),
        "route_risk_level":                data.get("route_historical_delay_rate", 0.2) * 10,
        "customs_clearance_time":          data.get("customs_clearance_time", 1.0),
        "driver_behavior_score":           data.get("driver_behavior_score", 0.8),
        "fatigue_monitoring_score":        data.get("fatigue_monitoring_score", 0.2),
        "disruption_likelihood_score":     data.get("disruption_likelihood_score", 0.3),
        "hour_of_day":                     now_hour,
        "day_of_week":                     data.get("day_of_week", 1),
        "is_weekend":                      data.get("is_weekend", 0),
        "is_peak_hour":                    1 if now_hour in range(7, 10) or now_hour in range(16, 20) else 0,
        "month":                           data.get("month", 6),
        "vehicle_gps_latitude":            data.get("origin_lat", 40.0),
        "vehicle_gps_longitude":           data.get("origin_lon", -95.0),
    }
    return np.array([row[col] for col in FEATURE_COLUMNS], dtype=np.float32)



def build_trajectory_vector(data: dict) -> Optional[np.ndarray]:
    """Build trajectory feature vector for Isolation Forest."""
    vals = [
        data.get("corridor_congestion_index", 0.5) * 10,
        data.get("fuel_consumption_rate", 5.0),
        data.get("driver_behavior_score", 0.8),
        data.get("fatigue_monitoring_score", 0.2),
        data.get("route_historical_delay_rate", 0.2) * 10,
    ]
    return np.array([vals], dtype=np.float32)


def engineer_from_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """
    Feature engineering for the USA Dynamic Supply Chain Logistics Dataset.
    All columns are already numeric — just add temporal features from timestamp.
    """
    df = df.copy()

    # Parse timestamp
    df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")

    # Temporal features
    df["hour_of_day"] = df["timestamp"].dt.hour.fillna(12).astype(int)
    df["day_of_week"] = df["timestamp"].dt.dayofweek.fillna(0).astype(int)
    df["is_weekend"] = (df["day_of_week"] >= 5).astype(int)
    df["is_peak_hour"] = df["hour_of_day"].apply(
        lambda h: 1 if h in range(7, 10) or h in range(16, 20) else 0
    )
    df["month"] = df["timestamp"].dt.month.fillna(6).astype(int)

    # Binary delay label from risk_classification
    risk_map = {"High Risk": 1, "Moderate Risk": 1, "Low Risk": 0}
    df["is_delayed"] = df["risk_classification"].map(risk_map).fillna(0).astype(int)

    # ETA regression target: delivery_time_deviation (hours)
    df["trip_duration_hours"] = df["delivery_time_deviation"].clip(lower=0)

    return df
