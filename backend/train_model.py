"""
TrustPhone AI — Model Training Script

Generates a clearly-labeled SYNTHETIC DEMO DATASET and trains a
multi-class LogisticRegression model for the AI Risk Assessment feature.

IMPORTANT:
  This training data is SYNTHETIC and generated for demonstration
  purposes only. It does NOT represent verified real-world fraud data.
  The model is a hackathon prototype and should not be used for
  production risk decisions.

Usage:
    python train_model.py
"""

import csv
import logging
from pathlib import Path

import joblib
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

DATA_DIR = Path(__file__).resolve().parent / "data"
CSV_PATH = DATA_DIR / "training_data.csv"
MODEL_PATH = DATA_DIR / "trained_risk_model.joblib"
RANDOM_STATE = 42
N_SAMPLES = 4000

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("trustphone.training")

FEATURE_NAMES = [
    "number_of_previous_reports",
    "verified_report_count",
    "transaction_price",
    "reference_market_price",
    "price_deviation_percentage",
    "imei_status",
    "seller_report_frequency",
    "information_completeness",
]

# Risk label encoding for multi-class
RISK_LOW = 0
RISK_MEDIUM = 1
RISK_HIGH = 2
RISK_LABEL_NAMES = {0: "LOW", 1: "MEDIUM", 2: "HIGH"}


# ---------------------------------------------------------------------------
# Synthetic data generation
# ---------------------------------------------------------------------------

def generate_synthetic_data(n_samples: int = N_SAMPLES, seed: int = RANDOM_STATE) -> tuple:
    """
    Generate synthetic training data for the risk assessment model.

    All data is artificially created for demonstration purposes.
    No real transactions, devices, or persons are represented.

    Key design decisions:
      - price_deviation_percentage is SYMMETRIC: it captures BOTH below-market
        AND above-market deviations using abs(asking - market) / market.
        It is generated INDEPENDENTLY of imei_status so the model learns that
        price deviation is its own risk signal.
      - The label formula gives balanced weight to device status and price
        deviation as independent contributors to risk.
      - Three risk classes (LOW / MEDIUM / HIGH) are assigned based on a
        composite logit, giving smooth transitions between levels.
      - Reports and seller frequency are still derived from status for
        consistency with prediction-time feature computation.

    Returns (feature_matrix, labels, feature_names).
    """
    rng = np.random.default_rng(seed)

    # --- Feature generation ---
    # IMEI status encoded: 0=CLEAN, 1=SUSPICIOUS, 2=UNDER_REVIEW, 3=BLOCKED, 4=STOLEN
    imei_status = rng.choice(
        [0, 1, 2, 3, 4], size=n_samples, p=[0.30, 0.20, 0.20, 0.15, 0.15]
    )

    # Reports and seller frequency derived from status
    # (matches prediction-time logic in risk_engine.py)
    status_to_min_reports = {0: 0, 1: 2, 2: 4, 3: 5, 4: 7}
    status_to_seller_freq = {0: 0.0, 1: 1.5, 2: 3.0, 3: 4.0, 4: 5.0}

    number_of_previous_reports = np.array([
        status_to_min_reports[int(s)] + rng.integers(0, 2) for s in imei_status
    ], dtype=float)
    verified_report_count = np.array([
        min(rng.integers(0, 3), int(r)) for r in number_of_previous_reports
    ], dtype=float)

    # ---- Price deviation generated INDEPENDENTLY of status ----
    # This is the critical design choice: the model must learn that a large
    # price deviation (either direction) is suspicious REGARDLESS of device
    # status.  Previously, only below-market prices were modelled, causing
    # above-market asking prices (e.g. 60k for a 25k phone) to score LOW.
    #
    # Symmetric distribution: abs deviation ~ |N(0, 25)| clipped to 0-120%.
    # This covers both below-market and above-market scenarios equally.
    raw_deviation = rng.normal(0, 25, size=n_samples)
    price_deviation_percentage = np.abs(raw_deviation)
    price_deviation_percentage = np.clip(price_deviation_percentage, 0, 120)
    price_deviation_percentage = np.round(price_deviation_percentage, 2)

    # Derive transaction price: randomly assign below or above market
    # to train the model on both directions of deviation.
    reference_market_price = rng.uniform(10_000, 200_000, size=n_samples)
    direction = rng.choice([-1, 1], size=n_samples)  # -1 = below, +1 = above
    transaction_price = np.round(
        reference_market_price * (1.0 + direction * price_deviation_percentage / 100.0), 2
    )
    # Ensure transaction price stays positive
    transaction_price = np.clip(transaction_price, 1.0, None)

    seller_report_frequency = np.array([
        status_to_seller_freq[int(s)] + rng.uniform(0, 0.5) for s in imei_status
    ])
    information_completeness = rng.uniform(0.3, 1.0, size=n_samples)

    # --- Risk label generation (3-class: LOW / MEDIUM / HIGH) ---
    #
    # The composite logit gives balanced weight to:
    #   1. Device status (primary signal - STOLEN/BLOCKED are serious)
    #   2. Price deviation (independent signal - any large deviation = risk)
    #   3. Report count (secondary signal - previous complaints)
    #   4. Information completeness (negative signal - less info = more risk)
    #
    # The sigmoid probability is then bucketed into three classes:
    #   prob < 0.15  -> LOW
    #   0.15 - 0.85  -> MEDIUM
    #   prob > 0.85  -> HIGH
    #
    # Tuned boundaries:
    #   CLEAN + fair price           -> LOW
    #   CLEAN + ~20% deviation       -> LOW (minor deviation is normal)
    #   CLEAN + ~40% deviation       -> MEDIUM
    #   CLEAN + ~60% deviation       -> HIGH
    #   SUSPICIOUS + fair price      -> MEDIUM
    #   STOLEN/BLOCKED + fair        -> HIGH (status alone is enough)
    logit = (
        -2.00
        + 1.30 * imei_status
        + 0.08 * np.clip(price_deviation_percentage, 0, 120)
        + 0.15 * number_of_previous_reports
        - 0.50 * information_completeness
    )
    prob = 1.0 / (1.0 + np.exp(-logit))
    noise = rng.normal(0, 0.03, size=n_samples)
    prob_noisy = np.clip(prob + noise, 0, 1)

    labels = np.zeros(n_samples, dtype=int)
    labels[prob_noisy >= 0.15] = RISK_MEDIUM
    labels[prob_noisy >= 0.85] = RISK_HIGH

    features = np.column_stack([
        number_of_previous_reports,
        verified_report_count,
        transaction_price,
        reference_market_price,
        price_deviation_percentage,
        imei_status,
        seller_report_frequency,
        information_completeness,
    ])

    return features, labels


def save_training_csv(features: np.ndarray, labels: np.ndarray) -> None:
    """Save the synthetic training data to a CSV file."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(CSV_PATH, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        header = FEATURE_NAMES + ["risk_label"]
        writer.writerow(header)
        for row, label in zip(features, labels):
            writer.writerow(list(row) + [int(label)])
    logger.info("Saved %d synthetic training rows to %s", len(labels), CSV_PATH)


# ---------------------------------------------------------------------------
# Training
# ---------------------------------------------------------------------------

def train_model(features: np.ndarray, labels: np.ndarray) -> None:
    """
    Train a multi-class LogisticRegression classifier and save to disk.

    Model choice rationale:
      LogisticRegression is chosen because:
        1. Outputs calibrated probabilities directly (needed for risk_score 0-100).
        2. Interpretable - feature weights explain which factors drive risk.
        3. Multi-class support gives smooth LOW/MEDIUM/HIGH transitions.
        4. Robust on small synthetic datasets; minimal hyperparameter tuning needed.
        5. Low computational cost - suitable for a hackathon prototype.
    """
    X_train, X_test, y_train, y_test = train_test_split(
        features, labels, test_size=0.2, random_state=RANDOM_STATE, stratify=labels
    )

    # A StandardScaler is included in the pipeline because the raw features
    # have very different scales (prices in thousands vs. counts 0-10).
    # Scaling ensures stable convergence and fair coefficient comparison.
    pipeline = Pipeline([
        ("scaler", StandardScaler()),
        ("clf", LogisticRegression(
            max_iter=2000,
            random_state=RANDOM_STATE,
            class_weight="balanced",
            solver="lbfgs",
        )),
    ])
    pipeline.fit(X_train, y_train)

    # ---- Evaluation (prototype metrics on synthetic data) ----
    y_pred = pipeline.predict(X_test)
    acc = accuracy_score(y_test, y_pred)

    logger.info("=== PROTOTYPE EVALUATION METRICS (synthetic data) ===")
    logger.info("  Accuracy:  %.4f", acc)
    logger.info("These metrics are based on SYNTHETIC demo data only.")
    logger.info("")
    for line in classification_report(
        y_test, y_pred,
        target_names=["LOW", "MEDIUM", "HIGH"],
        zero_division=0,
    ).splitlines():
        logger.info("  %s", line)

    # ---- Save model + metadata ----
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    artifact = {
        "model": pipeline,
        "feature_names": FEATURE_NAMES,
        "classes": pipeline.named_steps["clf"].classes_.tolist(),
        "multi_class": True,
    }
    joblib.dump(artifact, MODEL_PATH)
    logger.info("Trained model saved to %s", MODEL_PATH)

    # ---- Log feature coefficients for transparency ----
    clf = pipeline.named_steps["clf"]
    logger.info("=== Feature Coefficients (scaled, per class) ===")
    for cls_idx, cls_label in enumerate(clf.classes_):
        logger.info("  Class %d (%s):", cls_label, RISK_LABEL_NAMES.get(cls_label, "?"))
        for name, coef in zip(FEATURE_NAMES, clf.coef_[cls_idx]):
            logger.info("    %-35s %+.4f", name, coef)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    logger.info("TrustPhone AI - Risk Model Training (multi-class)")
    logger.info("Generating SYNTHETIC DEMO dataset (%d samples)...", N_SAMPLES)

    features, labels = generate_synthetic_data()

    for lbl, name in RISK_LABEL_NAMES.items():
        count = (labels == lbl).sum()
        logger.info("  %s: %d samples (%.1f%%)", name, count, count / len(labels) * 100)

    save_training_csv(features, labels)
    train_model(features, labels)

    logger.info("Training complete.")
