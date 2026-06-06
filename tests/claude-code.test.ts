import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { installClaudeCode } from '../src/platforms/claude-code';

describe('installClaudeCode — autoMemoryDirectory isolation', () => {
  it('removes autoMemoryDirectory from global settings to prevent cross-project collision', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-cctest-amd-'));
    const settingsPath = path.join(tmpDir, '.claude', 'settings.json');
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    // Pre-seed a stale global autoMemoryDirectory (as written by older memobank versions)
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({ autoMemoryDirectory: '/old/project/path' }),
      'utf-8'
    );

    const origHome = process.env.HOME;
    const origUserProfile = process.env.USERPROFILE;
    process.env.HOME = tmpDir;
    process.env.USERPROFILE = tmpDir;

    installClaudeCode(tmpDir, false);

    process.env.HOME = origHome;
    process.env.USERPROFILE = origUserProfile;

    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    expect(settings.autoMemoryDirectory).toBeUndefined();
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('writes autoMemoryDirectory to project-level settings.local.json when inside a git repo', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-cctest-proj-'));
    // Simulate a git repo with .memobank inside
    fs.mkdirSync(path.join(tmpDir, '.git'));
    const memobankDir = path.join(tmpDir, '.memobank');
    fs.mkdirSync(memobankDir);

    const globalClaudeDir = path.join(tmpDir, '_home', '.claude');
    fs.mkdirSync(globalClaudeDir, { recursive: true });

    const origHome = process.env.HOME;
    const origUserProfile = process.env.USERPROFILE;
    process.env.HOME = path.join(tmpDir, '_home');
    process.env.USERPROFILE = path.join(tmpDir, '_home');

    installClaudeCode(memobankDir, false);

    process.env.HOME = origHome;
    process.env.USERPROFILE = origUserProfile;

    const projectSettingsPath = path.join(tmpDir, '.claude', 'settings.local.json');
    expect(fs.existsSync(projectSettingsPath)).toBe(true);
    const projectSettings = JSON.parse(fs.readFileSync(projectSettingsPath, 'utf-8'));
    expect(projectSettings.autoMemoryDirectory).toBe(memobankDir);
    fs.rmSync(tmpDir, { recursive: true });
  });
});

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
