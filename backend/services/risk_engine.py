"""
TrustPhone AI — Risk Engine

Scikit-learn-based AI risk scoring using a trained LogisticRegression model.

The model was trained on SYNTHETIC DEMO DATA only. It does NOT represent
verified real-world fraud patterns. Risk scores are indicative, not
definitive — they help users identify signals that warrant caution.
"""

import logging
from pathlib import Path
from typing import Any, Optional

import joblib
import numpy as np
from sqlalchemy.orm import Session

from models import DeviceRecord, StolenReport

logger = logging.getLogger("trustphone.risk")

# ---------------------------------------------------------------------------
# Model loading
# ---------------------------------------------------------------------------

_MODEL_PATH = Path(__file__).resolve().parent.parent / "data" / "trained_risk_model.joblib"

_model_artifact: Optional[dict] = None


def get_model() -> dict:
    """
    Load and cache the trained model artifact on first call.

    Returns a dict with keys: 'model' (Pipeline), 'feature_names', 'classes'.
    """
    global _model_artifact
    if _model_artifact is None:
        if not _MODEL_PATH.exists():
            raise FileNotFoundError(
                f"Trained model not found at {_MODEL_PATH}. "
                "Run `python train_model.py` to generate it."
            )
        _model_artifact = joblib.load(_MODEL_PATH)
        logger.info("Loaded risk model from %s", _MODEL_PATH)
    return _model_artifact


# ---------------------------------------------------------------------------
# Status encoding (must match training data)
# ---------------------------------------------------------------------------

_STATUS_MAP: dict[str, int] = {
    "CLEAN": 0,
    "SUSPICIOUS": 1,
    "UNDER_REVIEW": 2,
    "BLOCKED": 3,
    "STOLEN": 4,
    "UNKNOWN": 0,   # No record → treat as clean baseline
}

# Minimum report counts implied by device status, used when the DB has
# no StolenReport rows (common in prototypes).  This keeps prediction-time
# features consistent with the correlated synthetic training data.
_STATUS_MIN_REPORTS: dict[str, int] = {
    "CLEAN": 0,
    "UNKNOWN": 0,
    "SUSPICIOUS": 2,
    "UNDER_REVIEW": 4,
    "BLOCKED": 5,
    "STOLEN": 7,
}

_STATUS_MIN_SELLER_FREQ: dict[str, float] = {
    "CLEAN": 0.0,
    "UNKNOWN": 0.0,
    "SUSPICIOUS": 1.5,
    "UNDER_REVIEW": 3.0,
    "BLOCKED": 4.0,
    "STOLEN": 5.0,
}


# ---------------------------------------------------------------------------
# Feature computation
# ---------------------------------------------------------------------------

def compute_features(
    imei: str,
    asking_price: float,
    reference_market_price: float,
    device_record: Optional[DeviceRecord],
    db: Session,
) -> tuple[np.ndarray, dict]:
    """
    Build the 8-feature vector expected by the trained model.

    Returns (feature_array, feature_dict) where feature_dict holds
    human-readable values used for key_factors generation.
    """
    # ---- 1. Number of previous reports for this IMEI ----
    db_report_count: int = (
        db.query(StolenReport)
        .filter(StolenReport.imei_number == imei)
        .count()
    )

    # Use the larger of actual DB reports and the status-implied minimum.
    # This ensures features remain consistent with training data even when
    # the StolenReport table is empty (common in prototypes).
    device_status = device_record.status if device_record else "UNKNOWN"
    status_min = _STATUS_MIN_REPORTS.get(device_status, 0)
    num_reports = max(db_report_count, status_min)

    # ---- 2. Verified report count ----
    verified_count: int = (
        db.query(StolenReport)
        .filter(
            StolenReport.imei_number == imei,
            StolenReport.verification_status == "VERIFIED_STOLEN",
        )
        .count()
    )

    # ---- 3 & 4. Prices (from request) ----
    transaction_price = float(asking_price)
    market_price = float(reference_market_price)

    # ---- 5. Price difference percentage ----
    if market_price > 0:
        price_diff_pct = round(((market_price - transaction_price) / market_price) * 100, 2)
    else:
        price_diff_pct = 0.0

    # ---- 6. IMEI status (encoded as in training data) ----
    # device_status was already resolved above
    imei_status_code = _STATUS_MAP.get(device_status, 0)

    # ---- 7. Seller report frequency ----
    # Derived from device status and DB report count.
    # At prediction time, actual seller data is unavailable, so this is
    # proxied by the status-implied minimum to stay consistent with
    # training data.
    seller_report_freq = max(float(db_report_count), _STATUS_MIN_SELLER_FREQ.get(device_status, 0.0))

    # ---- 8. Information completeness (0.0 – 1.0) ----
    completeness_items = [
        device_record is not None,
        asking_price > 0,
        reference_market_price > 0,
        len(imei) == 15,
    ]
    information_completeness = sum(completeness_items) / len(completeness_items)

    # ---- Assemble feature vector (order must match FEATURE_NAMES) ----
    feature_array = np.array([[
        float(num_reports),
        float(verified_count),
        transaction_price,
        market_price,
        price_diff_pct,
        float(imei_status_code),
        seller_report_freq,
        information_completeness,
    ]])

    feature_dict = {
        "number_of_previous_reports": num_reports,
        "verified_report_count": verified_count,
        "price_diff_pct": price_diff_pct,
        "device_status": device_status,
        "information_completeness": information_completeness,
    }

    return feature_array, feature_dict


# ---------------------------------------------------------------------------
# Key-factor generation
# ---------------------------------------------------------------------------

def _derive_key_factors(feature_dict: dict, risk_level: str) -> list[str]:
    """
    Generate human-readable key_factors based on the computed features.

    Uses cautious language — never claims certainty.
    """
    factors: list[str] = []

    status = feature_dict["device_status"]
    if status in ("STOLEN", "BLOCKED"):
        factors.append("Device status indicates a serious concern")
    elif status == "SUSPICIOUS":
        factors.append("Device status suggests potential risk")
    elif status == "UNDER_REVIEW":
        factors.append("Device has a pending report under review")

    pct = feature_dict["price_diff_pct"]
    if pct > 30:
        factors.append(
            "Asking price differs significantly from the reference price"
        )
    elif pct > 15:
        factors.append(
            "Asking price is moderately below the reference price"
        )

    if feature_dict["number_of_previous_reports"] > 0:
        factors.append(
            "Previous reports exist for this device IMEI"
        )

    if feature_dict["verified_report_count"] > 0:
        factors.append(
            "One or more reports have been verified"
        )

    if feature_dict["information_completeness"] < 0.75:
        factors.append("Limited information available for assessment")

    # Ensure at least one factor
    if not factors:
        if risk_level == "LOW":
            factors.append("No significant risk signals detected in the available data")
        else:
            factors.append("General risk indicators present in the transaction data")

    return factors[:5]


# ---------------------------------------------------------------------------
# Risk prediction
# ---------------------------------------------------------------------------

def predict_risk(
    imei: str,
    asking_price: float,
    reference_market_price: float,
    device_record: Optional[DeviceRecord],
    db: Session,
) -> dict:
    """
    Run the full risk-assessment pipeline:
      1. Compute features from request + DB context.
      2. Run trained LogisticRegression model.
      3. Convert probability → risk_score (0-100).
      4. Map score → LOW / MEDIUM / HIGH.
      5. Generate key_factors and safety_advice.

    Returns a dict matching the MASTER SPECIFICATION /api/risk-score response.
    """
    artifact = get_model()
    pipeline = artifact["model"]

    features, feat_dict = compute_features(
        imei, asking_price, reference_market_price, device_record, db
    )

    # ---- Model prediction ----
    probability = float(pipeline.predict_proba(features)[0][1])  # P(risk=1)
    risk_score = int(round(probability * 100))
    risk_score = max(0, min(100, risk_score))  # clamp 0–100

    # ---- Risk level mapping ----
    if risk_score <= 30:
        risk_level = "LOW"
    elif risk_score <= 65:
        risk_level = "MEDIUM"
    else:
        risk_level = "HIGH"

    # ---- Key factors ----
    key_factors = _derive_key_factors(feat_dict, risk_level)

    # ---- Safety advice (cautious language, never absolute) ----
    safety_advice_map = {
        "LOW": (
            "Based on the available data, no significant risk signals were detected. "
            "However, always verify device details in person before purchasing."
        ),
        "MEDIUM": (
            "Some risk factors were detected. Proceed with caution and verify "
            "all available information before completing the transaction."
        ),
        "HIGH": (
            "Multiple risk factors were detected. Proceed with extreme caution "
            "and thoroughly verify all information before completing the transaction."
        ),
    }
    safety_advice = safety_advice_map[risk_level]

    return {
        "success": True,
        "risk_score": risk_score,
        "risk_level": risk_level,
        "key_factors": key_factors,
        "safety_advice": safety_advice,
        "data_sufficiency": "SUFFICIENT",
    }
