/**
 * Claude Code platform install helper
 * Installs memobank hooks in ~/.claude/settings.json
 * Schema: https://www.schemastore.org/claude-code-settings.json
 */
/**
 * Hook command types per Claude Code schema
 */
interface HookCommand {
    type: 'command' | 'prompt' | 'agent' | 'http';
    command?: string;
    prompt?: string;
    url?: string;
    timeout?: number;
    async?: boolean;
    statusMessage?: string;
    model?: string;
    headers?: Record<string, string>;
    allowedEnvVars?: string[];
}
/**
 * Hook matcher entry per Claude Code schema
 * Each hook entry must have: { matcher?: string, hooks: HookCommand[] }
 */
interface HookMatcher {
    matcher?: string;
    hooks: HookCommand[];
}
/**
 * Claude Code settings interface per schema
 */
export interface ClaudeCodeSettings {
    autoMemoryEnabled?: boolean;
    autoMemoryDirectory?: string;
    hooks?: {
        Stop?: HookMatcher[];
        PreToolUse?: HookMatcher[];
        PostToolUse?: HookMatcher[];
        PermissionRequest?: HookMatcher[];
        UserPromptSubmit?: HookMatcher[];
        Notification?: HookMatcher[];
        [key: string]: HookMatcher[] | undefined;
    };
    [key: string]: unknown;
}
/**
 * Install memobank for Claude Code
 * @param enableAutoMemory - explicitly set autoMemoryEnabled in settings (true to enable, false to leave unchanged)
 */
export declare function installClaudeCode(repoRoot: string, enableAutoMemory?: boolean): Promise<boolean>;
export {};
//# sourceMappingURL=claude-code.d.ts.map