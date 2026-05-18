export interface Turn {
    role: 'user' | 'assistant';
    text: string;
    ts: string;
}
export declare function deriveProjectId(absoluteCwd: string): string;
export declare function getTranscriptDir(cwd: string): string;
export declare function parseTranscriptFile(transcriptFile: string): Promise<Turn[]>;
export declare function findUnprocessedSessions(cwd: string, processedIds: string[]): Promise<Array<{
    sessionId: string;
    file: string;
}>>;
export declare function writeL0(l0Dir: string, sessionId: string, turns: Turn[]): Promise<void>;
//# sourceMappingURL=transcript-parser.d.ts.map