"use strict";
/**
 * Index command
 * Build or update the search index
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
exports.indexCommand = indexCommand;
const store_1 = require("../core/store");
const config_1 = require("../config");
const embedding_1 = require("../core/embedding");
async function indexCommand(options = {}) {
    const cwd = process.cwd();
    const repoRoot = (0, store_1.findRepoRoot)(cwd, options.repo);
    const config = (0, config_1.loadConfig)(repoRoot);
    const engineName = options.engine ?? config.embedding.engine;
    // Text engine: no-op (searches live files directly)
    if (engineName === 'text') {
        const memories = (0, store_1.loadAll)(repoRoot);
        console.log(`text engine: no index needed`);
        console.log(`Loaded ${memories.length} memories from disk`);
        return;
    }
    // LanceDB engine
    if (engineName === 'lancedb') {
        try {
            const { LanceDbEngine } = await Promise.resolve().then(() => __importStar(require('../engines/lancedb-engine')));
            const embedConfig = embedding_1.EmbeddingGenerator.fromMemoConfig(config);
            if (!embedConfig) {
                throw new Error('OPENAI_API_KEY not set or embedding config missing');
            }
            const embeddingGenerator = new embedding_1.EmbeddingGenerator(embedConfig);
            const engine = new LanceDbEngine(repoRoot, embeddingGenerator);
            const memories = (0, store_1.loadAll)(repoRoot);
            console.log(`Indexing ${memories.length} memories...`);
            await engine.index(memories, options.incremental ?? false);
            console.log('Index updated successfully');
        }
        catch (error) {
            if (error.code === 'MODULE_NOT_FOUND') {
                console.error('LanceDB engine requires: npm install @lancedb/lancedb @lancedb/core openai');
                console.error('Or use the default text engine (no setup needed).');
            }
            else {
                console.error(`Index error: ${error.message}`);
            }
        }
    }
}
//# sourceMappingURL=index.js.map