/**
 * Library item processing — extract structured data from documents.
 * - template → template_schema (fields, sections)
 * - model → style_guide (tone, patterns, vocabulary)
 * - entity → entity_data (names, identifiers, dates, amounts)
 */

import type { LibraryItemType } from '@/lib/db/models/library-item';

export async function processLibraryItemData(
  type: LibraryItemType | string,
  rawText: string,
  filename: string
): Promise<Record<string, unknown>> {
  switch (type) {
    case 'template':
      return extractTemplateSchema(rawText, filename);
    case 'model':
      return extractStyleGuide(rawText, filename);
    case 'entity':
      return extractEntityData(rawText, filename);
    default:
      throw new Error(`Unknown library item type: ${type}`);
  }
}

async function extractTemplateSchema(
  rawText: string,
  filename: string
): Promise<Record<string, unknown>> {
  const { callAgentWithRetry } = await import('@/lib/ai/client');
  const { AGENT_MODELS } = await import('@/types/pipeline');

  const result = await callAgentWithRetry(
    {
      model: AGENT_MODELS.extract_analyze,
      max_tokens: 8000,
      system: `You are a template analysis agent. Given the text of a template document, identify all fillable fields, placeholders (like [___], {{field}}, or blank lines meant to be filled), and sections. Return structured JSON via the tool.`,
      messages: [
        {
          role: 'user',
          content: `Analyze this template document "${filename}" and extract its schema:\n\n${rawText.slice(0, 30000)}`,
        },
      ],
      tools: [
        {
          name: 'save_template_schema',
          description: 'Save the extracted template schema',
          input_schema: {
            type: 'object' as const,
            properties: {
              fields: {
                type: 'array',
                description: 'List of template fields/placeholders',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    label: { type: 'string' },
                    type: {
                      type: 'string',
                      enum: ['text', 'date', 'number', 'narrative', 'table_fill', 'computed', 'conditional'],
                    },
                    required: { type: 'boolean' },
                    hint: { type: 'string' },
                    section: { type: 'string' },
                  },
                  required: ['id', 'label', 'type'],
                },
              },
              sections: {
                type: 'array',
                description: 'Document sections',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    title: { type: 'string' },
                    type: { type: 'string' },
                  },
                },
              },
            },
            required: ['fields'],
          },
        },
      ],
      tool_choice: { type: 'tool' as const, name: 'save_template_schema' },
    },
    'save_template_schema',
    'library-template-schema'
  );

  return result.output as Record<string, unknown>;
}

async function extractStyleGuide(
  rawText: string,
  filename: string
): Promise<Record<string, unknown>> {
  const { callAgentWithRetry } = await import('@/lib/ai/client');
  const { AGENT_MODELS } = await import('@/types/pipeline');

  const result = await callAgentWithRetry(
    {
      model: AGENT_MODELS.extract_analyze,
      max_tokens: 8000,
      system: `You are a style analysis agent. Given a model document, extract its writing style, tone, rhetorical patterns, and domain vocabulary. CRITICAL: Do NOT extract any factual data (names, dates, amounts, CUI, IBAN). Only extract style and structural patterns.`,
      messages: [
        {
          role: 'user',
          content: `Analyze the writing style of this model document "${filename}":\n\n${rawText.slice(0, 30000)}`,
        },
      ],
      tools: [
        {
          name: 'save_style_guide',
          description: 'Save the extracted style guide',
          input_schema: {
            type: 'object' as const,
            properties: {
              tone: { type: 'string', description: 'Overall tone (formal, technical, etc.)' },
              language: { type: 'string', description: 'Detected language (en/ro)' },
              rhetorical_patterns: {
                type: 'array',
                items: { type: 'string' },
                description: 'Common rhetorical patterns found',
              },
              domain_vocabulary: {
                type: 'array',
                items: { type: 'string' },
                description: 'Domain-specific terms and phrases',
              },
              sentence_style: { type: 'string', description: 'Typical sentence structure' },
              formatting_conventions: {
                type: 'array',
                items: { type: 'string' },
                description: 'Formatting patterns (numbering, headings, etc.)',
              },
            },
            required: ['tone', 'language'],
          },
        },
      ],
      tool_choice: { type: 'tool' as const, name: 'save_style_guide' },
    },
    'save_style_guide',
    'library-style-guide'
  );

  return result.output as Record<string, unknown>;
}

async function extractEntityData(
  rawText: string,
  filename: string
): Promise<Record<string, unknown>> {
  const { callAgentWithRetry } = await import('@/lib/ai/client');
  const { AGENT_MODELS } = await import('@/types/pipeline');

  const result = await callAgentWithRetry(
    {
      model: AGENT_MODELS.extract_analyze,
      max_tokens: 8000,
      system: `You are a data extraction agent. Given a source document (ID card, contract, financial record, etc.), extract all factual data: names, dates, amounts, identification numbers (CUI, IBAN, CNP), addresses, and any other structured data. Organize by entity.`,
      messages: [
        {
          role: 'user',
          content: `Extract all entity data from this document "${filename}":\n\n${rawText.slice(0, 30000)}`,
        },
      ],
      tools: [
        {
          name: 'save_entity_data',
          description: 'Save the extracted entity data',
          input_schema: {
            type: 'object' as const,
            properties: {
              entity_name: { type: 'string', description: 'Primary entity name' },
              entity_role: {
                type: 'string',
                description: 'Role (beneficiary, contractor, subcontractor, authority, etc.)',
              },
              identifiers: {
                type: 'object',
                description: 'Identification numbers (CUI, IBAN, CNP, etc.)',
                additionalProperties: { type: 'string' },
              },
              contact: {
                type: 'object',
                description: 'Contact information',
                properties: {
                  address: { type: 'string' },
                  phone: { type: 'string' },
                  email: { type: 'string' },
                  representative: { type: 'string' },
                },
              },
              financial: {
                type: 'object',
                description: 'Financial data',
                additionalProperties: { type: 'string' },
              },
              dates: {
                type: 'object',
                description: 'Relevant dates',
                additionalProperties: { type: 'string' },
              },
              additional_data: {
                type: 'object',
                description: 'Any other structured data',
                additionalProperties: { type: 'string' },
              },
            },
            required: ['entity_name'],
          },
        },
      ],
      tool_choice: { type: 'tool' as const, name: 'save_entity_data' },
    },
    'save_entity_data',
    'library-entity-data'
  );

  return result.output as Record<string, unknown>;
}
