import type { MemoConfig, LifecycleConfig } from './types';
declare const DEFAULT_LIFECYCLE: LifecycleConfig;
export declare function loadConfig(repoRoot: string): MemoConfig;
export declare function writeConfig(repoRoot: string, config: MemoConfig): void;
export declare function initConfig(repoRoot: string, projectName: string): void;
export { DEFAULT_LIFECYCLE };
//# sourceMappingURL=config.d.ts.map