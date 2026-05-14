import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import type { MemoConfig, Engine, WorkspaceConfig, LifecycleConfig } from './types';

const DEFAULT_LIFECYCLE: LifecycleConfig = {
  experimental_ttl_days: 30,
  active_to_review_days: 90,
  review_to_deprecated_days: 90,
  review_recall_threshold: 3,
  decay_window_days: 180,
};

const DEFAULT_CONFIG: MemoConfig = {
  project: { name: 'default', description: '' },
  memory: { token_budget: 2000, top_k: 5 },
  embedding: {
    engine: 'text' as Engine,
    provider: 'openai',
    model: 'text-embedding-3-small',
    dimensions: 1536,
    base_url: undefined,
  },
  search: { use_tags: true, use_summary: true },
  review: { enabled: true },
  lifecycle: { ...DEFAULT_LIFECYCLE },
};

function getConfigPath(repoRoot: string): string {
  // Primary location: .memobank/meta/config.yaml
  // Alias: .memobank/config.yaml — accepted for user convenience, with a migration hint.
  const canonical = path.join(repoRoot, 'meta', 'config.yaml');
  const alias = path.join(repoRoot, 'config.yaml');
  if (!fs.existsSync(canonical) && fs.existsSync(alias)) {
    console.warn(
      `⚠️  memobank: config found at .memobank/config.yaml (old location).\n` +
        `   Move it to .memobank/meta/config.yaml to silence this warning.\n`
    );
    return alias;
  }
  return canonical;
}

export function loadConfig(repoRoot: string): MemoConfig {
  const configPath = getConfigPath(repoRoot);
  if (!fs.existsSync(configPath)) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const loaded = yaml.load(content) as any;

    // Alias team: → workspace: for backward compat
    if (loaded?.team && !loaded?.workspace) {
      loaded.workspace = loaded.team;
      delete loaded.team;
    }

    return {
      project: { ...DEFAULT_CONFIG.project, ...loaded?.project },
      memory: { ...DEFAULT_CONFIG.memory, ...loaded?.memory },
      embedding: { ...DEFAULT_CONFIG.embedding, ...loaded?.embedding },
      search: { ...DEFAULT_CONFIG.search, ...loaded?.search },
      review: { ...DEFAULT_CONFIG.review, ...loaded?.review },
      lifecycle: { ...DEFAULT_LIFECYCLE, ...loaded?.lifecycle },
      ...(loaded?.workspace ? { workspace: loaded.workspace as WorkspaceConfig } : {}),
      ...(loaded?.reranker ? { reranker: loaded.reranker } : {}),
    };
  } catch (error) {
    console.warn(`Could not load config: ${(error as Error).message}`);
    return { ...DEFAULT_CONFIG };
  }
}

export function writeConfig(repoRoot: string, config: MemoConfig): void {
  const configPath = getConfigPath(repoRoot);
  const configDir = path.dirname(configPath);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  try {
    const content = yaml.dump(config, { indent: 2 });
    fs.writeFileSync(configPath, content, 'utf-8');
  } catch (error) {
    throw new Error(`Could not write config: ${(error as Error).message}`);
  }
}

export function initConfig(repoRoot: string, projectName: string): void {
  const configPath = getConfigPath(repoRoot);
  if (fs.existsSync(configPath)) {
    // Preserve existing user config — only ensure project.name is set.
    const existing = loadConfig(repoRoot);
    if (!existing.project?.name) {
      writeConfig(repoRoot, { ...existing, project: { ...existing.project, name: projectName } });
    }
    return;
  }
  writeConfig(repoRoot, { ...DEFAULT_CONFIG, project: { name: projectName } });
}

export { DEFAULT_LIFECYCLE };
