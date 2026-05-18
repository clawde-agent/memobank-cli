/**
 * Distiller module
 * LLM-powered distillation of project memories into workspace-shareable knowledge
 * and personal persona profiles.
 */
import type { MemoryFile } from '../types';
export interface DistilledMemory {
    name: string;
    type: string;
    description: string;
    tags: string[];
    confidence: string;
    content: string;
    distilled_from: string[];
}
export type LLMCall = (prompt: string) => Promise<string>;
/**
 * Distill project memories into workspace-shareable knowledge.
 * Strips PII and project-specific details, generalizing insights.
 */
export declare function distillToWorkspace(memories: MemoryFile[], apiKey: string | undefined, llm?: LLMCall): Promise<DistilledMemory[]>;
/**
 * Synthesize or update a personal user persona profile from memories.
 */
export declare function distillToPersonal(memories: MemoryFile[], existingPersona: string | undefined, apiKey: string | undefined, llm?: LLMCall): Promise<string>;
//# sourceMappingURL=distiller.d.ts.map