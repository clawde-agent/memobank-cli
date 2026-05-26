/**
 * Claude Code platform install helper
 * Installs memobank hooks in ~/.claude/settings.json
 * Schema: https://www.schemastore.org/claude-code-settings.json
 */

import * as fs from 'fs';
import * as os from 'os';
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

  // Remove any existing memobank Stop hook (capture or process-queue) before re-adding.
  // This ensures upgrades from the old process-queue-only hook to the combined hook work cleanly.
  const hooks = settings.hooks;
  if (hooks?.Stop) {
    hooks.Stop = hooks.Stop.filter((h: HookMatcher) => {
      if (!h.hooks?.length) return true;
      return !h.hooks.some(
        (cmd: HookCommand) =>
          cmd.type === 'command' &&
          (cmd.command?.includes('memo capture') || cmd.command?.includes('memo process-queue'))
      );
    });
    if (hooks.Stop.length === 0) delete hooks.Stop;
    if (Object.keys(hooks).length === 0) delete settings.hooks;
  }

  // Stop hook: capture transcripts then drain the pending queue.
  // Use powershell on Windows (PS 5.1 doesn't support && operator).
  const isWindows = os.platform() === 'win32';
  const STOP_HOOK_CMD = isWindows
    ? 'powershell -c "memo capture --auto --silent; memo process-queue --background"'
    : 'memo capture --auto --silent; memo process-queue --background 2>/dev/null || true';

  if (!settings.hooks) settings.hooks = {};
  const hookMap = settings.hooks;
  hookMap.Stop = [
    ...(hookMap.Stop ?? []),
    {
      matcher: '',
      hooks: [
        {
          type: 'command',
          command: STOP_HOOK_CMD,
          timeout: 60,
          async: true,
          statusMessage: 'Saving memories...',
        },
      ],
    },
  ];

  // UserPromptSubmit hook: auto-recall on every user message.
  // Remove existing memobank UserPromptSubmit hooks before re-adding (idempotent).
  const isWindowsUp = os.platform() === 'win32';
  const UP_HOOK_CMD = isWindowsUp
    ? 'powershell -c "memo recall --hook-input --silent --top 3"'
    : 'memo recall --hook-input --silent --top 3';

  if (hookMap.UserPromptSubmit) {
    hookMap.UserPromptSubmit = hookMap.UserPromptSubmit.filter(
      (h: HookMatcher) =>
        !h.hooks?.some(
          (cmd: HookCommand) =>
            cmd.type === 'command' && cmd.command?.includes('memo recall --hook-input')
        )
    );
    if (hookMap.UserPromptSubmit.length === 0) delete hookMap.UserPromptSubmit;
  }

  hookMap.UserPromptSubmit = [
    ...(hookMap.UserPromptSubmit ?? []),
    {
      matcher: '',
      hooks: [
        {
          type: 'command',
          command: UP_HOOK_CMD,
          timeout: 10,
        },
      ],
    },
  ];

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
