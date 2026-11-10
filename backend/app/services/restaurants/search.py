"""Search text rules shared by the database column and the API (#46).

The same normalization runs in two places and must stay identical:
  - in PostgreSQL, as the generated column restaurants.search_text (migration 0004);
  - in Python, on the user's search term before it is compared with that column.

Normalization: lower case, alef forms -> ا, ى -> ي, ة -> ه, tatweel removed,
Arabic diacritics removed, runs of spaces -> one space.
"""
import re

MAX_SEARCH_CHARS = 50
MIN_CATEGORY_CHARS = 2  # a one-letter term would match almost every category

# Single source for the SQL expression; {col} is the text to normalize.
NORMALIZE_SQL = (
    "regexp_replace(regexp_replace(translate(lower({col}), 'أإآٱىةـ', 'اااايه'),"
    " '[\\u064B-\\u065F\\u0670]', '', 'g'), '\\s+', ' ', 'g')"
)

_LETTERS = str.maketrans({"أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا", "ى": "ي", "ة": "ه", "ـ": None})
_DIACRITICS = re.compile("[ً-ٰٟ]")
_SPACES = re.compile(r"\s+")


def normalize(text: str) -> str:
    """Python twin of NORMALIZE_SQL."""
    text = _DIACRITICS.sub("", text.lower().translate(_LETTERS))
    return _SPACES.sub(" ", text).strip()


# Arabic names people type for each dataset code (same wording as the app's labels).
CODE_LABELS_AR = {
    "saudi": "سعودي", "gulf_khaleeji": "خليجي", "yemeni": "يمني",
    "levantine": "شامي", "shawarma": "شاورما", "mediterranean": "متوسطي",
    "american": "أمريكي", "burgers": "برغر", "fried_chicken": "دجاج مقلي",
    "italian": "إيطالي", "pizza": "بيتزا",
    "indian": "هندي", "pakistani": "باكستاني", "bangladeshi": "بنغلاديشي", "afghan": "أفغاني",
    "chinese": "صيني", "japanese_sushi": "ياباني سوشي", "korean": "كوري",
    "thai_vietnamese": "تايلندي فيتنامي", "indonesian_malaysian": "إندونيسي ماليزي", "filipino": "فلبيني",
    "turkish": "تركي", "persian": "إيراني",
    "egyptian": "مصري", "sudanese": "سوداني", "moroccan": "مغربي", "iraqi": "عراقي",
    "international": "عالمي", "mexican": "مكسيكي", "french": "فرنسي", "african": "أفريقي", "ethiopian": "إثيوبي",
    "grill_bbq": "مشويات", "sandwiches": "ساندويتشات", "breakfast": "فطور", "seafood": "بحري مأكولات بحرية",
    "healthy_salads": "صحي سلطات", "specialty_coffee": "قهوة مختصة", "tea": "شاي",
    "desserts": "حلويات", "ice_cream": "آيس كريم", "bakery_pastry": "مخبوزات معجنات مخبز", "juices": "عصيرات عصير",
}
_CODE_WORDS = {code: normalize(f"{label} {code.replace('_', ' ')}") for code, label in CODE_LABELS_AR.items()}


def codes_for(term: str) -> list[str]:
    """Dataset codes whose Arabic or English name contains the normalized term."""
    if len(term) < MIN_CATEGORY_CHARS:
        return []
    return sorted(code for code, words in _CODE_WORDS.items() if term in words)


def like_pattern(term: str) -> str:
    """'%term%' with LIKE wildcards in the term escaped (escape character: backslash)."""
    escaped = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"
