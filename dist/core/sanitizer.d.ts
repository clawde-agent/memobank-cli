/**
 * Sanitizer module
 * Strips secrets and sensitive information from content before writing to memory
 */
/**
 * Sanitize content by replacing sensitive patterns with [REDACTED]
 */
export declare function sanitize(content: string): string;
export interface SecretFinding {
    line: number;
    content: string;
    label: string;
}
/**
 * Scan content for potential secrets without modifying it.
 * Returns human-readable findings with line numbers.
 */
export declare function scanForSecrets(content: string): string[];
//# sourceMappingURL=sanitizer.d.ts.map