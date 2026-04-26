# NEXUS — Supply Chain Disruption Detection & Dynamic Re-Routing

> ML-powered preemptive disruption detection with real-time route optimization for Indian truck logistics.  
> Built for hackathon demonstration using the Kaggle Delivery Truck Trips dataset.

---

## Overview

NEXUS detects supply chain disruptions **before** they cascade into delays and automatically recommends optimal alternative routes. It combines three ML models, a graph-based routing engine, and a real-time WebSocket dashboard.

```
┌─────────────────────────────────────────────────────────┐
│  Kaggle Truck GPS Dataset  +  Weather / Event Feeds     │
└────────────────────────┬────────────────────────────────┘
                         │
              ┌──────────▼──────────┐
              │   Feature Pipeline  │
              └──────────┬──────────┘
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
    XGBoost          LightGBM     Isolation Forest
  Delay Classifier  ETA Regressor  Anomaly Detector
          └──────────────┼──────────────┘
                         │  Ensemble Fusion
                         ▼
                   Risk Score 0–1
                  LOW / MEDIUM / HIGH
                         │
              ┌──────────▼──────────┐
              │  A* Route Engine    │  ← networkx graph
              │  Top-3 Alternatives │
              └──────────┬──────────┘
                         │
              ┌──────────▼──────────┐
              │   FastAPI Backend   │  ← REST + WebSocket
              └──────────┬──────────┘
                         │
              ┌──────────▼──────────┐
              │  NEXUS Dashboard    │  ← Next.js + Leaflet
              └─────────────────────┘
```

---

## Project Structure

```
supply_chain_proj/
├── backend/                    # FastAPI + ML backend
│   ├── main.py                 # App entry point
│   ├── config.py               # Settings & thresholds
│   ├── database.py             # Async SQLite (SQLAlchemy)
│   ├── seed_data.py            # Populate DB from CSV
│   ├── requirements.txt
│   ├── api/
│   │   ├── predict.py          # POST /predict, /predict/batch
│   │   ├── route.py            # POST /route, /route/select
│   │   ├── shipments.py        # CRUD /shipments
│   │   └── websocket.py        # WS /ws/{booking_id}
│   ├── ml/
│   │   ├── feature_engineering.py
│   │   ├── delay_classifier.py # Model A: XGBoost
│   │   ├── eta_regressor.py    # Model B: LightGBM
│   │   ├── anomaly_detector.py # Model C: Isolation Forest
│   │   ├── ensemble.py         # Risk score fusion
│   │   └── train.py            # Training script
│   ├── routing/
│   │   └── graph_router.py     # networkx A* routing
│   ├── models/
│   │   ├── db_models.py        # SQLAlchemy ORM
│   │   └── schemas.py          # Pydantic schemas
│   └── data/
│       └── delivery_truck_trips.csv   # Kaggle dataset (gitignored)
│
└── web_frontend/               # Next.js 16 dashboard
    ├── app/
    │   ├── layout.tsx
    │   └── page.tsx
    ├── frontend/
    │   ├── Dashboard.tsx
    │   ├── providers.tsx
    │   ├── store/useStore.ts   # Zustand state
    │   └── components/
    │       ├── Header.tsx
    │       ├── Sidebar.tsx
    │       ├── KPICards.tsx
    │       ├── LiveMap.tsx     # Leaflet map
    │       ├── RiskGauge.tsx   # Recharts gauge
    │       ├── ShipmentsList.tsx
    │       ├── AlertTicker.tsx
    │       ├── RouteModal.tsx  # Route decision + SHAP
    │       ├── AlertsView.tsx
    │       ├── ShipmentsView.tsx
    │       ├── AnalyticsView.tsx
    │       └── SettingsView.tsx
    ├── hooks/
    │   └── useApi.ts           # React Query hooks + WebSocket
    └── lib/
        ├── api.ts              # Typed API client
        └── mappers.ts          # Backend → frontend type mappers
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| **ML Models** | XGBoost, LightGBM, scikit-learn (Isolation Forest) |
| **Explainability** | SHAP values |
| **Routing** | networkx (A* / Yen's K-shortest paths) |
| **Backend** | FastAPI, SQLAlchemy (async), SQLite |
| **Real-time** | WebSocket (FastAPI native) |
| **Frontend** | Next.js 16, React 19, TypeScript |
| **State** | Zustand + TanStack React Query |
| **Map** | React-Leaflet + CartoDB dark tiles |
| **Charts** | Recharts |
| **Styling** | Tailwind CSS v4, Framer Motion |
| **Data** | Kaggle Delivery Truck Trips (6,880 rows, 32 cols) |

---

## Quick Start

### Prerequisites

- Python 3.10+
- Node.js 18+
- The Kaggle dataset CSV placed at `backend/data/delivery_truck_trips.csv`

---

### 1. Backend Setup

```bash
cd backend

# Install dependencies
pip install -r requirements.txt

# Train ML models (requires the CSV)
python -m ml.train

# Seed the database with real shipment data
python seed_data.py

# Start the API server
uvicorn main:app --reload --port 8000
```

API docs available at: `http://localhost:8000/docs`

---

### 2. Frontend Setup

```bash
cd web_frontend

# Install dependencies
npm install

# Start dev server
npm run dev
```

Dashboard available at: `http://localhost:3000`

---

### 3. Environment Variables

Create `web_frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## API Endpoints

### Health
| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | `{"status": "ok"}` |
| GET | `/info` | Graph stats, active connections |

### Shipments
| Method | Endpoint | Description |
|---|---|---|
| GET | `/shipments` | List all (filter by `status`, `risk_level`) |
| POST | `/shipments` | Create shipment |
| GET | `/shipments/{id}` | Get by booking ID |
| PATCH | `/shipments/{id}` | Update position / status |
| DELETE | `/shipments/{id}` | Remove shipment |
| GET | `/shipments/{id}/alerts` | Get alerts |
| POST | `/shipments/{id}/alerts/acknowledge` | Acknowledge alert |

### Prediction
| Method | Endpoint | Description |
|---|---|---|
| POST | `/predict` | Full 3-model pipeline → risk score + SHAP |
| POST | `/predict/batch` | Batch predictions |
| GET | `/predict/explain/{id}` | Latest SHAP explanation |

### Routing
| Method | Endpoint | Description |
|---|---|---|
| POST | `/route` | Compute top-K alternative routes |
| GET | `/route/{id}` | Get stored recommendations |
| POST | `/route/select` | Dispatcher selects a route |

### WebSocket
| Protocol | Endpoint | Description |
|---|---|---|
| WS | `/ws/{booking_id}` | Live tracking — sends `risk_update`, `alert`, `reroute` |

---

## ML Models

### Model A — XGBoost Delay Classifier
- **Task:** Binary classification — will shipment delay > 30 min?
- **Features:** 25 engineered features (temporal, spatial, network, historical, weather)
- **Output:** Delay probability `[0.0, 1.0]`
- **Metrics:** F1 = 0.63, ROC-AUC = 0.84

### Model B — LightGBM ETA Regressor
- **Task:** Quantile regression — predict actual trip duration
- **Output:** Point estimate + 80% confidence interval (P10, P50, P90)
- **Loss:** Quantile loss at α = 0.1, 0.5, 0.9

### Model C — Isolation Forest Anomaly Detector
- **Task:** Unsupervised — detect abnormal GPS trajectories
- **Features:** Speed variance, stop count, route deviation
- **Output:** Anomaly score `[0.0, 1.0]`, threshold at 0.6
- **Advantage:** No delay labels needed, catches novel patterns

### Ensemble Fusion
```
Risk Score = 0.55 × delay_prob + 0.30 × anomaly_score + 0.15 × eta_deviation
```
- `< 0.40` → LOW (monitor only)
- `0.40–0.70` → MEDIUM (alert dispatcher)
- `> 0.70` → HIGH (auto-recommend reroute)
- `> 0.85` → CRITICAL (escalate immediately)

---

## Demo Scenario — "The Ahmedabad Pharma Crisis"

| Time | Event | System Action |
|---|---|---|
| 09:00 | Shipment departs Pune → Chennai (1300 km) | Risk: 12% LOW |
| 10:15 | Weather alert on NH-48 corridor | Risk rises to 34% |
| 10:45 | Speed drops, GPS shows congestion | Anomaly score: 0.72 |
| 11:00 | **Risk crosses 78% HIGH threshold** | **ALERT triggered** |
| 11:01 | System computes 3 alternative routes | Route ranking complete |
| 11:02 | Dispatcher selects Route B (Via Nashik) | GPS path updated |
| 13:45 | Truck arrives — prediction error: 7 min | Feedback logged |

---

## Dataset

**Kaggle Delivery Truck Trips Dataset**
- 6,880 truck trips across India
- Real GPS coordinates, planned vs actual ETAs
- Vehicle types, cargo types, carrier IDs
- Delay labels (`G` = on time, `R` = delayed)

Download: [kaggle.com/datasets/ramakrishnanthiyagarajan/truck-gps-route-dataset](https://www.kaggle.com/datasets/ramakrishnanthiyagarajan/truck-gps-route-dataset)

Place at: `backend/data/delivery_truck_trips.csv`

---

## Seeded Demo Data

Running `python seed_data.py` inserts 20 real shipments:

| Count | Risk Level | Status |
|---|---|---|
| 7 | HIGH | DELAYED |
| 1 | MEDIUM | DELAYED |
| 12 | LOW | IN_TRANSIT |

Routes span real Indian corridors: Pune→Chennai, Bengaluru→Haryana, Lucknow→Pune, Chennai→Hosur, and more.

---

## Scalability Roadmap

| Phase | Scope | Models |
|---|---|---|
| **Hackathon** | Ahmedabad-Mumbai corridor | XGBoost + Isolation Forest |
| **V2** | Gujarat state | Corridor-specific models |
| **V3** | Western India | Graph Neural Network routing |
| **V4** | Pan-India | Federated learning |
| **V5** | Global | Transformer multi-modal fusion |

---

## License

MIT
