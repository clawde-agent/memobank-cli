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
  codeRefs?: string[]; // NEW: Logical hashes of code symbols this memory anchors to
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

export type SymbolKind = 'function' | 'class' | 'interface' | 'type' | 'const' | 'method';
export type EdgeKind = 'calls' | 'imports' | 'inherits';
export type IndexedLanguage =
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'go'
  | 'rust'
  | 'yaml'
  | 'csharp';

export interface CodeSymbol {
  name: string;
  qualifiedName: string; // "ClassName.methodName" or same as name for top-level
  kind: SymbolKind;
  file: string; // relative path from scan root
  lineStart: number;
  lineEnd: number;
  signature?: string;
  docstring?: string; // up to 3 lines
  isExported: boolean;
  parentName?: string; // for methods: the class name
  memoryRefs?: string[]; // memory filenames
  hash?: string; // NEW: Logical hash of the symbol's implementation
}

export interface CodeEdge {
  sourceName: string; // qualified name of caller
  sourceFile: string;
  targetName: string; // name of callee (may be unresolved)
  targetFile?: string;
  kind: EdgeKind;
  line: number;
}

export interface SymbolResult {
  symbol: CodeSymbol;
  score: number; // 0–1, FTS5 rank normalized
}

export interface CodeScanOptions {
  summarize?: boolean;
  force?: boolean;
  langs?: IndexedLanguage[];
  repo?: string;
}

export interface RefsOptions {
  repo?: string;
  format?: 'text' | 'json';
}
