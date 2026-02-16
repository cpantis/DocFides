"""Table extraction from images using img2table."""

from app.models import TableData


def extract_tables_from_image(image_data: bytes) -> list[TableData]:
    """Extract tables from preprocessed image data."""
    try:
        from img2table.document import Image as Img2TableImage
        from img2table.ocr import TesseractOCR
        import tempfile
        import os

        # img2table requires a file path
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
            tmp.write(image_data)
            tmp_path = tmp.name

        try:
            ocr = TesseractOCR(lang="ron+eng")
            doc = Img2TableImage(src=tmp_path)
            extracted = doc.extract_tables(ocr=ocr)

            tables: list[TableData] = []
            for table in extracted:
                if table.df is not None:
                    df = table.df
                    headers = [str(col) for col in df.columns.tolist()]
                    rows = [[str(cell) for cell in row] for row in df.values.tolist()]
                    tables.append(
                        TableData(
                            headers=headers,
                            rows=rows,
                            confidence=85.0,  # img2table doesn't provide per-table confidence
                        )
                    )

            return tables
        finally:
            os.unlink(tmp_path)
    except Exception:
        return []
