/**
 * Scan command
 * memo scan [path]           — scan memory files for secrets
 * memo scan --staged         — scan git-staged .md files (used by pre-commit hook)
 * memo scan --fail-on-secrets — exit 1 if secrets found
 * memo scan --fix            — redact secrets in-place and re-stage
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync, execFileSync } from 'child_process';
import { glob } from 'glob';
import { scanForSecrets, sanitize } from '../core/sanitizer';
import { findRepoRoot } from '../core/store';

export interface ScanResult {
  file: string;
  findings: string[];
}

/**
 * Scan a single file for secrets
 */
export function scanFile(filePath: string): string[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  return scanForSecrets(content);
}

/**
 * Scan all .md files in a directory recursively
 */
export function scanDirectory(dir: string): ScanResult[] {
  const results: ScanResult[] = [];
  const files = glob.sync(path.join(dir, '**', '*.md'));

  for (const file of files) {
    const findings = scanFile(file);
    if (findings.length > 0) {
      results.push({ file, findings });
    }
  }

  return results;
}

/**
 * Get git-staged .md files in the repository at cwd
 */
function getStagedMdFiles(cwd: string): string[] {
  try {
    const output = execSync(
      'git diff --staged --name-only --diff-filter=ACM',
      { cwd, encoding: 'utf-8', stdio: 'pipe' }
    );
    return output
      .trim()
      .split('\n')
      .filter(Boolean)
      .filter(f => f.endsWith('.md'))
      .map(f => path.join(cwd, f));
  } catch {
    return [];
  }
}

export interface ScanCommandOptions {
  staged?: boolean;
  failOnSecrets?: boolean;
  fix?: boolean;
  repo?: string;
}

export async function scanCommand(scanPath: string | undefined, options: ScanCommandOptions): Promise<void> {
  let results: ScanResult[] = [];

  if (options.staged) {
    // Staged mode: scan staged files in cwd (used by pre-commit hook)
    const cwd = process.cwd();
    const stagedFiles = getStagedMdFiles(cwd);

    for (const file of stagedFiles) {
      const findings = scanFile(file);
      if (findings.length > 0) {
        results.push({ file, findings });
      }
    }
  } else {
    // Directory scan
    const repoRoot = findRepoRoot(process.cwd(), options.repo);
    const targetDir = scanPath ? path.resolve(scanPath) : repoRoot;

    if (!fs.existsSync(targetDir)) {
      console.log(`No directory to scan: ${targetDir}`);
      return;
    }

    results = scanDirectory(targetDir);
  }

  if (results.length === 0) {
    console.log('✓ No secrets found.');
    return;
  }

  console.error('⚠️  Potential secrets found:');
  for (const { file, findings } of results) {
    console.error(`  ${file}`);
    for (const f of findings) {
      console.error(`    > ${f}`);
    }
  }

  if (options.fix) {
    console.log('\nApplying auto-redaction...');
    for (const { file } of results) {
      const original = fs.readFileSync(file, 'utf-8');
      const cleaned = sanitize(original);
      fs.writeFileSync(file, cleaned, 'utf-8');
      // Re-stage the file if in a git repo
      try {
        const dir = path.dirname(file);
        execFileSync('git', ['add', file], { cwd: dir, stdio: 'pipe' });
      } catch {
        /* not in a git repo, skip */
      }
      console.log(`  ✓ Redacted and re-staged: ${file}`);
    }
    return;
  }

  console.error('\n→ Run: memo scan --fix to auto-redact and re-stage');

  if (options.failOnSecrets) {
    process.exit(1);
  }
}
