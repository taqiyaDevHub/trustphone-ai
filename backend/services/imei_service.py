"""
TrustPhone AI — IMEI Service

Provides IMEI validation and checksum verification utilities.
"""


def validate_imei_format(imei: str) -> tuple[bool, str | None]:
    """
    Validate basic IMEI format: must be exactly 15 numeric digits.

    Returns (is_valid, error_code).
    error_code is None when valid, "INVALID_IMEI" otherwise.
    """
    if not imei.isdigit() or len(imei) != 15:
        return False, "INVALID_IMEI"
    return True, None


def validate_luhn_checksum(imei: str) -> bool:
    """
    Validate IMEI using the Luhn algorithm (standard IMEI checksum).

    Algorithm steps:
      1. Starting from the rightmost digit, double every second digit.
      2. If a doubled value exceeds 9, subtract 9.
      3. Sum all resulting digits.
      4. The IMEI is valid when the sum is divisible by 10.

    IMPORTANT:
      A valid IMEI checksum validates structural/checksum consistency only.
      It does NOT prove that a device is legitimate or safe.
      A real device can fail checksum due to data-entry error, and a
      counterfeit device can carry a cloned, checksum-valid IMEI.
    """
    digits = [int(d) for d in imei]
    total = 0
    for i in range(len(digits) - 1, -1, -1):
        d = digits[i]
        # Position from right: len(digits) - 1 - i
        # Double every second digit from the right (positions 1, 3, 5, …)
        if (len(digits) - 1 - i) % 2 == 1:
            d *= 2
            if d > 9:
                d -= 9
        total += d
    return total % 10 == 0
