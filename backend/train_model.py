"""
TrustPhone AI — Model Training Script

Generates a clearly-labeled SYNTHETIC DEMO DATASET and trains a
LogisticRegression model for the AI Risk Assessment feature.

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
from sklearn.metrics import accuracy_score, precision_score, recall_score
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
N_SAMPLES = 2000

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("trustphone.training")

FEATURE_NAMES = [
    "number_of_previous_reports",
    "verified_report_count",
    "transaction_price",
    "reference_market_price",
    "price_difference_percentage",
    "imei_status",
    "seller_report_frequency",
    "information_completeness",
]


# ---------------------------------------------------------------------------
# Synthetic data generation
# ---------------------------------------------------------------------------

def generate_synthetic_data(n_samples: int = N_SAMPLES, seed: int = RANDOM_STATE) -> tuple:
    """
    Generate synthetic training data for the risk assessment model.

    All data is artificially created for demonstration purposes.
    No real transactions, devices, or persons are represented.

    Returns (feature_matrix, labels, feature_names).
    """
    rng = np.random.default_rng(seed)

    # --- Feature generation ---
    # Generate IMEI status first, then derive other features consistently
    # with how the prediction pipeline computes them at runtime.
    # IMEI status encoded: 0=CLEAN, 1=SUSPICIOUS, 2=UNDER_REVIEW, 3=BLOCKED, 4=STOLEN
    imei_status = rng.choice(
        [0, 1, 2, 3, 4], size=n_samples, p=[0.30, 0.20, 0.20, 0.15, 0.15]
    )

    # Derive report counts from status using the same logic as risk_engine.py
    # This ensures training features match prediction-time features.
    status_to_min_reports = {0: 0, 1: 2, 2: 4, 3: 5, 4: 7}
    status_to_seller_freq = {0: 0.0, 1: 1.5, 2: 3.0, 3: 4.0, 4: 5.0}

    number_of_previous_reports = np.array([
        status_to_min_reports[int(s)] + rng.integers(0, 2) for s in imei_status
    ], dtype=float)
    verified_report_count = np.array([
        min(rng.integers(0, 3), int(r)) for r in number_of_previous_reports
    ], dtype=float)

    reference_market_price = rng.uniform(10_000, 150_000, size=n_samples)
    # Transaction price: worse status + some noise → bigger discounts
    price_ratio_base = np.where(imei_status >= 3, 0.30, np.where(imei_status >= 1, 0.40, 0.55))
    price_ratio_max = np.where(imei_status >= 3, 0.90, np.where(imei_status >= 1, 1.00, 1.10))
    price_ratio = rng.uniform(price_ratio_base, price_ratio_max)
    transaction_price = np.round(reference_market_price * price_ratio, 2)

    price_difference_percentage = np.round(
        ((reference_market_price - transaction_price) / reference_market_price) * 100, 2
    )

    # Seller report frequency derived from status (matches prediction logic)
    seller_report_frequency = np.array([
        status_to_seller_freq[int(s)] + rng.uniform(0, 0.5) for s in imei_status
    ])
    information_completeness = rng.uniform(0.3, 1.0, size=n_samples)

    # --- Risk label generation (probabilistic, not deterministic) ---
    # Higher risk correlates with:
    #   - More previous reports
    #   - Larger price discounts
    #   - Worse device status
    #   - Higher seller report frequency
    #   - Lower information completeness
    #
    # The coefficients below are tuned to produce label boundaries that
    # the trained LogisticRegression (with StandardScaler) can reproduce
    # faithfully at prediction time.
    logit = (
        -5.0
        + 0.20 * number_of_previous_reports
        + 0.15 * verified_report_count
        + 0.03 * np.clip(price_difference_percentage, 0, 100)
        + 2.50 * imei_status
        + 0.15 * seller_report_frequency
        - 0.80 * information_completeness
    )
    prob = 1.0 / (1.0 + np.exp(-logit))
    noise = rng.normal(0, 0.08, size=n_samples)
    labels = (np.clip(prob + noise, 0, 1) > 0.5).astype(int)

    features = np.column_stack([
        number_of_previous_reports,
        verified_report_count,
        transaction_price,
        reference_market_price,
        price_difference_percentage,
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
    Train a LogisticRegression classifier and save to disk.

    Model choice rationale:
      LogisticRegression is chosen because:
        1. Outputs calibrated probabilities directly (needed for risk_score 0-100).
        2. Interpretable — feature weights explain which factors drive risk.
        3. Robust on small synthetic datasets; minimal hyperparameter tuning needed.
        4. Low computational cost — suitable for a hackathon prototype.
    """
    X_train, X_test, y_train, y_test = train_test_split(
        features, labels, test_size=0.2, random_state=RANDOM_STATE, stratify=labels
    )

    # Model choice rationale:
    #   LogisticRegression is chosen because:
    #     1. Outputs calibrated probabilities directly (needed for risk_score 0-100).
    #     2. Interpretable — feature weights explain which factors drive risk.
    #     3. Robust on small synthetic datasets; minimal hyperparameter tuning needed.
    #     4. Low computational cost — suitable for a hackathon prototype.
    #
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
    prec = precision_score(y_test, y_pred, zero_division=0)
    rec = recall_score(y_test, y_pred, zero_division=0)

    logger.info("=== PROTOTYPE EVALUATION METRICS (synthetic data) ===")
    logger.info("  Accuracy:  %.4f", acc)
    logger.info("  Precision: %.4f", prec)
    logger.info("  Recall:    %.4f", rec)
    logger.info("These metrics are based on SYNTHETIC demo data only.")

    # ---- Save model + metadata ----
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    artifact = {
        "model": pipeline,
        "feature_names": FEATURE_NAMES,
        "classes": pipeline.named_steps["clf"].classes_.tolist(),
    }
    joblib.dump(artifact, MODEL_PATH)
    logger.info("Trained model saved to %s", MODEL_PATH)

    # ---- Log feature coefficients for transparency ----
    clf = pipeline.named_steps["clf"]
    scaler = pipeline.named_steps["scaler"]
    logger.info("=== Feature Coefficients (scaled) ===")
    for name, coef in zip(FEATURE_NAMES, clf.coef_[0]):
        logger.info("  %-35s %+.4f", name, coef)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    logger.info("TrustPhone AI — Risk Model Training")
    logger.info("Generating SYNTHETIC DEMO dataset (%d samples)...", N_SAMPLES)

    features, labels = generate_synthetic_data()

    logger.info("Risk distribution: %d LOW / %d HIGH", (labels == 0).sum(), (labels == 1).sum())

    save_training_csv(features, labels)
    train_model(features, labels)

    logger.info("Training complete.")
