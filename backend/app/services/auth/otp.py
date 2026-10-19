"""Verification code generation and checking (BE-04).

The database stores only an HMAC of each code, never the code itself.
The HMAC uses the server's secret key, so a leaked table cannot be
brute-forced back into codes without that key.
"""
import hashlib
import hmac
import secrets

CODE_LENGTH = 6
CODE_TTL_SECONDS = 300  # 5 minutes, matches the API contract
MAX_ATTEMPTS = 5


def generate_code() -> str:
    """Return a random numeric code, e.g. '048213'. Leading zeros are kept."""
    return f"{secrets.randbelow(10**CODE_LENGTH):0{CODE_LENGTH}d}"


def hash_code(phone: str, code: str, secret: str) -> str:
    """HMAC-SHA256 of phone + code. Including the phone ties the hash to one number."""
    message = f"{phone}:{code}".encode()
    return hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()


def code_matches(phone: str, code: str, stored_hash: str, secret: str) -> bool:
    """Compare in constant time, so response timing does not leak how close a guess was."""
    return hmac.compare_digest(hash_code(phone, code, secret), stored_hash)