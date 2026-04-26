"""
/shipments endpoints — CRUD for shipment tracking
GET    /shipments          — list all shipments (with optional filters)
POST   /shipments          — create a new shipment
GET    /shipments/{id}     — get shipment by booking_id
PATCH  /shipments/{id}     — update position / status
DELETE /shipments/{id}     — remove shipment
GET    /shipments/{id}/alerts — get alerts for a shipment
POST   /shipments/{id}/alerts/acknowledge — acknowledge an alert
"""
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from database import get_db
from models.schemas import ShipmentCreate, ShipmentUpdate, ShipmentResponse, AlertResponse, AlertAcknowledge
from models.db_models import Shipment, Alert

router = APIRouter(prefix="/shipments", tags=["Shipments"])


@router.get("", response_model=List[ShipmentResponse])
async def list_shipments(
    status: Optional[str] = Query(None, description="Filter by status: IN_TRANSIT, DELIVERED, DELAYED"),
    risk_level: Optional[str] = Query(None, description="Filter by risk: LOW, MEDIUM, HIGH"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    query = select(Shipment)
    if status:
        query = query.where(Shipment.status == status.upper())
    if risk_level:
        query = query.where(Shipment.risk_level == risk_level.upper())
    query = query.order_by(Shipment.created_at.desc()).limit(limit).offset(offset)

    result = await db.execute(query)
    return result.scalars().all()


@router.post("", response_model=ShipmentResponse, status_code=201)
async def create_shipment(payload: ShipmentCreate, db: AsyncSession = Depends(get_db)):
    # Check for duplicate booking_id
    existing = await db.execute(select(Shipment).where(Shipment.booking_id == payload.booking_id))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"Shipment {payload.booking_id} already exists")

    shipment = Shipment(**payload.model_dump())
    db.add(shipment)
    await db.commit()
    await db.refresh(shipment)
    return shipment


@router.get("/{booking_id}", response_model=ShipmentResponse)
async def get_shipment(booking_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Shipment).where(Shipment.booking_id == booking_id))
    shipment = result.scalar_one_or_none()
    if not shipment:
        raise HTTPException(status_code=404, detail=f"Shipment {booking_id} not found")
    return shipment


@router.patch("/{booking_id}", response_model=ShipmentResponse)
async def update_shipment(booking_id: str, payload: ShipmentUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Shipment).where(Shipment.booking_id == booking_id))
    shipment = result.scalar_one_or_none()
    if not shipment:
        raise HTTPException(status_code=404, detail=f"Shipment {booking_id} not found")

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(shipment, field, value)

    await db.commit()
    await db.refresh(shipment)
    return shipment


@router.delete("/{booking_id}", status_code=204)
async def delete_shipment(booking_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Shipment).where(Shipment.booking_id == booking_id))
    shipment = result.scalar_one_or_none()
    if not shipment:
        raise HTTPException(status_code=404, detail=f"Shipment {booking_id} not found")
    await db.delete(shipment)
    await db.commit()


@router.get("/{booking_id}/alerts", response_model=List[AlertResponse])
async def get_alerts(booking_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Alert)
        .where(Alert.booking_id == booking_id)
        .order_by(Alert.created_at.desc())
    )
    return result.scalars().all()


@router.post("/{booking_id}/alerts/acknowledge")
async def acknowledge_alert(booking_id: str, payload: AlertAcknowledge, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Alert).where(Alert.id == payload.alert_id, Alert.booking_id == booking_id)
    )
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.is_acknowledged = True
    await db.commit()
    return {"message": "Alert acknowledged", "alert_id": payload.alert_id}
