"""
WebSocket endpoint for real-time shipment tracking.
Clients connect to /ws/{booking_id} and receive live updates.

Message types:
  - position_update  : new GPS coordinates
  - risk_update      : new risk score from prediction engine
  - alert            : new disruption alert
  - reroute          : route recommendation triggered
"""
import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Dict, Set

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)

router = APIRouter(tags=["WebSocket"])


class ConnectionManager:
    """Manages active WebSocket connections per booking_id."""

    def __init__(self):
        # booking_id → set of connected WebSocket clients
        self._connections: Dict[str, Set[WebSocket]] = {}

    async def connect(self, booking_id: str, ws: WebSocket):
        await ws.accept()
        self._connections.setdefault(booking_id, set()).add(ws)
        logger.info("WS connected: booking_id=%s, total=%d", booking_id, len(self._connections[booking_id]))

    def disconnect(self, booking_id: str, ws: WebSocket):
        if booking_id in self._connections:
            self._connections[booking_id].discard(ws)
            if not self._connections[booking_id]:
                del self._connections[booking_id]
        logger.info("WS disconnected: booking_id=%s", booking_id)

    async def broadcast(self, booking_id: str, message: dict):
        """Send a message to all clients watching a booking."""
        clients = self._connections.get(booking_id, set()).copy()
        dead = set()
        for ws in clients:
            try:
                await ws.send_text(json.dumps(message, default=str))
            except Exception:
                dead.add(ws)
        for ws in dead:
            self.disconnect(booking_id, ws)

    async def broadcast_all(self, message: dict):
        """Broadcast to all connected clients (e.g., system-wide alerts)."""
        for booking_id in list(self._connections.keys()):
            await self.broadcast(booking_id, message)

    @property
    def active_bookings(self) -> list:
        return list(self._connections.keys())


manager = ConnectionManager()


def get_connection_manager() -> ConnectionManager:
    return manager


@router.websocket("/ws/{booking_id}")
async def shipment_websocket(websocket: WebSocket, booking_id: str):
    """
    WebSocket endpoint for a specific shipment.
    Sends a welcome message on connect, then listens for incoming messages
    (e.g., position updates from a GPS simulator).
    """
    await manager.connect(booking_id, websocket)
    try:
        # Send initial connection confirmation
        await websocket.send_text(json.dumps({
            "event": "connected",
            "booking_id": booking_id,
            "message": f"Tracking shipment {booking_id}",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }))

        while True:
            # Receive messages from client (e.g., GPS position updates)
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
                event = data.get("event", "unknown")

                if event == "position_update":
                    # Echo back with server timestamp for latency measurement
                    await manager.broadcast(booking_id, {
                        "event": "position_update",
                        "booking_id": booking_id,
                        "data": data.get("data", {}),
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    })

                elif event == "ping":
                    await websocket.send_text(json.dumps({
                        "event": "pong",
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    }))

                else:
                    logger.debug("Unknown WS event: %s for %s", event, booking_id)

            except json.JSONDecodeError:
                await websocket.send_text(json.dumps({"event": "error", "message": "Invalid JSON"}))

    except WebSocketDisconnect:
        manager.disconnect(booking_id, websocket)


async def push_risk_update(booking_id: str, risk_score: float, risk_level: str, recommendation: str):
    """Called by prediction pipeline to push risk updates to connected clients."""
    await manager.broadcast(booking_id, {
        "event": "risk_update",
        "booking_id": booking_id,
        "data": {
            "risk_score": risk_score,
            "risk_level": risk_level,
            "recommendation": recommendation,
        },
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })


async def push_alert(booking_id: str, alert_type: str, severity: str, message: str):
    """Push a disruption alert to connected clients."""
    await manager.broadcast(booking_id, {
        "event": "alert",
        "booking_id": booking_id,
        "data": {
            "alert_type": alert_type,
            "severity": severity,
            "message": message,
        },
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })


async def push_reroute(booking_id: str, routes: list):
    """Push reroute recommendations to connected clients."""
    await manager.broadcast(booking_id, {
        "event": "reroute",
        "booking_id": booking_id,
        "data": {"routes": routes},
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })
