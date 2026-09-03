"""
TrustPhone AI — OCR Engine

EasyOCR + OpenCV-based IMEI scanning from uploaded images.

Pipeline:
  1. Validate upload (MIME type, extension, size, filename safety)
  2. Generate multiple preprocessing variants (multi-pass OCR)
  3. Run EasyOCR on each variant
  4. Detect IMEI labels (IMEI, IMEI1, IMEI2, IMEI/MEID)
  5. Extract 15-digit candidates + reconstruct fragmented digits
  6. Apply safe OCR character normalization (O->0, I/l->1)
  7. Score and rank candidates using multi-signal strategy
  8. Return structured result — never triggers verification automatically

WHY MULTIPLE PASSES:
  A single preprocessing approach may fail on certain image conditions
  (poor lighting, glossy surfaces, small text). Running OCR on multiple
  variants (resize, grayscale+CLAHE, thresholded) maximises the chance
  of extracting readable text across diverse phone-box photos.

HOW CANDIDATES ARE RANKED:
  Each candidate receives a composite score based on:
    - Luhn checksum validity (+40)
    - Proximity to an IMEI label (+30)
    - Mean OCR confidence (+0 to +25)
    - Detection across multiple preprocessing passes (+12 per extra pass)
    - Label type priority: IMEI > IMEI1/2 > IMEI/MEID (+0/+10/+5)
  The highest-scoring candidate is returned as detected_imei.

HOW CONFIDENCE IS CALCULATED:
  Base = mean EasyOCR confidence of the selected candidate's detections.
  Bonuses: Luhn-valid (+0.05), multi-pass (+0.03 per extra), label
  proximity (+0.05).  Capped at 0.99 to avoid false certainty claims.
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

# Label patterns: match "IMEI", "IMEI1", "IMEI 1", "IMEI2", "IMEI 2", "IMEI/MEID"
# Does NOT match EID, Serial No, S/N, or Model
_IMEI_LABEL_RE = re.compile(
    r"\bIMEI[\s]?[12]?\b|IMEI[\s]?/[\s]?MEID",
    re.IGNORECASE,
)

# Sequences of 3+ consecutive digits (possibly mixed with OCR noise chars)
# used for fragment reconstruction of spaced/hyphenated IMEIs
_DIGIT_FRAGMENT_RE = re.compile(r"[\d][\d\-\s.]{1,}")

OCR_NO_RESULT_MESSAGE = (
    "Could not detect an IMEI. Please enter it manually or dial *#06#."
)

# Maximum pixel distance for associating text blocks with an IMEI label
_LABEL_PROXIMITY_PX = 350

# Maximum pixel gap between digit fragments for concatenation
_FRAGMENT_GAP_PX = 200


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
    Preprocess an image for OCR (CLAHE + adaptive threshold).

    Kept for backward compatibility with document_verifier.py.
    The main scan pipeline uses _preprocess_variants() instead.
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


def _resize_base(img: np.ndarray) -> np.ndarray:
    """Resize large images while preserving aspect ratio."""
    h, w = img.shape[:2]
    max_w = 1920
    if w > max_w:
        scale = max_w / w
        return cv2.resize(img, (max_w, int(h * scale)), interpolation=cv2.INTER_AREA)
    return img


def _preprocess_variants(img: np.ndarray) -> list[tuple[str, np.ndarray]]:
    """
    Generate multiple preprocessing variants for multi-pass OCR.

    Different variants handle different image conditions:
      - resize: clean resize, preserves colour (good for well-lit images)
      - clahe:  grayscale + CLAHE contrast (improves low-contrast text)
      - thresh: adaptive threshold (handles uneven lighting, shadows)

    Returns list of (variant_name, processed_image).
    """
    base = _resize_base(img)
    variants: list[tuple[str, np.ndarray]] = []

    # Pass 1: Clean resize (colour) — best for well-lit, high-contrast images
    variants.append(("resize", base))

    # Pass 2: Grayscale + CLAHE contrast enhancement
    gray = cv2.cvtColor(base, cv2.COLOR_BGR2GRAY) if len(base.shape) == 3 else base
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    # Convert back to 3-channel for EasyOCR
    variants.append(("clahe", cv2.cvtColor(enhanced, cv2.COLOR_GRAY2BGR)))

    # Pass 3: Adaptive threshold — handles uneven lighting
    thresh = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY, blockSize=11, C=2,
    )
    variants.append(("thresh", cv2.cvtColor(thresh, cv2.COLOR_GRAY2BGR)))

    return variants


# ---------------------------------------------------------------------------
# IMEI label detection
# ---------------------------------------------------------------------------

def _is_imei_label(text: str) -> bool:
    """
    Check if text matches an IMEI label pattern.

    Matches: IMEI, IMEI1, IMEI 1, IMEI2, IMEI 2, IMEI/MEID
    Does NOT match: EID, Serial No, S/N, Model
    """
    return bool(_IMEI_LABEL_RE.search(text))


def _find_imei_label_positions(
    results: list[tuple],
) -> list[tuple[int, tuple[float, float], str]]:
    """
    Find IMEI labels in OCR results and return their indices and centers.

    Returns list of (result_index, center_xy, label_text).
    """
    positions: list[tuple[int, tuple[float, float], str]] = []
    for i, (bbox, text, _conf) in enumerate(results):
        if _is_imei_label(text):
            cx = sum(p[0] for p in bbox) / len(bbox)
            cy = sum(p[1] for p in bbox) / len(bbox)
            positions.append((i, (cx, cy), text))
    return positions


def _block_center(bbox: list) -> tuple[float, float]:
    """Compute center point of an OCR bounding box."""
    cx = sum(p[0] for p in bbox) / len(bbox)
    cy = sum(p[1] for p in bbox) / len(bbox)
    return cx, cy


def _distance_2d(p1: tuple, p2: tuple) -> float:
    """Euclidean distance between two 2D points."""
    return ((p1[0] - p2[0]) ** 2 + (p1[1] - p2[1]) ** 2) ** 0.5


def _is_near_label(
    block_center: tuple[float, float],
    label_positions: list[tuple[int, tuple[float, float], str]],
    max_dist: float = _LABEL_PROXIMITY_PX,
) -> tuple[bool, str]:
    """
    Check if a text block is spatially near any IMEI label.

    Returns (is_near, nearest_label_text).
    """
    for _, lcenter, ltext in label_positions:
        if _distance_2d(block_center, lcenter) < max_dist:
            return True, ltext
    return False, ""


# ---------------------------------------------------------------------------
# Digit fragment reconstruction
# ---------------------------------------------------------------------------

def _extract_digit_fragments(
    results: list[tuple],
    label_center: tuple[float, float],
    max_dist: float = _LABEL_PROXIMITY_PX,
) -> list[tuple[str, tuple[float, float], float]]:
    """
    Extract digit-group fragments near an IMEI label position.

    Returns list of (digit_string, center_xy, ocr_confidence) for text
    blocks that contain digits and are within max_dist of the label.
    """
    fragments: list[tuple[str, tuple[float, float], float]] = []
    for bbox, text, conf in results:
        center = _block_center(bbox)
        dist = _distance_2d(center, label_center)
        if dist < max_dist:
            # Extract only digit characters from the text
            digits_only = re.sub(r"[^\d]", "", text)
            if len(digits_only) >= 2:
                fragments.append((digits_only, center, conf))
    # Sort fragments by x-coordinate (left-to-right reading order)
    fragments.sort(key=lambda f: f[1][0])
    return fragments


def _reconstruct_from_fragments(
    fragments: list[tuple[str, tuple[float, float], float]],
) -> list[tuple[str, float]]:
    """
    Attempt to reconstruct 15-digit IMEIs from spatially close digit groups.

    Tries concatenating 2-4 adjacent fragments (sorted by x-coordinate).
    Only returns candidates where fragments are within _FRAGMENT_GAP_PX
    and the concatenation yields exactly 15 digits.

    Returns list of (candidate_imei, mean_confidence).
    """
    candidates: list[tuple[str, float]] = []
    n = len(fragments)

    for start in range(n):
        for count in range(2, min(5, n - start + 1)):
            group = fragments[start:start + count]

            # Check spatial continuity: no large gaps between adjacent fragments
            spatially_close = all(
                abs(group[i + 1][1][0] - group[i][1][0]) < _FRAGMENT_GAP_PX
                for i in range(len(group) - 1)
            )
            if not spatially_close:
                continue

            combined = "".join(f[0] for f in group)
            if len(combined) == 15 and combined.isdigit():
                is_valid, _ = validate_imei_format(combined)
                if is_valid:
                    avg_conf = sum(f[2] for f in group) / len(group)
                    candidates.append((combined, avg_conf))

    return candidates


# ---------------------------------------------------------------------------
# OCR character normalization
# ---------------------------------------------------------------------------

def _normalize_ocr_digits(text: str) -> list[str]:
    """
    Generate candidate normalizations for common OCR character confusion.

    Safe replacements applied only when mixed with digits:
      O/o -> 0
      I/l/| -> 1

    Does NOT blindly replace letters — only generates variants where
    letter-to-digit substitutions produce near-15-digit strings.
    """
    stripped = re.sub(r"[\s\-.,:;()]", "", text)
    if len(stripped) < 13 or len(stripped) > 17:
        return []

    candidates: list[str] = []

    # Variant 1: O/o -> 0, I/l/| -> 1
    v1 = ""
    for ch in stripped:
        if ch in "Oo" and any(c.isdigit() for c in stripped):
            v1 += "0"
        elif ch in "Il|" and any(c.isdigit() for c in stripped):
            v1 += "1"
        else:
            v1 += ch
    if len(v1) == 15 and v1.isdigit() and v1 != stripped:
        candidates.append(v1)

    # Variant 2: Only O -> 0 (conservative, no I/l substitution)
    v2 = stripped.replace("O", "0").replace("o", "0")
    if len(v2) == 15 and v2.isdigit() and v2 != stripped and v2 not in candidates:
        candidates.append(v2)

    return candidates


# ---------------------------------------------------------------------------
# Candidate extraction (kept for backward compat with document_verifier)
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
# Candidate ranking
# ---------------------------------------------------------------------------

def _score_candidates(
    candidates: dict[str, dict],
    label_positions: list[tuple[int, tuple[float, float], str]],
) -> list[tuple[str, int]]:
    """
    Score and rank IMEI candidates using multi-signal strategy.

    Scoring signals:
      +40  Luhn checksum valid
      +30  Near an IMEI label
      +25  Mean OCR confidence (scaled 0-1)
      +12  Per additional preprocessing pass that found it
      +10  Near IMEI1 or IMEI2 (more specific than plain IMEI)
      +5   Near IMEI/MEID

    Returns sorted list of (candidate_imei, total_score), highest first.
    """
    scored: list[tuple[str, int]] = []

    for imei, info in candidates.items():
        score = 0

        # Luhn checksum (+40)
        if validate_luhn_checksum(imei):
            score += 40

        # Near IMEI label (+30)
        if info["near_label"]:
            score += 30

        # OCR confidence contribution (0-25)
        score += int(info["mean_conf"] * 25)

        # Multi-pass agreement (+12 per extra pass)
        score += (info["pass_count"] - 1) * 12

        # Label type bonus
        lt = info.get("label_type", "").upper()
        if "1" in lt or "2" in lt:
            score += 10  # IMEI1 or IMEI2 — more specific
        elif "MEID" in lt:
            score += 5

        scored.append((imei, score))

    scored.sort(key=lambda x: x[1], reverse=True)
    return scored


# ---------------------------------------------------------------------------
# Confidence calculation
# ---------------------------------------------------------------------------

def _compute_confidence(best_info: dict) -> float:
    """
    Compute confidence for the selected IMEI candidate.

    Base = mean OCR confidence of the candidate's detections.
    Bonuses:
      +0.05  Luhn checksum valid
      +0.03  Per additional preprocessing pass
      +0.05  Near an IMEI label
    Capped at 0.99 to avoid claiming false certainty.
    """
    conf = best_info["mean_conf"]

    if validate_luhn_checksum(best_info["imei"]):
        conf += 0.05

    conf += (best_info["pass_count"] - 1) * 0.03

    if best_info["near_label"]:
        conf += 0.05

    return round(min(0.99, max(0.0, conf)), 2)


# ---------------------------------------------------------------------------
# Main scanning function
# ---------------------------------------------------------------------------

def scan_image_for_imei(
    image_bytes: bytes,
    reader: easyocr.Reader,
) -> dict:
    """
    Full multi-pass OCR pipeline: bytes -> variants -> OCR -> rank -> result.

    Steps:
      1. Decode image from bytes
      2. Generate 3 preprocessing variants (resize, CLAHE, threshold)
      3. Run EasyOCR on each variant
      4. Detect IMEI labels and their positions
      5. Extract exact 15-digit matches + reconstruct fragments
      6. Apply OCR character normalization for near-label text
      7. Score and rank all candidates
      8. Return best candidate with confidence

    Returns a dict matching the scan-imei API response contract:
      success, detected_imei, confidence, candidate_imeis,
      extracted_text, message
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

    # ---- Generate preprocessing variants ----
    variants = _preprocess_variants(img)

    # ---- Run OCR on each variant ----
    # all_results: list of (pass_index, bbox, text, confidence)
    all_results: list[tuple[int, list, str, float]] = []
    all_text_parts: list[str] = []

    for pass_idx, (variant_name, processed) in enumerate(variants):
        try:
            ocr_results = reader.readtext(processed)
        except Exception as exc:
            logger.warning("OCR failed on variant '%s': %s", variant_name, exc)
            continue

        for bbox, text, conf in ocr_results:
            all_results.append((pass_idx, bbox, text, conf))
            all_text_parts.append(text)

        logger.debug(
            "OCR variant '%s': %d detections", variant_name, len(ocr_results)
        )

    if not all_results:
        return {
            "success": False,
            "detected_imei": None,
            "confidence": None,
            "candidate_imeis": [],
            "extracted_text": None,
            "message": OCR_NO_RESULT_MESSAGE,
        }

    # ---- Detect IMEI labels ----
    # Use first pass results for label detection (labels are usually readable)
    first_pass_results = [(b, t, c) for pi, b, t, c in all_results if pi == 0]
    label_positions = _find_imei_label_positions(first_pass_results)
    logger.debug("IMEI labels detected: %d", len(label_positions))

    # ---- Collect all IMEI candidates ----
    # Key: imei_string, Value: dict with scoring metadata
    candidates: dict[str, dict] = {}

    # Strategy 1: Exact 15-digit regex matches across all passes
    for pass_idx, bbox, text, conf in all_results:
        matches = IMEI_RE.findall(text)
        for m in matches:
            is_valid, _ = validate_imei_format(m)
            if not is_valid:
                continue

            center = _block_center(bbox)
            near_label, label_type = _is_near_label(center, label_positions)

            if m in candidates:
                # Already seen — update multi-pass tracking
                info = candidates[m]
                if pass_idx not in info["passes"]:
                    info["passes"].add(pass_idx)
                    info["pass_count"] = len(info["passes"])
                info["confs"].append(conf)
                info["mean_conf"] = sum(info["confs"]) / len(info["confs"])
                if near_label and not info["near_label"]:
                    info["near_label"] = True
                    info["label_type"] = label_type
            else:
                candidates[m] = {
                    "imei": m,
                    "passes": {pass_idx},
                    "pass_count": 1,
                    "near_label": near_label,
                    "label_type": label_type,
                    "confs": [conf],
                    "mean_conf": conf,
                }

    # Strategy 2: Fragment reconstruction near IMEI labels
    # Only attempted when labels exist and no exact match found near them
    if label_positions:
        has_near_label_match = any(
            info["near_label"] for info in candidates.values()
        )
        if not has_near_label_match:
            for _, lcenter, _ in label_positions:
                fragments = _extract_digit_fragments(
                    [(b, t, c) for _, b, t, c in all_results],
                    lcenter,
                )
                reconstructed = _reconstruct_from_fragments(fragments)
                for imei, avg_conf in reconstructed:
                    if imei not in candidates:
                        candidates[imei] = {
                            "imei": imei,
                            "passes": set(),
                            "pass_count": 1,
                            "near_label": True,
                            "label_type": "RECONSTRUCTED",
                            "confs": [avg_conf],
                            "mean_conf": avg_conf,
                        }

        # Strategy 3: OCR character normalization near labels
        # Try O->0, I->1 substitutions on text near IMEI labels
        for _, bbox, text, conf in all_results:
            if text.strip() in ("", " "):
                continue
            center = _block_center(bbox)
            near_label, label_type = _is_near_label(center, label_positions)
            if not near_label:
                continue

            normalized_variants = _normalize_ocr_digits(text)
            for norm in normalized_variants:
                is_valid, _ = validate_imei_format(norm)
                if not is_valid:
                    continue
                if norm not in candidates:
                    candidates[norm] = {
                        "imei": norm,
                        "passes": set(),
                        "pass_count": 1,
                        "near_label": True,
                        "label_type": label_type + " (normalized)",
                        "confs": [conf],
                        "mean_conf": conf,
                    }

    # ---- No candidates found ----
    if not candidates:
        full_text = " ".join(all_text_parts)
        return {
            "success": False,
            "detected_imei": None,
            "confidence": None,
            "candidate_imeis": [],
            "extracted_text": full_text or None,
            "message": OCR_NO_RESULT_MESSAGE,
        }

    # ---- Rank candidates ----
    ranked = _score_candidates(candidates, label_positions)
    best_imei, _best_score = ranked[0]

    # ---- Compute confidence for best candidate ----
    best_info = candidates[best_imei]
    confidence = _compute_confidence(best_info)

    # ---- Build ordered candidate list (best first) ----
    candidate_list = [imei for imei, _ in ranked]

    # ---- Full extracted text for display ----
    full_text = " ".join(all_text_parts)

    logger.info(
        "OCR result: %s (confidence=%.2f, candidates=%d, passes=%d)",
        best_imei, confidence, len(candidate_list), len(variants),
    )

    return {
        "success": True,
        "detected_imei": best_imei,
        "confidence": confidence,
        "candidate_imeis": candidate_list,
        "extracted_text": full_text,
        "message": "IMEI detected successfully. "
                   "Please review and confirm it before verification.",
    }
