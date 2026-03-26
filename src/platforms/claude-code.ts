/**
 * Claude Code platform install helper
 * Sets autoMemoryDirectory in ~/.claude/settings.json
 */

import * as fs from 'fs';
import * as path from 'path';

export interface ClaudeCodeSettings {
  autoMemoryEnabled?: boolean;
  autoMemoryDirectory?: string;
  hooks?: Record<string, unknown>;
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
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      settings = JSON.parse(content);
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

  // Set autoMemoryDirectory to the project tier root so Claude Code's
  // native auto-memory and memobank project memories share the same directory.
  settings.autoMemoryDirectory = repoRoot;

  // Remove any legacy memobank Stop hook (no longer needed — Claude Code's
  // native auto-memory writes directly to autoMemoryDirectory).
  const hooks = settings.hooks;
  if (hooks?.Stop) {
    const stopHooks = hooks.Stop as unknown[];
    const filtered = stopHooks.filter((h: unknown) => {
      const hookObj = h as Record<string, unknown>;
      // Legacy format: { hooks: [{ command: '...' }] }
      const hooksArray = hookObj.hooks as unknown[] | undefined;
      if (hooksArray && hooksArray.length > 0) {
        const firstHook = hooksArray[0] as Record<string, unknown> | undefined;
        const command = firstHook?.command as string | undefined;
        return !command?.includes('memo capture');
      }
      // Flat format: { command: '...' } — keep unless it is a memo capture hook
      const command = hookObj.command as string | undefined;
      return !command?.includes('memo capture');
    });
    const filteredUnknown = filtered as unknown;
    hooks.Stop = filteredUnknown;
    const stopLength = (hooks.Stop as unknown[])?.length ?? 0;
    if (stopLength === 0) {
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
  const currentStop = (hookMap.Stop as Array<{ command: string }> | undefined) ?? [];
  if (!currentStop.some((h) => h.command === STOP_HOOK)) {
    hookMap.Stop = [...currentStop, { command: STOP_HOOK }];
  }

  // Write settings
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
    console.log(`✓ Claude Code: autoMemoryDirectory configured`);
    return Promise.resolve(true);
  } catch (error) {
    console.error(`Could not write Claude settings: ${(error as Error).message}`);
    return Promise.resolve(false);
  }
}
