/**
 * Embedding Generator
 * Generates vector embeddings using OpenAI-compatible APIs
 * Supports: OpenAI, Azure, Ollama, and other compatible providers
 */
export type EmbeddingProvider = 'openai' | 'azure' | 'ollama' | 'jina' | 'custom';
export interface EmbeddingConfig {
    provider: EmbeddingProvider;
    model: string;
    dimensions: number;
    baseUrl?: string;
    apiKey?: string;
}
export declare class EmbeddingGenerator {
    private client;
    private config;
    constructor(config: EmbeddingConfig);
    getDimensions(): number;
    /**
     * Get default base URL for provider
     */
    private getDefaultBaseUrl;
    /**
     * Generate embedding for a single text
     * @param text - Input text to embed
     * @returns Vector embedding as number array
     */
    generateEmbedding(text: string): Promise<number[]>;
    /**
     * Generate embeddings for multiple texts in batch
     * @param texts - Array of input texts
     * @returns Array of vector embeddings
     */
    generateEmbeddings(texts: string[]): Promise<number[][]>;
    /**
     * Get embedding dimensions by querying the model
     * Useful when dimensions are unknown for custom models
     */
    detectDimensions(): Promise<number>;
    /**
     * Create embedding config from memo config
     * Supports multiple providers with appropriate defaults
     */
    static fromMemoConfig(config: {
        embedding: {
            provider?: string;
            model?: string;
            base_url?: string;
            dimensions?: number;
        };
    }): EmbeddingConfig | null;
    /**
     * Get default model for provider
     */
    private static getDefaultModel;
    /**
     * Get default dimensions for known models
     */
    private static getDefaultDimensions;
}
//# sourceMappingURL=embedding.d.ts.map