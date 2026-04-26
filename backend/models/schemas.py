from pydantic import BaseModel, Field
from typing import Optional, List, Any
from datetime import datetime
from enum import Enum


# ─── Enums ────────────────────────────────────────────────────────────────────

class RiskLevel(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class ShipmentStatus(str, Enum):
    IN_TRANSIT = "IN_TRANSIT"
    DELIVERED = "DELIVERED"
    DELAYED = "DELAYED"


# ─── Shipment Schemas ─────────────────────────────────────────────────────────

class ShipmentCreate(BaseModel):
    booking_id: str
    origin_lat: float
    origin_lon: float
    destination_lat: float
    destination_lon: float
    current_lat: Optional[float] = None
    current_lon: Optional[float] = None
    planned_eta: Optional[datetime] = None
    vehicle_type: Optional[str] = None
    distance_km: Optional[float] = None
    cargo_type: Optional[str] = None
    carrier_id: Optional[str] = None
    trip_start: Optional[datetime] = None


class ShipmentUpdate(BaseModel):
    current_lat: Optional[float] = None
    current_lon: Optional[float] = None
    status: Optional[ShipmentStatus] = None
    actual_eta: Optional[datetime] = None
    is_delayed: Optional[bool] = None


class ShipmentResponse(BaseModel):
    id: int
    booking_id: str
    origin_lat: float
    origin_lon: float
    destination_lat: float
    destination_lon: float
    current_lat: Optional[float]
    current_lon: Optional[float]
    planned_eta: Optional[datetime]
    actual_eta: Optional[datetime]
    vehicle_type: Optional[str]
    distance_km: Optional[float]
    cargo_type: Optional[str]
    carrier_id: Optional[str]
    status: str
    is_delayed: bool
    current_risk_score: float
    risk_level: str
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True


# ─── Prediction Schemas ───────────────────────────────────────────────────────

class PredictionInput(BaseModel):
    booking_id: str

    # Temporal
    hour_of_day: int = Field(..., ge=0, le=23)
    day_of_week: int = Field(..., ge=0, le=6)
    is_weekend: int = Field(..., ge=0, le=1)
    is_peak_hour: int = Field(..., ge=0, le=1)
    month: int = Field(..., ge=1, le=12)

    # Spatial
    origin_lat: float
    origin_lon: float
    destination_lat: float
    destination_lon: float
    distance_km: float
    corridor_id: Optional[str] = None

    # Network
    corridor_congestion_index: float = Field(default=0.5, ge=0.0, le=1.0)
    nearby_disruptions_count: int = Field(default=0, ge=0)

    # Historical
    carrier_ontime_rate: float = Field(default=0.85, ge=0.0, le=1.0)
    route_historical_delay_rate: float = Field(default=0.15, ge=0.0, le=1.0)
    vehicle_type: Optional[str] = None

    # External
    weather_severity: float = Field(default=0.0, ge=0.0, le=5.0)
    temperature_celsius: Optional[float] = None
    precipitation_mm: float = Field(default=0.0, ge=0.0)
    event_flag_accident: int = Field(default=0, ge=0, le=1)

    # Lag features
    delay_rate_t1h: float = Field(default=0.0, ge=0.0, le=1.0)
    delay_rate_t2h: float = Field(default=0.0, ge=0.0, le=1.0)
    delay_rate_t3h: float = Field(default=0.0, ge=0.0, le=1.0)

    # GPS trajectory (for anomaly detection)
    speed_variance: Optional[float] = None
    stop_count: Optional[int] = None
    route_deviation_km: Optional[float] = None


class PredictionResponse(BaseModel):
    booking_id: str
    delay_probability: float = Field(..., ge=0.0, le=1.0)
    eta_prediction_minutes: Optional[float]
    eta_lower_bound_minutes: Optional[float]
    eta_upper_bound_minutes: Optional[float]
    anomaly_score: Optional[float]
    is_anomaly: bool
    ensemble_risk_score: float = Field(..., ge=0.0, le=1.0)
    risk_level: RiskLevel
    shap_top_features: Optional[List[dict]]
    recommendation: str
    predicted_at: datetime


# ─── Routing Schemas ──────────────────────────────────────────────────────────

class RouteRequest(BaseModel):
    booking_id: str
    origin_lat: float
    origin_lon: float
    destination_lat: float
    destination_lon: float
    current_risk_score: float = Field(default=0.0, ge=0.0, le=1.0)
    max_routes: int = Field(default=3, ge=1, le=5)


class RouteOption(BaseModel):
    rank: int
    label: str
    waypoints: List[List[float]]  # [[lat, lon], ...]
    estimated_eta_minutes: float
    delay_risk: float
    extra_cost_inr: float
    distance_km: float
    is_recommended: bool


class RouteResponse(BaseModel):
    booking_id: str
    current_route: RouteOption
    alternatives: List[RouteOption]
    computed_at: datetime


# ─── Alert Schemas ────────────────────────────────────────────────────────────

class AlertResponse(BaseModel):
    id: int
    booking_id: str
    alert_type: str
    severity: str
    message: str
    is_acknowledged: bool
    created_at: datetime

    class Config:
        from_attributes = True


class AlertAcknowledge(BaseModel):
    alert_id: int


# ─── WebSocket Message ────────────────────────────────────────────────────────

class WSMessage(BaseModel):
    event: str  # "position_update" | "risk_update" | "alert" | "reroute"
    booking_id: str
    data: Any
    timestamp: datetime
