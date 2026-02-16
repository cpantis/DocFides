"""Apache Tika text extraction client."""

from typing import Any


def extract_text_with_tika(content: bytes) -> dict[str, Any]:
    """Extract text from documents using Apache Tika server."""
    try:
        from tika import parser

        parsed = parser.from_buffer(content)
        text = parsed.get("content", "") or ""
        metadata = parsed.get("metadata", {}) or {}

        page_count = 1
        if "xmpTPg:NPages" in metadata:
            try:
                page_count = int(metadata["xmpTPg:NPages"])
            except (ValueError, TypeError):
                pass

        return {
            "text": text.strip(),
            "metadata": metadata,
            "page_count": page_count,
        }
    except Exception as e:
        return {
            "text": "",
            "metadata": {},
            "page_count": 1,
            "error": str(e),
        }
