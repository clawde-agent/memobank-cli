/**
 * Shared TypeScript interfaces for memobank-cli
 */

export type MemoryType = 'lesson' | 'decision' | 'workflow' | 'architecture';
export type Engine = 'text' | 'lancedb';
export type Confidence = 'low' | 'medium' | 'high';
export type MemoryScope = 'personal' | 'team' | 'all';

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
  scope?: MemoryScope;    // 'personal' | 'team' | undefined (legacy root-level)
}

export interface ScoreBreakdown {
  keyword: number;  // 0-1, weighted keyword match
  tags: number;     // 0-1, tag overlap score
  recency: number;  // 0-1, Weibull decay score
}

export interface RecallResult {
  memory: MemoryFile;
  score: number;                    // final composite score (0-1)
  scoreBreakdown?: ScoreBreakdown;  // present when --explain is requested
}

export interface TeamConfig {
  remote: string;
  auto_sync: boolean;
  branch: string;
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
  team?: TeamConfig;
}

export interface ExtractionResult {
  name: string;
  type: MemoryType;
  description: string;
  tags: string[];
  confidence: Confidence;
  content: string;
}
