"""
TrustPhone AI — Risk scoring regression tests.

Focus: the deterministic business-rule safeguard that guarantees a device
flagged SUSPICIOUS is never presented as LOW risk, while leaving every other
status (CLEAN / UNKNOWN / UNDER_REVIEW / STOLEN / BLOCKED) and the API
response contract exactly as they were.

Run from the backend directory:
    python -m unittest test_risk_scoring -v
    (or)  python test_risk_scoring.py

These tests are read-only: /api/risk-score never writes to the database, so
running them does not pollute trustphone.db.
"""

import os
import sys
import unittest

# Ensure the backend package root is importable regardless of the cwd.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402
from services.risk_engine import _SUSPICIOUS_MIN_SCORE  # noqa: E402

# ---------------------------------------------------------------------------
# Seeded demo IMEIs (see backend/seed_data.py)
# ---------------------------------------------------------------------------
SUSPICIOUS_IMEI = "357890123456789"   # Google Pixel 8
SUSPICIOUS_IMEI_2 = "861234567890123"  # Realme GT 5 Pro
CLEAN_IMEI = "353456789012345"        # Samsung Galaxy A54
STOLEN_IMEI = "351234567890123"       # Samsung Galaxy S23 Ultra
BLOCKED_IMEI = "354567890123456"      # OnePlus Nord CE 4
UNDER_REVIEW_IMEI = "352345678901234"  # Huawei P60 Pro
UNKNOWN_IMEI = "999888777666551"      # not in DeviceRecord

# Exact safety-advice strings produced by risk_engine.predict_risk.
ADVICE = {
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

# Inclusive score bands implied by the level mapping in predict_risk.
LEVEL_BANDS = {"LOW": (0, 30), "MEDIUM": (31, 65), "HIGH": (66, 100)}

CONTRACT_KEYS = {
    "success", "risk_score", "risk_level",
    "key_factors", "safety_advice", "data_sufficiency",
}


class RiskScoringTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Enter the TestClient context so the app lifespan runs (init_db +
        # seed-if-empty). The DB is already seeded, so no rows are added.
        cls._cm = TestClient(app)
        cls.client = cls._cm.__enter__()

    @classmethod
    def tearDownClass(cls):
        cls._cm.__exit__(None, None, None)

    # ---- helpers ----------------------------------------------------------
    def risk(self, imei, asking, market):
        r = self.client.post(
            "/api/risk-score",
            json={"imei": imei, "asking_price": asking, "reference_market_price": market},
        )
        self.assertEqual(r.status_code, 200, f"HTTP {r.status_code}: {r.text[:200]}")
        return r.json()

    def assertContractAndConsistency(self, d):
        """G + H: exact contract keys/types, score in 0-100, level matches score band."""
        self.assertEqual(set(d.keys()), CONTRACT_KEYS, f"keys={sorted(d.keys())}")
        self.assertIs(d["success"], True)
        self.assertIsInstance(d["risk_score"], int)
        self.assertIsInstance(d["risk_level"], str)
        self.assertIsInstance(d["key_factors"], list)
        self.assertIsInstance(d["safety_advice"], str)
        self.assertEqual(d["data_sufficiency"], "SUFFICIENT")
        self.assertIn(d["risk_level"], LEVEL_BANDS)
        self.assertTrue(0 <= d["risk_score"] <= 100, f"score out of range: {d['risk_score']}")
        lo, hi = LEVEL_BANDS[d["risk_level"]]
        self.assertTrue(
            lo <= d["risk_score"] <= hi,
            f"score {d['risk_score']} not in {d['risk_level']} band [{lo},{hi}]",
        )
        # advice must match the (possibly floored) level
        self.assertEqual(d["safety_advice"], ADVICE[d["risk_level"]])

    # ---- A. SUSPICIOUS + fair price never LOW -----------------------------
    def test_A_suspicious_fair_price_never_low(self):
        d = self.risk(SUSPICIOUS_IMEI, 45000, 45000)
        self.assertContractAndConsistency(d)
        self.assertNotEqual(d["risk_level"], "LOW", "SUSPICIOUS must never be LOW")
        self.assertEqual(d["risk_level"], "MEDIUM")
        # score genuinely lifted into the MEDIUM band (not a label-only change)
        self.assertGreater(d["risk_score"], 30)
        self.assertEqual(d["risk_score"], _SUSPICIOUS_MIN_SCORE)
        self.assertTrue(
            any("potential risk" in f.lower() for f in d["key_factors"]),
            f"expected a SUSPICIOUS key factor, got {d['key_factors']}",
        )

    def test_A2_second_suspicious_device_never_low(self):
        d = self.risk(SUSPICIOUS_IMEI_2, 45000, 45000)
        self.assertContractAndConsistency(d)
        self.assertNotEqual(d["risk_level"], "LOW")

    # ---- B. SUSPICIOUS + above-market price -------------------------------
    def test_B_suspicious_above_market_not_low(self):
        d = self.risk(SUSPICIOUS_IMEI, 100000, 60000)  # ~67% above market
        self.assertContractAndConsistency(d)
        self.assertNotEqual(d["risk_level"], "LOW")
        self.assertIn(d["risk_level"], ("MEDIUM", "HIGH"))

    # ---- C. SUSPICIOUS + below-market price -------------------------------
    def test_C_suspicious_below_market_not_low(self):
        d = self.risk(SUSPICIOUS_IMEI, 20000, 60000)  # ~67% below market
        self.assertContractAndConsistency(d)
        self.assertNotEqual(d["risk_level"], "LOW")
        self.assertIn(d["risk_level"], ("MEDIUM", "HIGH"))

    # ---- Requirement 4/5: price independence (no hardcoded scenario) ------
    def test_suspicious_never_low_across_many_prices(self):
        scenarios = [
            (45000, 45000), (50000, 45000), (40000, 45000),   # fair / small dev
            (54000, 45000), (36000, 45000),                   # +20% / -20%
            (90000, 45000), (10000, 45000),                   # large dev both ways
            (45000, 60000), (120000, 60000), (5000, 60000),   # other market bases
        ]
        for asking, market in scenarios:
            with self.subTest(asking=asking, market=market):
                d = self.risk(SUSPICIOUS_IMEI, asking, market)
                self.assertContractAndConsistency(d)
                self.assertNotEqual(
                    d["risk_level"], "LOW",
                    f"SUSPICIOUS went LOW at asking={asking} market={market}",
                )

    # ---- D. CLEAN + fair price remains LOW --------------------------------
    def test_D_clean_fair_price_remains_low(self):
        d = self.risk(CLEAN_IMEI, 45000, 45000)
        self.assertContractAndConsistency(d)
        self.assertEqual(d["risk_level"], "LOW", "CLEAN + fair price must stay LOW")
        self.assertLessEqual(d["risk_score"], 30)

    # ---- E. STOLEN behavior unchanged -------------------------------------
    def test_E_stolen_behavior_unchanged(self):
        d = self.risk(STOLEN_IMEI, 45000, 45000)
        self.assertContractAndConsistency(d)
        self.assertEqual(d["risk_level"], "HIGH", "STOLEN must remain HIGH")
        self.assertTrue(
            any("serious concern" in f.lower() for f in d["key_factors"]),
            f"expected a serious-concern factor, got {d['key_factors']}",
        )

    # ---- F. BLOCKED behavior unchanged ------------------------------------
    def test_F_blocked_behavior_unchanged(self):
        d = self.risk(BLOCKED_IMEI, 45000, 45000)
        self.assertContractAndConsistency(d)
        self.assertEqual(d["risk_level"], "HIGH", "BLOCKED must remain HIGH")

    # ---- Other statuses must be untouched by the safeguard ----------------
    def test_under_review_unchanged(self):
        d = self.risk(UNDER_REVIEW_IMEI, 45000, 45000)
        self.assertContractAndConsistency(d)
        self.assertEqual(d["risk_level"], "MEDIUM", "UNDER_REVIEW + fair was MEDIUM and must stay MEDIUM")

    def test_unknown_can_still_be_low(self):
        d = self.risk(UNKNOWN_IMEI, 45000, 45000)
        self.assertContractAndConsistency(d)
        # UNKNOWN is NOT subject to the SUSPICIOUS floor; existing logic gives LOW.
        self.assertEqual(d["risk_level"], "LOW", "UNKNOWN + normal price should remain LOW")

    # ---- G. API response contract unchanged (across statuses) -------------
    def test_G_contract_unchanged_for_all_statuses(self):
        for imei in (SUSPICIOUS_IMEI, CLEAN_IMEI, STOLEN_IMEI, BLOCKED_IMEI,
                     UNDER_REVIEW_IMEI, UNKNOWN_IMEI):
            with self.subTest(imei=imei):
                d = self.risk(imei, 45000, 45000)
                self.assertContractAndConsistency(d)

    # ---- H. Scores remain within 0-100 across a wide sweep ----------------
    def test_H_scores_within_range(self):
        for imei in (SUSPICIOUS_IMEI, CLEAN_IMEI, STOLEN_IMEI, BLOCKED_IMEI, UNKNOWN_IMEI):
            for asking, market in [(1, 100), (100, 1), (45000, 45000), (999999, 1000), (1000, 999999)]:
                with self.subTest(imei=imei, asking=asking, market=market):
                    d = self.risk(imei, asking, market)
                    self.assertIsInstance(d["risk_score"], int)
                    self.assertTrue(0 <= d["risk_score"] <= 100)
                    self.assertContractAndConsistency(d)


if __name__ == "__main__":
    unittest.main(verbosity=2)
