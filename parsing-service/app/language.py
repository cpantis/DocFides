"""Language detection for OCR documents."""

from typing import Optional


# Tesseract language codes mapping
SUPPORTED_LANGUAGES = {
    "ron": "Romanian",
    "eng": "English",
    "fra": "French",
    "deu": "German",
    "ita": "Italian",
    "spa": "Spanish",
}

# Default OCR language string
DEFAULT_LANGS = "ron+eng"


def detect_language(text: str) -> Optional[str]:
    """Detect language from extracted text using character analysis."""
    if not text or len(text.strip()) < 20:
        return None

    text_lower = text.lower()

    # Romanian-specific diacritics
    ro_chars = set("ăâîșț")
    ro_count = sum(1 for c in text_lower if c in ro_chars)

    # French-specific
    fr_chars = set("àâæçéèêëîïôùûüÿœ")
    fr_count = sum(1 for c in text_lower if c in fr_chars)

    # German-specific
    de_chars = set("äöüß")
    de_count = sum(1 for c in text_lower if c in de_chars)

    # Romanian keywords (common in documents)
    ro_keywords = ["conform", "societatea", "contract", "beneficiar",
                   "proiect", "conform", "anul", "executant", "cerere",
                   "emis", "semnat", "pentru", "acest"]
    ro_keyword_count = sum(1 for w in ro_keywords if w in text_lower)

    # Score each language
    scores = {
        "ron": ro_count * 5 + ro_keyword_count * 3,
        "fra": fr_count * 5,
        "deu": de_count * 5,
        "eng": 0,  # English is default fallback
    }

    best_lang = max(scores, key=lambda k: scores[k])

    # If no strong signal, default to Romanian (primary use case)
    if scores[best_lang] < 3:
        return "ron"

    return best_lang


def get_tesseract_langs(detected_lang: Optional[str] = None) -> str:
    """Get Tesseract language string, prioritizing detected language."""
    if detected_lang and detected_lang in SUPPORTED_LANGUAGES:
        if detected_lang == "ron":
            return "ron+eng"
        if detected_lang == "eng":
            return "eng+ron"
        return f"{detected_lang}+eng+ron"

    return DEFAULT_LANGS
