"""
Seed script — populates the SQLite database with real shipments
from the Kaggle Delivery Truck Trips dataset.

Usage:
    cd backend
    python seed_data.py
"""
import asyncio
import sys
import logging
from pathlib import Path
from datetime import datetime, timezone

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))

from database import init_db, AsyncSessionLocal
from models.db_models import Shipment, Alert

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
logger = logging.getLogger(__name__)

CSV_PATH = Path(__file__).parent / "data" / "delivery_truck_trips.csv"

# ── Helpers ────────────────────────────────────────────────────────────────────

def parse_latlon(s: str):
    """Parse '13.155,80.196' → (13.155, 80.196)"""
    try:
        parts = str(s).split(",")
        return float(parts[0].strip()), float(parts[1].strip())
    except Exception:
        return None, None


def risk_from_delay(row) -> tuple[float, str]:
    """Derive a risk score and level from the delay flag."""
    is_delayed = str(row.get("delay", "")).strip().upper() == "R"
    dist = float(row.get("TRANSPORTATION_DISTANCE_IN_KM", 100) or 100)

    if is_delayed:
        # Longer delayed trips = higher risk
        score = min(0.95, 0.65 + (dist / 10000))
        level = "HIGH" if score > 0.70 else "MEDIUM"
    else:
        score = max(0.05, 0.10 + (dist / 20000))
        level = "LOW"
    return round(score, 3), level


def map_cargo(material: str) -> str:
    if not material or pd.isna(material):
        return "AUTO PARTS"
    return str(material).strip()[:100]


def map_vehicle(vtype: str) -> str:
    if not vtype or pd.isna(vtype):
        return "HCV"
    return str(vtype).strip()[:50]


def shorten_location(loc: str) -> str:
    """'ASHOK LEYLAND PLANT 1- HOSUR,HOSUR,KARNATAKA' → 'Hosur, Karnataka'"""
    if not loc or pd.isna(loc):
        return "Unknown"
    parts = str(loc).split(",")
    if len(parts) >= 2:
        return f"{parts[-2].strip().title()}, {parts[-1].strip().title()}"
    return str(loc)[:80]


# ── Main seeder ────────────────────────────────────────────────────────────────

async def seed():
    await init_db()

    df = pd.read_csv(CSV_PATH)
    logger.info("Loaded %d rows from CSV", len(df))

    # Parse timestamps
    for col in ["trip_start_date", "Planned_ETA", "actual_eta"]:
        df[col] = pd.to_datetime(df[col], errors="coerce")

    # Pick a diverse sample:
    # - 8 delayed (high/medium risk)
    # - 12 on-time (low risk)
    # - varied origins, distances, vehicle types
    delayed = df[df["delay"] == "R"].dropna(
        subset=["Org_lat_lon", "Des_lat_lon", "TRANSPORTATION_DISTANCE_IN_KM"]
    ).drop_duplicates(subset=["Org_lat_lon"]).head(8)

    ontime = df[df["ontime"] == "G"].dropna(
        subset=["Org_lat_lon", "Des_lat_lon", "TRANSPORTATION_DISTANCE_IN_KM"]
    ).drop_duplicates(subset=["Org_lat_lon"]).head(12)

    sample = pd.concat([delayed, ontime]).reset_index(drop=True)
    logger.info("Seeding %d shipments", len(sample))

    async with AsyncSessionLocal() as session:
        # Clear existing seed data
        from sqlalchemy import delete
        await session.execute(delete(Alert))
        await session.execute(delete(Shipment))
        await session.commit()
        logger.info("Cleared existing shipments and alerts")

        shipments_created = []

        for _, row in sample.iterrows():
            booking_id = str(row["BookingID"]).strip()
            org_lat, org_lon = parse_latlon(row["Org_lat_lon"])
            des_lat, des_lon = parse_latlon(row["Des_lat_lon"])

            if org_lat is None or des_lat is None:
                continue

            risk_score, risk_level = risk_from_delay(row)
            is_delayed = str(row.get("delay", "")).strip().upper() == "R"

            # Simulate current position: 30% of the way along the route
            curr_lat = org_lat + (des_lat - org_lat) * 0.30
            curr_lon = org_lon + (des_lon - org_lon) * 0.30

            status = "DELAYED" if is_delayed else "IN_TRANSIT"

            shipment = Shipment(
                booking_id=booking_id,
                origin_lat=org_lat,
                origin_lon=org_lon,
                destination_lat=des_lat,
                destination_lon=des_lon,
                current_lat=round(curr_lat, 6),
                current_lon=round(curr_lon, 6),
                planned_eta=row["Planned_ETA"] if pd.notna(row["Planned_ETA"]) else None,
                actual_eta=row["actual_eta"] if pd.notna(row.get("actual_eta")) else None,
                trip_start=row["trip_start_date"] if pd.notna(row["trip_start_date"]) else None,
                vehicle_type=map_vehicle(row.get("vehicleType")),
                distance_km=float(row["TRANSPORTATION_DISTANCE_IN_KM"]),
                cargo_type=map_cargo(row.get("Material Shipped")),
                carrier_id=str(row.get("supplierNameCode", "UNKNOWN"))[:50],
                status=status,
                is_delayed=is_delayed,
                current_risk_score=risk_score,
                risk_level=risk_level,
            )
            session.add(shipment)
            shipments_created.append((booking_id, risk_level, is_delayed))

        await session.commit()
        logger.info("✅ Inserted %d shipments", len(shipments_created))

        # Seed alerts for high-risk / delayed shipments
        alerts_data = []
        for booking_id, risk_level, is_delayed in shipments_created:
            if risk_level == "HIGH":
                alerts_data.append(Alert(
                    booking_id=booking_id,
                    alert_type="DELAY_RISK",
                    severity="HIGH",
                    message=f"Shipment {booking_id} has HIGH delay risk. Immediate rerouting recommended.",
                    is_acknowledged=False,
                ))
            elif risk_level == "MEDIUM" or is_delayed:
                alerts_data.append(Alert(
                    booking_id=booking_id,
                    alert_type="DELAY_RISK",
                    severity="MEDIUM",
                    message=f"Shipment {booking_id} is experiencing delays. Monitor closely.",
                    is_acknowledged=False,
                ))

        for alert in alerts_data:
            session.add(alert)
        await session.commit()
        logger.info("✅ Inserted %d alerts", len(alerts_data))

    # Print summary
    print("\n" + "="*60)
    print("SEED SUMMARY")
    print("="*60)
    for booking_id, risk_level, is_delayed in shipments_created:
        status = "DELAYED" if is_delayed else "ON TIME"
        print(f"  {booking_id:<30} {risk_level:<8} {status}")
    print(f"\nTotal: {len(shipments_created)} shipments, {len(alerts_data)} alerts")
    print("="*60)


if __name__ == "__main__":
    asyncio.run(seed())
