/**
 * Claude Code platform install helper
 * Sets autoMemoryDirectory in ~/.claude/settings.json
 */
export interface ClaudeCodeSettings {
    autoMemoryDirectory?: string;
    [key: string]: any;
}
/**
 * Install memobank for Claude Code
 */
export declare function installClaudeCode(repoRoot: string): Promise<boolean>;
//# sourceMappingURL=claude-code.d.ts.map