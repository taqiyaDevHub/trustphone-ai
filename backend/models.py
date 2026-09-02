"""
TrustPhone AI — SQLAlchemy ORM Models

Defines the two core database models:
  - DeviceRecord: IMEI-linked device status information.
  - StolenReport:  User-submitted stolen-phone reports.
"""

from datetime import datetime, timezone
from sqlalchemy import (
    Column,
    Integer,
    String,
    DateTime,
    Index,
)
from database import Base


# ---------------------------------------------------------------------------
# Allowed status values (enforced at the application layer)
# ---------------------------------------------------------------------------

DEVICE_STATUS_VALUES = ("CLEAN", "STOLEN", "BLOCKED", "SUSPICIOUS", "UNDER_REVIEW")

VERIFICATION_STATUS_VALUES = ("USER_REPORTED", "UNDER_REVIEW", "VERIFIED_STOLEN")

EVIDENCE_CONSISTENCY_VALUES = ("NOT_CHECKED", "PASS", "MISMATCH")


# ---------------------------------------------------------------------------
# DeviceRecord
# ---------------------------------------------------------------------------

class DeviceRecord(Base):
    """Stores IMEI-linked device status from demo / authoritative sources."""

    __tablename__ = "device_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    imei_number = Column(String(15), unique=True, nullable=False, index=True)
    brand = Column(String(100), nullable=False)
    model = Column(String(100), nullable=False)
    status = Column(String(20), nullable=False, default="CLEAN")
    reported_date = Column(DateTime, nullable=True)
    report_reference = Column(String(50), nullable=True)
    source = Column(String(200), nullable=False, default="TrustPhone AI Demo Database")
    created_at = Column(
        DateTime, nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    updated_at = Column(
        DateTime,
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    __table_args__ = (
        Index("ix_device_records_status", "status"),
        Index("ix_device_records_brand_model", "brand", "model"),
    )

    def __repr__(self) -> str:
        return (
            f"<DeviceRecord id={self.id} imei={self.imei_number} "
            f"status={self.status}>"
        )


# ---------------------------------------------------------------------------
# StolenReport
# ---------------------------------------------------------------------------

class StolenReport(Base):
    """User-submitted stolen-phone report (always starts as UNDER_REVIEW)."""

    __tablename__ = "stolen_reports"

    id = Column(Integer, primary_key=True, autoincrement=True)
    report_reference = Column(String(50), unique=True, nullable=False, index=True)
    owner_name = Column(String(200), nullable=False)
    contact_number = Column(String(30), nullable=False)
    imei_number = Column(String(15), nullable=False, index=True)
    brand = Column(String(100), nullable=False)
    model = Column(String(100), nullable=False)
    incident_date = Column(DateTime, nullable=False)
    incident_location = Column(String(300), nullable=False)
    fir_number = Column(String(100), nullable=True)
    evidence_path = Column(String(500), nullable=True)
    evidence_consistency_status = Column(
        String(20), nullable=False, default="NOT_CHECKED"
    )
    verification_status = Column(
        String(20), nullable=False, default="UNDER_REVIEW"
    )
    created_at = Column(
        DateTime, nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    updated_at = Column(
        DateTime,
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    __table_args__ = (
        Index("ix_stolen_reports_verification", "verification_status"),
        Index("ix_stolen_reports_imei", "imei_number"),
    )

    def __repr__(self) -> str:
        return (
            f"<StolenReport id={self.id} ref={self.report_reference} "
            f"status={self.verification_status}>"
        )
