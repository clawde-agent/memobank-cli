/**
 * Reranker module
 * Supports Jina AI and Cohere reranking APIs
 */
import type { RecallResult } from '../types';
export type RerankerProvider = 'jina' | 'cohere';
export interface RerankerConfig {
    provider: RerankerProvider;
    model?: string;
    top_n?: number;
    apiKey?: string;
}
export declare function rerank(query: string, results: RecallResult[], config: RerankerConfig): Promise<RecallResult[]>;
//# sourceMappingURL=reranker.d.ts.map