"""
OpenWeatherMap API integration.
Fetches current weather severity for a lat/lon point.

API: GET https://api.openweathermap.org/data/2.5/weather
     ?lat={lat}&lon={lon}&appid={key}&units=imperial

Falls back to simulation if API key not set.
"""
import logging
import httpx
from datetime import datetime, timezone
from typing import Optional

from config import settings

logger = logging.getLogger(__name__)

OWM_URL = "https://api.openweathermap.org/data/2.5/weather"

_weather_cache: dict = {}
CACHE_TTL_SECONDS = 600  # 10 minutes


async def get_weather(lat: float, lon: float) -> dict:
    """
    Returns weather dict:
    {
        "severity": float,        # 0-5 scale (0=clear, 5=extreme)
        "temperature_f": float,
        "precipitation_mm": float,
        "condition": str,         # "Clear", "Rain", "Snow", etc.
        "wind_speed_mph": float,
    }
    """
    key = (round(lat, 1), round(lon, 1))
    now = datetime.now(timezone.utc).timestamp()

    if key in _weather_cache:
        val, fetched_at = _weather_cache[key]
        if now - fetched_at < CACHE_TTL_SECONDS:
            return val

    if settings.OPENWEATHER_API_KEY:
        try:
            result = await _fetch_owm(lat, lon)
            _weather_cache[key] = (result, now)
            return result
        except Exception as e:
            logger.warning("OpenWeather API error: %s — falling back to simulation", e)

    result = _simulate_weather(lat, lon)
    _weather_cache[key] = (result, now)
    return result


async def _fetch_owm(lat: float, lon: float) -> dict:
    """Fetch from OpenWeatherMap and normalise to our schema."""
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.get(
            OWM_URL,
            params={
                "lat": lat,
                "lon": lon,
                "appid": settings.OPENWEATHER_API_KEY,
                "units": "imperial",
            },
        )
        resp.raise_for_status()
        data = resp.json()

    weather_id = data["weather"][0]["id"]
    condition = data["weather"][0]["main"]
    temp_f = data["main"]["temp"]
    wind_mph = data["wind"]["speed"]
    rain_mm = data.get("rain", {}).get("1h", 0.0)
    snow_mm = data.get("snow", {}).get("1h", 0.0)
    precip_mm = rain_mm + snow_mm

    severity = _weather_id_to_severity(weather_id, wind_mph, precip_mm)

    logger.debug("OWM weather at (%.1f, %.1f): %s, severity=%.1f", lat, lon, condition, severity)
    return {
        "severity": severity,
        "temperature_f": round(temp_f, 1),
        "precipitation_mm": round(precip_mm, 2),
        "condition": condition,
        "wind_speed_mph": round(wind_mph, 1),
    }


def _weather_id_to_severity(weather_id: int, wind_mph: float, precip_mm: float) -> float:
    """
    Map OWM weather condition ID to 0-5 severity scale.
    https://openweathermap.org/weather-conditions
    """
    if weather_id >= 900:       # Extreme: tornado, hurricane
        return 5.0
    elif weather_id >= 800:     # Clear / clouds
        base = 0.0 if weather_id == 800 else 0.5
    elif weather_id >= 700:     # Atmosphere: fog, haze, smoke
        base = 2.0
    elif weather_id >= 600:     # Snow
        base = 3.0 + min(precip_mm / 5, 1.5)
    elif weather_id >= 500:     # Rain
        base = 2.0 + min(precip_mm / 10, 2.0)
    elif weather_id >= 300:     # Drizzle
        base = 1.0
    elif weather_id >= 200:     # Thunderstorm
        base = 4.0
    else:
        base = 1.0

    # Wind penalty
    if wind_mph > 50:
        base = min(5.0, base + 1.5)
    elif wind_mph > 30:
        base = min(5.0, base + 0.5)

    return round(min(5.0, base), 2)


def _simulate_weather(lat: float, lon: float) -> dict:
    """Simulate weather based on US region and season."""
    import random
    now = datetime.now(timezone.utc)
    month = now.month

    # Regional base temperature (Fahrenheit)
    if lat > 45:        # Northern states
        base_temp = 30 if month in (12, 1, 2) else 55 if month in (3, 4, 11) else 70
    elif lat > 35:      # Mid-states
        base_temp = 45 if month in (12, 1, 2) else 65 if month in (3, 4, 11) else 82
    else:               # Southern states
        base_temp = 60 if month in (12, 1, 2) else 75 if month in (3, 4, 11) else 92

    # Seasonal precipitation probability
    precip_prob = 0.3 if month in (6, 7, 8) else 0.4 if month in (3, 4, 5) else 0.35

    rng = random.Random(int(abs(lat * 10) + abs(lon * 10)) + now.day)
    has_precip = rng.random() < precip_prob
    precip_mm = rng.uniform(0.5, 8.0) if has_precip else 0.0
    wind_mph = rng.uniform(5, 25)

    # Winter snow in northern states
    is_snow = lat > 40 and month in (12, 1, 2) and base_temp < 35
    condition = "Snow" if is_snow else ("Rain" if has_precip else "Clear")
    severity = 2.5 if is_snow else (1.5 if has_precip else 0.2)

    return {
        "severity": round(severity + rng.uniform(-0.3, 0.3), 2),
        "temperature_f": round(base_temp + rng.uniform(-8, 8), 1),
        "precipitation_mm": round(precip_mm, 2),
        "condition": condition,
        "wind_speed_mph": round(wind_mph, 1),
    }
