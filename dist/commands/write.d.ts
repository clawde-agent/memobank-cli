/**
 * Write command
 * Interactive + non-interactive memory creation
 */
import { MemoryType } from '../types';
export interface WriteOptions {
    name?: string;
    description?: string;
    tags?: string;
    content?: string;
    repo?: string;
}
export declare function writeMemoryCommand(type: MemoryType, options?: WriteOptions): Promise<void>;
//# sourceMappingURL=write.d.ts.map