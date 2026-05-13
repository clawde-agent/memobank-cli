/**
 * Recall command
 * Search memories and write to MEMORY.md
 */
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
}
export declare function recallCommand(query: string, options: RecallOptions): Promise<void>;
//# sourceMappingURL=recall.d.ts.map