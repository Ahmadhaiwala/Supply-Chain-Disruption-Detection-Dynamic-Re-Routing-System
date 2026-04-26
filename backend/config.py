from pydantic_settings import BaseSettings
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent


class Settings(BaseSettings):
    APP_NAME: str = "Supply Chain Disruption Detection API"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True

    # Database
    DATABASE_URL: str = f"sqlite+aiosqlite:///{BASE_DIR}/data/supply_chain.db"

    # ML model paths
    MODEL_DIR: Path = BASE_DIR / "ml" / "saved_models"

    # Risk thresholds
    RISK_LOW_MAX: float = 0.4
    RISK_MEDIUM_MAX: float = 0.7
    # > 0.7 is HIGH

    # Anomaly threshold
    ANOMALY_THRESHOLD: float = 0.6

    # Routing
    MAX_CANDIDATE_ROUTES: int = 3

    class Config:
        env_file = ".env"


settings = Settings()
