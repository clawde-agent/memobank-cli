import type { MemoryFile } from '../types';
export type SceneLLMCall = (prompt: string) => Promise<string>;
export interface SceneResult {
    filename: string;
    content: string;
    summary: string;
}
export declare function clusterByTags(memories: MemoryFile[]): MemoryFile[][];
export declare function synthesizeScenes(memories: MemoryFile[], memoDir: string, apiKey: string | undefined, llm?: SceneLLMCall): Promise<SceneResult[]>;
//# sourceMappingURL=scene-synthesizer.d.ts.map