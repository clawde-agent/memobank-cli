/**
 * Reranker module
 * Supports Jina AI and Cohere reranking APIs
 */

import { RecallResult } from '../types';

export type RerankerProvider = 'jina' | 'cohere';

export interface RerankerConfig {
  provider: RerankerProvider;
  model?: string;
  top_n?: number;
  apiKey?: string;
}

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

  // Final attempt - return whatever we get
  return fetch(url, options);
}

function getApiKey(provider: RerankerProvider, override?: string): string {
  if (override) return override;
  if (provider === 'jina') return process.env.JINA_API_KEY || '';
  if (provider === 'cohere') return process.env.COHERE_API_KEY || '';
  return '';
}

function getDefaultModel(provider: RerankerProvider): string {
  if (provider === 'jina') return 'jina-reranker-v2-base-multilingual';
  return 'rerank-v3.5';
}

export async function rerank(
  query: string,
  results: RecallResult[],
  config: RerankerConfig
): Promise<RecallResult[]> {
  const apiKey = getApiKey(config.provider, config.apiKey);
  
  // Validate API key format before making network calls
  if (!apiKey) {
    throw new Error(`No API key found for reranker provider: ${config.provider}`);
  }
  if (apiKey.length < 10) {
    throw new Error(`Invalid API key format for ${config.provider}. Key too short.`);
  }

  const model = config.model || getDefaultModel(config.provider);
  const top_n = config.top_n ?? results.length;
  const documents = results.map(r => `${r.memory.name}: ${r.memory.description}\n${r.memory.content.slice(0, 300)}`);

  if (config.provider === 'jina') {
    return rerankJina(query, results, documents, model, top_n, apiKey);
  } else {
    return rerankCohere(query, results, documents, model, top_n, apiKey);
  }
}

async function rerankJina(
  query: string,
  results: RecallResult[],
  documents: string[],
  model: string,
  top_n: number,
  apiKey: string
): Promise<RecallResult[]> {
  const response = await fetchWithRetry('https://api.jina.ai/v1/rerank', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model, query, documents, top_n }),
  });

  if (!response.ok) throw new Error(`Jina rerank failed: ${response.status} ${await response.text()}`);
  const data = await response.json() as { results: Array<{ index: number; relevance_score: number }> };

  return data.results.map(r => ({
    ...results[r.index],
    score: r.relevance_score,
  }));
}

async function rerankCohere(
  query: string,
  results: RecallResult[],
  documents: string[],
  model: string,
  top_n: number,
  apiKey: string
): Promise<RecallResult[]> {
  const response = await fetchWithRetry('https://api.cohere.com/v2/rerank', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model, query, documents, top_n, return_documents: false }),
  });

  if (!response.ok) throw new Error(`Cohere rerank failed: ${response.status} ${await response.text()}`);
  const data = await response.json() as { results: Array<{ index: number; relevance_score: number }> };

  return data.results.map(r => ({
    ...results[r.index],
    score: r.relevance_score,
  }));
}
