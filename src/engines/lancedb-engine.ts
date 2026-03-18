/**
 * LanceDB Engine (Optional)
 * This is a placeholder for the LanceDB vector search engine.
 * To use this feature, install: npm install vectordb openai
 *
 * This file provides type stubs only. The actual implementation
 * should be added when needed.
 */

import { MemoryFile, RecallResult } from '../types';
import { EngineAdapter } from './engine-adapter';

export class LanceDbEngine implements EngineAdapter {
  async search(query: string, memories: MemoryFile[], topK: number): Promise<RecallResult[]> {
    throw new Error('LanceDB engine is not implemented. Install vectordb and openai packages to enable vector search.');
  }

  async index(memories: MemoryFile[], incremental: boolean): Promise<void> {
    throw new Error('LanceDB engine is not implemented. Install vectordb and openai packages to enable vector search.');
  }
}