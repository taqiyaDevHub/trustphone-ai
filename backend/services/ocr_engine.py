"""
TrustPhone AI — OCR Engine

EasyOCR + OpenCV-based IMEI scanning from uploaded images.

Pipeline:
  1. Validate upload (MIME type, extension, size, filename safety)
  2. Load and preprocess image (resize, grayscale, CLAHE contrast, thresholding)
  3. Run EasyOCR text detection
  4. Extract 15-digit numeric candidates via regex
  5. Prefer Luhn-valid candidates; pick highest-confidence match
  6. Return structured result — never triggers verification automatically
"""

import logging
import re
import tempfile
from pathlib import Path
from typing import Optional

import cv2
import easyocr
import numpy as np

from services.imei_service import validate_imei_format, validate_luhn_checksum

logger = logging.getLogger("trustphone.ocr")


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

ALLOWED_MIME_TYPES: set[str] = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/bmp",
    "image/tiff",
}

ALLOWED_EXTENSIONS: set[str] = {
    ".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff", ".tif",
}

# 10 MB maximum upload size
MAX_FILE_SIZE_BYTES: int = 10 * 1024 * 1024

# Regex: exactly 15 consecutive digits, not embedded in a longer number
IMEI_RE = re.compile(r"(?<!\d)\d{15}(?!\d)")

OCR_NO_RESULT_MESSAGE = (
    "Could not detect an IMEI. Please enter it manually or dial *#06#."
)


# ---------------------------------------------------------------------------
# Upload validation helpers
# ---------------------------------------------------------------------------

def validate_upload(
    content_type: Optional[str],
    filename: str,
    size: int,
) -> Optional[str]:
    """
    Validate an uploaded image file.

    Returns an error message string if invalid, or None if the file passes
    all checks.
    """
    # Path traversal / unsafe filename — MUST be checked first
    if any(tok in (filename or "") for tok in ("..", "/", "\\")):
        return "Invalid filename."
    basename = Path(filename or "").name
    if not basename or basename.startswith("."):
        return "Invalid filename."

    # MIME type
    if not content_type or content_type not in ALLOWED_MIME_TYPES:
        return (
            f"Unsupported file type: {content_type}. "
            "Please upload a JPEG, PNG, WebP, BMP, or TIFF image."
        )

    # Extension
    ext = Path(filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        return (
            f"Unsupported file extension: {ext}. "
            "Please upload a JPEG, PNG, WebP, BMP, or TIFF image."
        )

    # Size
    if size > MAX_FILE_SIZE_BYTES:
        max_mb = MAX_FILE_SIZE_BYTES / (1024 * 1024)
        return f"File too large ({size / (1024*1024):.1f} MB). Maximum allowed is {max_mb:.0f} MB."
    if size == 0:
        return "Uploaded file is empty."

    return None


# ---------------------------------------------------------------------------
# Image preprocessing
# ---------------------------------------------------------------------------

def preprocess_image(image_array: np.ndarray) -> np.ndarray:
    """
    Preprocess an image for optimal IMEI digit recognition.

    Steps:
      1. Resize if width exceeds 1920 px (keeps aspect ratio).
      2. Convert to grayscale.
      3. Apply CLAHE adaptive contrast enhancement.
      4. Apply adaptive thresholding for binarisation.
    """
    img = image_array.copy()

    # 1. Resize large images to reduce processing time
    height, width = img.shape[:2]
    max_width = 1920
    if width > max_width:
        scale = max_width / width
        new_h = int(height * scale)
        img = cv2.resize(img, (max_width, new_h), interpolation=cv2.INTER_AREA)

    # 2. Grayscale conversion
    if len(img.shape) == 3:
        img = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # 3. CLAHE contrast enhancement
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    img = clahe.apply(img)

    # 4. Adaptive thresholding for sharper digit edges
    img = cv2.adaptiveThreshold(
        img, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        blockSize=11,
        C=2,
    )

    return img


# ---------------------------------------------------------------------------
# Candidate extraction
# ---------------------------------------------------------------------------

def extract_imei_candidates(text: str) -> list[str]:
    """
    Extract 15-digit numeric sequences from OCR text using regex.

    Does NOT assume the first detected number is the IMEI.
    Returns a deduplicated list preserving discovery order.
    """
    matches = IMEI_RE.findall(text)
    seen: set[str] = set()
    candidates: list[str] = []
    for m in matches:
        is_valid, _ = validate_imei_format(m)
        if is_valid and m not in seen:
            seen.add(m)
            candidates.append(m)
    return candidates


# ---------------------------------------------------------------------------
# Main scanning function
# ---------------------------------------------------------------------------

def scan_image_for_imei(
    image_bytes: bytes,
    reader: easyocr.Reader,
) -> dict:
    """
    Full OCR pipeline: bytes → preprocessed image → OCR → IMEI candidates.

    Returns a dict matching the MASTER SPECIFICATION scan-imei response:
      success, detected_imei, confidence, candidate_imeis,
      extracted_text, message

    This function ONLY extracts an IMEI — it does NOT call verification.
    """
    # ---- Load image with OpenCV from raw bytes ----
    try:
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("cv2.imdecode returned None")
    except Exception as exc:
        logger.warning("Could not decode uploaded image: %s", exc)
        return {
            "success": False,
            "detected_imei": None,
            "confidence": None,
            "candidate_imeis": [],
            "extracted_text": None,
            "message": "Could not read the image. It may be corrupted. "
                       "Please try another photo or enter the IMEI manually.",
        }

    # ---- Preprocess ----
    processed = preprocess_image(img)

    # ---- Run EasyOCR ----
    try:
        results = reader.readtext(processed)
    except Exception as exc:
        logger.error("EasyOCR error: %s", exc, exc_info=True)
        return {
            "success": False,
            "detected_imei": None,
            "confidence": None,
            "candidate_imeis": [],
            "extracted_text": None,
            "message": OCR_NO_RESULT_MESSAGE,
        }

    # ---- Aggregate extracted text and per-detection confidences ----
    text_parts: list[str] = []
    detection_confidences: list[float] = []
    for _, text, conf in results:
        text_parts.append(text)
        detection_confidences.append(conf)

    full_text = " ".join(text_parts)
    avg_confidence = (
        round(sum(detection_confidences) / len(detection_confidences), 2)
        if detection_confidences
        else 0.0
    )

    logger.debug("OCR extracted text: %s", full_text)

    # ---- Extract 15-digit candidates ----
    candidates = extract_imei_candidates(full_text)
    logger.debug("IMEI candidates found: %s", candidates)

    # ---- No candidates ----
    if not candidates:
        return {
            "success": False,
            "detected_imei": None,
            "confidence": None,
            "candidate_imeis": [],
            "extracted_text": full_text or None,
            "message": OCR_NO_RESULT_MESSAGE,
        }

    # ---- Select best candidate: prefer Luhn-valid, first discovery order ----
    luhn_valid = [c for c in candidates if validate_luhn_checksum(c)]
    best = luhn_valid[0] if luhn_valid else candidates[0]

    return {
        "success": True,
        "detected_imei": best,
        "confidence": avg_confidence,
        "candidate_imeis": candidates,
        "extracted_text": full_text,
        "message": "IMEI detected successfully. "
                   "Please review and confirm it before verification.",
    }
