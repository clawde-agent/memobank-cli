"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rrfMerge = rrfMerge;
function rrfMerge(textResults, vectorResults, k = 60) {
    const scores = new Map();
    const byName = new Map();
    for (const [rank, r] of textResults.entries()) {
        const s = (scores.get(r.memory.name) ?? 0) + 1 / (k + rank + 1);
        scores.set(r.memory.name, s);
        byName.set(r.memory.name, r);
    }
    for (const [rank, r] of vectorResults.entries()) {
        const s = (scores.get(r.memory.name) ?? 0) + 1 / (k + rank + 1);
        scores.set(r.memory.name, s);
        byName.set(r.memory.name, r);
    }
    return [...scores.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([name, score]) => ({ ...byName.get(name), score }));
}
//# sourceMappingURL=rrf.js.map