/**
 * Smart Extractor module
 * LLM-powered extraction for memo capture
 * Ported from memory-lancedb-pro
 */

import type { ExtractionResult } from '../types';

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

## Extraction Criteria

### DO Extract (High Value):
- Problems solved and solutions found
- Architectural decisions and rationale
- Workflows and processes discovered
- Best practices and patterns learned
- Bug fixes with root cause analysis
- Performance optimizations
- Security considerations
- Trade-offs and their reasoning

### DO NOT Extract (Low Value):
- Simple file operations (opened, closed, saved)
- Running commands (test, build, lint)
- Greetings and acknowledgments
- Trivial changes (typos, formatting)
- Questions without answers
- Meta-discussions about the AI

Extract only significant learnings. Skip trivial actions. Max 3 items per session.`;

/**
 * Fetch with exponential backoff retry for transient failures
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries: number = 3
): Promise<Response> {
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  for (let i = 0; i < maxRetries; i++) {
    const response = await fetch(url, options);

    // Success or client error (4xx) - don't retry
    if (response.ok || response.status < 500) {
      return response;
    }

    // Server error (5xx) - retry with exponential backoff
    if (i < maxRetries - 1) {
      const waitTime = Math.pow(2, i) * 1000; // 1s, 2s, 4s
      console.warn(`API request failed (status: ${response.status}), retrying in ${waitTime}ms...`);
      await sleep(waitTime);
    }
  }

  // Final attempt - return whatever we get (will be handled by caller)
  return fetch(url, options);
}

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
    // Call Claude API with timeout and retry
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

    const response = await fetchWithRetry('https://api.anthropic.com/v1/messages', {
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
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `LLM extraction failed: ${response.status} ${response.statusText}`;
      
      // Provide helpful error messages for common issues
      if (response.status === 401) {
        errorMessage += ' - Invalid API key. Check your ANTHROPIC_API_KEY environment variable.';
      } else if (response.status === 429) {
        errorMessage += ' - Rate limit exceeded or insufficient credits.';
      } else if (response.status === 500) {
        errorMessage += ' - Anthropic API server error. Try again later.';
      } else if (errorText) {
        errorMessage += ` - ${errorText}`;
      }
      
      console.error(errorMessage);
      return [];
    }

    const data = await response.json();
    const content = (data as any).content?.[0]?.text || '';

    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error('Could not parse JSON from LLM response');
      return [];
    }

    const extracted = JSON.parse(jsonMatch[0]) as ExtractionResult[];

    // Validate and filter
    return extracted.filter((item) => {
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
    if ((error as Error).name === 'AbortError') {
      console.error('LLM extraction timed out after 30 seconds');
    } else {
      console.error(`LLM extraction error: ${(error as Error).message}`);
    }
    return [];
  }
}
