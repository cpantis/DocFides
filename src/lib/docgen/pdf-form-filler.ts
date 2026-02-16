/**
 * PDF AcroForm filler — fills form fields in PDF templates.
 *
 * Used for PDF templates that have actual form fields (text inputs,
 * checkboxes, dropdowns). Common in Romanian government forms that
 * are distributed as fillable PDFs.
 *
 * Uses pdf-lib for direct PDF manipulation — no conversion needed.
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export interface PdfFormFillInput {
  /** PDF template buffer */
  templateBuffer: Buffer;
  /** Field name → value mapping from the Writing Agent */
  fieldValues: Record<string, string>;
  /** Checkbox field name → checked state */
  checkboxValues?: Record<string, boolean>;
  /** Dropdown field name → selected option */
  dropdownValues?: Record<string, string>;
  /** Whether to flatten the form (make fields non-editable) */
  flatten?: boolean;
}

export interface PdfFormFillResult {
  buffer: Buffer;
  filledFields: number;
  skippedFields: string[];
  totalFields: number;
}

/**
 * Fill AcroForm fields in a PDF template and return the filled PDF buffer.
 */
export async function fillPdfForm(input: PdfFormFillInput): Promise<PdfFormFillResult> {
  const pdfDoc = await PDFDocument.load(input.templateBuffer, { ignoreEncryption: true });
  const form = pdfDoc.getForm();

  // Embed Helvetica as fallback. Note: StandardFonts don't support full Romanian
  // diacritics (ș ț). For production use with Romanian text, a custom font with
  // full Unicode coverage (e.g., embedded NotoSans) should be used instead.
  // TODO: embed custom font with Romanian diacritic support (ș ț ă â î)
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const allFields = form.getFields();
  const totalFields = allFields.length;
  let filledFields = 0;
  const skippedFields: string[] = [];

  // Fill text fields
  for (const [fieldName, value] of Object.entries(input.fieldValues)) {
    try {
      const textField = form.getTextField(fieldName);
      textField.setText(value);
      textField.updateAppearances(font);
      filledFields++;
    } catch (error) {
      console.warn(`[PdfFormFiller] Skipped text field "${fieldName}":`, error instanceof Error ? error.message : error);
      skippedFields.push(fieldName);
    }
  }

  // Fill checkboxes
  if (input.checkboxValues) {
    for (const [fieldName, checked] of Object.entries(input.checkboxValues)) {
      try {
        const checkbox = form.getCheckBox(fieldName);
        if (checked) {
          checkbox.check();
        } else {
          checkbox.uncheck();
        }
        filledFields++;
      } catch (error) {
        console.warn(`[PdfFormFiller] Skipped checkbox "${fieldName}":`, error instanceof Error ? error.message : error);
        skippedFields.push(fieldName);
      }
    }
  }

  // Fill dropdowns
  if (input.dropdownValues) {
    for (const [fieldName, value] of Object.entries(input.dropdownValues)) {
      try {
        const dropdown = form.getDropdown(fieldName);
        dropdown.select(value);
        filledFields++;
      } catch (error) {
        console.warn(`[PdfFormFiller] Skipped dropdown "${fieldName}":`, error instanceof Error ? error.message : error);
        skippedFields.push(fieldName);
      }
    }
  }

  // Flatten form if requested (makes fields non-editable, looks like printed)
  if (input.flatten) {
    form.flatten();
  }

  const pdfBytes = await pdfDoc.save();

  console.log(
    `[PdfFormFiller] Filled ${filledFields}/${totalFields} fields ` +
    `(${skippedFields.length} skipped${input.flatten ? ', flattened' : ''})`
  );

  return {
    buffer: Buffer.from(pdfBytes),
    filledFields,
    skippedFields,
    totalFields,
  };
}

/**
 * Fill a flat PDF by overlaying text at specific coordinates.
 * Used when the PDF has no AcroForm fields (common for scanned forms).
 *
 * The field positions come from the AI Template Agent which analyzes
 * the PDF visually and identifies where each field should be placed.
 */
export async function fillFlatPdf(input: {
  templateBuffer: Buffer;
  fieldPlacements: PdfFieldPlacement[];
  flatten?: boolean;
}): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(input.templateBuffer, { ignoreEncryption: true });
  // TODO: embed custom font with Romanian diacritic support (ș ț ă â î)
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();

  for (const placement of input.fieldPlacements) {
    const page = pages[placement.page];
    if (!page) {
      console.warn(`[PdfFlatFiller] Page ${placement.page} not found, skipping field "${placement.fieldId}"`);
      continue;
    }

    const fontSize = placement.fontSize ?? 10;
    const color = placement.color ?? rgb(0, 0, 0);

    if (placement.multiline) {
      // Split text into lines that fit within the width
      const lines = wrapText(placement.value, font, fontSize, placement.maxWidth ?? 200);
      let y = placement.y;
      const lineHeight = fontSize * 1.2;

      for (const line of lines) {
        page.drawText(line, {
          x: placement.x,
          y,
          size: fontSize,
          font,
          color,
        });
        y -= lineHeight;
      }
    } else {
      page.drawText(placement.value, {
        x: placement.x,
        y: placement.y,
        size: fontSize,
        font,
        color,
      });
    }
  }

  const pdfBytes = await pdfDoc.save();

  console.log(
    `[PdfFlatFiller] Placed ${input.fieldPlacements.length} fields on flat PDF`
  );

  return Buffer.from(pdfBytes);
}

export interface PdfFieldPlacement {
  fieldId: string;
  value: string;
  /** 0-based page index */
  page: number;
  /** X coordinate in PDF points (from left) */
  x: number;
  /** Y coordinate in PDF points (from bottom) */
  y: number;
  fontSize?: number;
  color?: ReturnType<typeof rgb>;
  /** If true, text wraps within maxWidth */
  multiline?: boolean;
  /** Maximum width for multiline text (in PDF points) */
  maxWidth?: number;
}

/**
 * Simple word-wrap: break text into lines that fit within maxWidth.
 */
function wrapText(
  text: string,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  fontSize: number,
  maxWidth: number
): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const testWidth = font.widthOfTextAtSize(testLine, fontSize);

    if (testWidth > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}
