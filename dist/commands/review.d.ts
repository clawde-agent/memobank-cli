/**
 * Review command
 * List memories due for review
 */
export interface ReviewOptions {
    due?: boolean;
    format?: string;
    repo?: string;
}
export declare function reviewCommand(options?: ReviewOptions): Promise<void>;
//# sourceMappingURL=review.d.ts.map