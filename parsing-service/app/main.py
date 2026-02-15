from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
from app.detector import detect_document_type
from app.parser import parse_document
from app.models import ParseResponse, HealthResponse

app = FastAPI(
    title="DocFides Parsing Service",
    description="Document parsing microservice: OCR, table extraction, text extraction",
    version="0.1.0",
)


@app.get("/health", response_model=HealthResponse)
async def health_check():
    return HealthResponse(status="healthy", version="0.1.0")


@app.post("/parse", response_model=ParseResponse)
async def parse(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    content = await file.read()
    if len(content) > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 25MB)")

    try:
        doc_type = detect_document_type(content, file.filename, file.content_type or "")
        result = await parse_document(content, doc_type, file.filename)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Parsing failed: {str(e)}")
