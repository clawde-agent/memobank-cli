import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

function osHomeDir(): string {
  return process.env.HOME || process.env.USERPROFILE || '';
}

export function getGlobalDir(projectName: string): string {
  return path.join(osHomeDir(), '.memobank', projectName);
}

export function getProjectDir(repoRoot: string): string {
  return repoRoot;
}

export function getWorkspaceDir(workspaceName: string): string {
  return path.join(osHomeDir(), '.memobank', '_workspace', workspaceName);
}

export function resolveWorkspaceDir(workspace: { remote: string; local_path?: string }): string {
  if (workspace.local_path) {
    return workspace.local_path;
  }
  const wsName = path.basename(workspace.remote, '.git') || '_workspace';
  return path.join(osHomeDir(), '.memobank', '_workspace', wsName);
}

export function findRepoRoot(cwd: string, repoFlag?: string): string {
  if (repoFlag) {
    return path.resolve(repoFlag);
  }
  const envRepo = process.env.MEMOBANK_REPO;
  if (envRepo) {
    return path.resolve(envRepo);
  }

  let current = cwd;
  while (current !== path.dirname(current)) {
    const defaultConfigPath = path.join(current, '.memobank', 'meta', 'config.yaml');
    if (fs.existsSync(defaultConfigPath)) {
      return path.join(current, '.memobank');
    }
    if (fs.existsSync(path.join(current, 'meta', 'config.yaml'))) {
      return current;
    }
    current = path.dirname(current);
  }

  try {
    const gitRoot = path.join(cwd, '.git');
    if (fs.existsSync(gitRoot)) {
      const repoName = path.basename(cwd);
      return path.join(osHomeDir(), '.memobank', repoName);
    }
  } catch {
    /* ignore */
  }

  return path.join(osHomeDir(), '.memobank', 'default');
}

export function findGitRoot(cwd: string): string {
  let current = cwd;
  while (current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, '.git'))) {
      return current;
    }
    current = path.dirname(current);
  }
  return cwd;
}

export function resolveProjectId(memoBankDir: string): string {
  const gitCwd = path.dirname(memoBankDir);

  try {
    const remote = execSync('git remote get-url origin', {
      cwd: gitCwd,
      stdio: 'pipe',
      encoding: 'utf-8',
    }).trim();
    const match = remote.match(/[:/]([^/:]+\/[^/.]+?)(?:\.git)?$/);
    if (match?.[1]) {
      return match[1];
    }
  } catch {
    /* no remote or not a git repo — fall through */
  }

  try {
    const configPath = path.join(memoBankDir, 'meta', 'config.yaml');
    if (fs.existsSync(configPath)) {
      const raw = yaml.load(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown> | null;
      const name = (raw?.project as Record<string, unknown> | undefined)?.name as
        | string
        | undefined;
      if (name) {
        return name;
      }
    }
  } catch {
    /* config unreadable — fall through */
  }

  return path.basename(gitCwd);
}

export function assertRepoRootMatchesCwd(repoRoot: string, cwd: string): void {
  const cwdGitRoot = findGitRoot(cwd);
  if (cwdGitRoot === cwd && !fs.existsSync(path.join(cwd, '.git'))) {
    return;
  }
  const repoParent = path.dirname(repoRoot);
  const rel = path.relative(cwdGitRoot, repoParent);
  const isInside = !rel.startsWith('..') && !path.isAbsolute(rel);
  if (!isInside) {
    throw new Error(
      `Memobank project mismatch: repoRoot "${repoRoot}" does not belong to the git repo at "${cwdGitRoot}". ` +
        `Set MEMOBANK_REPO env var or run memo init in the correct directory.`
    );
  }
}
