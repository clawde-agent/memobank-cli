import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { installClaudeCode } from '../src/platforms/claude-code';

describe('installClaudeCode — UserPromptSubmit hook', () => {
  it('adds UserPromptSubmit hook with --hook-input command', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-cctest-'));
    const settingsPath = path.join(tmpDir, '.claude', 'settings.json');
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });

    const origHome = process.env.HOME;
    const origUserProfile = process.env.USERPROFILE;
    process.env.HOME = tmpDir;
    process.env.USERPROFILE = tmpDir;

    installClaudeCode(tmpDir, false);

    process.env.HOME = origHome;
    process.env.USERPROFILE = origUserProfile;

    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    const upHooks: Array<{ hooks?: Array<{ command?: string }> }> =
      settings.hooks?.UserPromptSubmit ?? [];
    const hasHookInput = upHooks.some((h) =>
      h.hooks?.some((cmd) => cmd.command?.includes('--hook-input'))
    );
    expect(hasHookInput).toBe(true);
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('is idempotent — installing twice does not duplicate UserPromptSubmit hook', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-cctest2-'));
    const settingsPath = path.join(tmpDir, '.claude', 'settings.json');
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });

    const origHome = process.env.HOME;
    const origUserProfile = process.env.USERPROFILE;
    process.env.HOME = tmpDir;
    process.env.USERPROFILE = tmpDir;

    installClaudeCode(tmpDir, false);
    installClaudeCode(tmpDir, false);

    process.env.HOME = origHome;
    process.env.USERPROFILE = origUserProfile;

    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    const upHooks: Array<{ hooks?: Array<{ command?: string }> }> =
      settings.hooks?.UserPromptSubmit ?? [];
    const hookInputCount = upHooks.filter((h) =>
      h.hooks?.some((cmd) => cmd.command?.includes('--hook-input'))
    ).length;
    expect(hookInputCount).toBe(1);
    fs.rmSync(tmpDir, { recursive: true });
  });
});
