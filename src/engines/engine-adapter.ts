/**
 * Shared engine adapter interface
 * All search engines must implement this interface
 */

import { MemoryFile, RecallResult } from '../types';

export interface EngineAdapter {
  /**
   * Search for memories matching a query
   * @param query - Search query string
   * @param memories - All memories to search through
   * @param topK - Maximum number of results to return
   * @returns Array of recall results sorted by score (descending)
   */
  search(query: string, memories: MemoryFile[], topK: number): Promise<RecallResult[]>;

  /**
   * Index memories (optional - some engines don't need pre-indexing)
   * @param memories - Memories to index
   * @param incremental - Whether to update incrementally or rebuild
   */
  index?(memories: MemoryFile[], incremental: boolean): Promise<void>;
}
