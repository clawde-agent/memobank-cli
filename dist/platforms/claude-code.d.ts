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
 * @param enableAutoMemory - explicitly set autoMemoryEnabled in settings (true to enable, false to leave unchanged)
 */
export declare function installClaudeCode(repoRoot: string, enableAutoMemory?: boolean): Promise<boolean>;
//# sourceMappingURL=claude-code.d.ts.map