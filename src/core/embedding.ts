/**
 * Embedding Generator
 * Generates vector embeddings using OpenAI-compatible APIs
 * Supports: OpenAI, Azure, Ollama, and other compatible providers
 */

import { OpenAI } from 'openai';

import type { EmbeddingProvider } from '../types';
export type { EmbeddingProvider };
import { EMBEDDING_REGISTRY, lookupDimensions } from './providers/embedding-registry';

export interface EmbeddingConfig {
  provider: EmbeddingProvider;
  model: string; // e.g. 'text-embedding-3-small' or 'mxbai-embed-large'
  dimensions: number; // e.g. 1536
  baseUrl?: string; // Optional custom API endpoint
  apiKey?: string; // Optional (not needed for local Ollama)
}

export class EmbeddingGenerator {
  private client: OpenAI;
  private config: EmbeddingConfig;

  constructor(config: EmbeddingConfig) {
    this.config = config;

    // Local providers (Ollama, llama.cpp) don't require a real API key
    const apiKey =
      config.apiKey ||
      (config.provider === 'ollama' || config.provider === 'llamacpp' ? 'local' : '');

    this.client = new OpenAI({
      apiKey,
      baseURL: this.normalizeBaseUrl(config.baseUrl, config.provider),
    });
  }

  getDimensions(): number {
    return this.config.dimensions;
  }

  private normalizeBaseUrl(baseUrl: string | undefined, provider: EmbeddingProvider): string {
    const fallback =
      EMBEDDING_REGISTRY.get(provider)?.defaultBaseUrl ?? 'https://api.openai.com/v1';
    if (!baseUrl) return fallback;
    // OpenAI-compatible providers need a /v1 path; append if omitted.
    if (!baseUrl.endsWith('/v1') && !baseUrl.includes('/v1/')) {
      return baseUrl.replace(/\/$/, '') + '/v1';
    }
    return baseUrl;
  }

  /**
   * Generate embedding for a single text
   * @param text - Input text to embed
   * @returns Vector embedding as number array
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.client.embeddings.create({
        model: this.config.model,
        input: text,
      });

      const embedding = response.data?.[0]?.embedding;
      if (!embedding) {
        throw new Error('No embedding returned');
      }
      return embedding;
    } catch (error) {
      throw new Error(`Failed to generate embedding: ${(error as Error).message}`);
    }
  }

  /**
   * Generate embeddings for multiple texts in batch
   * @param texts - Array of input texts
   * @returns Array of vector embeddings
   */
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    try {
      const response = await this.client.embeddings.create({
        model: this.config.model,
        input: texts,
      });

      // Sort by index to ensure order matches input
      const sorted = response.data.sort((a, b) => a.index - b.index);
      return sorted.map((item) => item.embedding);
    } catch (error) {
      throw new Error(`Failed to generate embeddings: ${(error as Error).message}`);
    }
  }

  /**
   * Get embedding dimensions by querying the model
   * Useful when dimensions are unknown for custom models
   */
  async detectDimensions(): Promise<number> {
    try {
      const embedding = await this.generateEmbedding('test');
      return embedding.length;
    } catch (error) {
      throw new Error(`Failed to detect dimensions: ${(error as Error).message}`);
    }
  }

  static fromMemoConfig(config: {
    embedding: {
      provider?: string;
      model?: string;
      base_url?: string;
      dimensions?: number;
    };
  }): EmbeddingConfig | null {
    const { embedding } = config;
    const provider = (embedding.provider as EmbeddingProvider) || 'openai';
    const descriptor = EMBEDDING_REGISTRY.get(provider);

    const apiKey = descriptor?.apiKeyEnv ? process.env[descriptor.apiKeyEnv] : undefined;
    if (descriptor?.requiresApiKey && !apiKey) return null;

    const model = embedding.model ?? descriptor?.defaultModel ?? 'text-embedding-3-small';
    const dimensions = embedding.dimensions ?? lookupDimensions(model);

    return { provider, model, dimensions, baseUrl: embedding.base_url, apiKey };
  }
}
