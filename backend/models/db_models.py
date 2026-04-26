from sqlalchemy import Column, String, Float, Integer, DateTime, Boolean, Text, JSON
from sqlalchemy.sql import func
from database import Base


class Shipment(Base):
    __tablename__ = "shipments"

    id = Column(Integer, primary_key=True, index=True)
    booking_id = Column(String(50), unique=True, index=True, nullable=False)

    # Origin / Destination
    origin_lat = Column(Float, nullable=False)
    origin_lon = Column(Float, nullable=False)
    destination_lat = Column(Float, nullable=False)
    destination_lon = Column(Float, nullable=False)

    # Current position
    current_lat = Column(Float, nullable=True)
    current_lon = Column(Float, nullable=True)

    # Timing
    planned_eta = Column(DateTime, nullable=True)
    actual_eta = Column(DateTime, nullable=True)
    trip_start = Column(DateTime, nullable=True)
    trip_end = Column(DateTime, nullable=True)

    # Attributes
    vehicle_type = Column(String(50), nullable=True)
    distance_km = Column(Float, nullable=True)
    cargo_type = Column(String(100), nullable=True)
    carrier_id = Column(String(50), nullable=True)

    # Status
    status = Column(String(20), default="IN_TRANSIT")  # IN_TRANSIT, DELIVERED, DELAYED
    is_delayed = Column(Boolean, default=False)

    # Risk
    current_risk_score = Column(Float, default=0.0)
    risk_level = Column(String(10), default="LOW")  # LOW, MEDIUM, HIGH

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class PredictionLog(Base):
    __tablename__ = "prediction_logs"

    id = Column(Integer, primary_key=True, index=True)
    booking_id = Column(String(50), index=True, nullable=False)

    # Predictions
    delay_probability = Column(Float, nullable=False)
    eta_prediction_minutes = Column(Float, nullable=True)
    anomaly_score = Column(Float, nullable=True)
    ensemble_risk_score = Column(Float, nullable=False)
    risk_level = Column(String(10), nullable=False)

    # Actuals (filled post-trip)
    actual_delayed = Column(Boolean, nullable=True)
    actual_delay_minutes = Column(Float, nullable=True)

    # SHAP / feature importance snapshot
    shap_values = Column(JSON, nullable=True)
    features_used = Column(JSON, nullable=True)

    predicted_at = Column(DateTime, server_default=func.now())


class RouteRecommendation(Base):
    __tablename__ = "route_recommendations"

    id = Column(Integer, primary_key=True, index=True)
    booking_id = Column(String(50), index=True, nullable=False)

    route_rank = Column(Integer, nullable=False)  # 1 = best
    route_label = Column(String(100), nullable=True)  # e.g. "Via Sanand"
    waypoints = Column(JSON, nullable=True)  # list of [lat, lon]
    estimated_eta_minutes = Column(Float, nullable=True)
    delay_risk = Column(Float, nullable=True)
    extra_cost_inr = Column(Float, default=0.0)
    distance_km = Column(Float, nullable=True)
    is_selected = Column(Boolean, default=False)

    created_at = Column(DateTime, server_default=func.now())


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, index=True)
    booking_id = Column(String(50), index=True, nullable=False)
    alert_type = Column(String(50), nullable=False)  # DELAY_RISK, ANOMALY, WEATHER
    severity = Column(String(10), nullable=False)  # LOW, MEDIUM, HIGH
    message = Column(Text, nullable=False)
    is_acknowledged = Column(Boolean, default=False)
    created_at = Column(DateTime, server_default=func.now())
