import { MemoryFile } from '../types';
import { EngineAdapter } from './engine-adapter';
export declare class LanceDBEngine implements EngineAdapter {
    private db;
    private table;
    private openai;
    private embeddingDimensions;
    private embeddingModel;
    private embeddingProvider;
    private embeddingBaseUrl;
    private tableName;
    constructor();
    private loadConfig;
    private getOpenAIClient;
    private getEmbedding;
    private ensureTable;
    index(memories: MemoryFile[], incremental: boolean): Promise<void>;
    /**
     * Simple BM25 implementation
     */
    private computeBM25Scores;
    const totalDocs: any;
    const avgDocLength: number;
    const k1: number;
    const b: number;
    const scores: Map<string, number>;
    for(: any, mem: any, of: any, memories: any): void;
}
//# sourceMappingURL=lancedb-engine.d.ts.map