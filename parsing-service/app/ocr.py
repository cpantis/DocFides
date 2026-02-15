"""OCR module: Tesseract 5 primary, EasyOCR fallback."""

from typing import Any


def run_tesseract(image_data: bytes) -> dict[str, Any]:
    """Run Tesseract OCR on preprocessed image data."""
    try:
        import pytesseract
        from PIL import Image
        import io

        image = Image.open(io.BytesIO(image_data))
        text = pytesseract.image_to_string(image, lang="ron+eng")

        # Get confidence data
        data = pytesseract.image_to_data(image, lang="ron+eng", output_type=pytesseract.Output.DICT)
        confidences = [int(c) for c in data["conf"] if int(c) > 0]
        avg_confidence = sum(confidences) / len(confidences) if confidences else 0

        warnings: list[str] = []
        if avg_confidence < 70:
            warnings.append("Low OCR confidence — consider re-scanning at higher DPI")

        return {
            "text": text.strip(),
            "confidence": avg_confidence,
            "language": "ron",
            "source": "tesseract",
            "warnings": warnings,
        }
    except Exception as e:
        return {
            "text": "",
            "confidence": 0,
            "source": "tesseract",
            "warnings": [f"Tesseract failed: {str(e)}"],
        }


def run_easyocr_fallback(image_data: bytes) -> dict[str, Any]:
    """Fallback OCR using EasyOCR when Tesseract confidence is low."""
    try:
        import easyocr
        import io

        reader = easyocr.Reader(["ro", "en"], gpu=False)
        results = reader.readtext(io.BytesIO(image_data).read())

        texts = []
        confidences = []
        for _, text, conf in results:
            texts.append(text)
            confidences.append(conf * 100)

        avg_confidence = sum(confidences) / len(confidences) if confidences else 0

        return {
            "text": " ".join(texts),
            "confidence": avg_confidence,
            "source": "easyocr",
            "warnings": [],
        }
    except Exception as e:
        return {
            "text": "",
            "confidence": 0,
            "source": "easyocr",
            "warnings": [f"EasyOCR failed: {str(e)}"],
        }
