"""
/route endpoints
POST /route          — compute top-K alternative routes
GET  /route/{booking_id} — get stored route recommendations
POST /route/select   — dispatcher selects a route
"""
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from database import get_db
from models.schemas import RouteRequest, RouteResponse, RouteOption
from models.db_models import RouteRecommendation, Shipment
from routing.graph_router import get_graph, build_route_options

router = APIRouter(prefix="/route", tags=["Routing"])


@router.post("", response_model=RouteResponse)
async def compute_routes(payload: RouteRequest, db: AsyncSession = Depends(get_db)):
    """
    Compute top-K alternative routes for a shipment using A* on the road network graph.
    """
    graph = get_graph()
    options = build_route_options(
        graph=graph,
        origin_lat=payload.origin_lat,
        origin_lon=payload.origin_lon,
        dest_lat=payload.destination_lat,
        dest_lon=payload.destination_lon,
        current_risk_score=payload.current_risk_score,
        max_routes=payload.max_routes,
    )

    if not options:
        raise HTTPException(status_code=422, detail="Could not compute routes for given coordinates")

    # Persist recommendations
    for opt in options:
        rec = RouteRecommendation(
            booking_id=payload.booking_id,
            route_rank=opt["rank"],
            route_label=opt["label"],
            waypoints=opt["waypoints"],
            estimated_eta_minutes=opt["estimated_eta_minutes"],
            delay_risk=opt["delay_risk"],
            extra_cost_inr=opt["extra_cost_inr"],
            distance_km=opt["distance_km"],
            is_selected=False,
        )
        db.add(rec)
    await db.commit()

    current = options[0]
    alternatives = options[1:]

    return RouteResponse(
        booking_id=payload.booking_id,
        current_route=RouteOption(**current),
        alternatives=[RouteOption(**a) for a in alternatives],
        computed_at=datetime.now(timezone.utc),
    )


@router.get("/{booking_id}", response_model=List[RouteOption])
async def get_routes(booking_id: str, db: AsyncSession = Depends(get_db)):
    """Retrieve stored route recommendations for a booking."""
    result = await db.execute(
        select(RouteRecommendation)
        .where(RouteRecommendation.booking_id == booking_id)
        .order_by(RouteRecommendation.created_at.desc(), RouteRecommendation.route_rank)
        .limit(10)
    )
    recs = result.scalars().all()
    if not recs:
        raise HTTPException(status_code=404, detail=f"No routes found for booking_id={booking_id}")

    return [
        RouteOption(
            rank=r.route_rank,
            label=r.route_label or f"Route {r.route_rank}",
            waypoints=r.waypoints or [],
            estimated_eta_minutes=r.estimated_eta_minutes or 0,
            delay_risk=r.delay_risk or 0,
            extra_cost_inr=r.extra_cost_inr or 0,
            distance_km=r.distance_km or 0,
            is_recommended=r.is_selected,
        )
        for r in recs
    ]


@router.post("/select")
async def select_route(booking_id: str, route_rank: int, db: AsyncSession = Depends(get_db)):
    """
    Dispatcher selects a route. Marks it as selected and updates shipment status.
    """
    # Mark selected
    await db.execute(
        update(RouteRecommendation)
        .where(RouteRecommendation.booking_id == booking_id)
        .values(is_selected=False)
    )
    result = await db.execute(
        select(RouteRecommendation)
        .where(
            RouteRecommendation.booking_id == booking_id,
            RouteRecommendation.route_rank == route_rank,
        )
        .order_by(RouteRecommendation.created_at.desc())
        .limit(1)
    )
    rec = result.scalar_one_or_none()
    if not rec:
        raise HTTPException(status_code=404, detail="Route not found")

    rec.is_selected = True
    await db.commit()

    return {
        "message": f"Route {route_rank} selected for {booking_id}",
        "selected_route": {
            "label": rec.route_label,
            "estimated_eta_minutes": rec.estimated_eta_minutes,
            "delay_risk": rec.delay_risk,
            "extra_cost_inr": rec.extra_cost_inr,
        },
    }
