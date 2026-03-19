/**
 * Retriever module
 * Orchestrates engine search and formats output for MEMORY.md injection
 * Tracks access patterns for lifecycle management
 */
import { RecallResult, MemoConfig } from '../types';
import { EngineAdapter } from '../engines/engine-adapter';
/**
 * Recall memories for a query
 * Returns both the results and formatted markdown
 * Records access for lifecycle tracking
 */
export declare function recall(query: string, repoRoot: string, config: MemoConfig, engine?: EngineAdapter): Promise<{
    results: RecallResult[];
    markdown: string;
}>;
/**
 * Write recall results to MEMORY.md
 */
export declare function writeRecallResults(repoRoot: string, results: RecallResult[], query: string, engine: string): void;
//# sourceMappingURL=retriever.d.ts.map