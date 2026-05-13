/**
 * Import Command
 * Import memories from other AI tools (Claude Code, Gemini CLI, Qwen Code)
 */
export interface ImportOptions {
    repo?: string;
    claude?: boolean;
    gemini?: boolean;
    qwen?: boolean;
    all?: boolean;
    dryRun?: boolean;
}
interface ToolMemory {
    name: string;
    path: string;
    content: string;
    exists: boolean;
}
/**
 * Detect available tools with memories
 */
export declare function detectAvailableTools(): ToolMemory[];
/**
 * Import memories from specified tools
 */
export declare function importMemories(options?: ImportOptions): void;
export {};
//# sourceMappingURL=import.d.ts.map