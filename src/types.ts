export type MemoryType = 'lesson' | 'decision' | 'workflow' | 'architecture';
export type Engine = 'text' | 'lancedb';
export type Confidence = 'low' | 'medium' | 'high';
export type MemoryScope = 'personal' | 'project' | 'workspace';
export type Status = 'experimental' | 'active' | 'needs-review' | 'deprecated';

export interface MemoryFile {
  path: string;
  name: string;
  type: MemoryType;
  description: string;
  tags: string[];
  created: string;
  updated?: string;
  review_after?: string;
  confidence?: Confidence;
  status?: Status; // NEW
  content: string;
  scope?: MemoryScope;
  project?: string; // source project ID (e.g. "org/repo"), written to frontmatter
}

export interface ScoreBreakdown {
  keyword: number;
  tags: number;
  recency: number;
}

export interface RecallResult {
  memory: MemoryFile;
  score: number;
  scoreBreakdown?: ScoreBreakdown;
}

export interface WorkspaceConfig {
  // renamed from TeamConfig
  remote: string;
  enabled?: boolean; // opt-in flag
  auto_sync: boolean;
  branch: string;
  path?: string; // subdirectory within remote repo
}

export interface LifecycleConfig {
  experimental_ttl_days: number;
  active_to_review_days: number;
  review_to_deprecated_days: number;
  review_recall_threshold: number;
  decay_window_days: number;
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
  lifecycle?: LifecycleConfig; // NEW
  workspace?: WorkspaceConfig; // renamed from team
  reranker?: {
    enabled: boolean;
    provider: 'jina' | 'cohere';
    model?: string;
    top_n?: number;
  };
}

export interface ExtractionResult {
  name: string;
  type: MemoryType;
  description: string;
  tags: string[];
  confidence: Confidence;
  content: string;
}
