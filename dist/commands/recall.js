"use strict";
/**
 * Recall command
 * Search memories and write to MEMORY.md
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
exports.recallCommand = recallCommand;
const store_1 = require("../core/store");
const config_1 = require("../config");
const retriever_1 = require("../core/retriever");
const text_engine_1 = require("../engines/text-engine");
const embedding_1 = require("../core/embedding");
async function recallCommand(query, options) {
    const repoRoot = (0, store_1.findRepoRoot)(process.cwd(), options.repo);
    const config = (0, config_1.loadConfig)(repoRoot);
    if (options.top) {
        config.memory.top_k = options.top;
    }
    const scope = options.scope || 'all';
    const explain = options.explain || false;
    let engine;
    if (options.engine === 'lancedb') {
        try {
            const { LanceDbEngine } = await Promise.resolve().then(() => __importStar(require('../engines/lancedb-engine')));
            const embedConfig = embedding_1.EmbeddingGenerator.fromMemoConfig(config);
            if (!embedConfig) {
                throw new Error('embedding config missing or API key not set');
            }
            const embeddingGenerator = new embedding_1.EmbeddingGenerator(embedConfig);
            engine = new LanceDbEngine(repoRoot, embeddingGenerator);
        }
        catch (err) {
            const msg = err.message;
            const provider = config.embedding?.provider ?? 'ollama';
            const model = config.embedding?.model ?? 'mxbai-embed-large';
            const hint = provider === 'ollama'
                ? `  Check: ollama serve && ollama pull ${model}`
                : `  Check: ${provider.toUpperCase()}_API_KEY is set`;
            process.stderr.write(`\n⚠  Vector search unavailable (${msg})\n${hint}\n  Falling back to text search.\n\n`);
            engine = new text_engine_1.TextEngine();
        }
    }
    const { results, markdown } = await (0, retriever_1.recall)(query, repoRoot, config, engine, scope, explain);
    if (options.format === 'json') {
        console.log(JSON.stringify(results, null, 2));
        return;
    }
    console.log(markdown);
    if (!options.dryRun) {
        (0, retriever_1.writeRecallResults)(repoRoot, results, query, config.embedding.engine);
    }
}
//# sourceMappingURL=recall.js.map