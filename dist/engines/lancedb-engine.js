"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LanceDBEngine = void 0;
const decay_engine_1 = require("../core/decay-engine");
const LanceDB = __importStar(require("vectordb"));
const openai_1 = __importDefault(require("openai"));
const fs_1 = require("fs");
const path_1 = require("path");
class LanceDBEngine {
    constructor() {
        this.db = null;
        this.table = null;
        this.openai = null;
        this.embeddingDimensions = 1536; // default for text-embedding-ada-002
        this.embeddingModel = 'text-embedding-ada-002';
        this.embeddingProvider = 'openai';
        this.tableName = 'memories';
        this.totalDocs = memories.length;
        this.avgDocLength = (Array.from(docLengths.values()).reduce((sum, len) => sum + len, 0) / totalDocs) || 1;
        // BM25 parameters
        this.k1 = 1.2;
        this.b = 0.75;
        this.scores = new Map();
        this.loadConfig();
    }
    loadConfig() {
        try {
            const configPath = (0, path_1.join)(process.cwd(), 'meta', 'config.yaml');
            if (require('fs').existsSync(configPath)) {
                const yaml = require('js-yaml');
                const config = yaml.load((0, fs_1.readFileSync)(configPath, 'utf8'));
                if (config.embedding) {
                    const emb = config.embedding;
                    this.embeddingProvider = emb.provider || 'openai';
                    this.embeddingModel = emb.model || this.embeddingModel;
                    this.embeddingBaseUrl = emb.base_url;
                    if (emb.dimensions) {
                        this.embeddingDimensions = emb.dimensions;
                    }
                }
            }
        }
        catch (e) {
            console.warn('Failed to load LanceDB engine config:', e);
        }
    }
    getOpenAIClient() {
        if (!this.openai) {
            this.openai = new openai_1.default({
                apiKey: process.env.OPENAI_API_KEY || '',
                baseURL: this.embeddingBaseUrl,
            });
        }
        return this.openai;
    }
    async getEmbedding(text) {
        const openai = this.getOpenAIClient();
        const res = await openai.embeddings.create({
            model: this.embeddingModel,
            input: text,
        });
        const embedding = res.data[0].embedding;
        // Ensure dimensionality matches expectation (could truncate/pad if needed)
        if (embedding.length > this.embeddingDimensions) {
            return embedding.slice(0, this.embeddingDimensions);
        }
        if (embedding.length < this.embeddingDimensions) {
            const padded = embedding.concat(new Array(this.embeddingDimensions - embedding.length).fill(0));
            return padded;
        }
        return embedding;
    }
    async ensureTable() {
        if (this.table)
            return this.table;
        try {
            this.db = await LanceDB.connect((0, path_1.join)(process.cwd(), '.lancedb'));
            // Check if table exists
            const tableNames = await this.db.tableNames();
            if (tableNames.includes(this.tableName)) {
                this.table = await this.db.openTable(this.tableName);
            }
            else {
                // Create new table (empty)
                this.table = await this.db.createTable(this.tableName, []);
            }
        }
        catch (e) {
            console.error('Failed to initialize LanceDB table:', e);
            throw e;
        }
        return this.table;
    }
    async index(memories, incremental) {
        const table = await this.ensureTable();
        if (!incremental) {
            // Drop and recreate table for full reindex
            try {
                await this.db.dropTable(this.tableName);
                this.table = null;
                // Recreate table
                return this.index(memories, false);
            }
            catch (e) {
                console.warn('Could not drop table:', e);
                // If we can't drop, we'll try to delete all rows and hope the schema remains
                try {
                    await this.table.delete('1=1');
                }
                catch (e2) {
                    console.error('Could not clear table:', e2);
                }
            }
        }
        // Process each memory
        for (const mem of memories) {
            try {
                // For upsert: delete existing row with same id, then add
                const escapedId = mem.path.replace(/'/g, "''");
                const predicate = "id = '" + escapedId + "'";
                await this.table.delete(predicate);
                // Generate embedding from name + description + content
                const textForEmbedding = `${mem.name} ${mem.description} ${mem.content}`;
                const vector = await this.getEmbedding(textForEmbedding);
                // Prepare row
                const row = {
                    id: mem.path,
                    name: mem.name,
                    description: mem.description,
                    tags: mem.tags.join(','),
                    content: mem.content,
                    created: mem.created ?? new Date().toISOString(),
                    vector: vector,
                };
                await this.table.add([row]);
            }
            catch (e) {
                console.error(`Failed to index memory ${mem.path}:`, e);
            }
        }
    }
    /**
     * Simple BM25 implementation
     */
    computeBM25Scores(query, memories) {
        const queryTokens = this.tokenize(query.toLowerCase());
        if (queryTokens.length === 0) {
            return new Map();
        }
        // Build term frequencies and document frequencies
        const termFreq = new Map(); // term -> docId -> freq
        const docLengths = new Map(); // docId -> length (in tokens)
        const docFreq = new Map(); // term -> number of docs containing term
        // First pass: compute term frequencies and doc lengths
        for (const mem of memories) {
            const tokens = this.tokenize((mem.name + ' ' + mem.description + ' ' + mem.content).toLowerCase());
            const freqMap = new Map();
            for (const token of tokens) {
                freqMap.set(token, (freqMap.get(token) ?? 0) + 1);
            }
            // Update global structures
            for (const [term, count] = freqMap, { if:  }; (!termFreq.has(term)); {
                termFreq, : .set(term, new Map())
            })
                termFreq.get(term).set(mem.path, count);
            docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
        }
        docLengths.set(mem.path, tokens.length);
    }
    for(, mem, of, memories) {
        let score = 0;
        const docLen = docLengths.get(mem.path) ?? 0;
        for (const term of queryTokens) {
            if (!docFreq.has(term))
                continue;
            const idf = Math.log((totalDocs - docFreq.get(term) + 0.5) / (docFreq.get(term) + 0.5) + 1);
            const tf = termFreq.get(term).get(mem.path) ?? 0;
            const denom = tf + k1 * (1 - b + b * (docLen / avgDocLength));
            score += idf * (tf * (k1 + 1)) / denom;
        }
        scores.set(mem.path, score);
    }
}
exports.LanceDBEngine = LanceDBEngine;
return scores;
tokenize(text, string);
string[];
{
    return text
        .toLowerCase()
        .replace(/[^\w\s-]/g, ' ')
        .split(/\s+/)
        .filter(token => token.length > 0);
}
async;
search(query, string, memories, types_1.MemoryFile[], topK, number);
Promise < types_1.RecallResult[] > {
    const: table = await this.ensureTable(),
    // Generate query embedding
    const: queryVector = await this.getEmbedding(query),
    // Perform vector search (kNN)
    const: vectorResults = await table.search(queryVector)
        .limit(topK * 2)
        .execute(),
    // Compute BM25 scores manually
    const: bm25Scores = this.computeBM25Scores(query, memories),
    // Normalize vector scores (distance to similarity)
    const: vectorScores, new: Map(),
    if(vectorResults) { }, : .length > 0
};
{
    // Assume results have _distance field
    const distances = vectorResults.map((r) => Number(r._distance ?? 0));
    const maxDist = Math.max(...distances);
    const minDist = Math.min(...distances);
    const distRange = maxDist - minDist || 1;
    for (const r of vectorResults) {
        const dist = Number(r._distance ?? 0);
        // Convert distance to similarity: 1 - normalized distance
        const norm = (dist - minDist) / distRange;
        const similarity = 1 - norm;
        vectorScores.set(r.id, similarity);
    }
}
// Normalize BM25 scores
if (bm25Scores.size > 0) {
    const bm25Vals = Array.from(bm25Scores.values());
    const maxScore = Math.max(...bm25Vals);
    const minScore = Math.min(...bm25Vals);
    const range = maxScore - minScore || 1;
    for (const [id, score] of bm25Scores) {
        const norm = (score - minScore) / range;
        bm25Scores.set(id, norm);
    }
}
// Get all candidate IDs
const candidateIds = new Set([...vectorScores.keys(), ...bm25Scores.keys()]);
const results = [];
for (const id of candidateIds) {
    const vecScore = vectorScores.get(id) ?? 0;
    const bm25Score = bm25Scores.get(id) ?? 0;
    const hybrid = vecScore * 0.7 + bm25Score * 0.3;
    // Find memory object
    const mem = memories.find(m => m.path === id);
    if (!mem)
        continue;
    const decayScore = (0, decay_engine_1.computeDecayScore)(mem);
    const finalScore = hybrid * 0.6 + decayScore * 0.4;
    results.push({ memory: mem, score: finalScore });
}
// Sort descending
results.sort((a, b) => b.score - a.score);
return results.slice(0, topK);
//# sourceMappingURL=lancedb-engine.js.map