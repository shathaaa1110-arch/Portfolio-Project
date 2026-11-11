"""Invite codes: four characters, upper-case letters and digits (TechnicalDoc section 2).

Letters and digits that people confuse when reading or typing a code (0 O, 1 I L)
are left out, which leaves 31 characters and 923,521 possible codes.
"""
import secrets

from app.core.config import get_settings

ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
LENGTH = 4


def new_code() -> str:
    """A random code from a cryptographic source, so codes cannot be predicted."""
    return "".join(secrets.choice(ALPHABET) for _ in range(LENGTH))


def invite_url(code: str) -> str | None:
    """The shareable link: INVITE_BASE_URL followed by the code, or None while the setting is empty."""
    base = get_settings().invite_base_url.strip().rstrip("/")
    return f"{base}/{code}" if base else None


def normalize_code(raw: str) -> str:
    """What a person typed, as stored: spaces removed, upper case (BE-09 uses this)."""
    return raw.strip().upper()
