"""
TrustPhone AI — Demo Seed Data

Populates the DeviceRecord table with realistic fictional demo data
when the table is empty. All data is clearly fictional and is used
ONLY for demonstration purposes during the hackathon prototype.

No real personal information is used.
"""

from datetime import datetime, timezone
from sqlalchemy.orm import Session
from models import DeviceRecord

# ---------------------------------------------------------------------------
# Fictional demo devices — covering every allowed status
# ---------------------------------------------------------------------------

DEMO_DEVICES: list[dict] = [
    # ---- CLEAN devices ----
    {
        "imei_number": "353456789012345",
        "brand": "Samsung",
        "model": "Galaxy A54",
        "status": "CLEAN",
        "reported_date": None,
        "report_reference": None,
        "source": "TrustPhone AI Demo Database",
    },
    {
        "imei_number": "356789012345678",
        "brand": "Apple",
        "model": "iPhone 14",
        "status": "CLEAN",
        "reported_date": None,
        "report_reference": None,
        "source": "TrustPhone AI Demo Database",
    },
    {
        "imei_number": "862345678901234",
        "brand": "Xiaomi",
        "model": "Redmi Note 13",
        "status": "CLEAN",
        "reported_date": None,
        "report_reference": None,
        "source": "TrustPhone AI Demo Database",
    },
    # ---- STOLEN devices ----
    {
        "imei_number": "351234567890123",
        "brand": "Samsung",
        "model": "Galaxy S23 Ultra",
        "status": "STOLEN",
        "reported_date": datetime(2026, 6, 15, 10, 30, tzinfo=timezone.utc),
        "report_reference": "TP-ST-2026-001",
        "source": "TrustPhone AI Demo Database",
    },
    {
        "imei_number": "359876543210987",
        "brand": "Apple",
        "model": "iPhone 15 Pro",
        "status": "STOLEN",
        "reported_date": datetime(2026, 7, 22, 14, 0, tzinfo=timezone.utc),
        "report_reference": "TP-ST-2026-002",
        "source": "TrustPhone AI Demo Database",
    },
    # ---- BLOCKED devices ----
    {
        "imei_number": "354567890123456",
        "brand": "OnePlus",
        "model": "Nord CE 4",
        "status": "BLOCKED",
        "reported_date": datetime(2026, 5, 10, 9, 0, tzinfo=timezone.utc),
        "report_reference": "TP-BK-2026-001",
        "source": "TrustPhone AI Demo Database",
    },
    {
        "imei_number": "867890123456789",
        "brand": "Oppo",
        "model": "Reno 11",
        "status": "BLOCKED",
        "reported_date": datetime(2026, 4, 3, 16, 45, tzinfo=timezone.utc),
        "report_reference": "TP-BK-2026-002",
        "source": "TrustPhone AI Demo Database",
    },
    # ---- SUSPICIOUS devices ----
    {
        "imei_number": "357890123456789",
        "brand": "Google",
        "model": "Pixel 8",
        "status": "SUSPICIOUS",
        "reported_date": datetime(2026, 8, 1, 11, 15, tzinfo=timezone.utc),
        "report_reference": "TP-SP-2026-001",
        "source": "TrustPhone AI Demo Database",
    },
    {
        "imei_number": "861234567890123",
        "brand": "Realme",
        "model": "GT 5 Pro",
        "status": "SUSPICIOUS",
        "reported_date": datetime(2026, 7, 18, 8, 30, tzinfo=timezone.utc),
        "report_reference": "TP-SP-2026-002",
        "source": "TrustPhone AI Demo Database",
    },
    # ---- UNDER_REVIEW devices ----
    {
        "imei_number": "352345678901234",
        "brand": "Huawei",
        "model": "P60 Pro",
        "status": "UNDER_REVIEW",
        "reported_date": datetime(2026, 8, 20, 13, 0, tzinfo=timezone.utc),
        "report_reference": "TP-UR-2026-001",
        "source": "TrustPhone AI Demo Database",
    },
    {
        "imei_number": "863456789012345",
        "brand": "Motorola",
        "model": "Edge 50 Pro",
        "status": "UNDER_REVIEW",
        "reported_date": datetime(2026, 8, 25, 17, 30, tzinfo=timezone.utc),
        "report_reference": "TP-UR-2026-002",
        "source": "TrustPhone AI Demo Database",
    },
]


def seed_device_records(db: Session) -> int:
    """
    Insert demo DeviceRecord rows if the table is empty.

    Returns the number of rows inserted (0 if data already exists).
    """
    existing_count = db.query(DeviceRecord).count()
    if existing_count > 0:
        return 0

    for device_data in DEMO_DEVICES:
        record = DeviceRecord(**device_data)
        db.add(record)

    db.commit()
    return len(DEMO_DEVICES)
