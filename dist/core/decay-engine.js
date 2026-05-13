"use strict";
/**
 * Weibull decay engine for memory scoring
 * Ported from memory-lancedb-pro
 * Formula: score = recency_weight × frequency_weight × importance_weight
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeDecayScore = computeDecayScore;
exports.isReviewDue = isReviewDue;
exports.computeEpochScore = computeEpochScore;
/**
 * Compute decay score for a memory (0-1)
 * Based on recency, access frequency, and confidence
 */
/**
 * Compute decay score for a memory (0-1) based on recency and confidence.
 * Access frequency is applied separately in retriever.ts via post-search boost.
 */
function computeDecayScore(memory, now = new Date()) {
    const recencyWeight = computeRecencyWeight(memory.created, now);
    const importanceWeight = computeImportanceWeight(memory.confidence);
    return recencyWeight * importanceWeight;
}
/**
 * Compute recency weight using Weibull stretched-exponential decay
 * Returns 0-1, where 1 is most recent
 */
function computeRecencyWeight(createdDate, now) {
    const created = new Date(createdDate);
    const daysSinceCreation = (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
    // Weibull parameters
    const k = 0.5; // shape parameter
    const lambda = 90; // scale parameter (90 days half-life-ish)
    // Stretched-exponential decay
    const t = daysSinceCreation / lambda;
    const recency = Math.exp(-Math.pow(t, k));
    return Math.max(0, Math.min(1, recency));
}
/**
 * Compute importance weight based on confidence
 */
function computeImportanceWeight(confidence) {
    switch (confidence) {
        case 'high':
            return 1.0;
        case 'medium':
            return 0.7;
        case 'low':
            return 0.4;
        default:
            return 0.5; // default for unspecified
    }
}
/**
 * Check if a memory is due for review
 */
function isReviewDue(memory, now = new Date()) {
    if (!memory.review_after) {
        return false;
    }
    const created = new Date(memory.created);
    const reviewDuration = parseReviewDuration(memory.review_after);
    const reviewDate = new Date(created.getTime() + reviewDuration);
    return now >= reviewDate;
}
/**
 * Parse review duration string (e.g., "90d", "1w", "3m") into milliseconds
 */
function parseReviewDuration(duration) {
    const match = duration.match(/^(\d+)([dwmy])$/);
    if (!match?.[1]) {
        // Default to 90 days if format is invalid
        return 90 * 24 * 60 * 60 * 1000;
    }
    const value = parseInt(match[1], 10);
    const unit = match[2];
    const msPerDay = 24 * 60 * 60 * 1000;
    switch (unit) {
        case 'd':
            return value * msPerDay;
        case 'w':
            return value * 7 * msPerDay;
        case 'm':
            return value * 30 * msPerDay;
        case 'y':
            return value * 365 * msPerDay;
        default:
            return 90 * msPerDay;
    }
}
/**
 * Compute dual-track epoch score.
 * score = epochAccessCount × 1.0 + historical × linearDecay(daysSinceEpoch, window)
 */
function computeEpochScore(input) {
    const { accessCount, epochAccessCount, daysSinceEpoch, decayWindowDays } = input;
    const historical = accessCount - epochAccessCount;
    const decay = Math.max(0, 1 - daysSinceEpoch / decayWindowDays);
    return epochAccessCount + historical * decay;
}
//# sourceMappingURL=decay-engine.js.map