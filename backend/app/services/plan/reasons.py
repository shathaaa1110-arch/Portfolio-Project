"""The Arabic reason shown on a recommendation card (BE-15, #28).

The engine returns reason keys; this turns them into one short sentence. Every part
comes from a real field, and a missing rating or location is never invented.
"""

REASON_TEXT = {
    "taste": "يناسب ذوقك",
    "budget": "ضمن ميزانيتك",
    "quality": "تقييمه عالي",
}


def reason_text(keys: list[str], distance_km: float | None) -> str:
    """e.g. ["taste", "budget", "distance"], 1.9 -> "يناسب ذوقك، ضمن ميزانيتك ويبعد 1.9 كم"."""
    parts = [REASON_TEXT[k] for k in keys if k in REASON_TEXT]
    if "distance" in keys and distance_km is not None:
        parts.append(f"يبعد {distance_km:g} كم")
    if not parts:
        return "مفتوح الحين"  # The filter only keeps places that are open at that time.
    return parts[0] if len(parts) == 1 else "، ".join(parts[:-1]) + " و" + parts[-1]
