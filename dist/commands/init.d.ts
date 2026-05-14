/**
 * init command
 * memo init          — project tier: creates .memobank/ in current repo
 * memo init --global — personal tier: creates ~/.memobank/<project>/
 * memo init --interactive — full onboarding TUI
 */
export interface QuickInitOptions {
    platform?: string;
    repoRoot?: string;
}
export declare function ensureGitignoreFull(gitRoot: string): void;
export declare function quickInit(options: QuickInitOptions): Promise<void>;
export declare function initCommand(options: {
    global?: boolean;
    name?: string;
}): void;
//# sourceMappingURL=init.d.ts.map