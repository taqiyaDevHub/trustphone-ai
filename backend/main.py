"""
TrustPhone AI — FastAPI Application

Entry point for the TrustPhone AI backend.
Implements:
  - GET /health            (API Contract 1)
  - GET /api/verify/{imei}  (API Contract 2)
  - POST /api/scan-imei     (API Contract 3)
  - POST /api/risk-score    (API Contract 4)
  - POST /api/report-stolen  (API Contract 5)
  - CORS configuration for local development
  - Automatic database and seed-data initialization on startup
"""

import logging
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from fastapi import Depends, FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

import easyocr

from database import get_db, init_db, SessionLocal
from models import DeviceRecord, StolenReport
from schemas import ErrorDetail, HealthResponse, RiskScoreRequest, VerifyResponse
from seed_data import seed_device_records
from services.imei_service import validate_imei_format, validate_luhn_checksum
from services.ocr_engine import (
    scan_image_for_imei,
    validate_upload,
)
from services.risk_engine import predict_risk
from services.document_verifier import verify_evidence_consistency

# ---------------------------------------------------------------------------
# EasyOCR reader — lazy-loaded on first request
# ---------------------------------------------------------------------------

_ocr_reader: easyocr.Reader | None = None


def get_ocr_reader() -> easyocr.Reader:
    """Return the shared EasyOCR reader, creating it on first call."""
    global _ocr_reader
    if _ocr_reader is None:
        logger.info("Initializing EasyOCR reader (first request)...")
        _ocr_reader = easyocr.Reader(["en"], gpu=False)
        logger.info("EasyOCR reader ready.")
    return _ocr_reader


# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("trustphone")


# ---------------------------------------------------------------------------
# Lifespan — run startup / shutdown logic
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize database tables and seed data on startup."""
    logger.info("Initializing database tables...")
    init_db()
    logger.info("Database tables ready.")

    # Seed demo data if the DeviceRecord table is empty
    db = SessionLocal()
    try:
        inserted = seed_device_records(db)
        if inserted > 0:
            logger.info("Seeded %d demo device records.", inserted)
        else:
            logger.info("Device records already exist — skipping seed.")
    finally:
        db.close()

    yield  # Application runs

    logger.info("TrustPhone AI backend shutting down.")


# ---------------------------------------------------------------------------
# FastAPI application
# ---------------------------------------------------------------------------

app = FastAPI(
    title="TrustPhone AI",
    description="Check Before You Buy — Verify a second-hand phone before you spend your money.",
    version="0.1.0",
    lifespan=lifespan,
)


# ---------------------------------------------------------------------------
# CORS — configured for local development
# ---------------------------------------------------------------------------

ALLOWED_ORIGINS: list[str] = [
    "http://localhost:5173",  # Vite frontend dev server
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Status label and safety message mappings (fixed per MASTER SPECIFICATION)
# ---------------------------------------------------------------------------

STATUS_LABEL_MAP: dict[str, str] = {
    "CLEAN": "Clean",
    "STOLEN": "Stolen",
    "BLOCKED": "Blocked",
    "SUSPICIOUS": "Suspicious",
    "UNDER_REVIEW": "Under Review",
    "UNKNOWN": "No Known Record",
}

SAFETY_MESSAGE_MAP: dict[str, str] = {
    "CLEAN": "No known adverse record found in the available records checked.",
    "STOLEN": "Device is reported as stolen. Do not purchase.",
    "BLOCKED": "Device is blocked. Do not purchase without resolving its status.",
    "SUSPICIOUS": "Potential risk detected. Review the available information before purchasing.",
    "UNDER_REVIEW": "This device has a pending report and requires further verification.",
    "UNKNOWN": "No known adverse record found in the TrustPhone AI database.",
}


# ---------------------------------------------------------------------------
# API Contract 3 — POST /api/scan-imei
# ---------------------------------------------------------------------------

@app.post("/api/scan-imei")
async def scan_imei(image: UploadFile = File(...)) -> dict:
    """
    Scan an uploaded image for a 15-digit IMEI using EasyOCR + OpenCV.

    This endpoint ONLY extracts an IMEI candidate. It does NOT automatically
    trigger device verification — the frontend must present the result to
    the user for review and confirmation before calling /api/verify/{imei}.
    """
    # 1. Read file content
    content = await image.read()

    # 2. Validate upload metadata
    error = validate_upload(image.content_type, image.filename or "", len(content))
    if error:
        return {
            "success": False,
            "detected_imei": None,
            "confidence": None,
            "candidate_imeis": [],
            "extracted_text": None,
            "message": error,
        }

    # 3. Run OCR pipeline
    reader = get_ocr_reader()
    result = scan_image_for_imei(content, reader)

    return result


# ---------------------------------------------------------------------------
# API Contract 4 — POST /api/risk-score
# ---------------------------------------------------------------------------

@app.post("/api/risk-score")
async def risk_score(
    request: RiskScoreRequest,
    db: Session = Depends(get_db),
) -> dict:
    """
    Run AI risk assessment on a device transaction.

    Uses a trained LogisticRegression model on SYNTHETIC DEMO DATA.
    Returns risk_score (0-100), risk_level (LOW/MEDIUM/HIGH),
    key_factors, and cautious safety_advice.
    """
    # 1. Validate IMEI format
    is_valid, _ = validate_imei_format(request.imei)
    if not is_valid:
        return {
            "success": False,
            "risk_score": None,
            "risk_level": None,
            "key_factors": [],
            "safety_advice": "Insufficient information for a reliable risk assessment.",
            "data_sufficiency": "INSUFFICIENT",
            "error": {
                "code": "INVALID_IMEI",
                "message": "IMEI must contain exactly 15 digits.",
            },
        }

    # 2. Check data sufficiency
    if request.asking_price <= 0 or request.reference_market_price <= 0:
        return {
            "success": False,
            "risk_score": None,
            "risk_level": None,
            "key_factors": [],
            "safety_advice": "Insufficient information for a reliable risk assessment.",
            "data_sufficiency": "INSUFFICIENT",
            "error": {
                "code": "INSUFFICIENT_DATA",
                "message": "Insufficient information for a reliable risk assessment.",
            },
        }

    # 3. Look up device record (may be None for unknown IMEIs)
    device_record = (
        db.query(DeviceRecord)
        .filter(DeviceRecord.imei_number == request.imei)
        .first()
    )

    # 4. Run AI risk prediction
    try:
        result = predict_risk(
            imei=request.imei,
            asking_price=request.asking_price,
            reference_market_price=request.reference_market_price,
            device_record=device_record,
            db=db,
        )
    except Exception as exc:
        logger.error("Risk prediction failed: %s", exc, exc_info=True)
        return {
            "success": False,
            "risk_score": None,
            "risk_level": None,
            "key_factors": [],
            "safety_advice": "Risk assessment is temporarily unavailable. Please try again later.",
            "data_sufficiency": "INSUFFICIENT",
            "error": {
                "code": "PREDICTION_ERROR",
                "message": "Risk assessment could not be completed.",
            },
        }

    return result


# ---------------------------------------------------------------------------
# API Contract 5 — POST /api/report-stolen
# ---------------------------------------------------------------------------

UPLOADS_DIR = Path(__file__).resolve().parent / "uploads"


def _generate_report_reference(db: Session) -> str:
    """Generate a unique report reference like TP-ST-2026-001."""
    year = datetime.now(timezone.utc).year
    # Count existing reports this year to determine next sequence number
    existing = (
        db.query(StolenReport)
        .filter(StolenReport.report_reference.like(f"TP-ST-{year}-%"))
        .count()
    )
    next_num = existing + 1
    ref = f"TP-ST-{year}-{next_num:03d}"
    # Safety: ensure uniqueness
    while db.query(StolenReport).filter(StolenReport.report_reference == ref).first():
        next_num += 1
        ref = f"TP-ST-{year}-{next_num:03d}"
    return ref


def _parse_incident_date(date_str: str) -> datetime:
    """Parse an incident date string into a datetime (UTC)."""
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(date_str, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    # Fallback: use current UTC time
    return datetime.now(timezone.utc)


# Device statuses that represent an authoritative / already-confirmed state.
# A single user-submitted report must NEVER downgrade or override these.
_AUTHORITATIVE_DEVICE_STATUSES = {"STOLEN", "CLEAN", "BLOCKED", "SUSPICIOUS"}


def _sync_device_record_under_review(
    db: Session, imei: str, brand: str, model: str, report_reference: str
) -> None:
    """
    Make a freshly reported IMEI visible to GET /api/verify/{imei} as
    UNDER_REVIEW, without ever overriding authoritative data.

    Decision rules (a single user report is NOT authoritative verification):
      - No DeviceRecord for this IMEI yet -> CREATE one with status
        UNDER_REVIEW, this report's reference, and the submitted brand/model.
      - Existing status is authoritative (STOLEN / CLEAN / BLOCKED /
        SUSPICIOUS) -> LEAVE IT UNTOUCHED (never downgrade a confirmed device).
      - Existing status is already UNDER_REVIEW -> UPDATE its report_reference
        and reported_date to point at this latest report.

    The status is never set to STOLEN here; promotion to STOLEN is reserved
    for a separate manual/admin review process.
    """
    existing: DeviceRecord | None = (
        db.query(DeviceRecord)
        .filter(DeviceRecord.imei_number == imei)
        .first()
    )
    now = datetime.now(timezone.utc)

    if existing is None:
        db.add(
            DeviceRecord(
                imei_number=imei,
                brand=brand,
                model=model,
                status="UNDER_REVIEW",
                reported_date=now,
                report_reference=report_reference,
                source="TrustPhone AI Demo Database",
            )
        )
        return

    if existing.status in _AUTHORITATIVE_DEVICE_STATUSES:
        # Never downgrade/override an already-confirmed device status.
        return

    # Already UNDER_REVIEW: refresh to reference the most recent report.
    existing.status = "UNDER_REVIEW"
    existing.report_reference = report_reference
    existing.reported_date = now


@app.post("/api/report-stolen")
async def report_stolen(
    owner_name: str = Form(...),
    contact_number: str = Form(...),
    imei: str = Form(...),
    brand: str = Form(...),
    model: str = Form(...),
    incident_date: str = Form(...),
    incident_location: str = Form(...),
    fir_number: str | None = Form(None),
    evidence: UploadFile | None = File(None),
    db: Session = Depends(get_db),
) -> dict:
    """
    Submit a stolen-phone report with optional supporting evidence.

    IMPORTANT:
      - The report is always created with verification_status = UNDER_REVIEW.
      - A new report NEVER automatically changes a DeviceRecord status to STOLEN.
      - Evidence OCR consistency checking does NOT legally authenticate a document.
    """
    # 1. Validate IMEI
    is_valid, _ = validate_imei_format(imei)
    if not is_valid:
        return {
            "success": False,
            "error": {
                "code": "INVALID_IMEI",
                "message": "IMEI must contain exactly 15 digits.",
            },
        }

    # 2. Generate unique report reference
    report_ref = _generate_report_reference(db)

    # 3. Handle evidence upload (optional)
    evidence_path: str | None = None
    evidence_consistency = "NOT_CHECKED"

    if evidence is not None and evidence.filename:
        content = await evidence.read()

        # Validate file security
        upload_error = validate_upload(
            evidence.content_type, evidence.filename, len(content)
        )
        if upload_error:
            return {
                "success": False,
                "error": {
                    "code": "INVALID_EVIDENCE",
                    "message": upload_error,
                },
            }

        # Save to uploads/ with a safe, unique filename
        UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
        ext = Path(evidence.filename).suffix.lower()
        safe_name = f"evidence_{uuid.uuid4().hex}{ext}"
        file_path = UPLOADS_DIR / safe_name
        file_path.write_bytes(content)
        evidence_path = str(file_path.relative_to(UPLOADS_DIR.parent))

        # Run OCR consistency check
        try:
            reader = get_ocr_reader()
            evidence_consistency, _ = verify_evidence_consistency(
                content, imei, reader
            )
        except Exception as exc:
            logger.error("Evidence verification failed: %s", exc, exc_info=True)
            evidence_consistency = "NOT_CHECKED"

    # 4. Parse incident date
    parsed_date = _parse_incident_date(incident_date)

    # 5. Create StolenReport (always UNDER_REVIEW per MASTER SPECIFICATION)
    report = StolenReport(
        report_reference=report_ref,
        owner_name=owner_name,
        contact_number=contact_number,
        imei_number=imei,
        brand=brand,
        model=model,
        incident_date=parsed_date,
        incident_location=incident_location,
        fir_number=fir_number,
        evidence_path=evidence_path,
        evidence_consistency_status=evidence_consistency,
        verification_status="UNDER_REVIEW",
    )
    db.add(report)

    # 6. Sync a DeviceRecord so this IMEI becomes visible to Verify lookup as
    #    UNDER_REVIEW. A single user report is NOT authoritative verification,
    #    so this NEVER overrides a confirmed status and NEVER sets STOLEN.
    _sync_device_record_under_review(
        db, imei=imei, brand=brand, model=model, report_reference=report_ref
    )

    db.commit()

    return {
        "success": True,
        "report_reference": report_ref,
        "verification_status": "UNDER_REVIEW",
        "evidence_consistency_status": evidence_consistency,
        "submitted_date": report.created_at,
        "message": "Your report has been submitted for review.",
    }


# ---------------------------------------------------------------------------
# API Contract 2 — GET /api/verify/{imei}
# ---------------------------------------------------------------------------

@app.get("/api/verify/{imei}")
async def verify_imei(imei: str, db: Session = Depends(get_db)) -> dict:
    """
    Look up a device by its 15-digit IMEI.

    Returns public device-status information only.
    Private stolen-report data (owner, contact, evidence, FIR) is never exposed.
    """
    # 1. Validate format — reject immediately if invalid
    is_valid, error_code = validate_imei_format(imei)
    if not is_valid:
        return {
            "success": False,
            "error": {
                "code": "INVALID_IMEI",
                "message": "IMEI must contain exactly 15 digits.",
            },
        }

    # 2. Luhn checksum check (informational — logged for diagnostics)
    #    NOTE: A valid checksum confirms structural consistency only.
    #    It does NOT prove that a device is legitimate or safe.
    luhn_ok = validate_luhn_checksum(imei)
    if not luhn_ok:
        logger.debug("IMEI %s failed Luhn checksum validation.", imei)

    # 3. Database lookup
    record: DeviceRecord | None = (
        db.query(DeviceRecord)
        .filter(DeviceRecord.imei_number == imei)
        .first()
    )

    # 4a. Known device — return only public fields
    if record is not None:
        return {
            "success": True,
            "found": True,
            "imei": record.imei_number,
            "brand": record.brand,
            "model": record.model,
            "status": record.status,
            "status_label": STATUS_LABEL_MAP.get(record.status, record.status),
            "reported_date": record.reported_date,
            "report_reference": record.report_reference,
            "source": record.source,
            "safety_message": SAFETY_MESSAGE_MAP.get(record.status, ""),
        }

    # 4b. Unknown device — no record found in TrustPhone AI database
    return {
        "success": True,
        "found": False,
        "imei": imei,
        "brand": None,
        "model": None,
        "status": "UNKNOWN",
        "status_label": STATUS_LABEL_MAP["UNKNOWN"],
        "reported_date": None,
        "report_reference": None,
        "source": "TrustPhone AI Demo Database",
        "safety_message": SAFETY_MESSAGE_MAP["UNKNOWN"],
    }


# ---------------------------------------------------------------------------
# API Contract 1 — GET /health
# ---------------------------------------------------------------------------

@app.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """Return a simple health status for the TrustPhone AI backend."""
    return HealthResponse(
        success=True,
        status="ok",
        message="TrustPhone AI backend is running",
    )
