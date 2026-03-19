"use strict";
/**
 * LanceDB Engine
 * Vector search engine using LanceDB with hybrid BM25 + vector search
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
exports.LanceDbEngine = void 0;
const path = __importStar(require("path"));
const crypto_1 = require("crypto");
const decay_engine_1 = require("../core/decay-engine");
// LanceDB types (dynamic import)
let lancedb = null;
class LanceDbEngine {
    dbPath;
    embeddingGenerator;
    db = null;
    table = null;
    tableName = 'memories';
    indexDirName = '.lancedb';
    constructor(dbPath, embeddingGenerator) {
        this.dbPath = dbPath;
        this.embeddingGenerator = embeddingGenerator;
    }
    /**
     * Initialize LanceDB connection and table
     */
    async init() {
        if (this.db !== null) {
            return;
        }
        try {
            // Dynamic import for optional dependency
            lancedb = await Promise.resolve().then(() => __importStar(require('@lancedb/lancedb')));
            const uri = path.join(this.dbPath, this.indexDirName);
            this.db = await lancedb.connect(uri);
            // Try to open existing table
            try {
                this.table = await this.db.openTable(this.tableName);
            }
            catch {
                // Table doesn't exist - will be created on first index
                this.table = null;
            }
        }
        catch (error) {
            throw new Error(`Failed to initialize LanceDB: ${error.message}`);
        }
    }
    /**
     * Index memories into LanceDB
     * @param memories - Memories to index
     * @param incremental - Whether to update incrementally or rebuild
     */
    async index(memories, incremental) {
        await this.init();
        if (memories.length === 0) {
            return;
        }
        // Generate embeddings for all memories
        const texts = memories.map((m) => this.getEmbeddingText(m));
        const embeddings = await this.embeddingGenerator.generateEmbeddings(texts);
        // Prepare data for insertion (filter out undefined embeddings)
        const dataToInsert = memories
            .map((memory, i) => ({
            id: this.memoryId(memory),
            path: memory.path,
            name: memory.name,
            description: memory.description,
            tags: memory.tags.join(', '),
            content: memory.content,
            vector: embeddings[i] ?? [],
            created: memory.created,
            updated: memory.updated || memory.created,
            confidence: memory.confidence || 'medium',
        }))
            .filter((item) => item.vector.length > 0);
        // Create table if it doesn't exist
        if (this.table === null) {
            if (dataToInsert.length === 0) {
                console.log('No valid memories to index (embeddings failed)');
                return;
            }
            this.table = await this.db.createTable(this.tableName, dataToInsert);
            console.log(`Created table with ${dataToInsert.length} records`);
            return;
        }
        // Get existing indexed paths for incremental update
        let existingPaths = new Set();
        if (incremental) {
            try {
                const allData = await this.table.query().limit(10000).toArray();
                existingPaths = new Set(allData.map((row) => row.path));
            }
            catch {
                // Table empty or error
            }
        }
        // Filter memories that need indexing
        const memoriesToIndex = memories.filter((m) => !incremental || !existingPaths.has(m.path) || this.isMemoryUpdated(m));
        if (memoriesToIndex.length === 0) {
            console.log('No new memories to index');
            return;
        }
        // Generate embeddings for new/updated memories
        const newTexts = memoriesToIndex.map((m) => this.getEmbeddingText(m));
        const newEmbeddings = await this.embeddingGenerator.generateEmbeddings(newTexts);
        // Prepare data for insertion (filter out undefined embeddings)
        const newDataToInsert = memoriesToIndex
            .map((memory, i) => ({
            id: this.memoryId(memory),
            path: memory.path,
            name: memory.name,
            description: memory.description,
            tags: memory.tags.join(', '),
            content: memory.content,
            vector: newEmbeddings[i] ?? [],
            created: memory.created,
            updated: memory.updated || memory.created,
            confidence: memory.confidence || 'medium',
        }))
            .filter((item) => item.vector.length > 0);
        // Delete old entries for updated memories
        if (incremental) {
            const updatedPaths = memoriesToIndex
                .filter((m) => this.isMemoryUpdated(m))
                .map((m) => m.path);
            for (const p of updatedPaths) {
                try {
                    await this.table.delete(`path = '${p.replace(/'/g, "''")}'`);
                }
                catch {
                    // Ignore delete errors
                }
            }
        }
        // Insert new data
        await this.table.add(newDataToInsert);
        console.log(`Added ${newDataToInsert.length} records`);
        // Create index for vector search (if not exists)
        try {
            await this.table.createIndex('vector', {
                config: lancedb.Index.ivfPq({
                    numPartitions: Math.max(1, Math.floor(memories.length / 100)),
                    numSubVectors: Math.floor(this.embeddingGenerator['config'].dimensions / 8),
                }),
            });
        }
        catch {
            // Index may already exist, ignore
        }
    }
    /**
     * Search for memories using hybrid vector + BM25 search
     * @param query - Search query string
     * @param memories - All memories (fallback for text search)
     * @param topK - Maximum number of results
     * @returns Array of recall results sorted by score
     */
    async search(query, memories, topK) {
        await this.init();
        // If table doesn't exist yet, return empty results
        if (this.table === null) {
            return [];
        }
        try {
            // Generate query embedding
            const queryEmbedding = await this.embeddingGenerator.generateEmbedding(query);
            // Vector search using nearestTo
            const queryResult = await this.table
                .query()
                .nearestTo(queryEmbedding)
                .limit(topK * 2)
                .toArray();
            // Convert to RecallResult with hybrid scoring
            const results = queryResult.map((row) => {
                const memory = this.rowToMemory(row);
                const vectorScore = 1 - (row._distance || 0); // Convert distance to similarity
                // Combine with decay score
                const decayScore = (0, decay_engine_1.computeDecayScore)(memory);
                const finalScore = vectorScore * 0.7 + decayScore * 0.3;
                return { memory, score: finalScore };
            });
            // Sort by score descending
            results.sort((a, b) => b.score - a.score);
            // Return top-K
            return results.slice(0, topK);
        }
        catch (error) {
            console.warn(`LanceDB search failed, falling back to text engine: ${error.message}`);
            // Return empty results, caller should handle fallback
            return [];
        }
    }
    /**
     * Get combined text for embedding generation
     */
    getEmbeddingText(memory) {
        return `${memory.name} ${memory.description} ${memory.tags.join(' ')} ${memory.content}`.slice(0, 8000);
    }
    /**
     * Generate unique memory ID
     */
    memoryId(memory) {
        const hash = (0, crypto_1.createHash)('md5').update(memory.path).digest('hex');
        return hash.slice(0, 16);
    }
    /**
     * Check if memory has been updated since last indexing
     */
    isMemoryUpdated(memory) {
        // Simple check based on updated timestamp
        return memory.updated !== undefined && memory.updated !== memory.created;
    }
    /**
     * Convert LanceDB row to MemoryFile
     */
    rowToMemory(row) {
        return {
            path: row.path,
            name: row.name,
            type: this.inferType(row.name),
            description: row.description,
            tags: row.tags.split(', ').filter((t) => t.length > 0),
            created: row.created,
            updated: row.updated,
            confidence: row.confidence,
            content: row.content,
        };
    }
    /**
     * Infer memory type from name/path
     */
    inferType(name) {
        const lower = name.toLowerCase();
        if (lower.includes('lesson'))
            return 'lesson';
        if (lower.includes('decision'))
            return 'decision';
        if (lower.includes('workflow'))
            return 'workflow';
        if (lower.includes('architecture'))
            return 'architecture';
        return 'lesson'; // default
    }
}
exports.LanceDbEngine = LanceDbEngine;
//# sourceMappingURL=lancedb-engine.js.map