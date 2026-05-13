/**
 * Tool Configuration Module
 * Configures AI coding tools to use memobank for memory
 */
export interface ToolConfig {
    name: string;
    scope: 'global' | 'project';
    projectPath?: string;
}
/**
 * Configure Claude Code to use memobank
 */
export declare function configureClaudeCode(config: ToolConfig): void;
/**
 * Configure Gemini CLI to use memobank
 */
export declare function configureGeminiCli(config: ToolConfig): void;
/**
 * Configure Qwen Code to use memobank
 */
export declare function configureQwenCode(config: ToolConfig): void;
/**
 * Configure all selected tools
 */
export declare function configureTools(tools: ToolConfig[]): void;
/**
 * Check which tools are installed
 */
export declare function detectInstalledTools(): {
    name: string;
    installed: boolean;
}[];
//# sourceMappingURL=tool-config.d.ts.map