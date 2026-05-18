/**
 * Recall command
 * Search memories and write to MEMORY.md
 */
import type { EmbeddingConfig } from '../core/embedding';
import type { EngineAdapter } from '../engines/engine-adapter';
export interface RecallOptions {
    top?: number;
    engine?: string;
    format?: string;
    dryRun?: boolean;
    repo?: string;
    scope?: string;
    explain?: boolean;
    code?: boolean;
    refs?: string;
    silent?: boolean;
}
export declare function selectEngine(engineName: string, repoRoot: string, embedConfig: EmbeddingConfig | null): Promise<{
    engine: EngineAdapter;
    warning: string | null;
}>;
export declare function recallCommand(query: string, options: RecallOptions): Promise<void>;
//# sourceMappingURL=recall.d.ts.map