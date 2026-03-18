/**
 * Config module
 * Read and write meta/config.yaml
 */
import { MemoConfig } from './types';
/**
 * Load config from repo root
 * Falls back to defaults if file doesn't exist
 */
export declare function loadConfig(repoRoot: string): MemoConfig;
/**
 * Write config to repo root
 */
export declare function writeConfig(repoRoot: string, config: MemoConfig): void;
/**
 * Initialize config with project name
 */
export declare function initConfig(repoRoot: string, projectName: string): void;
//# sourceMappingURL=config.d.ts.map