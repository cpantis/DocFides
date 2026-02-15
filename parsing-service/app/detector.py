import mimetypes
from dataclasses import dataclass


@dataclass
class DocumentType:
    category: str  # image, pdf_native, pdf_scanned, docx, xlsx, unknown
    mime_type: str
    extension: str
    has_text: bool = False


IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".tiff", ".tif"}
PDF_EXTENSIONS = {".pdf"}
DOCX_EXTENSIONS = {".docx"}
XLSX_EXTENSIONS = {".xlsx", ".xls"}


def detect_document_type(
    content: bytes, filename: str, content_type: str
) -> DocumentType:
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    mime = content_type or mimetypes.guess_type(filename)[0] or "application/octet-stream"

    if ext in IMAGE_EXTENSIONS:
        return DocumentType(category="image", mime_type=mime, extension=ext)

    if ext in PDF_EXTENSIONS:
        has_text = _pdf_has_selectable_text(content)
        category = "pdf_native" if has_text else "pdf_scanned"
        return DocumentType(
            category=category, mime_type=mime, extension=ext, has_text=has_text
        )

    if ext in DOCX_EXTENSIONS:
        return DocumentType(
            category="docx", mime_type=mime, extension=ext, has_text=True
        )

    if ext in XLSX_EXTENSIONS:
        return DocumentType(
            category="xlsx", mime_type=mime, extension=ext, has_text=True
        )

    return DocumentType(category="unknown", mime_type=mime, extension=ext)


def _pdf_has_selectable_text(content: bytes) -> bool:
    """Quick check if PDF contains text streams (not just images)."""
    # Simple heuristic: check for text-related PDF operators
    text_markers = [b"/Type /Page", b"BT", b"ET", b"/Font"]
    marker_count = sum(1 for marker in text_markers if marker in content[:50000])
    return marker_count >= 2
