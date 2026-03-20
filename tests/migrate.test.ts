import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

function makeLegacyRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-migrate-'));
  fs.mkdirSync(path.join(dir, 'meta'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'meta', 'config.yaml'), 'project:\n  name: test\n');
  // personal/ layout
  fs.mkdirSync(path.join(dir, 'personal', 'lesson'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'personal', 'lesson', '2026-01-01-personal.md'),
    '---\nname: personal-mem\ntype: lesson\ndescription: desc\ntags: []\ncreated: "2026-01-01"\n---\nContent'
  );
  // team/ layout
  fs.mkdirSync(path.join(dir, 'team', 'lesson'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'team', 'lesson', '2026-01-01-team.md'),
    '---\nname: team-mem\ntype: lesson\ndescription: desc\ntags: []\ncreated: "2026-01-01"\n---\nContent'
  );
  return dir;
}

describe('migrate --dry-run', () => {
  it('reports files that would move without changing them', async () => {
    const { migrate } = await import('../src/commands/migrate');
    const repo = makeLegacyRepo();
    const globalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-global-'));
    const result = await migrate(repo, globalDir, { dryRun: true });
    expect(result.personalMoves.length).toBeGreaterThan(0);
    expect(result.teamMoves.length).toBeGreaterThan(0);
    // Files unchanged
    expect(fs.existsSync(path.join(repo, 'personal', 'lesson', '2026-01-01-personal.md'))).toBe(true);
    fs.rmSync(repo, { recursive: true });
    fs.rmSync(globalDir, { recursive: true });
  });
});

describe('migrate', () => {
  it('moves personal/ to globalDir and team/ to repo root', async () => {
    const { migrate } = await import('../src/commands/migrate');
    const repo = makeLegacyRepo();
    const globalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-global-'));
    await migrate(repo, globalDir, {});
    expect(fs.existsSync(path.join(globalDir, 'lesson', '2026-01-01-personal.md'))).toBe(true);
    expect(fs.existsSync(path.join(repo, 'lesson', '2026-01-01-team.md'))).toBe(true);
    // Backups preserved
    expect(fs.existsSync(path.join(repo, 'personal.bak'))).toBe(true);
    expect(fs.existsSync(path.join(repo, 'team.bak'))).toBe(true);
    fs.rmSync(repo, { recursive: true });
    fs.rmSync(globalDir, { recursive: true });
  });

  it('is idempotent: re-running skips already migrated files', async () => {
    const { migrate } = await import('../src/commands/migrate');
    const repo = makeLegacyRepo();
    const globalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-global-'));
    await migrate(repo, globalDir, {});
    await migrate(repo, globalDir, {});  // should not throw
    fs.rmSync(repo, { recursive: true });
    fs.rmSync(globalDir, { recursive: true });
  });
});
