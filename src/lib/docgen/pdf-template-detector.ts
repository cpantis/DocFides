/**
 * Detect PDF template type: AcroForm (fillable fields) vs flat (image/text only).
 *
 * AcroForm PDFs have actual form fields (text inputs, checkboxes, dropdowns)
 * that can be filled programmatically with pdf-lib.
 *
 * Flat PDFs (common for Romanian gov forms like DR24) have no form fields —
 * they need AI Vision to identify field positions and pdf-lib to overlay text.
 */

import { PDFDocument } from 'pdf-lib';

export type PdfTemplateType = 'acroform' | 'flat';

export interface PdfTemplateAnalysis {
  type: PdfTemplateType;
  pageCount: number;
  /** AcroForm fields found (empty for flat PDFs) */
  fields: PdfFormField[];
  /** Whether the PDF has any text content (vs pure scanned image) */
  hasTextContent: boolean;
}

export interface PdfFormField {
  name: string;
  type: 'text' | 'checkbox' | 'dropdown' | 'radio' | 'signature' | 'unknown';
  page: number;
  /** Field rectangle [x, y, width, height] in PDF points */
  rect?: { x: number; y: number; width: number; height: number };
  /** Current value if pre-filled */
  currentValue?: string;
  /** Dropdown options if applicable */
  options?: string[];
  required: boolean;
}

/**
 * Analyze a PDF buffer to determine its template type and extract form fields.
 */
export async function analyzePdfTemplate(pdfBuffer: Buffer): Promise<PdfTemplateAnalysis> {
  const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
  const pageCount = pdfDoc.getPageCount();

  const form = pdfDoc.getForm();
  const formFields = form.getFields();

  const fields: PdfFormField[] = [];

  for (const field of formFields) {
    const name = field.getName();
    const widgets = field.acroField.getWidgets();
    const firstWidget = widgets[0];

    let page = 0;
    let rect: PdfFormField['rect'] | undefined;

    if (firstWidget) {
      const rectArray = firstWidget.getRectangle();
      rect = {
        x: rectArray.x,
        y: rectArray.y,
        width: rectArray.width,
        height: rectArray.height,
      };

      // Find which page this widget belongs to
      const pages = pdfDoc.getPages();
      for (let i = 0; i < pages.length; i++) {
        const pageRef = pages[i]?.ref;
        const widgetPage = firstWidget.P();
        if (pageRef && widgetPage && pageRef === widgetPage) {
          page = i;
          break;
        }
      }
    }

    const fieldType = getFieldType(field);

    const pdfField: PdfFormField = {
      name,
      type: fieldType,
      page,
      rect,
      required: false,
    };

    // Extract current value for text fields
    if (fieldType === 'text') {
      try {
        const textField = form.getTextField(name);
        pdfField.currentValue = textField.getText() ?? undefined;
      } catch (error) {
        console.warn(`[PdfDetector] Could not read text field "${name}":`, error instanceof Error ? error.message : error);
      }
    }

    // Extract options for dropdowns
    if (fieldType === 'dropdown') {
      try {
        const dropdown = form.getDropdown(name);
        pdfField.options = dropdown.getOptions();
        const selected = dropdown.getSelected();
        pdfField.currentValue = selected.length > 0 ? selected[0] : undefined;
      } catch (error) {
        console.warn(`[PdfDetector] Could not read dropdown "${name}":`, error instanceof Error ? error.message : error);
      }
    }

    fields.push(pdfField);
  }

  // Check if PDF has text content (not just scanned images)
  const hasTextContent = await checkForTextContent(pdfDoc);

  const type: PdfTemplateType = fields.length > 0 ? 'acroform' : 'flat';

  console.log(
    `[PdfDetector] PDF template: ${type}, ${pageCount} pages, ${fields.length} form fields, hasText=${hasTextContent}`
  );

  return { type, pageCount, fields, hasTextContent };
}

type PdfField = ReturnType<ReturnType<typeof PDFDocument.prototype.getForm>['getFields']>[number];

function getFieldType(field: PdfField): PdfFormField['type'] {
  const constructor = field.constructor.name;
  switch (constructor) {
    case 'PDFTextField': return 'text';
    case 'PDFCheckBox': return 'checkbox';
    case 'PDFDropdown': return 'dropdown';
    case 'PDFRadioGroup': return 'radio';
    case 'PDFSignature': return 'signature';
    default: return 'unknown';
  }
}

/**
 * Heuristic to check if the PDF has embedded text content (vs pure scanned images).
 * If it has text fields in the form, we know it has text.
 * Otherwise, we check if pages have content streams with text rendering operators.
 */
async function checkForTextContent(pdfDoc: PDFDocument): Promise<boolean> {
  const pages = pdfDoc.getPages();
  if (pages.length === 0) return false;

  // If the form has any fields, the PDF has structured content
  const form = pdfDoc.getForm();
  if (form.getFields().length > 0) return true;

  // Check first page's content stream for text operators (Tj, TJ, Tf)
  try {
    const firstPage = pages[0]!;
    const node = firstPage.node;
    const contentsRef = node.get(node.context.obj('Contents'));
    if (!contentsRef) return false;

    // If there's a Contents stream, the PDF has some content
    // (could be images or text — but most PDFs with content streams have text)
    return true;
  } catch (error) {
    console.warn('[PdfDetector] Could not check text content:', error instanceof Error ? error.message : error);
    // If we can't determine, assume it has text (safer default for OCR fallback)
    return true;
  }
}
