/**
 * Install command
 * Sets up memobank directory structure and platform integrations
 */
export interface InstallOptions {
    repo?: string;
    claudeCode?: boolean;
    codex?: boolean;
    cursor?: boolean;
    all?: boolean;
    platform?: string;
}
/**
 * Install memobank
 */
export declare function installCommand(options?: InstallOptions): Promise<void>;
//# sourceMappingURL=install.d.ts.map