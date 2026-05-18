import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  installPostCommitHook,
  uninstallPostCommitHook,
  isHookInstalled,
} from '../src/core/hook-installer';

function makeFakeRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-hook-'));
  fs.mkdirSync(path.join(dir, '.git', 'hooks'), { recursive: true });
  return dir;
}

describe('installPostCommitHook', () => {
  it('creates .git/hooks/post-commit with memo index-code call', () => {
    const repo = makeFakeRepo();
    installPostCommitHook(repo);

    const hookPath = path.join(repo, '.git', 'hooks', 'post-commit');
    expect(fs.existsSync(hookPath)).toBe(true);
    const content = fs.readFileSync(hookPath, 'utf-8');
    expect(content).toContain('memo index-code');
    expect(content).toContain('--incremental');
    fs.rmSync(repo, { recursive: true });
  });

  it('makes the hook file executable', () => {
    const repo = makeFakeRepo();
    installPostCommitHook(repo);
    const hookPath = path.join(repo, '.git', 'hooks', 'post-commit');
    const stat = fs.statSync(hookPath);
    // owner execute bit
    expect(stat.mode & 0o100).toBeTruthy();
    fs.rmSync(repo, { recursive: true });
  });

  it('does not overwrite an existing hook not written by memobank', () => {
    const repo = makeFakeRepo();
    const hookPath = path.join(repo, '.git', 'hooks', 'post-commit');
    fs.writeFileSync(hookPath, '#!/bin/sh\necho "custom hook"\n');
    installPostCommitHook(repo);
    const content = fs.readFileSync(hookPath, 'utf-8');
    // Should append, not overwrite
    expect(content).toContain('custom hook');
    expect(content).toContain('memo index-code');
    fs.rmSync(repo, { recursive: true });
  });

  it('is idempotent — installing twice does not duplicate the memo block', () => {
    const repo = makeFakeRepo();
    installPostCommitHook(repo);
    installPostCommitHook(repo);
    const content = fs.readFileSync(path.join(repo, '.git', 'hooks', 'post-commit'), 'utf-8');
    const count = (content.match(/memobank:post-commit/g) ?? []).length;
    expect(count).toBe(1);
    fs.rmSync(repo, { recursive: true });
  });
});

describe('uninstallPostCommitHook', () => {
  it('removes the memobank block from hook file', () => {
    const repo = makeFakeRepo();
    installPostCommitHook(repo);
    uninstallPostCommitHook(repo);
    const hookPath = path.join(repo, '.git', 'hooks', 'post-commit');
    if (fs.existsSync(hookPath)) {
      const content = fs.readFileSync(hookPath, 'utf-8');
      expect(content).not.toContain('memobank:post-commit');
    }
    fs.rmSync(repo, { recursive: true });
  });
});

describe('isHookInstalled', () => {
  it('returns false when hook does not exist', () => {
    const repo = makeFakeRepo();
    expect(isHookInstalled(repo)).toBe(false);
    fs.rmSync(repo, { recursive: true });
  });

  it('returns true after install', () => {
    const repo = makeFakeRepo();
    installPostCommitHook(repo);
    expect(isHookInstalled(repo)).toBe(true);
    fs.rmSync(repo, { recursive: true });
  });
});
