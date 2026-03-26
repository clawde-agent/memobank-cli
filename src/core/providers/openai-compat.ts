import OpenAI from 'openai';
import type { CaptureProvider } from '../capture-provider';
import type { ExtractionResult } from '../../types';
import { SYSTEM_PROMPT, buildUserMessage, validateExtractionResult } from '../capture-provider';

export function createOpenAICompatProvider(
  apiKey: string,
  model: string,
  baseUrl?: string
): CaptureProvider {
  return {
    async extract(sessionText: string): Promise<ExtractionResult[]> {
      try {
        const client = new OpenAI({
          apiKey,
          ...(baseUrl ? { baseURL: baseUrl } : {}),
        });
        const response = await client.chat.completions.create({
          model,
          max_tokens: 4096,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: buildUserMessage(sessionText) },
          ],
        });
        const text = response.choices[0]?.message?.content ?? '';
        const parsed: unknown = JSON.parse(text);
        if (!Array.isArray(parsed)) {
          return [];
        }
        return (parsed as unknown[])
          .map(validateExtractionResult)
          .filter((r): r is ExtractionResult => r !== null);
      } catch {
        return [];
      }
    },
  };
}
