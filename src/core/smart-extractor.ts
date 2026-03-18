/**
 * Smart Extractor module
 * LLM-powered extraction for memo capture
 * Ported from memory-lancedb-pro
 */

import { ExtractionResult } from '../types';

const SYSTEM_PROMPT = `You extract structured memories from AI coding session summaries.
Return a JSON array. Each item:
{
  "name": "slug-format",
  "type": "lesson|decision|workflow|architecture",
  "description": "one sentence summary",
  "tags": ["tag1", "tag2"],
  "confidence": "low|medium|high",
  "content": "markdown body with the full insight"
}
Extract only significant learnings. Skip trivial actions. Max 3 items per session.`;

/**
 * Extract memories from session text using LLM
 * Falls back to no-op if no API key is configured
 */
export async function extract(
  sessionText: string,
  apiKey?: string,
  model: string = 'claude-3-5-sonnet-20241022'
): Promise<ExtractionResult[]> {
  // Check for API key
  const effectiveApiKey = apiKey || process.env.ANTHROPIC_API_KEY;
  if (!effectiveApiKey) {
    console.warn('No API key configured. Skipping LLM extraction.');
    return [];
  }

  try {
    // Call Claude API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': effectiveApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Extract memories from this session:\n\n${sessionText}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`LLM extraction failed: ${error}`);
      return [];
    }

    const data = await response.json() as any;
    const content = data.content[0]?.text || '';

    // Parse JSON from response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error('Could not parse JSON from LLM response');
      return [];
    }

    const extracted = JSON.parse(jsonMatch[0]) as ExtractionResult[];

    // Validate and filter
    return extracted.filter(item => {
      return (
        item.name &&
        item.type &&
        item.description &&
        Array.isArray(item.tags) &&
        item.confidence &&
        item.content
      );
    });
  } catch (error) {
    console.error(`LLM extraction error: ${(error as Error).message}`);
    return [];
  }
}
