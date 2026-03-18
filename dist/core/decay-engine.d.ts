/**
 * Weibull decay engine for memory scoring
 * Ported from memory-lancedb-pro
 * Formula: score = recency_weight × frequency_weight × importance_weight
 */
import { MemoryFile } from '../types';
/**
 * Compute decay score for a memory (0-1)
 * Based on recency, access frequency, and confidence
 */
export declare function computeDecayScore(memory: MemoryFile, now?: Date): number;
/**
 * Check if a memory is due for review
 */
export declare function isReviewDue(memory: MemoryFile, now?: Date): boolean;
//# sourceMappingURL=decay-engine.d.ts.map