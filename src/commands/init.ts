/**
 * init command
 * memo init          — project tier: creates .memobank/ in current repo
 * memo init --global — personal tier: creates ~/.memobank/<project>/
 */

import * as fs from 'fs';
import * as path from 'path';
import { initConfig } from '../config';

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
    ensureGitignore(cwd);
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

function ensureGitignore(repoRoot: string): void {
  const gitignorePath = path.join(repoRoot, '.gitignore');
  const entry = '.memobank/meta/access-log.json';
  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, `${entry}\n`);
    return;
  }
  const content = fs.readFileSync(gitignorePath, 'utf-8');
  if (!content.includes(entry)) {
    fs.appendFileSync(
      gitignorePath,
      `\n# memobank — access log is local, not team state\n${entry}\n`
    );
  }
}
