import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { installClaudeCode } from '../src/platforms/claude-code';

function makeTempHome(): { home: string; settingsPath: string; cleanup: () => void } {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-install-'));
  const settingsPath = path.join(home, '.claude', 'settings.json');
  const origHome = process.env.HOME;
  const origUserProfile = process.env.USERPROFILE;
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  return {
    home,
    settingsPath,
    cleanup: () => {
      process.env.HOME = origHome;
      process.env.USERPROFILE = origUserProfile;
      fs.rmSync(home, { recursive: true });
    },
  };
}

describe('installClaudeCode — Stop hook', () => {
  it('writes Stop hook for memo process-queue --background', async () => {
    const { settingsPath, cleanup } = makeTempHome();
    await installClaudeCode('/fake/repo');
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    const stopHooks = settings.hooks?.Stop as Array<{ command: string }> | undefined;
    expect(stopHooks).toBeDefined();
    expect(stopHooks!.some((h) => h.command.includes('process-queue --background'))).toBe(true);
    cleanup();
  });

  it('merges Stop hook without removing existing hooks', async () => {
    const { settingsPath, cleanup } = makeTempHome();
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        hooks: {
          Stop: [{ command: 'some-other-hook' }],
        },
      })
    );
    await installClaudeCode('/fake/repo');
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    const stopHooks = settings.hooks?.Stop as Array<{ command: string }>;
    expect(stopHooks.some((h) => h.command === 'some-other-hook')).toBe(true);
    expect(stopHooks.some((h) => h.command.includes('process-queue --background'))).toBe(true);
    cleanup();
  });

  it('does not add duplicate Stop hook if already present', async () => {
    const { settingsPath, cleanup } = makeTempHome();
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        hooks: { Stop: [{ command: 'memo process-queue --background' }] },
      })
    );
    await installClaudeCode('/fake/repo');
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    const stopHooks = settings.hooks?.Stop as Array<{ command: string }>;
    const count = stopHooks.filter((h) => h.command.includes('process-queue --background')).length;
    expect(count).toBe(1);
    cleanup();
  });
});
