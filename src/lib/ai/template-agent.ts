import { AGENT_MODELS } from '@/types/pipeline';
import { TEMPLATE_SYSTEM_PROMPT } from './prompts/template';
import { callGeminiWithRetry, type AgentResult } from './gemini-client';

export interface TemplateAgentInput {
  /** Extracted text content from the template */
  content: string;
  /** Template format: docx, acroform PDF, or flat PDF */
  templateType?: 'docx' | 'acroform' | 'flat_pdf';
  /** AcroForm fields detected by pdf-lib (for PDF templates) */
  pdfFormFields?: Array<{ name: string; type: string; value?: string }>;
  /** Base64-encoded page images for flat PDF templates (Gemini Vision) */
  pageImages?: Array<{ page: number; base64: string; mimeType: string }>;
}

/**
 * Template Agent — analyzes templates (DOCX or PDF) to identify all fillable fields.
 *
 * For DOCX: identifies placeholders ({{field}}, [Field], _____)
 * For AcroForm PDF: maps form field names to data types using surrounding context
 * For flat PDF: uses Gemini Vision to identify field positions visually
 */
export async function runTemplateAgent(input: string | TemplateAgentInput): Promise<AgentResult> {
  // Support both old (string) and new (object) call signature
  const config: TemplateAgentInput = typeof input === 'string'
    ? { content: input, templateType: 'docx' }
    : input;

  // Build the user message based on template type
  let userMessage: string;
  const inlineData: Array<{ mimeType: string; data: string }> = [];

  if (config.templateType === 'acroform' && config.pdfFormFields) {
    userMessage =
      `Analyze this PDF form template (AcroForm). The PDF has ${config.pdfFormFields.length} fillable form fields.\n\n` +
      `Template type: acroform\n\n` +
      `AcroForm Fields Detected:\n${JSON.stringify(config.pdfFormFields, null, 2)}\n\n` +
      `Template Text Content (OCR/extracted):\n${config.content}\n\n` +
      `For each AcroForm field, determine:\n` +
      `1. What data it expects (use surrounding text as context)\n` +
      `2. The contentType (copy/narrative/table_fill/computed/conditional)\n` +
      `3. Include the acroFieldName in each field's output`;
  } else if (config.templateType === 'flat_pdf') {
    userMessage =
      `Analyze this flat PDF template (no fillable form fields — like a scanned Romanian government form).\n\n` +
      `Template type: flat_pdf\n\n` +
      `Template Text Content (OCR/extracted):\n${config.content}\n\n` +
      `IMPORTANT: For each field you identify, you MUST provide exact PDF coordinates in pdfPlacement:\n` +
      `- page: 0-based page number\n` +
      `- x: horizontal position from LEFT edge (in PDF points)\n` +
      `- y: vertical position from BOTTOM edge (in PDF points)\n` +
      `- width: available horizontal space for text\n` +
      `- fontSize: estimated font size that fits the space\n\n` +
      `Look for empty lines, dotted lines, underscores, empty table cells, and checkbox squares.`;

    // Add page images for Vision analysis if available
    if (config.pageImages && config.pageImages.length > 0) {
      for (const img of config.pageImages) {
        inlineData.push({
          mimeType: img.mimeType,
          data: img.base64,
        });
        userMessage += `\n\n[Page ${img.page + 1} image included — identify all fillable fields with exact coordinates]`;
      }
    }
  } else {
    userMessage =
      `Analyze the following DOCX template document. Identify all fillable fields, classify each ` +
      `(copy/narrative/table_fill/computed/conditional), detect dynamic tables and conditional sections, ` +
      `and generate descriptive hints.\n\nTemplate type: docx\n\n${config.content}`;
  }

  // Build tool schema with PDF-specific fields
  const fieldProperties: Record<string, unknown> = {
    id: { type: 'string' as const },
    placeholder: { type: 'string' as const, description: 'The placeholder text in the template (DOCX) or field label (PDF)' },
    contentType: {
      type: 'string' as const,
      enum: ['copy', 'narrative', 'table_fill', 'computed', 'conditional'],
    },
    hint: { type: 'string' as const },
    userHint: { type: 'string' as const },
    estimatedLength: { type: 'string' as const },
    // PDF-specific
    acroFieldName: { type: 'string' as const, description: 'AcroForm field name (for acroform PDFs)' },
    pdfPlacement: {
      type: 'object' as const,
      description: 'Exact coordinates for flat PDF field placement',
      properties: {
        page: { type: 'number' as const },
        x: { type: 'number' as const },
        y: { type: 'number' as const },
        width: { type: 'number' as const },
        fontSize: { type: 'number' as const },
        multiline: { type: 'boolean' as const },
      },
    },
  };

  return callGeminiWithRetry(
    {
      model: AGENT_MODELS.template,
      system: TEMPLATE_SYSTEM_PROMPT,
      userMessage,
      temperature: 0.3,
      maxOutputTokens: 8192,
      tools: [
        {
          name: 'save_template_schema',
          description: 'Save identified template fields with classification and hints',
          input_schema: {
            type: 'object' as const,
            properties: {
              templateType: {
                type: 'string' as const,
                enum: ['docx', 'acroform', 'flat_pdf'],
                description: 'Type of template analyzed',
              },
              fields: {
                type: 'array' as const,
                description: 'All fillable fields with id, type, hint, and optional PDF coordinates',
                items: {
                  type: 'object' as const,
                  properties: fieldProperties,
                  required: ['id', 'contentType', 'hint'],
                },
              },
              conditionalSections: {
                type: 'array' as const,
                description: 'Sections that only appear if a condition is met',
              },
              dynamicTables: {
                type: 'array' as const,
                description: 'Tables with variable row counts',
              },
              headerFooterPlaceholders: {
                type: 'array' as const,
                description: 'Placeholders in headers/footers',
              },
            },
            required: ['templateType', 'fields'],
          },
        },
      ],
      ...(inlineData.length > 0 ? { inlineData } : {}),
    },
    'save_template_schema'
  );
}
