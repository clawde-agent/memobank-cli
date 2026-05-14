"use strict";
/**
 * Text-based search engine
 * Uses keyword matching, tag filtering, and decay scoring
 * Zero external dependencies
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TextEngine = void 0;
const decay_engine_1 = require("../core/decay-engine");
class TextEngine {
    /**
     * Search for memories using keyword matching + decay scoring
     */
    async search(query, memories, topK) {
        // 1. Tokenize query
        const queryTokens = this.tokenize(query);
        if (queryTokens.length === 0) {
            return memories.slice(0, topK).map((memory) => ({
                memory,
                score: (0, decay_engine_1.computeDecayScore)(memory),
            }));
        }
        // 2. Score each memory
        const scored = memories.map((memory) => {
            const textScore = this.computeTextScore(memory, queryTokens);
            const decayScore = (0, decay_engine_1.computeDecayScore)(memory);
            // Final: (text_score × 0.6) + (decay_score × 0.4)
            const finalScore = textScore * 0.6 + decayScore * 0.4;
            return { memory, score: finalScore };
        });
        // 3. Sort by score descending
        scored.sort((a, b) => b.score - a.score);
        // 4. Return top-K
        return scored.slice(0, topK);
    }
    /**
     * Tokenize a string into lowercase words
     */
    tokenize(text) {
        return text
            .toLowerCase()
            .replace(/[^\w\s-]/g, ' ')
            .split(/\s+/)
            .filter((token) => token.length > 0);
    }
    /**
     * Compute text match score for a memory (0-1)
     */
    computeTextScore(memory, queryTokens) {
        let totalScore = 0;
        let totalWeight = 0;
        // Search fields with their weights
        const fields = [
            { text: memory.name, weight: 1.0 },
            { text: memory.description, weight: 0.8 },
            { text: memory.tags.join(' '), weight: 0.9 },
            { text: memory.content, weight: 0.5 },
        ];
        for (const field of fields) {
            const fieldTokens = this.tokenize(field.text);
            const fieldScore = this.computeFieldMatchScore(queryTokens, fieldTokens);
            totalScore += fieldScore * field.weight;
            totalWeight += field.weight;
        }
        return totalWeight > 0 ? totalScore / totalWeight : 0;
    }
    /**
     * Compute match score for query tokens against field tokens (0-1)
     */
    computeFieldMatchScore(queryTokens, fieldTokens) {
        if (queryTokens.length === 0) {
            return 0;
        }
        let matchedTokens = 0;
        const fieldTokenSet = new Set(fieldTokens);
        for (const queryToken of queryTokens) {
            // Check for exact match
            if (fieldTokenSet.has(queryToken)) {
                matchedTokens++;
                continue;
            }
            // Check for partial match (contains)
            for (const fieldToken of fieldTokens) {
                if (fieldToken.includes(queryToken) || queryToken.includes(fieldToken)) {
                    matchedTokens += 0.5; // Partial match gets half credit
                    break;
                }
            }
        }
        return Math.min(1, matchedTokens / queryTokens.length);
    }
    /**
     * Index is a no-op for text engine - searches live files directly
     */
    async index(_memories) {
        // No-op - text engine doesn't need indexing
    }
}
exports.TextEngine = TextEngine;
//# sourceMappingURL=text-engine.js.map