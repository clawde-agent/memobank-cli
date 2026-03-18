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
 */
export async function installClaudeCode(repoRoot: string): Promise<boolean> {
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

  // Set autoMemoryDirectory
  settings.autoMemoryDirectory = path.join(repoRoot, 'memory');

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