"""Phone number cleanup for sign-up and log in (BE-04).

Every phone number is stored in one format, 05XXXXXXXX, so the same
person always maps to the same account.
"""
import re

# Arabic-Indic (٠-٩) and Persian (۰-۹) digits -> 0-9
_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789")
_SAUDI_MOBILE = re.compile(r"^05\d{8}$")


class InvalidPhoneError(ValueError):
    """The phone number is not a Saudi mobile number in a format we accept."""


def normalize_phone(raw: str) -> str:
    """Return the phone as 05XXXXXXXX, or raise InvalidPhoneError."""
    phone = raw.translate(_DIGITS)
    phone = re.sub(r"[\s\-()]", "", phone)

    if phone.startswith("+966"):
        phone = "0" + phone[4:]
    elif phone.startswith("00966"):
        phone = "0" + phone[5:]
    elif phone.startswith("966"):
        phone = "0" + phone[3:]
    elif phone.startswith("5") and len(phone) == 9:
        phone = "0" + phone

    if not _SAUDI_MOBILE.match(phone):
        raise InvalidPhoneError(raw)
    return phone


def to_international(phone: str) -> str:
    """05XXXXXXXX -> +9665XXXXXXXX, the format Authentica expects."""
    return "+966" + phone[1:]
