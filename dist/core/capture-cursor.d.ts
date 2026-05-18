export interface CaptureCursor {
    processedSessions: string[];
}
export declare function readCursor(metaDir: string): Promise<CaptureCursor>;
export declare function markSessionProcessed(metaDir: string, sessionId: string): Promise<void>;
export declare function isSessionProcessed(metaDir: string, sessionId: string): Promise<boolean>;
//# sourceMappingURL=capture-cursor.d.ts.map