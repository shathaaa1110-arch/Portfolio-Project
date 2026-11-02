import pytest
from app.services.auth.phone import InvalidPhoneError, normalize_phone, to_international


@pytest.mark.parametrize(
    "raw",
    [
        "0551234567",
        "٠٥٥١٢٣٤٥٦٧",
        "055 123 4567",
        "055-123-4567",
        "+966551234567",
        "00966551234567",
        "966551234567",
        "551234567",
    ],
)
def test_accepted_formats_become_05(raw):
    assert normalize_phone(raw) == "0551234567"


@pytest.mark.parametrize("raw", ["", "12345", "0451234567", "05512345678", "+971551234567", "abc"])
def test_invalid_numbers_are_rejected(raw):
    with pytest.raises(InvalidPhoneError):
        normalize_phone(raw)


def test_to_international():
    assert to_international("0551234567") == "+966551234567"
