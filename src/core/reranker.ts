import type { RecallResult, RerankerProvider } from '../types';
import { RERANKER_REGISTRY } from './providers/reranker-registry';

export type { RerankerProvider } from '../types';

export interface RerankerConfig {
  provider: RerankerProvider;
  model?: string;
  top_n?: number;
  apiKey?: string;
  baseUrl?: string;
}

export async function rerank(
  query: string,
  results: RecallResult[],
  config: RerankerConfig
): Promise<RecallResult[]> {
  const descriptor = RERANKER_REGISTRY.get(config.provider);
  if (!descriptor) throw new Error(`Unknown reranker provider: ${config.provider}`);

  const model = config.model ?? descriptor.defaultModel;
  const top_n = config.top_n ?? results.length;
  const documents = results.map(
    (r) => `${r.memory.name}: ${r.memory.description}\n${r.memory.content.slice(0, 300)}`
  );

  const apiKey =
    config.apiKey ?? (descriptor.apiKeyEnv ? process.env[descriptor.apiKeyEnv] : undefined);
  if (descriptor.requiresApiKey && !apiKey) {
    throw new Error(`No API key found for reranker provider: ${config.provider}`);
  }
  if (descriptor.requiresApiKey && apiKey && apiKey.length < 10) {
    throw new Error(`Invalid API key format for ${config.provider}. Key too short.`);
  }

  return descriptor.rerank(query, results, documents, model, top_n, apiKey, config.baseUrl);
}
