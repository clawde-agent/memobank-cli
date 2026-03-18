/**
 * Shared TypeScript interfaces for memobank-cli
 */

export type MemoryType = 'lesson' | 'decision' | 'workflow' | 'architecture';
export type Engine = 'text' | 'lancedb';
export type Confidence = 'low' | 'medium' | 'high';

export interface MemoryFile {
  path: string;           // absolute path to .md file
  name: string;           // frontmatter slug
  type: MemoryType;
  description: string;    // one-sentence summary
  tags: string[];
  created: string;        // ISO date
  updated?: string;
  review_after?: string;  // e.g. "90d"
  confidence?: Confidence;
  content: string;        // Markdown body (below ---)
}

export interface RecallResult {
  memory: MemoryFile;
  score: number;          // final composite score (0-1)
}

export interface MemoConfig {
  project: { name: string; description?: string };
  memory: { token_budget: number; top_k: number };
  embedding: {
    engine: Engine;
    provider?: string;
    model?: string;
    base_url?: string;
    dimensions?: number;
  };
  search: { use_tags: boolean; use_summary: boolean };
  review: { enabled: boolean };
}

export interface ExtractionResult {
  name: string;
  type: MemoryType;
  description: string;
  tags: string[];
  confidence: Confidence;
  content: string;
}