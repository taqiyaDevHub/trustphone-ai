"""
TrustPhone AI — Database Configuration

Provides SQLAlchemy engine, session factory, and declarative base
for the SQLite-backed TrustPhone AI database.
"""

import os
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# Resolve the backend directory and database file path
BASE_DIR = Path(__file__).resolve().parent
DATABASE_PATH = BASE_DIR / "trustphone.db"
DATABASE_URL = f"sqlite:///{DATABASE_PATH}"

# SQLAlchemy engine — check_same_thread=False required for SQLite + FastAPI
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
    echo=False,
)

# Session factory
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)

# Declarative base for all ORM models
Base = declarative_base()


def get_db():
    """FastAPI dependency that yields a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create all tables defined by models inheriting Base."""
    Base.metadata.create_all(bind=engine)
