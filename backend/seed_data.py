"""
Seed script — USA Dynamic Supply Chain Logistics Dataset.
Generates realistic shipments across US corridors using the dataset's
GPS coordinates, risk scores, and sensor readings.

Usage:
    cd backend
    python seed_data.py
"""
import asyncio
import sys
import logging
import random
from pathlib import Path
from datetime import datetime, timezone, timedelta

import pandas as pd
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))

from database import init_db, AsyncSessionLocal
from models.db_models import Shipment, Alert
from routing.graph_router import USA_NODES, haversine_km

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
logger = logging.getLogger(__name__)

CSV_PATH = Path(__file__).parent / "data" / "dynamic_supply_chain_logistics_dataset.csv"

# ── US city name lookup ────────────────────────────────────────────────────────
CITY_NAMES = {name: name.replace("_", " ") for name in USA_NODES}

# ── Cargo types for US logistics ──────────────────────────────────────────────
CARGO_TYPES = [
    "Electronics", "Automotive Parts", "Pharmaceuticals", "Food & Beverage",
    "Industrial Equipment", "Consumer Goods", "Chemicals", "Refrigerated Goods",
    "Hazardous Materials", "E-commerce Parcels",
]

VEHICLE_TYPES = [
    "53ft Dry Van", "48ft Flatbed", "Reefer Trailer", "Tanker",
    "Step Deck", "Double Drop", "LTL Freight", "Intermodal Container",
]

CARRIERS = [
    "J.B. Hunt Transport", "Werner Enterprises", "Schneider National",
    "Swift Transportation", "Knight Transportation", "Old Dominion Freight",
    "XPO Logistics", "FedEx Freight", "UPS Freight", "Amazon Logistics",
    "C.H. Robinson", "Echo Global Logistics",
]

# ── Major US origin-destination pairs ─────────────────────────────────────────
OD_PAIRS = [
    ("Los_Angeles", "Chicago"),
    ("New_York", "Miami"),
    ("Chicago", "Dallas"),
    ("Houston", "Atlanta"),
    ("Seattle", "Los_Angeles"),
    ("Boston", "Washington_DC"),
    ("Denver", "Kansas_City"),
    ("Atlanta", "Nashville"),
    ("Dallas", "Houston"),
    ("Philadelphia", "Charlotte"),
    ("Minneapolis", "Chicago"),
    ("San_Francisco", "Seattle"),
    ("Miami", "Orlando"),
    ("Detroit", "Cleveland"),
    ("Memphis", "St_Louis"),
    ("Louisville", "Indianapolis"),
    ("Savannah_Port", "Atlanta"),
    ("LA_Port", "Phoenix"),
    ("Houston_Port", "Dallas"),
    ("NY_Port", "Philadelphia"),
]


def risk_from_classification(risk_class: str, disruption_score: float) -> tuple:
    if risk_class == "High Risk" or disruption_score > 0.80:
        if disruption_score > 0.88:
            score = min(0.97, 0.85 + disruption_score * 0.12)
            level = "CRITICAL"
        else:
            score = min(0.95, 0.72 + disruption_score * 0.22)
            level = "HIGH"
    elif risk_class == "Moderate Risk" or disruption_score > 0.45:
        score = 0.42 + disruption_score * 0.25
        level = "MEDIUM"
    else:
        score = max(0.04, disruption_score * 0.38)
        level = "LOW"
    return round(score, 3), level


async def seed():
    await init_db()

    df = pd.read_csv(CSV_PATH)
    logger.info("Loaded %d rows from dataset", len(df))

    # Skew heavily toward high/critical risk for a realistic dashboard view:
    # 10 High Risk + 5 Moderate + 5 Low = 20 total
    high_risk = df[df["risk_classification"] == "High Risk"].sample(10, random_state=42)
    moderate  = df[df["risk_classification"] == "Moderate Risk"].sample(5, random_state=42)
    low_risk  = df[df["risk_classification"] == "Low Risk"].sample(5, random_state=42)
    sample = pd.concat([high_risk, moderate, low_risk]).reset_index(drop=True)

    async with AsyncSessionLocal() as session:
        from sqlalchemy import delete
        await session.execute(delete(Alert))
        await session.execute(delete(Shipment))
        await session.commit()
        logger.info("Cleared existing data")

        shipments_created = []
        rng = random.Random(42)

        for i, (_, row) in enumerate(sample.iterrows()):
            # Pick an OD pair
            od = OD_PAIRS[i % len(OD_PAIRS)]
            origin_name, dest_name = od
            org_lat, org_lon = USA_NODES[origin_name]
            des_lat, des_lon = USA_NODES[dest_name]

            # Use dataset GPS as current position (it's mid-route)
            curr_lat = float(row["vehicle_gps_latitude"])
            curr_lon = float(row["vehicle_gps_longitude"])

            # Clamp to continental USA
            curr_lat = max(25.0, min(49.0, curr_lat))
            curr_lon = max(-125.0, min(-66.0, curr_lon))

            risk_class = row["risk_classification"]
            disruption_score = float(row["disruption_likelihood_score"])
            risk_score, risk_level = risk_from_classification(risk_class, disruption_score)

            is_delayed = risk_class in ("High Risk", "Moderate Risk")
            status = "DELAYED" if risk_class == "High Risk" else (
                "IN_TRANSIT" if risk_class == "Moderate Risk" else "IN_TRANSIT"
            )

            dist_km = haversine_km(org_lat, org_lon, des_lat, des_lon)

            # Generate booking ID
            booking_id = f"US-{origin_name[:3].upper()}-{dest_name[:3].upper()}-{1000 + i:04d}"

            # Planned ETA: distance / 65mph average
            trip_hours = dist_km / 104.6  # 65mph in km/h
            now = datetime.now(timezone.utc)
            planned_eta = now + timedelta(hours=trip_hours * rng.uniform(0.8, 1.2))
            trip_start = now - timedelta(hours=trip_hours * 0.3)

            shipment = Shipment(
                booking_id=booking_id,
                origin_lat=org_lat,
                origin_lon=org_lon,
                destination_lat=des_lat,
                destination_lon=des_lon,
                current_lat=round(curr_lat, 6),
                current_lon=round(curr_lon, 6),
                planned_eta=planned_eta,
                trip_start=trip_start,
                vehicle_type=rng.choice(VEHICLE_TYPES),
                distance_km=round(dist_km, 1),
                cargo_type=rng.choice(CARGO_TYPES),
                carrier_id=rng.choice(CARRIERS),
                status=status,
                is_delayed=is_delayed,
                current_risk_score=risk_score,
                risk_level=risk_level,
            )
            session.add(shipment)
            shipments_created.append({
                "booking_id": booking_id,
                "origin": origin_name,
                "dest": dest_name,
                "risk_level": risk_level,
                "risk_score": risk_score,
                "is_delayed": is_delayed,
                "traffic": float(row["traffic_congestion_level"]),
                "weather": float(row["weather_condition_severity"]),
            })

        await session.commit()
        logger.info("✅ Inserted %d shipments", len(shipments_created))

        # Seed alerts
        alert_messages = {
            "HIGH": [
                "HIGH delay risk detected. Immediate rerouting recommended.",
                "Traffic congestion exceeds threshold on current route.",
                "Weather advisory: severe conditions ahead. Consider alternate route.",
                "Driver fatigue alert. Rest stop required within 2 hours.",
            ],
            "MEDIUM": [
                "Moderate delay risk. Monitor shipment closely.",
                "Port congestion reported at destination. Expect 2-4 hour delay.",
                "Weather conditions deteriorating on route. Prepare alternatives.",
            ],
        }

        alerts_added = 0
        for s in shipments_created:
            if s["risk_level"] == "HIGH":
                msgs = alert_messages["HIGH"]
                severity = "HIGH"
                # Add traffic alert if congestion is high
                if s["traffic"] > 7:
                    session.add(Alert(
                        booking_id=s["booking_id"],
                        alert_type="TRAFFIC",
                        severity="HIGH",
                        message=f"[{s['booking_id']}] Traffic congestion level {s['traffic']:.1f}/10 on {s['origin'].replace('_',' ')} → {s['dest'].replace('_',' ')} corridor.",
                        is_acknowledged=False,
                    ))
                    alerts_added += 1
                # Add weather alert if severe
                if s["weather"] > 3:
                    session.add(Alert(
                        booking_id=s["booking_id"],
                        alert_type="WEATHER",
                        severity="HIGH",
                        message=f"[{s['booking_id']}] Severe weather (severity {s['weather']:.1f}/10) on route. Rerouting recommended.",
                        is_acknowledged=False,
                    ))
                    alerts_added += 1
                session.add(Alert(
                    booking_id=s["booking_id"],
                    alert_type="DELAY_RISK",
                    severity=severity,
                    message=f"[{s['booking_id']}] {rng.choice(msgs)}",
                    is_acknowledged=False,
                ))
                alerts_added += 1

            elif s["risk_level"] == "MEDIUM":
                session.add(Alert(
                    booking_id=s["booking_id"],
                    alert_type="DELAY_RISK",
                    severity="MEDIUM",
                    message=f"[{s['booking_id']}] {rng.choice(alert_messages['MEDIUM'])}",
                    is_acknowledged=False,
                ))
                alerts_added += 1

        await session.commit()
        logger.info("✅ Inserted %d alerts", alerts_added)

    # Summary
    print("\n" + "=" * 70)
    print("SEED SUMMARY — USA Supply Chain Shipments")
    print("=" * 70)
    for s in shipments_created:
        status = "DELAYED" if s["is_delayed"] else "IN_TRANSIT"
        print(f"  {s['booking_id']:<28} {s['risk_level']:<8} {status:<12} "
              f"{s['origin'].replace('_',' '):<18} -> {s['dest'].replace('_',' ')}")
    print(f"\nTotal: {len(shipments_created)} shipments, {alerts_added} alerts")
    print("=" * 70)


async def auto_seed():
    """Seed database on every startup — ensures fresh sample data."""
    if not CSV_PATH.exists():
        logger.warning("Seed CSV not found at %s, skipping auto-seed", CSV_PATH)
        return

    logger.info("Running auto-seed to ensure fresh data...")
    await seed()


if __name__ == "__main__":
    asyncio.run(seed())
