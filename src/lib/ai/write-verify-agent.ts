/**
 * Agent 2 — Write & Verify (Gemini 2.5 Pro)
 *
 * Combines 2 logical stages into a single API call:
 *   - Writing Agent (text generation)
 *   - Verification Agent (quality checks)
 *
 * Input: Agent 1 JSON (project_data + style_guide + field_map)
 * Output: field completions + quality report
 */

import { AGENT_MODELS } from '@/types/pipeline';
import { WRITE_VERIFY_SYSTEM_PROMPT } from './prompts/write-verify';
import { callGeminiWithRetry, type AgentResult } from './gemini-client';

export interface WriteVerifyInput {
  projectData: Record<string, unknown>;
  styleGuide: Record<string, unknown>;
  fieldMap: Record<string, unknown>;
  projectId?: string;
}

export async function runWriteVerifyAgent(input: WriteVerifyInput): Promise<AgentResult> {
  const styleSection = Object.keys(input.styleGuide).length > 0
    ? `\n\nStyle Guide (STYLE ONLY — patterns and vocabulary, no factual data):\n${JSON.stringify(input.styleGuide, null, 2)}`
    : '\n\nStyle Guide: Not available (no model document was provided). Use formal Romanian style.';

  const userMessage =
    `Generate text for ALL template fields and verify quality in a single pass.\n\n` +
    `For each field in the field_map:\n` +
    `- "copy" fields: exact value from project_data\n` +
    `- "narrative" fields: professional text using project_data + style guidance\n` +
    `- "computed" fields: calculate using the formula\n` +
    `- "conditional" fields: evaluate condition, generate if true\n` +
    `- "table_fill" fields: populate from structured data\n` +
    `- Fields with needsMultipleSuggestions=true: one suggestion per entity\n\n` +
    `After generating, verify data integrity, formatting, and coherence.\n\n` +
    `Use save_write_verify to return all results.\n\n` +
    `Project Data (source of truth for ALL factual data):\n${JSON.stringify(input.projectData, null, 2)}\n\n` +
    `Field Map (template fields with classification and data sources):\n${JSON.stringify(input.fieldMap, null, 2)}` +
    `${styleSection}`;

  return callGeminiWithRetry(
    {
      model: AGENT_MODELS.write_verify,
      system: WRITE_VERIFY_SYSTEM_PROMPT,
      userMessage,
      temperature: 0.4,
      maxOutputTokens: 16384,
      tools: [
        {
          name: 'save_write_verify',
          description: 'Save generated field values with quality scores and verification report',
          input_schema: {
            type: 'object' as const,
            properties: {
              fields: {
                type: 'object' as const,
                description: 'Generated values per field ID',
              },
              quality_scores: {
                type: 'object' as const,
                description: 'Per-field scores: { fieldId: { accuracy, style, completeness, coherence } } (0-100 each)',
              },
              global_score: {
                type: 'number' as const,
                description: 'Overall quality score 0-100',
              },
              errors: {
                type: 'array' as const,
                description: 'Critical issues that MUST be fixed',
                items: {
                  type: 'object' as const,
                  properties: {
                    fieldId: { type: 'string' as const },
                    issue: { type: 'string' as const },
                    severity: { type: 'string' as const, enum: ['critical', 'error'] },
                    suggestedFix: { type: 'string' as const },
                  },
                  required: ['fieldId', 'issue', 'severity'],
                },
              },
              warnings: {
                type: 'array' as const,
                description: 'Issues that SHOULD be reviewed',
                items: {
                  type: 'object' as const,
                  properties: {
                    fieldId: { type: 'string' as const },
                    issue: { type: 'string' as const },
                  },
                  required: ['fieldId', 'issue'],
                },
              },
              data_leakage_check: {
                type: 'object' as const,
                description: 'Model data leakage verification results',
                properties: {
                  passed: { type: 'boolean' as const },
                  violations: { type: 'array' as const, items: { type: 'string' as const } },
                },
                required: ['passed'],
              },
            },
            required: ['fields', 'quality_scores', 'global_score'],
          },
        },
      ],
    },
    'save_write_verify',
    'WriteVerify',
    input.projectId
  );
}
