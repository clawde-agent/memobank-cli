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
exports.selectEngine = selectEngine;
exports.recallCommand = recallCommand;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const store_1 = require("../core/store");
const scene_index_1 = require("../core/scene-index");
const scene_navigation_1 = require("../core/scene-navigation");
const config_1 = require("../config");
const retriever_1 = require("../core/retriever");
const text_engine_1 = require("../engines/text-engine");
const hybrid_engine_1 = require("../engines/hybrid-engine");
const embedding_1 = require("../core/embedding");
const memory_graph_1 = require("../engines/memory-graph");
const rrf_1 = require("../core/rrf");
async function selectEngine(engineName, repoRoot, embedConfig) {
    if (engineName !== 'lancedb') {
        return { engine: new text_engine_1.TextEngine(), warning: null };
    }
    if (!embedConfig) {
        const warning = `⚠  Vector search unavailable (embedding config missing or API key not set)\n  Falling back to text search.`;
        return { engine: new text_engine_1.TextEngine(), warning };
    }
    try {
        const { LanceDbEngine } = await Promise.resolve().then(() => __importStar(require('../engines/lancedb-engine')));
        const { EmbeddingGenerator } = await Promise.resolve().then(() => __importStar(require('../core/embedding')));
        // Validate API key before constructing — fail fast for cloud providers
        const provider = embedConfig.provider ?? 'ollama';
        if (provider !== 'ollama' && provider !== 'custom') {
            const keyMap = {
                openai: process.env.OPENAI_API_KEY,
                azure: process.env.OPENAI_API_KEY ?? process.env.AZURE_API_KEY,
                jina: process.env.JINA_API_KEY,
            };
            const key = keyMap[provider] ?? process.env.OPENAI_API_KEY;
            if (!key) {
                throw new Error(`${provider.toUpperCase()}_API_KEY is not set`);
            }
        }
        const embeddingGenerator = new EmbeddingGenerator(embedConfig);
        const lanceEngine = new LanceDbEngine(repoRoot, embeddingGenerator);
        const textEngine = new text_engine_1.TextEngine();
        return { engine: new hybrid_engine_1.HybridEngine(textEngine, lanceEngine), warning: null };
    }
    catch (err) {
        const msg = err.message;
        const provider = embedConfig.provider ?? 'ollama';
        const model = embedConfig.model ?? 'mxbai-embed-large';
        const hint = provider === 'ollama'
            ? `  Check: ollama serve && ollama pull ${model}`
            : `  Check: ${provider.toUpperCase()}_API_KEY is set`;
        const warning = `⚠  Vector search unavailable (${msg})\n${hint}\n  Falling back to text search.`;
        return { engine: new text_engine_1.TextEngine(), warning };
    }
}
function appendRecallMiss(repoRoot, query) {
    const missesPath = path.join(repoRoot, 'meta', 'recall-misses.json');
    let misses = [];
    try {
        if (fs.existsSync(missesPath)) {
            misses = JSON.parse(fs.readFileSync(missesPath, 'utf-8'));
        }
    }
    catch {
        misses = [];
    }
    misses.push({ query, timestamp: new Date().toISOString(), result_count: 0 });
    fs.writeFileSync(missesPath, JSON.stringify(misses, null, 2), 'utf-8');
}
function printStudyHint(repoRoot, silent) {
    if (silent)
        return;
    const suggestionsPath = path.join(repoRoot, 'meta', 'study-suggestions.json');
    try {
        if (!fs.existsSync(suggestionsPath))
            return;
        const suggestions = JSON.parse(fs.readFileSync(suggestionsPath, 'utf-8'));
        if (suggestions.length === 0)
            return;
        process.stdout.write('\n');
        for (const s of suggestions.slice(0, 3)) {
            process.stdout.write(`memo study ${s.name} — recalled ${s.access_count} times\n`);
        }
    }
    catch {
        // corrupt or unreadable — skip silently
    }
}
async function recallCommand(query, options) {
    // Validate query
    if (!query || !query.trim()) {
        throw new Error('Query cannot be empty');
    }
    if (query.length > 1000) {
        throw new Error('Query too long (max 1000 characters)');
    }
    // Validate top
    if (options.top !== undefined) {
        const topVal = typeof options.top === 'string' ? parseInt(options.top, 10) : options.top;
        if (isNaN(topVal) || topVal < 1) {
            throw new Error('--top must be a positive integer');
        }
        if (topVal > 100) {
            throw new Error('--top cannot exceed 100');
        }
    }
    const repoRoot = (0, store_1.findRepoRoot)(process.cwd(), options.repo);
    if (options.refs) {
        try {
            const { CodeIndex } = await Promise.resolve().then(() => __importStar(require('../engines/code-index')));
            const dbPath = CodeIndex.getDbPath(repoRoot);
            if (!fs.existsSync(dbPath)) {
                console.error('No code index found. Run: memo index-code [path]');
                return;
            }
            const idx = new CodeIndex(dbPath);
            try {
                const refs = idx.getRefs(options.refs);
                if (refs.length === 0) {
                    if (!options.silent) {
                        process.stdout.write(`No callers found for: ${options.refs}\n`);
                    }
                    return;
                }
                if (!options.silent) {
                    process.stdout.write(`\n## Callers of \`${options.refs}\` (${refs.length})\n\n`);
                    for (const r of refs) {
                        process.stdout.write(`- ${r.symbol.qualifiedName}  ${r.symbol.file}:${r.symbol.lineStart}\n`);
                    }
                }
            }
            finally {
                idx.close();
            }
            return;
        }
        catch {
            console.error('Code index unavailable. Run: npm install memobank-cli --include=optional');
            return;
        }
    }
    const config = (0, config_1.loadConfig)(repoRoot);
    if (options.top) {
        config.memory.top_k = typeof options.top === 'string' ? parseInt(options.top, 10) : options.top;
    }
    const scope = options.scope || 'all';
    const explain = options.explain || false;
    // Determine engine: explicit --engine flag overrides config
    const engineName = options.engine ?? config.embedding.engine;
    const embedConfig = embedding_1.EmbeddingGenerator.fromMemoConfig(config);
    const { engine, warning } = await selectEngine(engineName, repoRoot, embedConfig);
    if (warning && !options.silent) {
        process.stderr.write('\n' + warning + '\n\n');
    }
    const recallOutput = await (0, retriever_1.recall)(query, repoRoot, config, engine, scope, explain, options.code ?? 'auto');
    let results = recallOutput.results;
    const { markdown, symbolResults } = recallOutput;
    // Path C: graph expansion (depth ≤ 2) — additive, non-fatal
    let graphExpandedResults = [];
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { CodeIndex } = require('../engines/code-index');
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const Database = require('better-sqlite3');
        const dbPath = CodeIndex.getDbPath(repoRoot);
        if (fs.existsSync(dbPath)) {
            const db = new Database(dbPath);
            try {
                const seeds = [
                    ...results.map((r) => ({ id: r.memory.name, node_type: 'memory' })),
                    ...(symbolResults ?? []).map((s) => ({
                        id: s.symbol.name,
                        node_type: 'symbol',
                    })),
                ];
                const expandedIds = (0, memory_graph_1.graphExpand)(db, seeds);
                const alreadyIn = new Set(results.map((r) => r.memory.name));
                const allMemories = (0, store_1.loadAll)(repoRoot);
                graphExpandedResults = expandedIds
                    .filter((id) => !alreadyIn.has(id))
                    .map((id) => allMemories.find((m) => m.name === id))
                    .filter((m) => m !== undefined)
                    .map((m) => ({ memory: m, score: 0.1 }));
            }
            finally {
                db.close();
            }
        }
    }
    catch {
        // better-sqlite3 absent or graph error — non-fatal
    }
    if (graphExpandedResults.length > 0) {
        results = (0, rrf_1.rrfMerge)(results, graphExpandedResults);
    }
    // Track recall misses (non-fatal)
    if (results.length === 0) {
        try {
            appendRecallMiss(repoRoot, query);
        }
        catch {
            /* non-fatal */
        }
    }
    if (options.format === 'json') {
        if (!options.silent) {
            process.stdout.write(JSON.stringify({ results, symbolResults }, null, 2) + '\n');
        }
        // Study hint from previous session's suggestions
        printStudyHint(repoRoot, options.silent ?? false);
        return;
    }
    if (!options.silent) {
        process.stdout.write(markdown + '\n');
    }
    const actualEngineName = engine instanceof text_engine_1.TextEngine && engineName === 'lancedb'
        ? 'text (fallback from lancedb)'
        : engineName;
    if (!options.dryRun) {
        (0, retriever_1.writeRecallResults)(repoRoot, results, query, actualEngineName);
        // Append scene navigation if scenes exist
        const sceneIndex = await (0, scene_index_1.readSceneIndex)(repoRoot);
        if (sceneIndex.length > 0) {
            const memoryPath = path.join(repoRoot, 'MEMORY.md');
            const existing = fs.existsSync(memoryPath) ? fs.readFileSync(memoryPath, 'utf-8') : '';
            const stripped = (0, scene_navigation_1.stripSceneNavigation)(existing);
            const nav = (0, scene_navigation_1.generateSceneNavigation)(repoRoot, sceneIndex);
            fs.writeFileSync(memoryPath, stripped + '\n\n' + nav, 'utf-8');
        }
    }
    // Study hint from previous session's suggestions
    printStudyHint(repoRoot, options.silent ?? false);
}
//# sourceMappingURL=recall.js.map