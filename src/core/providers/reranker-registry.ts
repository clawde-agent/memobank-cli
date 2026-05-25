import type { RecallResult, RerankerProvider } from '../../types';

export interface RerankerDescriptor {
  readonly name: RerankerProvider;
  readonly label: string;
  readonly requiresApiKey: boolean;
  readonly apiKeyEnv?: string;
  readonly defaultModel: string;
  readonly defaultBaseUrl?: string;
  rerank(
    query: string,
    results: RecallResult[],
    documents: string[],
    model: string,
    top_n: number,
    apiKey?: string,
    baseUrl?: string
  ): Promise<RecallResult[]>;
}

export const RERANKER_REGISTRY = new Map<RerankerProvider, RerankerDescriptor>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries: number = 3
): Promise<Response> {
  const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
  for (let i = 0; i < maxRetries; i++) {
    const response = await fetch(url, options);
    if (response.ok || response.status < 500) return response;
    if (i < maxRetries - 1) {
      const waitTime = Math.pow(2, i) * 1000;
      console.warn(`API request failed (status: ${response.status}), retrying in ${waitTime}ms...`);
      await sleep(waitTime);
    }
  }
  return fetch(url, options);
}

function mapResults(
  results: RecallResult[],
  ranked: Array<{ index: number; relevance_score: number }>
): RecallResult[] {
  return ranked.map((r) => ({ ...results[r.index], score: r.relevance_score }));
}

// ---------------------------------------------------------------------------
// jina
// ---------------------------------------------------------------------------
RERANKER_REGISTRY.set('jina', {
  name: 'jina',
  label: 'Jina AI',
  requiresApiKey: true,
  apiKeyEnv: 'JINA_API_KEY',
  defaultModel: 'jina-reranker-v2-base-multilingual',
  async rerank(query, results, documents, model, top_n, apiKey) {
    const response = await fetchWithRetry('https://api.jina.ai/v1/rerank', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, query, documents, top_n }),
    });
    if (!response.ok) {
      throw new Error(`Jina rerank failed: ${response.status} ${await response.text()}`);
    }
    const data = (await response.json()) as {
      results: Array<{ index: number; relevance_score: number }>;
    };
    return mapResults(results, data.results);
  },
});

// ---------------------------------------------------------------------------
// cohere
// ---------------------------------------------------------------------------
RERANKER_REGISTRY.set('cohere', {
  name: 'cohere',
  label: 'Cohere',
  requiresApiKey: true,
  apiKeyEnv: 'COHERE_API_KEY',
  defaultModel: 'rerank-v3.5',
  async rerank(query, results, documents, model, top_n, apiKey) {
    const response = await fetchWithRetry('https://api.cohere.com/v2/rerank', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, query, documents, top_n, return_documents: false }),
    });
    if (!response.ok) {
      throw new Error(`Cohere rerank failed: ${response.status} ${await response.text()}`);
    }
    const data = (await response.json()) as {
      results: Array<{ index: number; relevance_score: number }>;
    };
    return mapResults(results, data.results);
  },
});

// ---------------------------------------------------------------------------
// omlx
// ---------------------------------------------------------------------------
RERANKER_REGISTRY.set('omlx', {
  name: 'omlx',
  label: 'oMLX (local, Apple Silicon)',
  requiresApiKey: false,
  defaultModel: 'ModernBERT',
  defaultBaseUrl: 'http://localhost:8000/v1',
  async rerank(query, results, documents, model, top_n, _apiKey, baseUrl) {
    const base = (baseUrl ?? 'http://localhost:8000/v1').replace(/\/$/, '');
    const response = await fetchWithRetry(`${base}/rerank`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, query, documents, top_n }),
    });
    if (!response.ok) {
      throw new Error(`oMLX rerank failed: ${response.status} ${await response.text()}`);
    }
    const data = (await response.json()) as {
      results: Array<{ index: number; relevance_score: number }>;
    };
    return mapResults(results, data.results);
  },
});
