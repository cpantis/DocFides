import time
import uuid
from typing import Optional

from app.models import ParseResponse, ExtractionBlock, TableData, BoundingBox
from app.detector import DocumentType
from app.ocr import run_tesseract, run_easyocr_fallback
from app.preprocessor import preprocess_image
from app.table_extractor import extract_tables_from_image
from app.tika_client import extract_text_with_tika


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
        processed = preprocess_image(content)
        ocr_result = run_tesseract(processed)
        raw_text = ocr_result["text"]
        language = ocr_result.get("language")
        page_count = 1

        blocks.append(
            ExtractionBlock(
                id=str(uuid.uuid4()),
                type="text",
                content=raw_text,
                source="tesseract",
                confidence=ocr_result["confidence"],
                page=1,
                position=BoundingBox(x=0, y=0, w=1, h=1),
                warnings=ocr_result.get("warnings", []),
            )
        )

        # Try table extraction
        image_tables = extract_tables_from_image(processed)
        for t in image_tables:
            tables.append(t)

    elif doc_type.category == "pdf_native":
        tika_result = extract_text_with_tika(content)
        raw_text = tika_result["text"]
        page_count = tika_result.get("page_count", 1)

        blocks.append(
            ExtractionBlock(
                id=str(uuid.uuid4()),
                type="text",
                content=raw_text,
                source="tika",
                confidence=95.0,
                page=1,
                position=BoundingBox(x=0, y=0, w=1, h=1),
            )
        )

    elif doc_type.category == "pdf_scanned":
        # Per-page OCR
        processed = preprocess_image(content)
        ocr_result = run_tesseract(processed)
        raw_text = ocr_result["text"]
        language = ocr_result.get("language")

        if ocr_result["confidence"] < 70:
            # Fallback to EasyOCR
            easy_result = run_easyocr_fallback(content)
            if easy_result["confidence"] > ocr_result["confidence"]:
                raw_text = easy_result["text"]
                ocr_result = easy_result

        blocks.append(
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
        )

    elif doc_type.category == "docx":
        tika_result = extract_text_with_tika(content)
        raw_text = tika_result["text"]

        blocks.append(
            ExtractionBlock(
                id=str(uuid.uuid4()),
                type="text",
                content=raw_text,
                source="tika",
                confidence=98.0,
                page=1,
                position=BoundingBox(x=0, y=0, w=1, h=1),
            )
        )

    elif doc_type.category == "xlsx":
        # TODO: Use openpyxl for structured table parsing
        raw_text = f"[Excel file: {filename}]"
        blocks.append(
            ExtractionBlock(
                id=str(uuid.uuid4()),
                type="table",
                content=raw_text,
                source="tika",
                confidence=95.0,
                page=1,
                position=BoundingBox(x=0, y=0, w=1, h=1),
            )
        )

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
