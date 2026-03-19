/**
 * Install command
 * Sets up memobank directory structure and platform integrations
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { initConfig } from '../config';
import { installClaudeCode } from '../platforms/claude-code';
import { installCodex } from '../platforms/codex';
import { installCursor } from '../platforms/cursor';
import { installGemini, detectGemini } from '../platforms/gemini';
import { installQwen, detectQwen } from '../platforms/qwen';

const execAsync = promisify(exec);

export interface InstallOptions {
  repo?: string;
  claudeCode?: boolean;
  codex?: boolean;
  cursor?: boolean;
  all?: boolean;
  platform?: string;
}

const MEMORY_TYPES = ['lesson', 'decision', 'workflow', 'architecture'];

/**
 * Detect git repo name
 */
async function detectGitRepoName(cwd: string): Promise<string> {
  try {
    const { stdout } = await execAsync('git rev-parse --show-toplevel', { cwd });
    const gitRoot = stdout.trim();
    return path.basename(gitRoot);
  } catch (error) {
    // Not a git repo, use directory name
    return path.basename(cwd);
  }
}

/**
 * Create directory structure
 */
function createDirectoryStructure(repoRoot: string): void {
  const personalDir = path.join(repoRoot, 'personal');
  for (const type of MEMORY_TYPES) {
    const typeDir = path.join(personalDir, type);
    if (!fs.existsSync(typeDir)) {
      fs.mkdirSync(typeDir, { recursive: true });
    }
  }

  const memoryDir = path.join(repoRoot, 'memory');
  if (!fs.existsSync(memoryDir)) {
    fs.mkdirSync(memoryDir, { recursive: true });
  }

  const metaDir = path.join(repoRoot, 'meta');
  if (!fs.existsSync(metaDir)) {
    fs.mkdirSync(metaDir, { recursive: true });
  }
}

/**
 * Install adapter for a specific platform
 */
async function installPlatform(platform: string, repoRoot: string): Promise<void> {
  const { installClaudeCode: installCC } = await import('../platforms/claude-code');
  const { installCodex: installCx } = await import('../platforms/codex');
  const { installGemini: installGem, detectGemini: detectGem } = await import('../platforms/gemini');
  const { installQwen: installQw, detectQwen: detectQw } = await import('../platforms/qwen');
  const { installCursor: installCur } = await import('../platforms/cursor');

  switch (platform) {
    case 'claude-code':
      await installCC(repoRoot);
      break;
    case 'codex':
      await installCx(process.cwd());
      break;
    case 'gemini':
      await installGem();
      break;
    case 'qwen':
      await installQw();
      break;
    case 'cursor':
      await installCur(process.cwd());
      break;
    case 'all':
      await installCC(repoRoot);
      await installCx(process.cwd());
      if (detectGem()) { await installGem(); }
      if (detectQw()) { await installQw(); }
      await installCur(process.cwd());
      break;
    default:
      console.error(`Unknown platform: ${platform}. Valid: claude-code, codex, gemini, qwen, cursor, all`);
  }
}

/**
 * Install memobank
 */
export async function installCommand(options: InstallOptions = {}): Promise<void> {
  const cwd = process.cwd();

  // Determine mode and repo root
  let repoRoot: string;
  let projectName: string;

  if (options.repo) {
    // Mode A: Explicit repo path
    repoRoot = path.resolve(options.repo);
    projectName = path.basename(repoRoot);
  } else {
    // Mode B: Auto-detect or use ~/.memobank/<project>/
    projectName = await detectGitRepoName(cwd);
    repoRoot = path.join(os.homedir(), '.memobank', projectName);
  }

  if (options.platform) {
    await installPlatform(options.platform, repoRoot);
    return;
  }

  console.log(`Setting up memobank at: ${repoRoot}`);

  // Create directory structure
  createDirectoryStructure(repoRoot);
  console.log(`✓ Directory structure created`);

  // Write config if missing
  const configPath = path.join(repoRoot, 'meta', 'config.yaml');
  if (!fs.existsSync(configPath)) {
    initConfig(repoRoot, projectName);
    console.log(`✓ Config initialized`);
  } else {
    console.log(`⊘ Config already exists`);
  }

  // Platform installs
  const allPlatforms = options.all ?? (!options.claudeCode && !options.codex && !options.cursor);

  if (allPlatforms || options.claudeCode) {
    await installClaudeCode(repoRoot);
  }

  if (allPlatforms || options.codex) {
    await installCodex(cwd);
  }

  if (allPlatforms || options.cursor) {
    await installCursor(cwd);
  }

  if (allPlatforms) {
    if (detectGemini()) { await installGemini(); }
    if (detectQwen()) { await installQwen(); }
  }

  // Print success summary
  console.log();
  console.log(`✓ memobank ready at ${repoRoot}`);
  console.log();
  console.log('Next steps:');
  console.log(`  memo setup                      # Interactive configuration`);
  console.log(`  memo import                     # Import memories from other AI tools`);
  console.log(`  memo recall "project context"   # Test recall`);
  console.log(`  memo write lesson               # Create a memory`);
  console.log(`  memo map                        # View memory summary`);
  console.log(`  memo --help                     # See all commands`);
}
