export interface DistillOptions {
    to: 'workspace' | 'personal';
    repo?: string;
    silent?: boolean;
}
export declare function distillCommand(options: DistillOptions): Promise<void>;
//# sourceMappingURL=distill.d.ts.map