/**
 * Claude Code platform install helper
 * Sets autoMemoryDirectory in ~/.claude/settings.json
 */

import * as fs from 'fs';
import * as path from 'path';

export interface ClaudeCodeSettings {
  autoMemoryDirectory?: string;
  [key: string]: any;
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
export async function installClaudeCode(repoRoot: string, enableAutoMemory: boolean = true): Promise<boolean> {
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
      settings = JSON.parse(content);
    } catch (error) {
      console.warn(`Could not read Claude settings: ${(error as Error).message}`);
      return false;
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
  if (settings.hooks?.Stop) {
    settings.hooks.Stop = settings.hooks.Stop.filter(
      (h: any) => !(h.hooks?.[0]?.command?.includes('memo capture'))
    );
    if (settings.hooks.Stop.length === 0) { delete settings.hooks.Stop; }
    if (Object.keys(settings.hooks).length === 0) { delete settings.hooks; }
  }

  // Write settings
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
    console.log(`✓ Claude Code: autoMemoryDirectory configured`);
    return true;
  } catch (error) {
    console.error(`Could not write Claude settings: ${(error as Error).message}`);
    return false;
  }
}
