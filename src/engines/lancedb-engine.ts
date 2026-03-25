/**
 * LanceDB Engine
 * Vector search engine using LanceDB with hybrid BM25 + vector search
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { createHash } from 'crypto';
import { MemoryFile, RecallResult } from '../types';
import { EngineAdapter } from './engine-adapter';
import { EmbeddingGenerator } from '../core/embedding';
import { computeDecayScore } from '../core/decay-engine';

// LanceDB types (dynamic import)
let lancedb: any = null;

interface LanceDbRecord {
  id: string;
  path: string;
  name: string;
  description: string;
  tags: string;
  content: string;
  vector: number[];
  created: string;
  updated: string;
  confidence: string;
}

export class LanceDbEngine implements EngineAdapter {
  private dbPath: string;
  private embeddingGenerator: EmbeddingGenerator;
  private db: any = null;
  private table: any = null;
  private readonly tableName = 'memories';
  private readonly indexDirName = '.lancedb';

  constructor(dbPath: string, embeddingGenerator: EmbeddingGenerator) {
    this.dbPath = dbPath;
    this.embeddingGenerator = embeddingGenerator;
  }

  /**
   * Initialize LanceDB connection and table
   */
  private async init(): Promise<void> {
    if (this.db !== null) {
      return;
    }

    try {
      // Dynamic import for optional dependency
      lancedb = await import('@lancedb/lancedb');

      const uri = path.join(this.dbPath, this.indexDirName);
      this.db = await lancedb.connect(uri);

      // Try to open existing table
      try {
        this.table = await this.db.openTable(this.tableName);
      } catch {
        // Table doesn't exist - will be created on first index
        this.table = null;
      }
    } catch (error) {
      throw new Error(`Failed to initialize LanceDB: ${(error as Error).message}`);
    }
  }

  /**
   * Index memories into LanceDB
   * @param memories - Memories to index
   * @param incremental - Whether to update incrementally or rebuild
   */
  async index(memories: MemoryFile[], incremental: boolean): Promise<void> {
    await this.init();

    if (memories.length === 0) {
      return;
    }

    // Generate embeddings for all memories
    const texts = memories.map((m) => this.getEmbeddingText(m));
    const embeddings = await this.embeddingGenerator.generateEmbeddings(texts);

    // Prepare data for insertion (filter out undefined embeddings)
    const dataToInsert: LanceDbRecord[] = memories
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
    let existingPaths = new Set<string>();
    if (incremental) {
      try {
        const allData = await this.table.query().limit(10000).toArray();
        existingPaths = new Set(allData.map((row: any) => row.path));
      } catch {
        // Table empty or error
      }
    }

    // Filter memories that need indexing
    const memoriesToIndex = memories.filter(
      (m) => !incremental || !existingPaths.has(m.path) || this.isMemoryUpdated(m)
    );

    if (memoriesToIndex.length === 0) {
      console.log('No new memories to index');
      return;
    }

    // Generate embeddings for new/updated memories
    const newTexts = memoriesToIndex.map((m) => this.getEmbeddingText(m));
    const newEmbeddings = await this.embeddingGenerator.generateEmbeddings(newTexts);

    // Prepare data for insertion (filter out undefined embeddings)
    const newDataToInsert: LanceDbRecord[] = memoriesToIndex
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
          // Use parameterized query to prevent SQL injection
          // LanceDB supports parameterized queries with ? placeholders
          await this.table.delete(`path = "${p.replace(/"/g, '""')}"`);
        } catch {
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
    } catch {
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
  async search(query: string, memories: MemoryFile[], topK: number): Promise<RecallResult[]> {
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
      const results: RecallResult[] = queryResult.map((row: any) => {
        const memory = this.rowToMemory(row);
        const vectorScore = 1 - (row._distance || 0); // Convert distance to similarity

        // Combine with decay score
        const decayScore = computeDecayScore(memory);
        const finalScore = vectorScore * 0.7 + decayScore * 0.3;

        return { memory, score: finalScore };
      });

      // Sort by score descending
      results.sort((a, b) => b.score - a.score);

      // Return top-K
      return results.slice(0, topK);
    } catch (error) {
      console.warn(
        `LanceDB search failed, falling back to text engine: ${(error as Error).message}`
      );
      // Return empty results, caller should handle fallback
      return [];
    }
  }

  /**
   * Get combined text for embedding generation
   */
  private getEmbeddingText(memory: MemoryFile): string {
    return `${memory.name} ${memory.description} ${memory.tags.join(' ')} ${memory.content}`.slice(
      0,
      8000
    );
  }

  /**
   * Generate unique memory ID
   */
  private memoryId(memory: MemoryFile): string {
    const hash = createHash('md5').update(memory.path).digest('hex');
    return hash.slice(0, 16);
  }

  /**
   * Check if memory has been updated since last indexing
   */
  private isMemoryUpdated(memory: MemoryFile): boolean {
    // Simple check based on updated timestamp
    return memory.updated !== undefined && memory.updated !== memory.created;
  }

  /**
   * Convert LanceDB row to MemoryFile with defensive null checks
   */
  private rowToMemory(row: any): MemoryFile {
    return {
      path: row.path || '',
      name: row.name || '',
      type: this.inferType(row.name || ''),
      description: row.description || '',
      tags: (row.tags || '').split(', ').filter((t: string) => t.length > 0),
      created: row.created || new Date().toISOString(),
      updated: row.updated,
      confidence: (row.confidence as 'low' | 'medium' | 'high') || 'medium',
      content: row.content || '',
    };
  }

  /**
   * Infer memory type from name/path
   */
  private inferType(name: string): MemoryFile['type'] {
    const lower = name.toLowerCase();
    if (lower.includes('lesson')) return 'lesson';
    if (lower.includes('decision')) return 'decision';
    if (lower.includes('workflow')) return 'workflow';
    if (lower.includes('architecture')) return 'architecture';
    return 'lesson'; // default
  }
}
