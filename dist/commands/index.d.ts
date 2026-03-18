/**
 * Index command
 * Build or update the search index
 */
export interface IndexOptions {
    incremental?: boolean;
    engine?: string;
    force?: boolean;
    repo?: string;
}
export declare function indexCommand(options?: IndexOptions): Promise<void>;
//# sourceMappingURL=index.d.ts.map