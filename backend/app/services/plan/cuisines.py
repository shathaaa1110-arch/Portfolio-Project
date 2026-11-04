"""The 18 cuisine categories the app shows, and the dataset codes under each (24 Oct decision).

Users pick category keys (P-02 #8). Restaurants store raw dataset codes.
`other` has no key on purpose: those restaurants stay, with a cuisine score of zero.
"""

CUISINE_GROUPS: dict[str, tuple[str, ...]] = {
    # Cuisines
    "saudi_gulf": ("saudi", "gulf_khaleeji", "yemeni"),
    "levant": ("levantine", "shawarma", "mediterranean"),
    "american": ("american", "burgers", "fried_chicken"),
    "italian": ("italian", "pizza"),
    "indian": ("indian", "pakistani", "bangladeshi", "afghan"),
    "asian": ("chinese", "japanese_sushi", "korean", "thai_vietnamese", "indonesian_malaysian", "filipino"),
    "turk_persian": ("turkish", "persian"),
    "egypt_arab": ("egyptian", "sudanese", "moroccan", "iraqi"),
    "world": ("international", "mexican", "french", "african", "ethiopian"),
    # Food types
    "grill": ("grill_bbq",),
    "sandwich": ("sandwiches",),
    "breakfast": ("breakfast",),
    "seafood": ("seafood",),
    "healthy": ("healthy_salads",),
    "coffee_tea": ("specialty_coffee", "tea"),
    "sweets": ("desserts", "ice_cream"),
    "bakery": ("bakery_pastry",),
    "juice": ("juices",),
}

# Places that only serve these appear only when someone chose one of them.
CAFE_KEYS = frozenset({"coffee_tea", "sweets", "bakery", "juice"})

# Reverse lookup: dataset code -> category key.
CODE_TO_KEY: dict[str, str] = {code: key for key, codes in CUISINE_GROUPS.items() for code in codes}


def keys_for_codes(codes) -> list[str]:
    """Category keys of a restaurant, in the order its codes appear, without repeats."""
    keys = []
    for code in codes:
        key = CODE_TO_KEY.get(code)
        if key and key not in keys:
            keys.append(key)
    return keys


def is_known_key(key: str) -> bool:
    """True for one of the 18 category keys. The API rejects anything else with 422."""
    return key in CUISINE_GROUPS
