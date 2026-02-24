/**
 * Shared Google Gemini client with retry logic and cost tracking for all AI agents.
 *
 * Replaces the Anthropic client (client.ts) with Google Generative AI.
 * All agents use this client for structured output via function calling.
 */

import {
  GoogleGenerativeAI,
  type GenerativeModel,
  type Part,
  FunctionCallingMode,
  type GenerateContentResult,
} from '@google/generative-ai';

const MAX_RETRIES = 3;
const RETRY_DELAYS = [5000, 15000, 45000];

/** Per-token pricing (USD) — Gemini 2.5 */
const PRICES: Record<string, { input: number; output: number }> = {
  'gemini-2.5-flash': { input: 0.15 / 1_000_000, output: 0.60 / 1_000_000 },
  'gemini-2.5-pro': { input: 1.25 / 1_000_000, output: 10 / 1_000_000 },
  'gemini-2.0-flash': { input: 0.10 / 1_000_000, output: 0.40 / 1_000_000 },
};

let genAI: GoogleGenerativeAI | null = null;

export function getGeminiClient(): GoogleGenerativeAI {
  if (!genAI) {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) throw new Error('GOOGLE_AI_API_KEY is not set');
    genAI = new GoogleGenerativeAI(apiKey);
  }
  return genAI;
}

export interface AgentResult {
  output: Record<string, unknown>;
  tokenUsage: {
    inputTokens: number;
    outputTokens: number;
  };
}

function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const baseModel = model.replace(/-preview.*$/, '');
  const pricing = PRICES[baseModel] ?? PRICES['gemini-2.5-flash']!;
  return inputTokens * pricing.input + outputTokens * pricing.output;
}

async function logAndAccumulateCost(
  label: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
  projectId?: string
): Promise<void> {
  const cost = calculateCost(model, inputTokens, outputTokens);
  console.log(
    `[${label}] input: ${inputTokens} tokens, output: ${outputTokens} tokens, cost: $${cost.toFixed(4)} (${model})`
  );

  if (projectId && cost > 0) {
    try {
      const { connectToDatabase, Project } = await import('@/lib/db');
      await connectToDatabase();
      await Project.findByIdAndUpdate(projectId, { $inc: { aiCost: cost } });
    } catch (err) {
      console.warn('[AI] Failed to accumulate cost:', err);
    }
  }
}

/**
 * Convert a tool schema from Anthropic format to Gemini FunctionDeclarations format.
 * Gemini uses SchemaType enum strings instead of literal 'object'/'string' etc.
 */
function convertToolSchema(
  tools: Array<{ name: string; description: string; input_schema: Record<string, unknown> }>
): Record<string, unknown> {
  return {
    functionDeclarations: tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: convertSchemaType(tool.input_schema),
    })),
  };
}

function convertSchemaType(schema: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  if (schema.type) {
    result.type = (schema.type as string).toUpperCase();
  }
  if (schema.description) result.description = schema.description;
  if (schema.enum) result.enum = schema.enum;
  if (schema.required) result.required = schema.required;

  if (schema.properties) {
    const props: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(schema.properties as Record<string, unknown>)) {
      props[key] = convertSchemaType(value as Record<string, unknown>);
    }
    result.properties = props;
  }

  if (schema.items) {
    result.items = convertSchemaType(schema.items as Record<string, unknown>);
  }

  return result;
}

export interface GeminiCallParams {
  model: string;
  system: string;
  userMessage: string;
  tools: Array<{ name: string; description: string; input_schema: Record<string, unknown> }>;
  temperature?: number;
  maxOutputTokens?: number;
  /** Inline file data (for document parsing) */
  inlineData?: Array<{ mimeType: string; data: string }>;
}

/**
 * Call the Gemini API with retry logic and function calling extraction.
 * Retries on timeouts, rate limits, and server errors.
 * Re-prompts once if the model doesn't call the expected function.
 */
export async function callGeminiWithRetry(
  params: GeminiCallParams,
  expectedFunctionName: string,
  agentLabel?: string,
  projectId?: string
): Promise<AgentResult> {
  const client = getGeminiClient();
  const label = agentLabel ?? expectedFunctionName;

  const geminiTools = convertToolSchema(params.tools);

  const model: GenerativeModel = client.getGenerativeModel({
    model: params.model,
    systemInstruction: params.system,
    tools: [geminiTools] as never,
    toolConfig: {
      functionCallingConfig: {
        mode: FunctionCallingMode.ANY,
        allowedFunctionNames: [expectedFunctionName],
      },
    },
    generationConfig: {
      temperature: params.temperature ?? 0.3,
      maxOutputTokens: params.maxOutputTokens ?? 16384,
    },
  });

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Build content parts
      const parts: Part[] = [];

      // Add inline document data if present
      if (params.inlineData) {
        for (const data of params.inlineData) {
          parts.push({
            inlineData: {
              mimeType: data.mimeType,
              data: data.data,
            },
          });
        }
      }

      // Add text message
      parts.push({ text: params.userMessage });

      const response: GenerateContentResult = await model.generateContent(parts);
      const result = response.response;

      // Extract token usage
      const usage = result.usageMetadata;
      const inputTokens = usage?.promptTokenCount ?? 0;
      const outputTokens = usage?.candidatesTokenCount ?? 0;

      // Look for function call in the response
      const candidate = result.candidates?.[0];
      if (candidate?.content?.parts) {
        for (const part of candidate.content.parts) {
          if (part.functionCall && part.functionCall.name === expectedFunctionName) {
            await logAndAccumulateCost(label, params.model, inputTokens, outputTokens, projectId);
            return {
              output: (part.functionCall.args ?? {}) as Record<string, unknown>,
              tokenUsage: { inputTokens, outputTokens },
            };
          }
        }

        // Any function call as fallback
        for (const part of candidate.content.parts) {
          if (part.functionCall) {
            console.warn(`[AI] Expected ${expectedFunctionName}, got ${part.functionCall.name}. Using anyway.`);
            await logAndAccumulateCost(label, params.model, inputTokens, outputTokens, projectId);
            return {
              output: (part.functionCall.args ?? {}) as Record<string, unknown>,
              tokenUsage: { inputTokens, outputTokens },
            };
          }
        }
      }

      // No function call — re-prompt once
      if (attempt === 0) {
        console.warn(`[AI] Model did not call ${expectedFunctionName}, re-prompting...`);

        const chat = model.startChat({
          history: [
            { role: 'user', parts },
            { role: 'model', parts: candidate?.content?.parts ?? [{ text: 'I will analyze the content.' }] },
          ],
        });

        const retryResponse = await chat.sendMessage(
          `You must call the ${expectedFunctionName} function with the structured data. Call it now.`
        );
        const retryResult = retryResponse.response;
        const retryUsage = retryResult.usageMetadata;
        const totalInput = inputTokens + (retryUsage?.promptTokenCount ?? 0);
        const totalOutput = outputTokens + (retryUsage?.candidatesTokenCount ?? 0);

        const retryCandidate = retryResult.candidates?.[0];
        if (retryCandidate?.content?.parts) {
          for (const part of retryCandidate.content.parts) {
            if (part.functionCall) {
              await logAndAccumulateCost(label, params.model, totalInput, totalOutput, projectId);
              return {
                output: (part.functionCall.args ?? {}) as Record<string, unknown>,
                tokenUsage: { inputTokens: totalInput, outputTokens: totalOutput },
              };
            }
          }
        }

        throw new Error(`Model failed to call ${expectedFunctionName} after re-prompt`);
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const errorMessage = lastError.message.toLowerCase();

      // Rate limit
      if (errorMessage.includes('429') || errorMessage.includes('rate') || errorMessage.includes('quota')) {
        if (attempt < MAX_RETRIES) {
          const delay = RETRY_DELAYS[attempt] ?? 5000;
          console.warn(`[AI] Rate limited, waiting ${delay}ms...`);
          await sleep(delay);
          continue;
        }
      }

      // Server error
      if (errorMessage.includes('500') || errorMessage.includes('503') || errorMessage.includes('internal')) {
        if (attempt < MAX_RETRIES) {
          const delay = RETRY_DELAYS[attempt] ?? 5000;
          console.warn(`[AI] Server error, retrying in ${delay}ms...`);
          await sleep(delay);
          continue;
        }
      }

      throw lastError;
    }
  }

  throw lastError ?? new Error('Gemini call failed after retries');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
