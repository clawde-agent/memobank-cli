"use strict";
/**
 * Embedding Generator
 * Generates vector embeddings using OpenAI-compatible APIs
 * Supports: OpenAI, Azure, Ollama, and other compatible providers
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmbeddingGenerator = void 0;
const openai_1 = require("openai");
class EmbeddingGenerator {
    client;
    config;
    constructor(config) {
        this.config = config;
        // Ollama typically uses empty string or 'ollama' as API key
        const apiKey = config.apiKey || (config.provider === 'ollama' ? 'ollama' : '');
        this.client = new openai_1.OpenAI({
            apiKey,
            baseURL: config.baseUrl || this.getDefaultBaseUrl(config.provider),
        });
    }
    getDimensions() {
        return this.config.dimensions;
    }
    /**
     * Get default base URL for provider
     */
    getDefaultBaseUrl(provider) {
        switch (provider) {
            case 'ollama':
                return 'http://localhost:11434/v1';
            case 'azure':
                return 'https://api.openai.com/v1'; // Azure uses different format
            case 'jina':
                return 'https://api.jina.ai/v1';
            default:
                return 'https://api.openai.com/v1';
        }
    }
    /**
     * Generate embedding for a single text
     * @param text - Input text to embed
     * @returns Vector embedding as number array
     */
    async generateEmbedding(text) {
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
        }
        catch (error) {
            throw new Error(`Failed to generate embedding: ${error.message}`);
        }
    }
    /**
     * Generate embeddings for multiple texts in batch
     * @param texts - Array of input texts
     * @returns Array of vector embeddings
     */
    async generateEmbeddings(texts) {
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
        }
        catch (error) {
            throw new Error(`Failed to generate embeddings: ${error.message}`);
        }
    }
    /**
     * Get embedding dimensions by querying the model
     * Useful when dimensions are unknown for custom models
     */
    async detectDimensions() {
        try {
            const embedding = await this.generateEmbedding('test');
            return embedding.length;
        }
        catch (error) {
            throw new Error(`Failed to detect dimensions: ${error.message}`);
        }
    }
    /**
     * Create embedding config from memo config
     * Supports multiple providers with appropriate defaults
     */
    static fromMemoConfig(config) {
        const { embedding } = config;
        const provider = embedding.provider || 'openai';
        // Get API key based on provider
        let apiKey;
        if (provider === 'ollama') {
            // Ollama doesn't require an API key
            apiKey = undefined;
        }
        else if (provider === 'jina') {
            apiKey = process.env.JINA_API_KEY;
            if (!apiKey) {
                return null;
            }
        }
        else {
            // OpenAI, Azure, etc. need API key from environment
            apiKey = process.env.OPENAI_API_KEY || process.env.AZURE_API_KEY;
            if (!apiKey && provider !== 'custom') {
                return null;
            }
        }
        // Get model with provider-specific defaults
        const model = embedding.model || EmbeddingGenerator.getDefaultModel(provider);
        // Get dimensions - either from config or detect automatically later
        let dimensions = embedding.dimensions;
        if (!dimensions) {
            dimensions = EmbeddingGenerator.getDefaultDimensions(model);
        }
        return {
            provider,
            model,
            dimensions,
            baseUrl: embedding.base_url,
            apiKey,
        };
    }
    /**
     * Get default model for provider
     */
    static getDefaultModel(provider) {
        switch (provider) {
            case 'ollama':
                return 'mxbai-embed-large'; // Popular Ollama embedding model
            case 'azure':
                return 'text-embedding-ada-002';
            case 'jina':
                return 'jina-embeddings-v3';
            default:
                return 'text-embedding-3-small';
        }
    }
    /**
     * Get default dimensions for known models
     */
    static getDefaultDimensions(model) {
        const modelDimensions = {
            // OpenAI
            'text-embedding-3-small': 1536,
            'text-embedding-3-large': 3072,
            'text-embedding-ada-002': 1536,
            // Ollama popular models
            'mxbai-embed-large': 1024,
            'nomic-embed-text': 768,
            'all-minilm': 384,
            'all-mpnet-base-v2': 768,
            // Jina
            'jina-embeddings-v3': 1024,
            'jina-embeddings-v2-base-en': 768,
            'jina-embeddings-v2-small-en': 512,
        };
        // Try exact match first
        if (modelDimensions[model]) {
            return modelDimensions[model];
        }
        // Try partial match
        for (const [key, dim] of Object.entries(modelDimensions)) {
            if (model.includes(key)) {
                return dim;
            }
        }
        // Default fallback
        return 1536;
    }
}
exports.EmbeddingGenerator = EmbeddingGenerator;
//# sourceMappingURL=embedding.js.map