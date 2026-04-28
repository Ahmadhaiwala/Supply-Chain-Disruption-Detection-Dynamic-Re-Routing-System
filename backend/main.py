"""
Supply Chain Disruption Detection & Dynamic Re-Routing System
FastAPI Backend Entry Point
"""
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from database import init_db
from api.predict import router as predict_router
from api.route import router as route_router
from api.shipments import router as shipments_router
from api.websocket import router as ws_router
from api.external import router as external_router
from api.history import router as history_router

# ─── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)


# ─── Lifespan ─────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    logger.info("Starting %s v%s", settings.APP_NAME, settings.APP_VERSION)

    # Ensure directories exist
    os.makedirs(settings.MODEL_DIR, exist_ok=True)
    os.makedirs(settings.MODEL_DIR.parent.parent / "data", exist_ok=True)

    # Initialize database
    await init_db()
    logger.info("Database initialized")

    # Pre-load ML models (warm up)
    from ml.delay_classifier import get_delay_classifier
    from ml.eta_regressor import get_eta_regressor
    from ml.anomaly_detector import get_anomaly_detector
    from routing.graph_router import get_graph

    get_delay_classifier()
    get_eta_regressor()
    get_anomaly_detector()
    get_graph()
    logger.info("ML models and routing graph loaded")

    yield

    logger.info("Shutting down %s", settings.APP_NAME)


# ─── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description=(
        "ML-powered preemptive supply chain disruption detection "
        "with dynamic route optimization. Built for the Ahmedabad region."
    ),
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# ─── CORS ─────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.get_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Routers ──────────────────────────────────────────────────────────────────
app.include_router(shipments_router)
app.include_router(predict_router)
app.include_router(route_router)
app.include_router(ws_router)
app.include_router(external_router)
app.include_router(history_router)


# ─── Health & Info ────────────────────────────────────────────────────────────
@app.get("/", tags=["Health"])
async def root():
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "running",
        "docs": "/docs",
    }


@app.get("/health", tags=["Health"])
async def health():
    return {"status": "ok"}


@app.get("/info", tags=["Health"])
async def info():
    from routing.graph_router import get_graph
    from api.websocket import get_connection_manager

    graph = get_graph()
    manager = get_connection_manager()

    return {
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "graph_nodes": graph.G.number_of_nodes(),
        "graph_edges": graph.G.number_of_edges(),
        "active_ws_connections": len(manager.active_bookings),
        "risk_thresholds": {
            "low_max": settings.RISK_LOW_MAX,
            "medium_max": settings.RISK_MEDIUM_MAX,
        },
    }
