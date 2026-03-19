import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { installPreCommitHook, getTeamSyncStatus } from '../src/commands/team';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'memo-team-test-'));
}

describe('installPreCommitHook', () => {
  it('creates pre-commit hook file in team/.git/hooks/', () => {
    const tmp = makeTempDir();
    const hooksDir = path.join(tmp, '.git', 'hooks');
    fs.mkdirSync(hooksDir, { recursive: true });
    installPreCommitHook(tmp);
    const hookPath = path.join(hooksDir, 'pre-commit');
    expect(fs.existsSync(hookPath)).toBe(true);
    const content = fs.readFileSync(hookPath, 'utf-8');
    expect(content).toContain('memo scan --staged --fail-on-secrets');
    fs.rmSync(tmp, { recursive: true });
  });

  it('makes pre-commit hook executable', () => {
    const tmp = makeTempDir();
    const hooksDir = path.join(tmp, '.git', 'hooks');
    fs.mkdirSync(hooksDir, { recursive: true });
    installPreCommitHook(tmp);
    const hookPath = path.join(hooksDir, 'pre-commit');
    const stat = fs.statSync(hookPath);
    expect(stat.mode & 0o100).toBeTruthy();
    fs.rmSync(tmp, { recursive: true });
  });
});

describe('getTeamSyncStatus', () => {
  it('returns { hasTeam: false } when team/ does not exist', () => {
    const tmp = makeTempDir();
    const status = getTeamSyncStatus(tmp);
    expect(status.hasTeam).toBe(false);
    fs.rmSync(tmp, { recursive: true });
  });

  it('returns { hasTeam: true } when team/ exists with .git', () => {
    const tmp = makeTempDir();
    fs.mkdirSync(path.join(tmp, 'team', '.git'), { recursive: true });
    const status = getTeamSyncStatus(tmp);
    expect(status.hasTeam).toBe(true);
    fs.rmSync(tmp, { recursive: true });
  });
});
