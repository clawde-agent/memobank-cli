/**
 * Recall command
 * Hot path - called by memobank-skill before every session
 */
export interface RecallOptions {
    top?: number;
    engine?: string;
    format?: string;
    dryRun?: boolean;
    repo?: string;
}
export declare function recall(query: string, options?: RecallOptions): Promise<void>;
//# sourceMappingURL=recall.d.ts.map