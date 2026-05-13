export interface ProcessQueueOptions {
    background: boolean;
}
export declare function runProcessQueue(memoBankDir: string, options: ProcessQueueOptions): Promise<number>;
export declare function processQueueCommand(options?: {
    background?: boolean;
}): Promise<void>;
//# sourceMappingURL=process-queue.d.ts.map