"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deduplicate = deduplicate;
async function deduplicate(candidates, existing, llm) {
    const toWrite = [];
    const toSkip = [];
    const ambiguous = [];
    for (const candidate of candidates) {
        // Stage 1: exact name match
        if (existing.some((e) => e.name === candidate.name)) {
            toSkip.push(candidate);
            continue;
        }
        // Stage 1: Jaccard on name + description
        const candidateText = `${candidate.name} ${candidate.description}`;
        let maxScore = 0;
        let closestExisting;
        for (const e of existing) {
            const score = jaccard(candidateText, `${e.name} ${e.description}`);
            if (score > maxScore) {
                maxScore = score;
                closestExisting = e;
            }
        }
        if (maxScore >= 0.8) {
            toSkip.push(candidate);
        }
        else if (maxScore >= 0.4 && closestExisting) {
            ambiguous.push({ candidate, existing: closestExisting });
        }
        else {
            toWrite.push(candidate);
        }
    }
    // Stage 2: LLM for ambiguous pairs
    if (ambiguous.length > 0) {
        if (llm) {
            try {
                const decisions = await llm(ambiguous);
                for (let i = 0; i < ambiguous.length; i++) {
                    if (decisions[i] === 'DUPLICATE') {
                        toSkip.push(ambiguous[i].candidate);
                    }
                    else {
                        toWrite.push(ambiguous[i].candidate);
                    }
                }
            }
            catch (err) {
                console.warn(`Stage 2 dedup LLM failed: ${err.message} — treating ambiguous as KEEP_BOTH`);
                for (const { candidate } of ambiguous) {
                    toWrite.push(candidate);
                }
            }
        }
        else {
            // No LLM configured — KEEP_BOTH
            for (const { candidate } of ambiguous) {
                toWrite.push(candidate);
            }
        }
    }
    return { toWrite, toSkip };
}
/**
 * Similarity score: max of word-level Jaccard and character-trigram Jaccard.
 * Word-level captures shared vocabulary; trigrams capture near-identical names
 * that differ by only a suffix (e.g. "handling" vs "handler").
 */
function jaccard(a, b) {
    return Math.max(wordJaccard(a, b), trigramJaccard(a, b));
}
function wordJaccard(a, b) {
    const tokA = new Set(tokenize(a));
    const tokB = new Set(tokenize(b));
    const intersection = [...tokA].filter((t) => tokB.has(t)).length;
    const union = new Set([...tokA, ...tokB]).size;
    return union === 0 ? 0 : intersection / union;
}
function tokenize(text) {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(Boolean);
}
function trigramJaccard(a, b) {
    const tokA = trigrams(a);
    const tokB = trigrams(b);
    const intersection = [...tokA].filter((t) => tokB.has(t)).length;
    const union = new Set([...tokA, ...tokB]).size;
    return union === 0 ? 0 : intersection / union;
}
function trigrams(text) {
    const t = text.toLowerCase().replace(/[^a-z0-9]/g, '');
    const result = new Set();
    for (let i = 0; i <= t.length - 3; i++) {
        result.add(t.slice(i, i + 3));
    }
    return result;
}
//# sourceMappingURL=dedup.js.map