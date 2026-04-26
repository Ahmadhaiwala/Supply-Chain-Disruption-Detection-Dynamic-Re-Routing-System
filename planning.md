# Supply Chain Disruption Detection & Dynamic Re-Routing System
## Hackathon Project Documentation

---

## 1. Project Overview

| Attribute | Detail |
|---|---|
| **Problem** | Supply chain disruptions are detected too late, causing cascading delays across global networks |
| **Solution** | ML-powered preemptive disruption detection with dynamic route optimization |
| **Scope** | Start with Ahmedabad region, scalable to national/global |
| **Core Tech** | XGBoost + Isolation Forest + Graph-based routing |
| **Data Source** | Kaggle Delivery Truck Trips Dataset |

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              DATA LAYER                                      │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐ │
│  │ Kaggle Truck    │  │ Weather API     │  │ Simulated External Feeds    │ │
│  │ GPS Dataset     │  │ (OpenWeatherMap)│  │ (Accidents, Port Delays)    │ │
│  │ (50-100K rows)  │  │                 │  │                             │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FEATURE ENGINEERING                                  │
│  • Temporal: hour, day_of_week, month, holiday_flag                         │
│  • Spatial: origin_zone, destination_zone, corridor_id, distance_km         │
│  • Network: corridor_congestion_index, port_proximity                       │
│  • Historical: carrier_ontime_rate, route_avg_delay, cargo_type_risk        │
│  • External: weather_severity_score, temperature, event_flags               │
│  • Lag features: delay_at_t-1, t-2, t-3 for same corridor                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      MULTI-MODEL PREDICTION ENGINE                           │
│                                                                              │
│   ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────────┐    │
│   │  Model A        │    │  Model B        │    │  Model C            │    │
│   │  XGBoost        │    │  LightGBM       │    │  Isolation Forest   │    │
│   │  Delay          │    │  ETA            │    │  Anomaly            │    │
│   │  Classifier     │    │  Regressor      │    │  Detector           │    │
│   │  (2-6 hr ahead) │    │  (1-4 hr ahead) │    │  (Real-time)        │    │
│   │                 │    │                 │    │                     │    │
│   │  Input: Tabular │    │  Input: Tabular │    │  Input: GPS traj    │    │
│   │  Output: Prob   │    │  Output: Time   │    │  Output: Score      │    │
│   │  0.0 - 1.0      │    │  HH:MM ± CI     │    │  0.0 - 1.0          │    │
│   └─────────────────┘    └─────────────────┘    └─────────────────────┘    │
│                                                                              │
│   Ensemble Fusion: Weighted average → Final Risk Score (0-1)                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DISRUPTION SEVERITY SCORING                               │
│                                                                              │
│   Risk Score = P(delay) × Impact × Detectability                            │
│                                                                              │
│   • P(delay): From XGBoost model                                            │
│   • Impact: Cargo value × Customer tier × Downstream dependency             │
│   • Detectability: How early can we act (time to intervention)              │
│                                                                              │
│   Buckets:                                                                   │
│   • 0.0 - 0.4  → LOW     (Monitor, log only)                                │
│   • 0.4 - 0.7  → MEDIUM  (Alert dispatcher, prepare alternatives)           │
│   • 0.7 - 1.0  → HIGH    (Auto-recommend reroute, escalate)                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PRESCRIPTIVE RE-ROUTING ENGINE                            │
│                                                                              │
│   Step 1: Generate candidate routes via A* on road network graph            │
│   Step 2: For each candidate, run Model A/B on hypothetical path            │
│   Step 3: Score each route: Success Probability, Cost, Time, Risk           │
│   Step 4: Multi-objective ranking (Pareto frontier)                         │
│   Step 5: Present top-3 options with trade-offs                             │
│                                                                              │
│   Example Output:                                                            │
│   • Route A (Current):  78% delay risk, ETA 15:30, Cost ₹0                  │
│   • Route B (Via Sanand): 15% delay risk, ETA 13:45, Cost +₹200            │
│   • Route C (Via Vadodara): 22% delay risk, ETA 14:10, Cost +₹150          │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         EXECUTION & FEEDBACK                                 │
│                                                                              │
│   • Dispatcher selects route → System updates GPS path                       │
│   • Track actual outcome vs. prediction                                      │
│   • Log: Predicted delay prob, chosen route, actual arrival, error           │
│   • Weekly retraining trigger if drift detected (PSI > 0.2)                  │
│   • SHAP explanations stored for audit/debugging                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Model Specifications

### Model A: XGBoost Delay Classifier

| Parameter | Value |
|---|---|
| **Task** | Binary classification: Will shipment delay > 30 min? |
| **Architecture** | Gradient boosted trees (XGBClassifier) |
| **Input features** | 15-20 engineered features (tabular) |
| **Output** | Probability of delay [0.0, 1.0] |
| **Training data** | Historical shipments with delay labels |
| **Validation** | Time-based split (no random shuffle) |
| **Metrics** | F1-score, Precision-Recall AUC, ROC-AUC |
| **Class imbalance** | Scale_pos_weight or focal loss |
| **Interpretability** | SHAP values for feature importance |
| **Inference latency** | < 5 ms per prediction |

### Model B: LightGBM ETA Regressor

| Parameter | Value |
|---|---|
| **Task** | Regression: Predict actual arrival time |
| **Architecture** | Gradient boosted trees (LGBMRegressor) |
| **Loss function** | Quantile loss (for prediction intervals) |
| **Output** | Point estimate + 80% confidence interval |
| **Metrics** | MAE, RMSE, MAPE |

### Model C: Isolation Forest Anomaly Detector

| Parameter | Value |
|---|---|
| **Task** | Unsupervised: Detect abnormal trajectories |
| **Architecture** | Isolation Forest (sklearn) |
| **Input** | GPS trajectory features (speed variance, stop count, route deviation) |
| **Output** | Anomaly score [-1, 1], threshold at 0.6 |
| **Training** | Fit on normal historical trajectories only |
| **Advantage** | No delay labels needed, catches novel patterns |

---

## 4. Data Pipeline

### Source: Kaggle Delivery Truck Trips Dataset

| Column | Type | Usage |
|---|---|---|
| `BookingID` | String | Primary key |
| `Org_lat_lon` | Lat,Lon | Origin node |
| `Des_lat_lon` | Lat,Lon | Destination node |
| `Curr_lat` / `Curr_lon` | Lat,Lon | Real-time position |
| `Planned_ETA` | Timestamp | Baseline comparison |
| `actual_eta` | Timestamp | Ground truth label |
| `ontime` / `delay` | Binary | Target variable for Model A |
| `TRANSPORTATION_DISTANCE_IN_KM` | Float | Edge weight |
| `vehicleType` | Categorical | Feature (reefer = higher risk) |
| `trip_start_date` | Timestamp | Temporal features |
| `trip_end_date` | Timestamp | Duration calculation |

### Feature Engineering Pipeline

```
Raw Data
    │
    ├──→ Temporal Features
    │       ├── hour_of_day (0-23)
    │       ├── day_of_week (0-6)
    │       ├── is_weekend (0/1)
    │       ├── is_peak_hour (0/1)
    │       └── month (1-12)
    │
    ├──→ Spatial Features
    │       ├── origin_zone (clustered lat/lon)
    │       ├── destination_zone
    │       ├── corridor_id (origin→destination pair)
    │       ├── distance_km
    │       └── port_proximity_km
    │
    ├──→ Network Features
    │       ├── corridor_avg_speed
    │       ├── corridor_congestion_index
    │       └── nearby_disruptions_count
    │
    ├──→ Historical Features
    │       ├── carrier_ontime_rate (rolling 30-day)
    │       ├── route_historical_delay_rate
    │       └── vehicle_type_avg_delay
    │
    ├──→ External Features
    │       ├── weather_severity (0-5)
    │       ├── temperature_celsius
    │       ├── precipitation_mm
    │       └── event_flag_accident (0/1)
    │
    └──→ Lag Features (for time-series)
            ├── delay_rate_same_corridor_t-1h
            ├── delay_rate_same_corridor_t-2h
            └── delay_rate_same_corridor_t-3h
```

---

## 5. Technology Stack

| Layer | Technology | Justification |
|---|---|---|
| **Language** | Python 3.10+ | Ecosystem, libraries |
| **ML Framework** | XGBoost, LightGBM, scikit-learn | No PyTorch needed, CPU-only |
| **Data Processing** | pandas, numpy | Standard, fast enough |
| **Graph Routing** | networkx | Dijkstra, A*, easy graph ops |
| **Backend API** | FastAPI | Async, auto-docs, fast |
| **Database** | SQLite (dev) / PostgreSQL (prod) | Simple, relational |
| **Frontend** | React + Leaflet | Interactive maps, lightweight |
| **Real-time** | WebSocket or Server-Sent Events | Live updates |
| **Visualization** | SHAP (for explainability) | Feature importance plots |
| **Deployment** | Docker (optional) | Portability |

### Dependencies (requirements.txt)

```
fastapi
uvicorn
pandas
numpy
scikit-learn
xgboost
lightgbm
networkx
shap
joblib
```

**No PyTorch. No TensorFlow. No GPU required.**

---

## 6. Implementation Phases

### Phase 1: Foundation (Hours 0-8)

| Task | Deliverable |
|---|---|
| Download & explore Kaggle dataset | EDA notebook |
| Clean data, handle missing values | Cleaned CSV |
| Build road network graph from origin-destination pairs | networkx graph object |
| Implement Dijkstra routing | Working route finder |
| Create feature engineering pipeline | Feature matrix X, target y |

### Phase 2: ML Models (Hours 8-16)

| Task | Deliverable |
|---|---|
| Train XGBoost delay classifier | Trained model, validation metrics |
| Train Isolation Forest anomaly detector | Trained model |
| Train LightGBM ETA regressor (optional) | Trained model |
| Build ensemble fusion layer | Combined risk score function |
| Generate SHAP explainability plots | Interpretation dashboard |

### Phase 3: Integration (Hours 16-22)

| Task | Deliverable |
|---|---|
| Build FastAPI backend | REST endpoints for predict, route, alert |
| Implement WebSocket for real-time updates | Live shipment tracking |
| Build React frontend with Leaflet map | Interactive dashboard |
| Create alert cards with risk scores | Disruption notification UI |
| Implement reroute suggestion panel | Top-3 route options with trade-offs |

### Phase 4: Demo & Polish (Hours 22-30)

| Task | Deliverable |
|---|---|
| Create demo script with narrative | "Ahmedabad Pharma Crisis" story |
| Inject simulated disruption events | Live demo scenario |
| Add metrics dashboard | Cost saved, delays prevented |
| Prepare presentation slides | Technical + business value |
| Record demo video (optional) | Backup if live demo fails |

---

## 7. Demo Scenario: "The Ahmedabad Pharma Crisis"

| Time | Event | System Action |
|---|---|---|
| 09:00 | Shipment SHP-0012 departs Zydus Cadila, Ahmedabad | Status: NORMAL, delay risk 12% |
| 09:30 | Truck on NH 48, 45 km/h average speed | Model C: Trajectory normal |
| 10:15 | Weather API: Heavy rain alert for NH 48 corridor | Model A: Delay risk rises to 34% |
| 10:45 | Speed drops to 22 km/h, GPS shows congestion | Model C: Anomaly score 0.72 |
| 11:00 | **Model A: Delay risk 78% — HIGH threshold crossed** | **ALERT triggered** |
| 11:01 | System generates 3 alternative routes | Route ranking complete |
| | • Route A (Current): ETA 15:30, cost ₹0, risk 78% | |
| | • Route B (Via Sanand): ETA 13:45, cost +₹200, risk 15% | |
| | • Route C (Via Vadodara): ETA 14:10, cost +₹150, risk 22% | |
| 11:02 | Dispatcher selects Route B | System updates GPS path |
| 11:05 | Truck reroutes via Sanand | Map updates, stakeholders notified |
| 13:45 | **Actual arrival: 13:52** | Prediction error: 7 minutes |
| 14:00 | Vessel departs Mundra Port | **Shipment saved, ₹5L penalty avoided** |
| Post-trip | Feedback logged, model drift checked | Continuous learning loop |

---

## 8. Key Metrics & Success Criteria

| Metric | Target | How Measured |
|---|---|---|
| Delay prediction accuracy (F1) | > 0.75 | On held-out test set |
| ETA prediction MAE | < 15 minutes | On held-out test set |
| Anomaly detection precision@10 | > 0.80 | Top 10 anomalies, % true positives |
| Inference latency | < 10 ms | API response time |
| Route computation time | < 100 ms | A* on graph |
| False positive rate | < 15% | Alerts that don't materialize |

---

## 9. Scalability Roadmap

| Phase | Geography | Data Volume | Model Complexity |
|---|---|---|---|
| **Hackathon** | Ahmedabad-Mumbai corridor | 50-100 shipments | XGBoost + Isolation Forest |
| **V2** | Gujarat state | 1,000+ shipments | Add corridor-specific models |
| **V3** | Western India | 10,000+ shipments | Graph Neural Network for routing |
| **V4** | Pan-India | 100,000+ shipments | Federated learning, regional models |
| **V5** | Global | 1M+ shipments | Transformer for multi-modal fusion |

---

## 10. Risk Mitigation

| Risk | Mitigation |
|---|---|
| Model overfits to limited data | Time-based validation, regularization, early stopping |
| Class imbalance (few delays) | Scale_pos_weight, SMOTE, or focal loss |
| Concept drift (new routes/carriers) | Weekly retraining, drift detection (PSI) |
| Demo failure | Pre-recorded backup, offline mode |
| Explainability questions | SHAP plots ready, feature importance documented |

---

## 11. Team Roles (Suggested)

| Role | Responsibility |
|---|---|
| **ML Engineer** | Model training, validation, feature engineering |
| **Backend Developer** | FastAPI, database, API design |
| **Frontend Developer** | React, Leaflet map, dashboard UI |
| **Data Engineer** | Data pipeline, cleaning, feature store |
| **Demo/Presentation Lead** | Narrative, slides, scenario scripting |

---

## 12. Summary

| Decision | Choice |
|---|---|
| **Primary ML model** | XGBoost (delay classification) |
| **Secondary ML model** | Isolation Forest (anomaly detection) |
| **Optional ML model** | LightGBM (ETA regression) |
| **Deep learning?** | No — not needed for tabular data |
| **PyTorch/TensorFlow?** | No — sklearn + xgboost + lightgbm only |
| **GPU needed?** | No — CPU-only |
| **Routing algorithm** | Dijkstra / A* on networkx graph |
| **Explainability** | SHAP values |
| **Real-time feel** | WebSocket + simulated GPS stream |
| **Demo focus** | "Ahmedabad Pharma Crisis" narrative |

---

**This architecture balances accuracy, interpretability, and implementation speed — optimized for a hackathon environment while demonstrating production-grade thinking.**