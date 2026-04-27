"""
TomTom Traffic Flow API integration.
Fetches real-time traffic congestion for a lat/lon point.

TomTom Flow Segment API:
  GET https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json
      ?point={lat},{lon}&key={API_KEY}

Returns currentSpeed, freeFlowSpeed → congestion ratio [0, 1].
Falls back to time-of-day simulation if API unavailable.
"""
import math
import logging
import httpx
from datetime import datetime, timezone
from functools import lru_cache
from typing import Optional

from config import settings

logger = logging.getLogger(__name__)

TOMTOM_FLOW_URL = (
    "https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json"
)

# Simple in-memory cache: (lat_r, lon_r) → (congestion, fetched_at_unix)
_traffic_cache: dict = {}
CACHE_TTL_SECONDS = 300  # 5 minutes


def _cache_key(lat: float, lon: float) -> tuple:
    return (round(lat, 2), round(lon, 2))


async def get_traffic_congestion(lat: float, lon: float) -> float:
    """
    Returns congestion factor [0.0, 1.0].
    0.0 = free flow, 1.0 = completely jammed.
    Uses TomTom API if key is set, otherwise simulates.
    """
    key = _cache_key(lat, lon)
    now = datetime.now(timezone.utc).timestamp()

    # Return cached value if fresh
    if key in _traffic_cache:
        val, fetched_at = _traffic_cache[key]
        if now - fetched_at < CACHE_TTL_SECONDS:
            return val

    if settings.TOMTOM_API_KEY:
        try:
            congestion = await _fetch_tomtom(lat, lon)
            _traffic_cache[key] = (congestion, now)
            return congestion
        except Exception as e:
            logger.warning("TomTom API error: %s — falling back to simulation", e)

    # Fallback: simulate from time-of-day
    congestion = _simulate_congestion(lat, lon)
    _traffic_cache[key] = (congestion, now)
    return congestion


async def _fetch_tomtom(lat: float, lon: float) -> float:
    """Call TomTom Flow Segment API and return congestion ratio."""
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.get(
            TOMTOM_FLOW_URL,
            params={
                "point": f"{lat},{lon}",
                "key": settings.TOMTOM_API_KEY,
                "unit": "KMPH",
            },
        )
        resp.raise_for_status()
        data = resp.json()

    flow = data.get("flowSegmentData", {})
    current_speed = flow.get("currentSpeed", 0)
    free_flow_speed = flow.get("freeFlowSpeed", 1)

    if free_flow_speed <= 0:
        return 0.0

    # Congestion = how much slower than free flow (0 = free, 1 = stopped)
    congestion = max(0.0, 1.0 - (current_speed / free_flow_speed))
    logger.debug("TomTom traffic at (%.2f, %.2f): %.0f/%.0f kmph → congestion %.2f",
                 lat, lon, current_speed, free_flow_speed, congestion)
    return round(congestion, 3)


def _simulate_congestion(lat: float, lon: float) -> float:
    """
    Simulate realistic traffic congestion based on:
    - Time of day (peak hours)
    - Location (urban density proxy from lat/lon)
    - Random noise
    """
    import random
    now = datetime.now(timezone.utc)
    hour = now.hour

    # Peak hour multiplier
    if 7 <= hour <= 9 or 16 <= hour <= 19:
        base = 0.55  # heavy congestion
    elif 10 <= hour <= 15:
        base = 0.25  # moderate
    elif 20 <= hour <= 22:
        base = 0.20
    else:
        base = 0.10  # night / early morning

    # Urban density proxy: major US metro areas have higher congestion
    urban_boost = _urban_density_factor(lat, lon)

    # Deterministic noise from coordinates (reproducible per location)
    seed = int(abs(lat * 100) + abs(lon * 100)) % 1000
    rng = random.Random(seed + now.hour)
    noise = rng.uniform(-0.08, 0.08)

    congestion = min(0.95, max(0.0, base + urban_boost + noise))
    return round(congestion, 3)


def _urban_density_factor(lat: float, lon: float) -> float:
    """Return extra congestion for known US metro areas."""
    metros = [
        # (lat, lon, radius_deg, boost)
        (40.71, -74.01, 1.5, 0.25),   # New York
        (34.05, -118.24, 1.5, 0.22),  # Los Angeles
        (41.88, -87.63, 1.2, 0.20),   # Chicago
        (29.76, -95.37, 1.0, 0.18),   # Houston
        (33.45, -112.07, 1.0, 0.15),  # Phoenix
        (39.95, -75.17, 0.8, 0.18),   # Philadelphia
        (29.42, -98.49, 0.8, 0.15),   # San Antonio
        (32.79, -96.80, 0.8, 0.17),   # Dallas
        (30.33, -81.66, 0.7, 0.14),   # Jacksonville
        (37.77, -122.42, 1.0, 0.20),  # San Francisco
        (47.61, -122.33, 0.8, 0.18),  # Seattle
        (39.74, -104.98, 0.8, 0.15),  # Denver
        (42.36, -71.06, 0.8, 0.18),   # Boston
        (36.17, -86.78, 0.7, 0.14),   # Nashville
        (35.23, -80.84, 0.7, 0.14),   # Charlotte
    ]
    for mlat, mlon, radius, boost in metros:
        dist = math.sqrt((lat - mlat) ** 2 + (lon - mlon) ** 2)
        if dist < radius:
            return boost * (1 - dist / radius)
    return 0.0
