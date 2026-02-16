from pydantic import BaseModel
from typing import Optional


class BoundingBox(BaseModel):
    x: float
    y: float
    w: float
    h: float


class MergedCell(BaseModel):
    row: int
    col: int
    row_span: int
    col_span: int


class TableData(BaseModel):
    headers: list[str]
    rows: list[list[str]]
    merged_cells: list[MergedCell] = []
    confidence: float


class ExtractionBlock(BaseModel):
    id: str
    type: str  # text, table, heading, list
    content: str | dict
    source: str  # tika, tesseract, easyocr, img2table
    confidence: float
    page: int
    position: BoundingBox
    warnings: list[str] = []


class ParseResponse(BaseModel):
    blocks: list[ExtractionBlock]
    raw_text: str
    tables: list[TableData]
    overall_confidence: float
    language: Optional[str] = None
    page_count: int
    processing_time_ms: int


class HealthResponse(BaseModel):
    status: str
    version: str
