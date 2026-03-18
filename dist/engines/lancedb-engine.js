"use strict";
/**
 * LanceDB Engine (Optional)
 * This is a placeholder for the LanceDB vector search engine.
 * To use this feature, install: npm install vectordb openai
 *
 * This file provides type stubs only. The actual implementation
 * should be added when needed.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.LanceDbEngine = void 0;
class LanceDbEngine {
    async search(query, memories, topK) {
        throw new Error('LanceDB engine is not implemented. Install vectordb and openai packages to enable vector search.');
    }
    async index(memories, incremental) {
        throw new Error('LanceDB engine is not implemented. Install vectordb and openai packages to enable vector search.');
    }
}
exports.LanceDbEngine = LanceDbEngine;
//# sourceMappingURL=lancedb-engine.js.map