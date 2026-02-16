/**
 * Shared Anthropic client with retry logic for all AI agents.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { MessageCreateParamsNonStreaming } from '@anthropic-ai/sdk/resources/messages';
import type { ContentBlock } from '@anthropic-ai/sdk/resources/messages';

const MAX_RETRIES = 3;
const RETRY_DELAYS = [5000, 15000, 45000];

let client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!client) {
    client = new Anthropic();
  }
  return client;
}

export interface AgentResult {
  output: Record<string, unknown>;
  tokenUsage: {
    inputTokens: number;
    outputTokens: number;
  };
}

/**
 * Call the Anthropic API with retry logic and tool use extraction.
 * Retries on timeouts, rate limits, and server errors.
 * Re-prompts once if the model doesn't call the expected tool.
 */
export async function callAgentWithRetry(
  params: MessageCreateParamsNonStreaming,
  expectedToolName: string
): Promise<AgentResult> {
  const anthropic = getAnthropicClient();
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await anthropic.messages.create(params);

      // Extract tool use block
      const toolUse = response.content.find(
        (block: ContentBlock) => block.type === 'tool_use' && block.name === expectedToolName
      );

      if (toolUse && toolUse.type === 'tool_use') {
        return {
          output: toolUse.input as Record<string, unknown>,
          tokenUsage: {
            inputTokens: response.usage.input_tokens,
            outputTokens: response.usage.output_tokens,
          },
        };
      }

      // Tool not called — re-prompt once
      if (attempt === 0) {
        console.warn(`[AI] Model did not call ${expectedToolName}, re-prompting...`);
        const retryParams: MessageCreateParamsNonStreaming = {
          ...params,
          messages: [
            ...params.messages,
            {
              role: 'assistant' as const,
              content: response.content,
            },
            {
              role: 'user' as const,
              content: `You must use the ${expectedToolName} tool to save your results. Please call it now with the structured data.`,
            },
          ],
        };

        const retryResponse = await anthropic.messages.create(retryParams);
        const retryToolUse = retryResponse.content.find(
          (block: ContentBlock) => block.type === 'tool_use' && block.name === expectedToolName
        );

        if (retryToolUse && retryToolUse.type === 'tool_use') {
          return {
            output: retryToolUse.input as Record<string, unknown>,
            tokenUsage: {
              inputTokens: response.usage.input_tokens + retryResponse.usage.input_tokens,
              outputTokens: response.usage.output_tokens + retryResponse.usage.output_tokens,
            },
          };
        }

        // Extract any tool use as fallback
        const anyTool = retryResponse.content.find((block: ContentBlock) => block.type === 'tool_use');
        if (anyTool && anyTool.type === 'tool_use') {
          return {
            output: anyTool.input as Record<string, unknown>,
            tokenUsage: {
              inputTokens: response.usage.input_tokens + retryResponse.usage.input_tokens,
              outputTokens: response.usage.output_tokens + retryResponse.usage.output_tokens,
            },
          };
        }

        throw new Error(`Model failed to call ${expectedToolName} after re-prompt`);
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const status = (error as { status?: number }).status;

      // Rate limited
      if (status === 429) {
        const retryAfter = (error as { headers?: Record<string, string> }).headers?.['retry-after'];
        const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : (RETRY_DELAYS[attempt] ?? 5000);
        console.warn(`[AI] Rate limited, waiting ${waitMs}ms...`);
        await sleep(waitMs);
        continue;
      }

      // Server error or timeout — retry
      if (status && status >= 500) {
        if (attempt < MAX_RETRIES) {
          const delay = RETRY_DELAYS[attempt] ?? 5000;
          console.warn(`[AI] Server error (${status}), retrying in ${delay}ms...`);
          await sleep(delay);
          continue;
        }
      }

      // Overloaded
      if (status === 529) {
        if (attempt < MAX_RETRIES) {
          const delay = RETRY_DELAYS[attempt] ?? 5000;
          console.warn(`[AI] API overloaded, retrying in ${delay}ms...`);
          await sleep(delay);
          continue;
        }
      }

      // Non-retryable error
      throw lastError;
    }
  }

  throw lastError ?? new Error('AI call failed after retries');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
