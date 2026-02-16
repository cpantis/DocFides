import time
import uuid
from typing import Optional

from app.models import ParseResponse, ExtractionBlock, TableData, BoundingBox
from app.detector import DocumentType
from app.ocr import run_tesseract, run_easyocr_fallback
from app.preprocessor import preprocess_image
from app.table_extractor import extract_tables_from_image
from app.tika_client import extract_text_with_tika
from app.xlsx_parser import parse_xlsx
from app.pdf_utils import extract_pdf_pages, extract_tables_from_native_pdf
from app.language import detect_language


async def parse_document(
    content: bytes, doc_type: DocumentType, filename: str
) -> ParseResponse:
    start_time = time.time()
    blocks: list[ExtractionBlock] = []
    tables: list[TableData] = []
    raw_text = ""
    language: Optional[str] = None
    page_count = 1

    if doc_type.category == "image":
        blocks, tables, raw_text, language = _parse_image(content)
        page_count = 1

    elif doc_type.category == "pdf_native":
        blocks, tables, raw_text, language, page_count = _parse_pdf_native(content)

    elif doc_type.category == "pdf_scanned":
        blocks, tables, raw_text, language, page_count = _parse_pdf_scanned(content)

    elif doc_type.category == "docx":
        blocks, tables, raw_text, language, page_count = _parse_docx(content)

    elif doc_type.category == "xlsx":
        blocks, tables, raw_text, page_count = _parse_xlsx(content, filename)

    else:
        raise ValueError(f"Unsupported document type: {doc_type.category}")

    elapsed_ms = int((time.time() - start_time) * 1000)
    confidences = [b.confidence for b in blocks]
    overall = sum(confidences) / len(confidences) if confidences else 0

    return ParseResponse(
        blocks=blocks,
        raw_text=raw_text,
        tables=tables,
        overall_confidence=overall,
        language=language,
        page_count=page_count,
        processing_time_ms=elapsed_ms,
    )


def _parse_image(
    content: bytes,
) -> tuple[list[ExtractionBlock], list[TableData], str, Optional[str]]:
    """Parse a single image: preprocess -> OCR -> table extraction."""
    processed = preprocess_image(content)

    ocr_result = run_tesseract(processed)
    raw_text = ocr_result["text"]
    language = detect_language(raw_text) or ocr_result.get("language")

    # Fallback to EasyOCR if low confidence
    if ocr_result["confidence"] < 70:
        easy_result = run_easyocr_fallback(content)
        if easy_result["confidence"] > ocr_result["confidence"]:
            raw_text = easy_result["text"]
            ocr_result = easy_result

    blocks: list[ExtractionBlock] = [
        ExtractionBlock(
            id=str(uuid.uuid4()),
            type="text",
            content=raw_text,
            source=ocr_result.get("source", "tesseract"),
            confidence=ocr_result["confidence"],
            page=1,
            position=BoundingBox(x=0, y=0, w=1, h=1),
            warnings=ocr_result.get("warnings", []),
        )
    ]

    # Table extraction from image
    image_tables = extract_tables_from_image(processed)
    for t in image_tables:
        tables_list: list[TableData] = []
        tables_list.append(t)
        blocks.append(
            ExtractionBlock(
                id=str(uuid.uuid4()),
                type="table",
                content=t.model_dump(),
                source="img2table",
                confidence=t.confidence,
                page=1,
                position=BoundingBox(x=0, y=0, w=1, h=1),
            )
        )

    return blocks, image_tables, raw_text, language


def _parse_pdf_native(
    content: bytes,
) -> tuple[list[ExtractionBlock], list[TableData], str, Optional[str], int]:
    """Parse native (text-based) PDF: Tika text + Camelot tables."""
    tika_result = extract_text_with_tika(content)
    raw_text = tika_result["text"]
    page_count = tika_result.get("page_count", 1)
    language = detect_language(raw_text)

    blocks: list[ExtractionBlock] = [
        ExtractionBlock(
            id=str(uuid.uuid4()),
            type="text",
            content=raw_text,
            source="tika",
            confidence=95.0,
            page=1,
            position=BoundingBox(x=0, y=0, w=1, h=1),
        )
    ]

    # Extract tables using Camelot
    tables: list[TableData] = []
    camelot_tables = extract_tables_from_native_pdf(content)
    for ct in camelot_tables:
        td = TableData(
            headers=ct["headers"],
            rows=ct["rows"],
            confidence=ct.get("confidence", 85.0),
        )
        tables.append(td)
        blocks.append(
            ExtractionBlock(
                id=str(uuid.uuid4()),
                type="table",
                content=td.model_dump(),
                source="camelot",
                confidence=td.confidence,
                page=ct.get("page", 1),
                position=BoundingBox(x=0, y=0, w=1, h=1),
            )
        )

    return blocks, tables, raw_text, language, page_count


def _parse_pdf_scanned(
    content: bytes,
) -> tuple[list[ExtractionBlock], list[TableData], str, Optional[str], int]:
    """Parse scanned PDF: per-page rendering + OCR + table extraction."""
    pages = extract_pdf_pages(content)
    page_count = len(pages)

    blocks: list[ExtractionBlock] = []
    tables: list[TableData] = []
    all_text: list[str] = []
    language: Optional[str] = None

    for page_num, page_image in enumerate(pages, start=1):
        processed = preprocess_image(page_image)

        # OCR this page
        ocr_result = run_tesseract(processed)
        page_text = ocr_result["text"]

        # Fallback to EasyOCR if low confidence
        if ocr_result["confidence"] < 70:
            easy_result = run_easyocr_fallback(page_image)
            if easy_result["confidence"] > ocr_result["confidence"]:
                page_text = easy_result["text"]
                ocr_result = easy_result

        if page_text.strip():
            all_text.append(page_text)
            blocks.append(
                ExtractionBlock(
                    id=str(uuid.uuid4()),
                    type="text",
                    content=page_text,
                    source=ocr_result.get("source", "tesseract"),
                    confidence=ocr_result["confidence"],
                    page=page_num,
                    position=BoundingBox(x=0, y=0, w=1, h=1),
                    warnings=ocr_result.get("warnings", []),
                )
            )

        # Table extraction per page
        page_tables = extract_tables_from_image(processed)
        for t in page_tables:
            tables.append(t)
            blocks.append(
                ExtractionBlock(
                    id=str(uuid.uuid4()),
                    type="table",
                    content=t.model_dump(),
                    source="img2table",
                    confidence=t.confidence,
                    page=page_num,
                    position=BoundingBox(x=0, y=0, w=1, h=1),
                )
            )

    raw_text = "\n\n".join(all_text)
    language = detect_language(raw_text)

    # If no text was extracted at all, add a warning block
    if not blocks:
        blocks.append(
            ExtractionBlock(
                id=str(uuid.uuid4()),
                type="text",
                content="",
                source="tesseract",
                confidence=0,
                page=1,
                position=BoundingBox(x=0, y=0, w=1, h=1),
                warnings=["No text could be extracted from this PDF"],
            )
        )

    return blocks, tables, raw_text, language, page_count


def _parse_docx(
    content: bytes,
) -> tuple[list[ExtractionBlock], list[TableData], str, Optional[str], int]:
    """Parse DOCX: Tika text extraction + XML table parsing."""
    tika_result = extract_text_with_tika(content)
    raw_text = tika_result["text"]
    language = detect_language(raw_text)

    blocks: list[ExtractionBlock] = [
        ExtractionBlock(
            id=str(uuid.uuid4()),
            type="text",
            content=raw_text,
            source="tika",
            confidence=98.0,
            page=1,
            position=BoundingBox(x=0, y=0, w=1, h=1),
        )
    ]

    # Extract tables from DOCX XML
    tables = _extract_docx_tables(content)
    for t in tables:
        blocks.append(
            ExtractionBlock(
                id=str(uuid.uuid4()),
                type="table",
                content=t.model_dump(),
                source="tika",
                confidence=t.confidence,
                page=1,
                position=BoundingBox(x=0, y=0, w=1, h=1),
            )
        )

    return blocks, tables, raw_text, language, 1


def _extract_docx_tables(content: bytes) -> list[TableData]:
    """Extract tables from DOCX by parsing the XML structure."""
    try:
        import zipfile
        import io
        import xml.etree.ElementTree as ET

        WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"

        zf = zipfile.ZipFile(io.BytesIO(content))
        if "word/document.xml" not in zf.namelist():
            return []

        doc_xml = zf.read("word/document.xml")
        root = ET.fromstring(doc_xml)

        tables: list[TableData] = []

        for tbl in root.iter(f"{{{WORD_NS}}}tbl"):
            rows_data: list[list[str]] = []

            for tr in tbl.iter(f"{{{WORD_NS}}}tr"):
                row: list[str] = []
                for tc in tr.iter(f"{{{WORD_NS}}}tc"):
                    cell_texts: list[str] = []
                    for t_elem in tc.iter(f"{{{WORD_NS}}}t"):
                        if t_elem.text:
                            cell_texts.append(t_elem.text)
                    row.append(" ".join(cell_texts))
                if row:
                    rows_data.append(row)

            if rows_data:
                headers = rows_data[0] if rows_data else []
                data_rows = rows_data[1:] if len(rows_data) > 1 else []
                tables.append(TableData(
                    headers=headers,
                    rows=data_rows,
                    confidence=97.0,
                ))

        zf.close()
        return tables
    except Exception:
        return []


def _parse_xlsx(
    content: bytes, filename: str
) -> tuple[list[ExtractionBlock], list[TableData], str, int]:
    """Parse Excel files using openpyxl."""
    result = parse_xlsx(content, filename)

    blocks: list[ExtractionBlock] = []
    tables: list[TableData] = result.get("tables", [])
    raw_text = result.get("raw_text", "")
    page_count = result.get("page_count", 1)

    if result.get("error"):
        blocks.append(
            ExtractionBlock(
                id=str(uuid.uuid4()),
                type="text",
                content=raw_text,
                source="openpyxl",
                confidence=0,
                page=1,
                position=BoundingBox(x=0, y=0, w=1, h=1),
                warnings=[f"Excel parse error: {result['error']}"],
            )
        )
    else:
        # Add text block with raw representation
        if raw_text:
            blocks.append(
                ExtractionBlock(
                    id=str(uuid.uuid4()),
                    type="text",
                    content=raw_text,
                    source="openpyxl",
                    confidence=98.0,
                    page=1,
                    position=BoundingBox(x=0, y=0, w=1, h=1),
                )
            )

        # Add table blocks
        for i, t in enumerate(tables):
            blocks.append(
                ExtractionBlock(
                    id=str(uuid.uuid4()),
                    type="table",
                    content=t.model_dump(),
                    source="openpyxl",
                    confidence=t.confidence,
                    page=i + 1,
                    position=BoundingBox(x=0, y=0, w=1, h=1),
                )
            )

    return blocks, tables, raw_text, page_count
