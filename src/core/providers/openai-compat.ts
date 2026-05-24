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
        const base = (baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '');
        const response = await fetch(`${base}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            max_tokens: 4096,
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: buildUserMessage(sessionText) },
            ],
          }),
        });
        if (!response.ok) {
          return [];
        }
        const data = (await response.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        const rawText = data.choices?.[0]?.message?.content ?? '';
        // Strip <think>...</think> blocks (Qwen3 and other reasoning models)
        // before searching for the JSON array to avoid matching brackets inside thinking.
        const text = rawText.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
          return [];
        }
        const parsed: unknown = JSON.parse(jsonMatch[0]);
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
