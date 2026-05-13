/**
 * Memory Template Module
 * Provides templates and sanitization for memobank memories
 * Aligned with: https://github.com/clawde-agent/memobank/blob/master/docs/specs/2026-03-17-memobank-design.md
 */
export type MemoryType = 'lesson' | 'decision' | 'workflow' | 'architecture';
export type Confidence = 'low' | 'medium' | 'high';
/**
 * Memory template with frontmatter - aligned with memobank design spec
 */
export interface MemoryTemplate {
    name: string;
    type: MemoryType;
    description: string;
    tags: string[];
    created: string;
    updated?: string;
    reviewAfter?: string;
    confidence?: Confidence;
    content: string;
}
/**
 * Sanitize content by removing sensitive information
 */
export declare function sanitizeContent(content: string): {
    sanitized: string;
    redacted: string[];
};
/**
 * Check if content contains sensitive topics
 */
export declare function checkSensitiveTopics(content: string): string[];
/**
 * Validate memory content for safety
 */
export declare function validateMemoryContent(content: string): {
    valid: boolean;
    warnings: string[];
    errors: string[];
};
/**
 * Generate memory file name (slug format)
 */
export declare function generateMemorySlug(name: string): string;
/**
 * Generate memory file content with frontmatter
 * Aligned with memobank design spec:
 * - Filename: <date>-<name>.md
 * - Frontmatter: YAML with required fields
 * - Body: Free-form Markdown
 * - Design Goal: Human-readable, Git-native, Portable
 */
export declare function generateMemoryFile(template: MemoryTemplate): {
    fileName: string;
    content: string;
};
/**
 * Get template by type
 * Aligned with memobank design spec directory semantics:
 * - lessons/: Post-mortems, bugs fixed, gotchas
 * - decisions/: ADRs: context, options, decision, consequences
 * - workflows/: Step-by-step runbooks, deploy flows, onboarding
 * - architecture/: System diagrams, component descriptions, data flows
 */
export declare function getTemplateByType(type: MemoryType): string;
/**
 * Validate memory abstraction level
 */
export declare function checkAbstractionLevel(content: string): 'high' | 'medium' | 'low' | 'too-specific';
//# sourceMappingURL=memory-template.d.ts.map