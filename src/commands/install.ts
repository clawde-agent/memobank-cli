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

const execAsync = promisify(exec);

export interface InstallOptions {
  repo?: string;
  claudeCode?: boolean;
  codex?: boolean;
  cursor?: boolean;
  all?: boolean;
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
  // Create memory type directories
  for (const type of MEMORY_TYPES) {
    const typeDir = path.join(repoRoot, type);
    if (!fs.existsSync(typeDir)) {
      fs.mkdirSync(typeDir, { recursive: true });
    }
  }

  // Create memory directory
  const memoryDir = path.join(repoRoot, 'memory');
  if (!fs.existsSync(memoryDir)) {
    fs.mkdirSync(memoryDir, { recursive: true });
  }

  // Create meta directory
  const metaDir = path.join(repoRoot, 'meta');
  if (!fs.existsSync(metaDir)) {
    fs.mkdirSync(metaDir, { recursive: true });
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
