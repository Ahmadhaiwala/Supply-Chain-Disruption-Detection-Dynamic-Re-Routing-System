"""
Supply Chain Disruption Detection & Dynamic Re-Routing System
FastAPI Backend Entry Point
"""
import logging
import os
import traceback
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

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
    logger.info("CORS allowed origins: %s", settings.get_allowed_origins())

    # Ensure directories exist
    os.makedirs(settings.MODEL_DIR, exist_ok=True)
    os.makedirs(settings.MODEL_DIR.parent.parent / "data", exist_ok=True)

    # Initialize database
    await init_db()
    logger.info("Database initialized")

    # Auto-seed if empty
    from seed_data import auto_seed
    await auto_seed()

    # Auto-train models if not saved
    from ml.delay_classifier import get_delay_classifier
    from ml.eta_regressor import get_eta_regressor
    from ml.anomaly_detector import get_anomaly_detector
    from routing.graph_router import get_graph
    from config import settings
    from pathlib import Path

    clf = get_delay_classifier()
    reg = get_eta_regressor()
    det = get_anomaly_detector()

    models_missing = (
        clf.model is None or
        reg.model_median is None or
        det.model is None
    )

    if models_missing:
        csv_path = Path(__file__).parent / "data" / "dynamic_supply_chain_logistics_dataset.csv"
        if csv_path.exists():
            logger.info("Saved models not found — auto-training on startup...")
            try:
                from ml.train import train_all
                train_all(str(csv_path))
                logger.info("Auto-training complete")
                # Reload singletons after training
                from ml import delay_classifier as _dc
                from ml import eta_regressor as _er
                from ml import anomaly_detector as _ad
                _dc._classifier = None
                _er._regressor = None
                _ad._detector = None
                get_delay_classifier()
                get_eta_regressor()
                get_anomaly_detector()
            except Exception as e:
                logger.error("Auto-training failed: %s — predictions will use defaults", e)
        else:
            logger.warning(
                "No saved models and no CSV at %s — predictions will use defaults. "
                "Run: python -m ml.train", csv_path
            )

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

# ─── Global Exception Handler ────────────────────────────────────────────────
# Catches ALL unhandled exceptions so they are converted to JSONResponses
# inside the ExceptionMiddleware scope. Without this, non-HTTPException errors
# (like sklearn NotFittedError) propagate past the CORS middleware, which then
# cannot add Access-Control-Allow-Origin to the 500 response, causing the
# browser to block it with a CORS error.
@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.error("Unhandled exception on %s %s: %s", request.method, request.url.path, exc)
    logger.debug("Traceback:\n%s", traceback.format_exc())
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal Server Error", "error": str(exc)},
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
