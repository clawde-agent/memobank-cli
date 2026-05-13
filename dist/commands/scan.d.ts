/**
 * Scan command
 * memo scan [path]           — scan memory files for secrets
 * memo scan --staged         — scan git-staged .md files (used by pre-commit hook)
 * memo scan --fail-on-secrets — exit 1 if secrets found
 * memo scan --fix            — redact secrets in-place and re-stage
 */
export interface ScanResult {
    file: string;
    findings: string[];
}
/**
 * Scan a single file for secrets
 */
export declare function scanFile(filePath: string): string[];
/**
 * Scan all .md files in a directory recursively
 */
export declare function scanDirectory(dir: string): ScanResult[];
export interface ScanCommandOptions {
    staged?: boolean;
    failOnSecrets?: boolean;
    fix?: boolean;
    repo?: string;
}
export declare function scanCommand(scanPath: string | undefined, options: ScanCommandOptions): void;
//# sourceMappingURL=scan.d.ts.map