"""BE-31: requests about an outing's round name it with round_id. Tests read it the way the app does."""

BASE = "/api/v1/outings"


def round_of(client, outing_id, headers) -> str | None:
    """The caller's view of the current round, or None when they cannot read the outing."""
    r = client.get(f"{BASE}/{outing_id}", headers=headers)
    return r.json()["round_id"] if r.status_code == 200 else None


def R(client, outing_id, headers) -> dict:
    """{"round_id": ...} for a query or a body; empty when the caller cannot read the outing."""
    current = round_of(client, outing_id, headers)
    return {} if current is None else {"round_id": current}


def W(client, outing_id, headers, body: dict) -> dict:
    """A body with the current round added."""
    return {**body, **R(client, outing_id, headers)}
