import type { CaptureProvider } from '../capture-provider';
import type { ExtractionResult } from '../../types';
import { SYSTEM_PROMPT, buildUserMessage, validateExtractionResult } from '../capture-provider';

export function createAnthropicProvider(apiKey: string, model: string): CaptureProvider {
  return {
    async extract(sessionText: string): Promise<ExtractionResult[]> {
      try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model,
            max_tokens: 4096,
            system: SYSTEM_PROMPT,
            messages: [{ role: 'user', content: buildUserMessage(sessionText) }],
          }),
        });
        if (!response.ok) {
          return [];
        }
        const data = (await response.json()) as { content?: { text: string }[] };
        const text = data.content?.[0]?.text ?? '';
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
