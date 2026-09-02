"""
TrustPhone AI — Document Verifier

OCR-based evidence consistency checking for stolen-phone reports.

When a user uploads supporting evidence (FIR, receipt, box image, etc.),
this module extracts text via OCR and compares the detected IMEI against
the IMEI submitted in the stolen-phone report.

IMPORTANT:
  A PASS result means the OCR-extracted IMEI matches the submitted IMEI.
  It does NOT mean the document is legally authentic or verified by any
  authoritative source. The report remains UNDER_REVIEW regardless.
"""

import logging
from typing import Optional

import easyocr
import numpy as np

from services.ocr_engine import preprocess_image, IMEI_RE

logger = logging.getLogger("trustphone.verifier")


def verify_evidence_consistency(
    evidence_bytes: bytes,
    submitted_imei: str,
    reader: easyocr.Reader,
) -> tuple[str, Optional[str]]:
    """
    Check OCR-extracted IMEI against the submitted IMEI.

    Returns:
        (consistency_status, extracted_imei_or_none)

        consistency_status is one of:
          "PASS"        — extracted IMEI matches submitted IMEI
          "MISMATCH"    — extracted IMEI differs from submitted IMEI
          "NOT_CHECKED" — no IMEI could be extracted from the document

    This function does NOT authenticate the document. A PASS result
    confirms textual consistency only, not legal validity.
    """
    # ---- Decode image from raw bytes ----
    try:
        import cv2
        nparr = np.frombuffer(evidence_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("cv2.imdecode returned None")
    except Exception as exc:
        logger.warning("Could not decode evidence image: %s", exc)
        return "NOT_CHECKED", None

    # ---- Preprocess for OCR ----
    processed = preprocess_image(img)

    # ---- Run OCR ----
    try:
        results = reader.readtext(processed)
    except Exception as exc:
        logger.error("OCR failed during evidence verification: %s", exc, exc_info=True)
        return "NOT_CHECKED", None

    # ---- Aggregate extracted text ----
    full_text = " ".join(text for _, text, _ in results)
    logger.debug("Evidence OCR text: %s", full_text)

    # ---- Extract 15-digit IMEI candidates ----
    matches = IMEI_RE.findall(full_text)
    if not matches:
        return "NOT_CHECKED", None

    # ---- Compare candidates against submitted IMEI ----
    for candidate in matches:
        if candidate == submitted_imei:
            return "PASS", candidate

    # Extracted an IMEI but it doesn't match
    return "MISMATCH", matches[0]
