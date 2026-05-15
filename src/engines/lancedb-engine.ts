/**
 * LanceDB Engine
 * Vector search engine using LanceDB with hybrid BM25 + vector search
 */

import * as path from 'path';
import { createHash } from 'crypto';
import type { MemoryFile, RecallResult } from '../types';
import type { EngineAdapter } from './engine-adapter';
import type { EmbeddingGenerator } from '../core/embedding';
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
  contentHash: string;
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
        contentHash: this.contentHash(memory),
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

    // Get existing indexed records for incremental update (path → contentHash)
    const existingHashMap = new Map<string, string>();
    if (incremental) {
      try {
        const allData = await this.table.query().limit(10000).toArray();
        for (const row of allData as Array<Record<string, unknown>>) {
          existingHashMap.set(row.path as string, (row.contentHash as string) ?? '');
        }
      } catch {
        // Table empty or error
      }
    }

    // Filter memories that need indexing: new or content changed
    const memoriesToIndex = memories.filter((m) => {
      if (!incremental) {
        return true;
      }
      const storedHash = existingHashMap.get(m.path);
      return storedHash === undefined || storedHash !== this.contentHash(m);
    });

    if (memoriesToIndex.length === 0) {
      console.log('No new or updated memories to index');
      return;
    }

    // Generate embeddings for new/updated memories
    const newTexts = memoriesToIndex.map((m) => this.getEmbeddingText(m));
    const newEmbeddings = await this.embeddingGenerator.generateEmbeddings(newTexts);

    // Prepare data for insertion
    const newDataToInsert: LanceDbRecord[] = memoriesToIndex
      .map((memory, i) => ({
        id: this.memoryId(memory),
        path: memory.path,
        name: memory.name,
        description: memory.description,
        tags: memory.tags.join(', '),
        content: memory.content,
        contentHash: this.contentHash(memory),
        vector: newEmbeddings[i] ?? [],
        created: memory.created,
        updated: memory.updated || memory.created,
        confidence: memory.confidence || 'medium',
      }))
      .filter((item) => item.vector.length > 0);

    // Delete stale entries (updated or re-indexed paths)
    const pathsToDelete = memoriesToIndex
      .filter((m) => existingHashMap.has(m.path))
      .map((m) => m.path);

    for (const p of pathsToDelete) {
      try {
        await this.table.delete(`path = "${p.replace(/"/g, '""')}"`);
      } catch {
        // Ignore delete errors
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
          numSubVectors: Math.floor(this.embeddingGenerator.getDimensions() / 8),
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
        const distance = (row as Record<string, unknown>)._distance as number | undefined;
        const vectorScore = 1 - (distance ?? 0); // Convert distance to similarity

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
    const hash = createHash('sha256').update(memory.path).digest('hex');
    return hash.slice(0, 16);
  }

  /**
   * Hash memory content for change detection
   */
  private contentHash(memory: MemoryFile): string {
    return createHash('sha256')
      .update(memory.content + memory.description + memory.tags.join(','))
      .digest('hex');
  }

  /**
   * Convert LanceDB row to MemoryFile with defensive null checks
   */
  private rowToMemory(row: Record<string, unknown>): MemoryFile {
    return {
      path: (row.path as string) || '',
      name: (row.name as string) || '',
      type: this.inferType((row.name as string) || ''),
      description: (row.description as string) || '',
      tags: ((row.tags as string) || '').split(', ').filter((t: string) => t.length > 0),
      created: (row.created as string) || new Date().toISOString(),
      updated: row.updated as string,
      confidence: (row.confidence as 'low' | 'medium' | 'high') || 'medium',
      content: (row.content as string) || '',
    };
  }

  /**
   * Infer memory type from name/path
   */
  private inferType(name: string): MemoryFile['type'] {
    const lower = name.toLowerCase();
    if (lower.includes('lesson')) {
      return 'lesson';
    }
    if (lower.includes('decision')) {
      return 'decision';
    }
    if (lower.includes('workflow')) {
      return 'workflow';
    }
    if (lower.includes('architecture')) {
      return 'architecture';
    }
    return 'lesson'; // default
  }
}
