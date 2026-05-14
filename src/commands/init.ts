/**
 * init command
 * memo init          — project tier: creates .memobank/ in current repo
 * memo init --global — personal tier: creates ~/.memobank/<project>/
 * memo init --interactive — full onboarding TUI
 */

import * as fs from 'fs';
import * as path from 'path';
import { initConfig } from '../config';
import { findRepoRoot } from '../core/store';
import { detectProjectName, detectPlatforms } from '../core/platform-detector';
import { installClaudeCode } from '../platforms/claude-code';
import { installCursor } from '../platforms/cursor';
import { installCodex } from '../platforms/codex';
import { installGemini } from '../platforms/gemini';
import { installQwen } from '../platforms/qwen';

export interface QuickInitOptions {
  platform?: string;
  repoRoot?: string; // for testing
}

const GITIGNORE_ENTRIES = [
  '.memobank/meta/access-log.json',
  '.memobank/meta/code-index.db',
  '.memobank/.lancedb/',
  '.memobank/pending/',
];

function ensureGitignoreFull(gitRoot: string): void {
  const gitignorePath = path.join(gitRoot, '.gitignore');
  const content = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf-8') : '';
  const toAdd = GITIGNORE_ENTRIES.filter((entry) => !content.includes(entry));
  if (!toAdd.length) return;
  const block = '\n# memobank\n' + toAdd.join('\n') + '\n';
  if (!content) {
    fs.writeFileSync(gitignorePath, block.trimStart());
  } else {
    fs.appendFileSync(gitignorePath, block);
  }
}

export async function quickInit(options: QuickInitOptions): Promise<void> {
  const cwd = process.cwd();
  const gitRoot = options.repoRoot ?? findRepoRoot(cwd);
  const memobankRoot = path.join(gitRoot, '.memobank');
  const projectName = detectProjectName();

  createTierDirs(memobankRoot);
  initConfig(memobankRoot, projectName);
  ensureGitignoreFull(gitRoot);

  const allPlatforms = detectPlatforms();
  const targets = options.platform
    ? options.platform.split(',').map((s) => s.trim())
    : allPlatforms.filter((p) => p.hint?.includes('✓')).map((p) => p.value);

  const installed: string[] = [];
  for (const p of targets) {
    if (p === 'claude-code') {
      await installClaudeCode(memobankRoot);
      installed.push(p);
    } else if (p === 'cursor') {
      await installCursor(cwd);
      installed.push(p);
    } else if (p === 'codex') {
      await installCodex(cwd);
      installed.push(p);
    } else if (p === 'gemini') {
      await installGemini();
      installed.push(p);
    } else if (p === 'qwen') {
      await installQwen();
      installed.push(p);
    }
  }

  const platformList = installed.length ? installed.join(', ') : 'none';
  console.log(`✓ memobank initialized (project: ${projectName}, platforms: ${platformList})`);
  if (!installed.length) {
    console.log('  Tip: run memo init --interactive to configure platforms manually.');
  }
}

const MEMORY_TYPES = ['lesson', 'decision', 'workflow', 'architecture'];

export function initCommand(options: { global?: boolean; name?: string }): void {
  const cwd = process.cwd();
  const projectName = options.name ?? path.basename(cwd);

  if (options.global) {
    const home = process.env.HOME || process.env.USERPROFILE || '';
    const globalDir = path.join(home, '.memobank', projectName);
    if (fs.existsSync(path.join(globalDir, 'meta', 'config.yaml'))) {
      console.log(`Personal memory already initialized at ${globalDir}`);
      console.log('Run: memo recall <query> to search memories.');
      return;
    }
    createTierDirs(globalDir);
    initConfig(globalDir, projectName);
    console.log(`✓ Personal memory initialized at: ${globalDir}`);
    console.log('  Memories here are private to your machine and never committed.');
  } else {
    const projectDir = path.join(cwd, '.memobank');
    if (fs.existsSync(path.join(projectDir, 'meta', 'config.yaml'))) {
      console.log(`.memobank/ already initialized in ${cwd}`);
      console.log('Run: memo recall <query> to search memories.');
      return;
    }
    createTierDirs(projectDir);
    initConfig(projectDir, projectName);
    ensureGitignoreFull(cwd);
    console.log(`✓ Project memory initialized at: ${projectDir}`);
    console.log('  Commit .memobank/ with your code — it IS the team memory.');
  }
}

function createTierDirs(root: string): void {
  fs.mkdirSync(path.join(root, 'meta'), { recursive: true });
  for (const type of MEMORY_TYPES) {
    fs.mkdirSync(path.join(root, type), { recursive: true });
  }
}
