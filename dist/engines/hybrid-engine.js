"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HybridEngine = void 0;
const rrf_1 = require("../core/rrf");
class HybridEngine {
    textEngine;
    vectorEngine;
    k;
    constructor(textEngine, vectorEngine, k = 60) {
        this.textEngine = textEngine;
        this.vectorEngine = vectorEngine;
        this.k = k;
    }
    async search(query, memories, topK) {
        const [textResults, vectorResults] = await Promise.all([
            this.textEngine.search(query, memories, topK),
            this.vectorEngine.search(query, memories, topK),
        ]);
        return (0, rrf_1.rrfMerge)(textResults, vectorResults, this.k).slice(0, topK);
    }
}
exports.HybridEngine = HybridEngine;
//# sourceMappingURL=hybrid-engine.js.map