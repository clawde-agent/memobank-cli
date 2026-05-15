import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { detectGemini } from '../platforms/gemini';
import { detectQwen } from '../platforms/qwen';

export interface PlatformItem {
  label: string;
  value: string;
  hint?: string;
  disabled?: boolean;
}

/** Detect git repo name from cwd */
export function detectProjectName(): string {
  try {
    const result = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf-8',
      stdio: 'pipe',
    }).trim();
    return path.basename(result);
  } catch {
    return path.basename(process.cwd());
  }
}

/** Detect which platforms are installed */
export function detectPlatforms(): PlatformItem[] {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const isInPath = (cmd: string): boolean => {
    try {
      execFileSync('which', [cmd], { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  };

  return [
    {
      label: 'Claude Code',
      value: 'claude-code',
      hint: fs.existsSync(path.join(home, '.claude', 'settings.json')) ? '✓ detected' : 'not found',
      disabled: false,
    },
    {
      label: 'Codex',
      value: 'codex',
      hint: isInPath('codex') ? '✓ detected' : 'not found',
    },
    {
      label: 'Gemini CLI',
      value: 'gemini',
      hint: detectGemini() ? '✓ detected' : 'not found',
    },
    {
      label: 'Qwen Code',
      value: 'qwen',
      hint: detectQwen() ? '✓ detected' : 'not found',
    },
    {
      label: 'Cursor',
      value: 'cursor',
      hint: fs.existsSync(path.join(process.cwd(), '.cursor')) ? '✓ detected' : 'not found',
    },
  ];
}
