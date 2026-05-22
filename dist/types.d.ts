export type MemoryType = 'lesson' | 'decision' | 'workflow' | 'architecture';
export type Engine = 'text' | 'lancedb';
export type LlmProvider = 'anthropic' | 'openai' | 'ollama' | 'gemini' | 'openrouter';
export type CaptureProviderName = 'anthropic' | 'openai' | 'gemini' | 'openrouter' | 'ollama';
export interface CaptureConfig {
    provider: CaptureProviderName;
    model: string;
    apiKey?: string;
    baseUrl?: string;
}
export interface LlmConfig {
    provider: LlmProvider;
    model: string;
    base_url?: string;
    api_key_env?: string;
}
export type Confidence = 'low' | 'medium' | 'high';
export type MemoryScope = 'personal' | 'project' | 'workspace';
export type Status = 'experimental' | 'active' | 'needs-review' | 'deprecated';
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
    status?: Status;
    content: string;
    scope?: MemoryScope;
    project?: string;
    codeRefs?: string[];
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
export interface WorkspaceConfig {
    remote: string;
    enabled?: boolean;
    auto_sync: boolean;
    branch: string;
    path?: string;
}
export interface LifecycleConfig {
    experimental_ttl_days: number;
    active_to_review_days: number;
    review_to_deprecated_days: number;
    review_recall_threshold: number;
    decay_window_days: number;
}
export interface MemoConfig {
    project: {
        name: string;
        description?: string;
        project_id?: string;
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
    lifecycle?: LifecycleConfig;
    workspace?: WorkspaceConfig;
    capture?: {
        provider: CaptureProviderName;
        model: string;
        base_url?: string;
    };
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
export interface MemoryNodeInput {
    id: string;
    file_path: string;
    content: string;
    type: string;
    tags: string[];
    status: string;
    content_hash: string;
    updated_at: string;
}
export type SymbolKind = 'function' | 'class' | 'interface' | 'type' | 'const' | 'method';
export type EdgeKind = 'calls' | 'imports' | 'inherits';
export type IndexedLanguage = 'typescript' | 'javascript' | 'python' | 'go' | 'rust' | 'yaml' | 'csharp';
export interface CodeSymbol {
    name: string;
    qualifiedName: string;
    kind: SymbolKind;
    file: string;
    lineStart: number;
    lineEnd: number;
    signature?: string;
    docstring?: string;
    isExported: boolean;
    parentName?: string;
    memoryRefs?: string[];
    hash?: string;
}
export interface CodeEdge {
    sourceName: string;
    sourceFile: string;
    targetName: string;
    targetFile?: string;
    kind: EdgeKind;
    line: number;
}
export interface SymbolResult {
    symbol: CodeSymbol;
    score: number;
}
export interface CodeScanOptions {
    summarize?: boolean;
    force?: boolean;
    langs?: IndexedLanguage[];
    repo?: string;
    incremental?: boolean;
    files?: string[];
}
export interface RefsOptions {
    repo?: string;
    format?: 'text' | 'json';
}
//# sourceMappingURL=types.d.ts.map