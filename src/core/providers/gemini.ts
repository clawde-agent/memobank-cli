import type { CaptureProvider } from '../capture-provider';
import type { ExtractionResult } from '../../types';
import { SYSTEM_PROMPT, buildUserMessage, validateExtractionResult } from '../capture-provider';

export function createGeminiProvider(apiKey: string, model: string): CaptureProvider {
  return {
    async extract(sessionText: string): Promise<ExtractionResult[]> {
      let GoogleGenerativeAI: new (key: string) => {
        getGenerativeModel: (opts: { model: string }) => {
          generateContent: (opts: {
            systemInstruction: string;
            contents: { role: string; parts: { text: string }[] }[];
          }) => Promise<{ response: { text: () => string } }>;
        };
      };
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        ({ GoogleGenerativeAI } = require('@google/generative-ai'));
      } catch {
        throw new Error(
          'Gemini requires @google/generative-ai — run: npm install @google/generative-ai'
        );
      }
      try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const genModel = genAI.getGenerativeModel({ model });
        const result = await genModel.generateContent({
          systemInstruction: SYSTEM_PROMPT,
          contents: [{ role: 'user', parts: [{ text: buildUserMessage(sessionText) }] }],
        });
        const text = result.response.text();
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
