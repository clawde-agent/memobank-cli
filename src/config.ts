/**
 * Config module
 * Read and write meta/config.yaml
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { MemoConfig, Engine, TeamConfig } from './types';

const DEFAULT_CONFIG: MemoConfig = {
  project: {
    name: 'default',
    description: '',
  },
  memory: {
    token_budget: 500,
    top_k: 5,
  },
  embedding: {
    engine: 'text' as Engine,
    provider: 'openai',
    model: 'text-embedding-3-small',
    dimensions: 1536,
    base_url: undefined,
  },
  search: {
    use_tags: true,
    use_summary: true,
  },
  review: {
    enabled: true,
  },
};

/**
 * Get config file path
 */
function getConfigPath(repoRoot: string): string {
  return path.join(repoRoot, 'meta', 'config.yaml');
}

/**
 * Load config from repo root
 * Falls back to defaults if file doesn't exist
 */
export function loadConfig(repoRoot: string): MemoConfig {
  const configPath = getConfigPath(repoRoot);

  if (!fs.existsSync(configPath)) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const loaded = yaml.load(content) as Partial<MemoConfig>;

    // Merge with defaults
    return {
      project: {
        ...DEFAULT_CONFIG.project,
        ...loaded?.project,
      },
      memory: {
        ...DEFAULT_CONFIG.memory,
        ...loaded?.memory,
      },
      embedding: {
        ...DEFAULT_CONFIG.embedding,
        ...loaded?.embedding,
      },
      search: {
        ...DEFAULT_CONFIG.search,
        ...loaded?.search,
      },
      review: {
        ...DEFAULT_CONFIG.review,
        ...loaded?.review,
      },
      ...(loaded?.team ? { team: loaded.team as TeamConfig } : {}),
    };
  } catch (error) {
    console.warn(`Could not load config: ${(error as Error).message}`);
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Write config to repo root
 */
export function writeConfig(repoRoot: string, config: MemoConfig): void {
  const configPath = getConfigPath(repoRoot);
  const configDir = path.dirname(configPath);

  // Ensure meta directory exists
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

/**
 * Initialize config with project name
 */
export function initConfig(repoRoot: string, projectName: string): void {
  const config: MemoConfig = {
    ...DEFAULT_CONFIG,
    project: {
      name: projectName,
    },
  };

  writeConfig(repoRoot, config);
}
