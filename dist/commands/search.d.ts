/**
 * Search command
 * Manual debugging - never writes MEMORY.md
 */
export interface SearchOptions {
    engine?: string;
    tag?: string;
    type?: string;
    format?: string;
    repo?: string;
}
export declare function search(query: string, options?: SearchOptions): Promise<void>;
//# sourceMappingURL=search.d.ts.map