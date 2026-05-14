/**
 * Claude Code platform install helper
 * Sets autoMemoryDirectory in ~/.claude/settings.json
 * Schema: https://www.schemastore.org/claude-code-settings.json
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Hook command types per Claude Code schema
 */
interface HookCommand {
  type: 'command' | 'prompt' | 'agent' | 'http';
  command?: string; // for type: 'command'
  prompt?: string; // for type: 'prompt' | 'agent'
  url?: string; // for type: 'http'
  timeout?: number;
  async?: boolean;
  statusMessage?: string;
  model?: string;
  headers?: Record<string, string>;
  allowedEnvVars?: string[];
}

/**
 * Hook matcher entry per Claude Code schema
 * Each hook entry must have: { matcher?: string, hooks: HookCommand[] }
 */
interface HookMatcher {
  matcher?: string;
  hooks: HookCommand[];
}

/**
 * Claude Code settings interface per schema
 */
export interface ClaudeCodeSettings {
  autoMemoryEnabled?: boolean;
  autoMemoryDirectory?: string;
  hooks?: {
    Stop?: HookMatcher[];
    PreToolUse?: HookMatcher[];
    PostToolUse?: HookMatcher[];
    PermissionRequest?: HookMatcher[];
    UserPromptSubmit?: HookMatcher[];
    Notification?: HookMatcher[];
    [key: string]: HookMatcher[] | undefined;
  };
  [key: string]: unknown;
}

/**
 * Get Claude Code settings path
 */
function getSettingsPath(): string {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  return path.join(home, '.claude', 'settings.json');
}

/**
 * Install memobank for Claude Code
 * @param enableAutoMemory - explicitly set autoMemoryEnabled in settings (true to enable, false to leave unchanged)
 */
export function installClaudeCode(
  repoRoot: string,
  enableAutoMemory: boolean = true
): Promise<boolean> {
  const settingsPath = getSettingsPath();
  const settingsDir = path.dirname(settingsPath);

  // Ensure .claude directory exists
  if (!fs.existsSync(settingsDir)) {
    fs.mkdirSync(settingsDir, { recursive: true });
  }

  // Read or create settings
  let settings: ClaudeCodeSettings = {};

  if (fs.existsSync(settingsPath)) {
    try {
      const content = fs.readFileSync(settingsPath, 'utf-8');
      settings = JSON.parse(content) as typeof settings;
    } catch (error) {
      console.warn(`Could not read Claude settings: ${(error as Error).message}`);
      return Promise.resolve(false);
    }
  }

  // Only set autoMemoryEnabled when the user explicitly agreed during setup.
  // If they chose to keep it off, leave the setting untouched.
  if (enableAutoMemory) {
    settings.autoMemoryEnabled = true;
  }

  // Remove any legacy memobank Stop hook (no longer needed — Claude Code's
  // native auto-memory writes directly to autoMemoryDirectory).
  const hooks = settings.hooks;
  if (hooks?.Stop) {
    const stopHooks = hooks.Stop;
    const filtered = stopHooks.filter((h: HookMatcher) => {
      // Check for legacy memo capture hooks
      if (h.hooks && h.hooks.length > 0) {
        return !h.hooks.some(
          (cmd: HookCommand) => cmd.type === 'command' && cmd.command?.includes('memo capture')
        );
      }
      return true;
    });
    hooks.Stop = filtered;
    if (hooks.Stop.length === 0) {
      delete hooks.Stop;
    }
    if (Object.keys(hooks).length === 0) {
      delete settings.hooks;
    }
  }

  // Add process-queue Stop hook (merge, no duplicates)
  const STOP_HOOK = 'memo process-queue --background';
  if (!settings.hooks) {
    settings.hooks = {};
  }
  const hookMap = settings.hooks;
  const currentStop: HookMatcher[] = hookMap.Stop ?? [];
  const hasStopHook = currentStop.some((h: HookMatcher) =>
    h.hooks?.some((cmd: HookCommand) => cmd.type === 'command' && cmd.command === STOP_HOOK)
  );
  if (!hasStopHook) {
    hookMap.Stop = [
      ...currentStop,
      {
        matcher: '',
        hooks: [
          {
            type: 'command',
            command: STOP_HOOK,
            timeout: 5000,
            async: true,
            statusMessage: 'Saving memories...',
          },
        ],
      },
    ];
  }

  // Write settings
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
    console.log(`✓ Claude Code: memobank hooks installed`);
    return Promise.resolve(true);
  } catch (error) {
    console.error(`Could not write Claude settings: ${(error as Error).message}`);
    return Promise.resolve(false);
  }
}
