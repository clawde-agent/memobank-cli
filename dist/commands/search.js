"use strict";
/**
 * Search command
 * Manual debugging - never writes MEMORY.md
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
exports.search = search;
const config_1 = require("../config");
const store_1 = require("../core/store");
const text_engine_1 = require("../engines/text-engine");
async function search(query, options = {}) {
    const cwd = process.cwd();
    const repoRoot = (0, store_1.findRepoRoot)(cwd, options.repo);
    const config = (0, config_1.loadConfig)(repoRoot);
    // Load all memories
    let memories = (0, store_1.loadAll)(repoRoot);
    // Apply filters
    if (options.tag) {
        memories = memories.filter(m => m.tags.includes(options.tag));
    }
    if (options.type) {
        memories = memories.filter(m => m.type === options.type);
    }
    // Get engine
    let engine;
    const engineName = options.engine ?? config.embedding.engine;
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
    // Run search
    const results = await engine.search(query, memories, config.memory.top_k);
    // Output
    if (options.format === 'json') {
        console.log(JSON.stringify(results, null, 2));
    }
    else {
        // Format as markdown (similar to recall but without MEMORY.md write)
        console.log(`## Search Results for "${query}"\n`);
        if (results.length === 0) {
            console.log('*No memories found*');
        }
        else {
            for (const result of results) {
                const { memory, score } = result;
                const confidenceStr = memory.confidence ? ` · ${memory.confidence} confidence` : '';
                const tagStr = memory.tags.length > 0 ? ` · tags: ${memory.tags.join(', ')}` : '';
                const relativePath = memory.path.replace(/^.*\/memobank\//, '');
                console.log(`### [${memory.type}] ${memory.name}${confidenceStr}`);
                console.log(`> ${memory.description}`);
                console.log(`> \`${relativePath}\`${tagStr}`);
                console.log(`> Score: ${score.toFixed(3)}\n`);
            }
        }
        console.log(`*${results.length} results · engine: ${engineName}*`);
    }
}
//# sourceMappingURL=search.js.map