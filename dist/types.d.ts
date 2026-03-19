/**
 * Shared TypeScript interfaces for memobank-cli
 */
export type MemoryType = 'lesson' | 'decision' | 'workflow' | 'architecture';
export type Engine = 'text' | 'lancedb';
export type Confidence = 'low' | 'medium' | 'high';
export type MemoryScope = 'personal' | 'team' | 'all';
export interface MemoryFile {
    path: string;
    name: string;
    type: MemoryType;
    description: string;
    tags: string[];
    created: string;
    updated?: string;
    review_after?: string;
    confidence?: Confidence;
    content: string;
    scope?: MemoryScope;
}
export interface ScoreBreakdown {
    keyword: number;
    tags: number;
    recency: number;
}
export interface RecallResult {
    memory: MemoryFile;
    score: number;
    scoreBreakdown?: ScoreBreakdown;
}
export interface TeamConfig {
    remote: string;
    auto_sync: boolean;
    branch: string;
}
export interface MemoConfig {
    project: {
        name: string;
        description?: string;
    };
    memory: {
        token_budget: number;
        top_k: number;
    };
    embedding: {
        engine: Engine;
        provider?: string;
        model?: string;
        base_url?: string;
        dimensions?: number;
    };
    search: {
        use_tags: boolean;
        use_summary: boolean;
    };
    review: {
        enabled: boolean;
    };
    team?: TeamConfig;
    reranker?: {
        enabled: boolean;
        provider: 'jina' | 'cohere';
        model?: string;
        top_n?: number;
    };
}
export interface ExtractionResult {
    name: string;
    type: MemoryType;
    description: string;
    tags: string[];
    confidence: Confidence;
    content: string;
}
//# sourceMappingURL=types.d.ts.map