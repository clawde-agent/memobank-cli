/**
 * Capture command
 * Extracts learnings from session text and writes to memory files
 * Uses noise filtering and value scoring to determine what's worth remembering
 */
export interface CaptureOptions {
    session?: string;
    auto?: boolean;
    repo?: string;
}
export declare function capture(options?: CaptureOptions): Promise<void>;
//# sourceMappingURL=capture.d.ts.map