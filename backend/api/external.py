"""
/external endpoints — real-time traffic and weather data
GET /external/traffic?lat=&lon=   — TomTom congestion for a point
GET /external/weather?lat=&lon=   — OpenWeather conditions for a point
GET /external/corridor?origin_lat=&origin_lon=&dest_lat=&dest_lon=
    — Combined traffic + weather summary for a route corridor
"""
from fastapi import APIRouter, Query
from services.traffic import get_traffic_congestion
from services.weather import get_weather

router = APIRouter(prefix="/external", tags=["External Data"])


@router.get("/traffic")
async def traffic(
    lat: float = Query(..., ge=24.0, le=50.0),
    lon: float = Query(..., ge=-125.0, le=-66.0),
):
    """Real-time traffic congestion [0-1] at a GPS point."""
    congestion = await get_traffic_congestion(lat, lon)
    return {
        "lat": lat,
        "lon": lon,
        "congestion": congestion,
        "congestion_level": round(congestion * 10, 1),
        "label": "Heavy" if congestion > 0.7 else "Moderate" if congestion > 0.4 else "Light",
    }


@router.get("/weather")
async def weather(
    lat: float = Query(..., ge=24.0, le=50.0),
    lon: float = Query(..., ge=-125.0, le=-66.0),
):
    """Current weather conditions at a GPS point."""
    w = await get_weather(lat, lon)
    return {"lat": lat, "lon": lon, **w}


@router.get("/corridor")
async def corridor(
    origin_lat: float = Query(...),
    origin_lon: float = Query(...),
    dest_lat: float = Query(...),
    dest_lon: float = Query(...),
):
    """
    Fetch traffic + weather for origin, midpoint, and destination.
    Returns a combined corridor risk assessment.
    """
    mid_lat = (origin_lat + dest_lat) / 2
    mid_lon = (origin_lon + dest_lon) / 2

    # Fetch all 3 points concurrently
    import asyncio
    (cong_orig, cong_mid, cong_dest,
     wx_orig, wx_mid, wx_dest) = await asyncio.gather(
        get_traffic_congestion(origin_lat, origin_lon),
        get_traffic_congestion(mid_lat, mid_lon),
        get_traffic_congestion(dest_lat, dest_lon),
        get_weather(origin_lat, origin_lon),
        get_weather(mid_lat, mid_lon),
        get_weather(dest_lat, dest_lon),
    )

    avg_congestion = round((cong_orig + cong_mid + cong_dest) / 3, 3)
    max_weather_severity = max(
        wx_orig["severity"], wx_mid["severity"], wx_dest["severity"]
    )

    # Combined corridor risk
    corridor_risk = min(1.0, avg_congestion * 0.6 + (max_weather_severity / 5) * 0.4)

    return {
        "origin": {"lat": origin_lat, "lon": origin_lon,
                   "congestion": cong_orig, "weather": wx_orig},
        "midpoint": {"lat": mid_lat, "lon": mid_lon,
                     "congestion": cong_mid, "weather": wx_mid},
        "destination": {"lat": dest_lat, "lon": dest_lon,
                        "congestion": cong_dest, "weather": wx_dest},
        "summary": {
            "avg_congestion": avg_congestion,
            "max_weather_severity": round(max_weather_severity, 2),
            "corridor_risk": round(corridor_risk, 3),
            "recommendation": (
                "HIGH RISK — Consider alternate route"
                if corridor_risk > 0.7 else
                "MODERATE — Monitor conditions"
                if corridor_risk > 0.4 else
                "CLEAR — Proceed normally"
            ),
        },
    }
