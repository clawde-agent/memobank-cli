/**
 * Workspace memory commands (cross-repo, optional)
 * memo workspace init <remote>  — clone/init workspace repo
 * memo workspace sync           — pull latest; optionally push
 * memo workspace publish <file> — scan secrets + copy to workspace
 * memo workspace status         — show git status of local workspace clone
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync, execFileSync } from 'child_process';
import { loadConfig, writeConfig } from '../config';
import { scanFile } from './scan';

const MEMORY_TYPES = ['lesson', 'decision', 'workflow', 'architecture', 'meta'];

export function workspaceInit(remoteUrl: string, repoRoot: string): void {
  const config = loadConfig(repoRoot);
  const wsName = path.basename(remoteUrl, '.git');
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const wsDir = path.join(home, '.memobank', '_workspace', wsName);

  if (fs.existsSync(wsDir)) {
    console.log(`Workspace already initialized at ${wsDir}. Run: memo workspace sync`);
    return;
  }

  let cloned = false;
  try {
    execSync(`git clone "${remoteUrl}" "${wsDir}"`, { stdio: 'pipe' });
    cloned = true;
    console.log('✓ Cloned workspace repository.');
  } catch {
    /* remote may be empty */
  }

  if (!cloned) {
    fs.mkdirSync(wsDir, { recursive: true });
    execSync(`git init "${wsDir}"`, { stdio: 'pipe' });
    execSync(`git -C "${wsDir}" remote add origin "${remoteUrl}"`, { stdio: 'pipe' });
    for (const type of MEMORY_TYPES) {
      fs.mkdirSync(path.join(wsDir, type), { recursive: true });
      fs.writeFileSync(path.join(wsDir, type, '.gitkeep'), '');
    }
    execSync(`git -C "${wsDir}" add -A`, { stdio: 'pipe' });
    execSync(`git -C "${wsDir}" commit -m "chore: initialize workspace memory repo"`, {
      stdio: 'pipe',
    });
    try {
      execSync(`git -C "${wsDir}" push -u origin main`, { stdio: 'pipe' });
    } catch {
      /* push may fail for empty remotes — ok */
    }
    console.log('✓ Initialized workspace repository.');
  }

  config.workspace = { remote: remoteUrl, auto_sync: false, branch: 'main', path: '.memobank' };
  writeConfig(repoRoot, config);
  console.log(`✓ Workspace remote configured: ${remoteUrl}`);
}

export function workspaceSync(repoRoot: string, push = false): void {
  const config = loadConfig(repoRoot);
  if (!config.workspace?.remote) {
    console.error('No workspace remote configured. Run: memo workspace init <remote-url>');
    process.exit(1);
  }

  const wsName = path.basename(config.workspace.remote, '.git');
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const wsDir = path.join(home, '.memobank', '_workspace', wsName);
  const branch = config.workspace.branch ?? 'main';

  console.log('Pulling from workspace remote...');
  execFileSync('git', ['-C', wsDir, 'pull', 'origin', branch], { stdio: 'inherit' });

  if (push) {
    execSync(`git -C "${wsDir}" add -A`, { stdio: 'pipe' });
    let hasChanges = false;
    try {
      execSync(`git -C "${wsDir}" diff --staged --quiet`, { stdio: 'pipe' });
    } catch {
      hasChanges = true;
    }

    if (hasChanges) {
      execSync(`git -C "${wsDir}" commit -m "chore: workspace sync [memo workspace sync]"`, {
        stdio: 'inherit',
      });
      execFileSync('git', ['-C', wsDir, 'push', 'origin', branch], { stdio: 'inherit' });
      console.log('✓ Pushed to workspace remote.');
    } else {
      console.log('Nothing to push. Repository is up to date.');
    }
  } else {
    console.log('✓ Workspace memories synced.');
  }
}

export async function workspacePublish(
  filePath: string,
  repoRoot: string,
  wsDirOverride?: string
): Promise<void> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  // Resolve to absolute paths for security checks
  const absoluteFilePath = path.resolve(filePath);
  const absoluteRepoRoot = path.resolve(repoRoot);

  // Security: Ensure filePath is within repoRoot to prevent path traversal
  const rel = path.relative(absoluteRepoRoot, absoluteFilePath);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Security: File must be within repo root. Got: ${filePath}`);
  }

  // Secret scan
  try {
    const findings = scanFile(filePath);
    if (findings.length > 0) {
      console.error('⚠️  Potential secrets found — aborting publish:');
      findings.forEach((f) => console.error(`  ${f}`));
      console.error('→ Fix manually or run: memo scan --fix <file>');
      process.exit(1);
    }
  } catch {
    /* scan module unavailable — skip */
  }

  const config = loadConfig(repoRoot);
  const wsName = config.workspace?.remote
    ? path.basename(config.workspace.remote, '.git')
    : '_workspace';
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const wsDir = wsDirOverride ?? path.join(home, '.memobank', '_workspace', wsName);

  if (!fs.existsSync(wsDir)) {
    throw new Error(`Workspace not initialized. Run: memo workspace init <remote-url>`);
  }

  const dst = path.join(wsDir, rel);

  // Security: Ensure destination is within wsDir
  const absoluteDst = path.resolve(dst);
  const absoluteWsDir = path.resolve(wsDir);
  const dstRel = path.relative(absoluteWsDir, absoluteDst);
  if (dstRel.startsWith('..') || path.isAbsolute(dstRel)) {
    throw new Error(`Security: Destination must be within workspace directory`);
  }

  if (fs.existsSync(dst)) {
    console.warn(`⚠️  File already exists in workspace: ${rel}`);
    console.warn('  Overwriting. The workspace repo PR review is the governance gate.');
  }

  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(filePath, dst);
  console.log(`✓ Published: ${rel}`);
  console.log('  Run: memo workspace sync --push to share with team.');
}

export function workspaceStatus(repoRoot: string): void {
  const config = loadConfig(repoRoot);
  if (!config.workspace?.remote) {
    console.log('No workspace configured. Run: memo workspace init <remote-url>');
    return;
  }
  const wsName = path.basename(config.workspace.remote, '.git');
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const wsDir = path.join(home, '.memobank', '_workspace', wsName);

  if (!fs.existsSync(path.join(wsDir, '.git'))) {
    console.log(`Workspace directory not found: ${wsDir}`);
    return;
  }
  try {
    const status = execFileSync('git', ['-C', wsDir, 'status', '--short'], { encoding: 'utf-8' });
    let log = '';
    try {
      log = execFileSync('git', ['-C', wsDir, 'log', '--oneline', '-5'], { encoding: 'utf-8' });
    } catch {
      log = '(no commits)';
    }
    console.log('Workspace repository status:');
    console.log(status || '  (clean)');
    console.log('\nRecent commits:');
    console.log(log);
  } catch (e) {
    console.error(`Could not get workspace status: ${(e as Error).message}`);
  }
}
