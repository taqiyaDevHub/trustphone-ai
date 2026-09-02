"""
TrustPhone AI — Pydantic Schemas

Request / response schemas aligned with the MASTER PROJECT SPECIFICATION
API contracts. These schemas are ready for future endpoint implementations.
"""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Shared error envelope
# ---------------------------------------------------------------------------

class ErrorDetail(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    success: bool = False
    error: ErrorDetail


# ---------------------------------------------------------------------------
# API Contract 1 — Health Check
# ---------------------------------------------------------------------------

class HealthResponse(BaseModel):
    success: bool = True
    status: str = "ok"
    message: str = "TrustPhone AI backend is running"


# ---------------------------------------------------------------------------
# API Contract 2 — IMEI Verification
# ---------------------------------------------------------------------------

class VerifyResponse(BaseModel):
    success: bool = True
    found: bool
    imei: str
    brand: Optional[str] = None
    model: Optional[str] = None
    status: str
    status_label: str
    reported_date: Optional[datetime] = None
    report_reference: Optional[str] = None
    source: str = "TrustPhone AI Demo Database"
    safety_message: str


class VerifyErrorResponse(BaseModel):
    success: bool = False
    error: ErrorDetail


# ---------------------------------------------------------------------------
# API Contract 3 — OCR IMEI Scanning
# ---------------------------------------------------------------------------

class ScanImeiResponse(BaseModel):
    success: bool
    detected_imei: Optional[str] = None
    confidence: Optional[float] = None
    candidate_imeis: List[str] = []
    extracted_text: Optional[str] = None
    message: str


# ---------------------------------------------------------------------------
# API Contract 4 — AI Risk Assessment
# ---------------------------------------------------------------------------

class RiskScoreRequest(BaseModel):
    imei: str = Field(..., min_length=15, max_length=15)
    seller_phone: str = Field(..., min_length=1)
    asking_price: float = Field(..., gt=0)
    reference_market_price: float = Field(..., gt=0)


class RiskScoreResponse(BaseModel):
    success: bool = True
    risk_score: Optional[int] = None
    risk_level: Optional[str] = None
    key_factors: List[str] = []
    safety_advice: str
    data_sufficiency: str


class RiskScoreErrorResponse(BaseModel):
    success: bool = False
    risk_score: Optional[int] = None
    risk_level: Optional[str] = None
    key_factors: List[str] = []
    safety_advice: str
    data_sufficiency: str = "INSUFFICIENT"
    error: ErrorDetail


# ---------------------------------------------------------------------------
# API Contract 5 — Report Stolen Phone
# ---------------------------------------------------------------------------

class ReportStolenResponse(BaseModel):
    success: bool = True
    report_reference: str
    verification_status: str = "UNDER_REVIEW"
    evidence_consistency_status: str
    submitted_date: datetime
    message: str = "Your report has been submitted for review."
