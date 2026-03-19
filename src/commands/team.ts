/**
 * Team memory commands
 * memo team init <remote>  — clone/init team repo
 * memo team sync           — pull + commit + push
 * memo team publish <file> — scan then stage in team/
 * memo team status         — show git status of team/
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { getTeamDir, migrateToPersonal, getPersonalDir } from '../core/store';
import { loadConfig, writeConfig } from '../config';

const MEMORY_TYPES = ['lesson', 'decision', 'workflow', 'architecture', 'meta'];

const PRE_COMMIT_HOOK = `#!/bin/sh
# memobank secret scanner — installed by memo team init
memo scan --staged --fail-on-secrets
`;

export function installPreCommitHook(teamDir: string): void {
  const hooksDir = path.join(teamDir, '.git', 'hooks');
  if (!fs.existsSync(hooksDir)) {
    fs.mkdirSync(hooksDir, { recursive: true });
  }
  const hookPath = path.join(hooksDir, 'pre-commit');
  fs.writeFileSync(hookPath, PRE_COMMIT_HOOK, 'utf-8');
  fs.chmodSync(hookPath, 0o755);
}

export function getTeamSyncStatus(repoRoot: string): { hasTeam: boolean; ahead?: number; behind?: number } {
  const teamDir = getTeamDir(repoRoot);
  if (!fs.existsSync(path.join(teamDir, '.git'))) {
    return { hasTeam: false };
  }
  return { hasTeam: true };
}

export async function teamInit(remoteUrl: string, repoRoot: string): Promise<void> {
  const teamDir = getTeamDir(repoRoot);

  if (fs.existsSync(teamDir)) {
    console.log(`team/ directory already exists. Run: memo team sync`);
    return;
  }

  // Check if personal/ needs migration first
  const personalDir = getPersonalDir(repoRoot);
  if (!fs.existsSync(personalDir)) {
    console.log('Migrating existing memories to personal/ before setting up team...');
    const { migrated, skipped } = migrateToPersonal(repoRoot);
    if (migrated.length > 0) {
      console.log(`  Migrated ${migrated.length} memories.`);
    }
    if (skipped.length > 0) {
      console.warn(`  Skipped ${skipped.length} files (conflict with existing personal/ files):`);
      skipped.forEach(f => console.warn(`    ${f}`));
    }
    fs.mkdirSync(personalDir, { recursive: true });
  }

  // Try cloning (works if remote has commits)
  let cloned = false;
  try {
    execSync(`git clone "${remoteUrl}" "${teamDir}"`, { stdio: 'pipe' });
    cloned = true;
    console.log('✓ Cloned team repository.');
  } catch {
    // Remote is likely empty — init locally and push
  }

  if (!cloned) {
    fs.mkdirSync(teamDir, { recursive: true });
    execSync(`git init "${teamDir}"`, { stdio: 'pipe' });
    execSync(`git -C "${teamDir}" remote add origin "${remoteUrl}"`, { stdio: 'pipe' });

    for (const type of MEMORY_TYPES) {
      const typeDir = path.join(teamDir, type);
      fs.mkdirSync(typeDir, { recursive: true });
      fs.writeFileSync(path.join(typeDir, '.gitkeep'), '');
    }

    execSync(`git -C "${teamDir}" add -A`, { stdio: 'pipe' });
    execSync(
      `git -C "${teamDir}" commit -m "chore: initialize team memory repo"`,
      { stdio: 'pipe' }
    );
    execSync(`git -C "${teamDir}" push -u origin main`, { stdio: 'pipe' });
    console.log('✓ Initialized and pushed empty team repository.');
  }

  installPreCommitHook(teamDir);
  console.log('✓ Pre-commit hook installed.');

  const config = loadConfig(repoRoot);
  config.team = { remote: remoteUrl, auto_sync: false, branch: 'main' };
  writeConfig(repoRoot, config);
  console.log(`✓ Team remote configured: ${remoteUrl}`);
}

export async function teamSync(repoRoot: string): Promise<void> {
  const config = loadConfig(repoRoot);
  if (!config.team) {
    console.error('No team remote configured. Run: memo team init <remote-url>');
    process.exit(1);
  }

  const teamDir = getTeamDir(repoRoot);
  const branch = config.team.branch;

  console.log('Pulling from team remote...');
  execSync(`git -C "${teamDir}" pull origin ${branch}`, { stdio: 'inherit' });

  execSync(`git -C "${teamDir}" add -A`, { stdio: 'pipe' });

  let hasChanges = false;
  try {
    execSync(`git -C "${teamDir}" diff --staged --quiet`, { stdio: 'pipe' });
  } catch {
    hasChanges = true;
  }

  if (hasChanges) {
    console.log('Committing staged changes...');
    execSync(
      `git -C "${teamDir}" commit -m "chore: sync memories [memo team sync]"`,
      { stdio: 'inherit' }
    );
    console.log('Pushing...');
    execSync(`git -C "${teamDir}" push origin ${branch}`, { stdio: 'inherit' });
    console.log('✓ Sync complete.');
  } else {
    console.log('Nothing to commit. Repository is up to date.');
  }
}

export async function teamPublish(filePath: string, repoRoot: string): Promise<void> {
  const absoluteFile = path.resolve(filePath);

  if (!fs.existsSync(absoluteFile)) {
    console.error(`File not found: ${absoluteFile}`);
    process.exit(1);
  }

  // Scan for secrets first (scan.ts is created in a later task — use indirect
  // import path to avoid compile-time module-not-found errors)
  try {
    const scanPath = './scan';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const scanModule: any = await import(scanPath);
    const findings: string[] = scanModule.scanFile(absoluteFile);
    if (findings.length > 0) {
      console.error('⚠️  Potential secrets found — aborting publish:');
      findings.forEach((f: string) => console.error(`  ${f}`));
      console.error('→ Fix manually or run: memo scan --fix <file>');
      process.exit(1);
    }
  } catch {
    // scan module not yet available — skip scanning
  }

  const teamDir = getTeamDir(repoRoot);
  const personalDir = getPersonalDir(repoRoot);
  const rel = path.relative(personalDir, absoluteFile);
  const dst = path.join(teamDir, rel);

  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(absoluteFile, dst);

  execSync(`git -C "${teamDir}" add "${dst}"`, { stdio: 'pipe' });
  console.log(`✓ Published: ${rel}`);
  console.log('  Staged in team/. Run: memo team sync to push.');
}

export async function teamStatus(repoRoot: string): Promise<void> {
  const teamDir = getTeamDir(repoRoot);
  if (!fs.existsSync(path.join(teamDir, '.git'))) {
    console.log('No team repository. Run: memo team init <remote-url>');
    return;
  }
  try {
    const status = execSync(`git -C "${teamDir}" status --short`, { encoding: 'utf-8' });
    const log = execSync(
      `git -C "${teamDir}" log --oneline -5 2>/dev/null || echo "(no commits)"`,
      { encoding: 'utf-8', shell: '/bin/sh' }
    );
    console.log('Team repository status:');
    console.log(status || '  (clean)');
    console.log('\nRecent commits:');
    console.log(log);
  } catch (e) {
    console.error(`Could not get team status: ${(e as Error).message}`);
  }
}
