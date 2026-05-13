/**
 * Noise Filter Module
 * Filters out low-value content before capturing as memory
 * Ported from memory-lancedb-pro
 */
/**
 * Check if content is likely noise
 */
export declare function isNoise(content: string): boolean;
/**
 * Check if content has high value indicators
 */
export declare function hasHighValueIndicators(content: string): boolean;
/**
 * Calculate content value score (0-1)
 */
export declare function calculateValueScore(content: string): number;
/**
 * Filter and rank memories by value
 */
export interface FilteredMemory {
    content: string;
    score: number;
    reason: string;
}
export declare function filterAndRank(memories: Array<{
    content: string;
    name?: string;
    description?: string;
}>): FilteredMemory[];
/**
 * Get recommendation for whether to capture
 */
export declare function getCaptureRecommendation(score: number): {
    shouldCapture: boolean;
    confidence: 'high' | 'medium' | 'low';
    reason: string;
};
//# sourceMappingURL=noise-filter.d.ts.map