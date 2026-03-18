/**
 * Capture command
 * Extracts learnings from session text and writes to memory files
 */
export interface CaptureOptions {
    session?: string;
    auto?: boolean;
    repo?: string;
}
export declare function capture(options?: CaptureOptions): Promise<void>;
//# sourceMappingURL=capture.d.ts.map