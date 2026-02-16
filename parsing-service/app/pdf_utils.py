"""PDF page-by-page processing for scanned PDFs."""

import io
import tempfile
import os
from typing import Any


def extract_pdf_pages(content: bytes) -> list[bytes]:
    """Split a PDF into individual page images for OCR processing."""
    try:
        import fitz  # PyMuPDF

        doc = fitz.open(stream=content, filetype="pdf")
        pages: list[bytes] = []

        for page_num in range(len(doc)):
            page = doc.load_page(page_num)
            # Render at 300 DPI for good OCR quality
            mat = fitz.Matrix(300 / 72, 300 / 72)
            pix = page.get_pixmap(matrix=mat)
            pages.append(pix.tobytes("png"))

        doc.close()
        return pages
    except ImportError:
        # Fallback to pdf2image if PyMuPDF not available
        return _extract_with_pdf2image(content)


def _extract_with_pdf2image(content: bytes) -> list[bytes]:
    """Fallback page extraction using pdf2image (poppler-based)."""
    try:
        from pdf2image import convert_from_bytes

        images = convert_from_bytes(content, dpi=300, fmt="png")
        pages: list[bytes] = []

        for image in images:
            buffer = io.BytesIO()
            image.save(buffer, format="PNG")
            pages.append(buffer.getvalue())

        return pages
    except Exception:
        # If both methods fail, return content as single "page"
        return [content]


def get_pdf_page_count(content: bytes) -> int:
    """Get page count from PDF without full rendering."""
    try:
        import fitz
        doc = fitz.open(stream=content, filetype="pdf")
        count = len(doc)
        doc.close()
        return count
    except ImportError:
        pass

    # Fallback: count /Type /Page occurrences
    count = content.count(b"/Type /Page")
    # Subtract /Type /Pages (parent node)
    parent_count = content.count(b"/Type /Pages")
    return max(count - parent_count, 1)


def extract_tables_from_native_pdf(content: bytes) -> list[dict[str, Any]]:
    """Extract tables from native PDFs using camelot."""
    try:
        import camelot

        # camelot requires a file path
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
            tmp.write(content)
            tmp_path = tmp.name

        try:
            # Try lattice mode first (bordered tables)
            tables_result = camelot.read_pdf(tmp_path, flavor="lattice", pages="all")

            extracted: list[dict[str, Any]] = []

            if len(tables_result) == 0:
                # Fallback to stream mode (borderless tables)
                tables_result = camelot.read_pdf(tmp_path, flavor="stream", pages="all")

            for table in tables_result:
                df = table.df
                if df.empty:
                    continue

                headers = [str(v) for v in df.iloc[0].tolist()]
                rows = [[str(cell) for cell in row] for row in df.iloc[1:].values.tolist()]
                accuracy = table.accuracy if hasattr(table, 'accuracy') else 85.0

                extracted.append({
                    "headers": headers,
                    "rows": rows,
                    "confidence": accuracy,
                    "page": table.page if hasattr(table, 'page') else 1,
                })

            return extracted
        finally:
            os.unlink(tmp_path)
    except Exception:
        return []
