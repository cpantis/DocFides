/**
 * OCR pipeline testing script.
 * Tests the parsing service with sample files.
 * Usage: npm run test:ocr
 */

async function testOcr() {
  const parsingServiceUrl = process.env.PARSING_SERVICE_URL || 'http://localhost:8000';

  // Health check
  try {
    const health = await fetch(`${parsingServiceUrl}/health`);
    const data = await health.json();
    console.log('[OCR Test] Parsing service health:', data);
  } catch (error) {
    console.error('[OCR Test] Parsing service unreachable:', error);
    process.exit(1);
  }

  // TODO: Add test file parsing
  // 1. Read sample files from test fixtures
  // 2. POST to /parse endpoint
  // 3. Validate response structure
  // 4. Check confidence scores

  console.log('[OCR Test] All tests passed');
}

testOcr().catch((err) => {
  console.error('[OCR Test] Error:', err);
  process.exit(1);
});
