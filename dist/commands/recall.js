"use strict";
/**
 * Recall command
 * Hot path - called by memobank-skill before every session
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.recall = recall;
const retriever_1 = require("../core/retriever");
const config_1 = require("../config");
const store_1 = require("../core/store");
const text_engine_1 = require("../engines/text-engine");
async function recall(query, options = {}) {
    const cwd = process.cwd();
    const repoRoot = (0, store_1.findRepoRoot)(cwd, options.repo);
    const config = (0, config_1.loadConfig)(repoRoot);
    // Override config with options
    const topK = options.top ?? config.memory.top_k;
    const engineName = options.engine ?? config.embedding.engine;
    // Get engine
    let engine;
    if (engineName === 'lancedb') {
        try {
            const { LanceDbEngine } = await Promise.resolve().then(() => __importStar(require('../engines/lancedb-engine')));
            engine = new LanceDbEngine();
        }
        catch (e) {
            console.error('LanceDB engine not available. Falling back to text engine.');
            console.error('To use LanceDB: npm install vectordb openai');
            engine = new text_engine_1.TextEngine();
        }
    }
    else {
        engine = new text_engine_1.TextEngine();
    }
    // Run recall
    const { results, markdown } = await (0, retriever_1.recall)(query, repoRoot, config, engine);
    // Write MEMORY.md unless dry-run
    if (!options.dryRun) {
        (0, retriever_1.writeRecallResults)(repoRoot, results, query, engineName);
    }
    // Output
    if (options.format === 'json') {
        console.log(JSON.stringify(results, null, 2));
    }
    else {
        console.log(markdown);
    }
}
//# sourceMappingURL=recall.js.map