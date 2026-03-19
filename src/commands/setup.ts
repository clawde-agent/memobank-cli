/**
 * Setup Command
 * Interactive setup wizard for memobank configuration
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as readline from 'readline';
import { findRepoRoot } from '../core/store';
import { loadConfig, writeConfig } from '../config';
import { detectAvailableTools, importMemories } from './import';
import { configureTools, detectInstalledTools, ToolConfig } from '../core/tool-config';
import { MemoConfig } from '../types';

/**
 * Create readline interface
 */
function createReadline(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

/**
 * Prompt user with yes/no question
 */
function askYesNo(
  rl: readline.Interface,
  question: string,
  defaultValue: boolean = true
): Promise<boolean> {
  return new Promise((resolve) => {
    const defaultStr = defaultValue ? 'Y/n' : 'y/N';
    rl.question(`${question} (${defaultStr}): `, (answer) => {
      if (!answer || answer.trim() === '') {
        resolve(defaultValue);
      } else {
        const lower = answer.toLowerCase().trim();
        resolve(lower === 'y' || lower === 'yes');
      }
    });
  });
}

/**
 * Prompt user to select from options
 */
function askSelect(rl: readline.Interface, question: string, options: string[]): Promise<number> {
  return new Promise((resolve) => {
    console.log(question);
    options.forEach((opt, i) => {
      console.log(`  ${i + 1}. ${opt}`);
    });

    rl.question(`Select (1-${options.length}, or 0 to skip): `, (answer) => {
      const num = parseInt(answer.trim());
      if (isNaN(num) || num < 0 || num > options.length) {
        resolve(-1);
      } else {
        resolve(num - 1);
      }
    });
  });
}

/**
 * Prompt user to select multiple options
 */
function askMultiSelect(
  rl: readline.Interface,
  question: string,
  options: string[]
): Promise<number[]> {
  return new Promise((resolve) => {
    console.log(question);
    options.forEach((opt, i) => {
      console.log(`  ${i + 1}. ${opt}`);
    });

    rl.question(`Select (comma-separated, e.g., "1,3" or "all"): `, (answer) => {
      const trimmed = answer.trim().toLowerCase();
      if (trimmed === 'all') {
        resolve(options.map((_, i) => i));
      } else if (!trimmed) {
        resolve([]);
      } else {
        const indices = trimmed
          .split(',')
          .map((s) => parseInt(s.trim()) - 1)
          .filter((n) => !isNaN(n) && n >= 0 && n < options.length);
        resolve(indices);
      }
    });
  });
}

/**
 * Ask user for scope (global or project)
 */
async function askScope(rl: readline.Interface, toolName: string): Promise<'global' | 'project'> {
  console.log(`\n📍 ${toolName} Memory Scope`);
  console.log('Where should memories be stored?\n');
  console.log('  1. Global - Shared across all projects');
  console.log('  2. Project - Specific to this project only');

  const answer = await new Promise<string>((resolve) => {
    rl.question('Select (1-2): ', resolve);
  });

  return answer.trim() === '1' ? 'global' : 'project';
}

/**
 * Check if Ollama is installed and running
 */
async function checkOllama(): Promise<{ installed: boolean; models: string[] }> {
  return new Promise((resolve) => {
    const { exec } = require('child_process');
    exec('ollama list', (error: Error, stdout: string) => {
      if (error) {
        resolve({ installed: false, models: [] });
      } else {
        const models = stdout
          .split('\n')
          .slice(1) // Skip header
          .filter((line) => line.trim())
          .map((line) => line.split(/\s+/)[0])
          .filter((name): name is string => !!name);
        resolve({ installed: true, models });
      }
    });
  });
}

/**
 * Setup embedding configuration
 */
async function setupEmbedding(rl: readline.Interface, config: MemoConfig): Promise<MemoConfig> {
  console.log('\n📡 Embedding Configuration\n');
  console.log('Vector embeddings enable semantic search for your memories.\n');

  const useEmbedding = await askYesNo(rl, 'Enable vector search with embeddings?', true);

  if (!useEmbedding) {
    config.embedding.engine = 'text';
    console.log('✓ Using text-based search only.\n');
    return config;
  }

  // Check for Ollama
  const ollamaStatus = await checkOllama();

  if (ollamaStatus.installed) {
    console.log(`\n✓ Ollama detected (${ollamaStatus.models.length} models installed)`);

    const hasMxbai = ollamaStatus.models.some((m) => m.includes('mxbai') || m.includes('embed'));

    if (!hasMxbai) {
      console.log('  Note: Recommended model "mxbai-embed-large" not found.');
      console.log('  Run: ollama pull mxbai-embed-large\n');
    }

    const useOllama = await askYesNo(rl, 'Use Ollama for local embeddings?', true);

    if (useOllama) {
      config.embedding.engine = 'lancedb';
      config.embedding.provider = 'ollama';
      config.embedding.model = 'mxbai-embed-large';
      config.embedding.dimensions = 1024;
      console.log('✓ Configured: Ollama + LanceDB\n');
      return config;
    }
  } else {
    console.log('\n⚠ Ollama not detected.');
    console.log('  Install: https://ollama.ai\n');
  }

  // OpenAI option
  const useOpenAI = await askYesNo(rl, 'Use OpenAI for embeddings?', false);

  if (useOpenAI) {
    const hasKey = !!process.env.OPENAI_API_KEY;

    if (!hasKey) {
      console.log('  ⚠ OPENAI_API_KEY not set in environment.');
      console.log('  Export: export OPENAI_API_KEY="sk-..."');
    }

    config.embedding.engine = 'lancedb';
    config.embedding.provider = 'openai';
    config.embedding.model = 'text-embedding-3-small';
    config.embedding.dimensions = 1536;
    console.log('✓ Configured: OpenAI + LanceDB\n');
    return config;
  }

  // Default to text
  config.embedding.engine = 'text';
  console.log('✓ Using text-based search only.\n');
  return config;
}

/**
 * Configure AI tools to use memobank
 */
async function setupToolConfiguration(rl: readline.Interface, repoRoot: string): Promise<void> {
  console.log('\n🔌 AI Tool Configuration\n');
  console.log(
    'Memobank can integrate with your AI coding tools to provide\nautomatic memory recall and capture.\n'
  );

  const installedTools = detectInstalledTools();
  const availableTools = installedTools.filter((t) => t.installed);

  if (availableTools.length === 0) {
    console.log('No supported AI tools detected.\n');
    console.log('Install one of:');
    console.log('  • Claude Code  - https://claude.ai/code');
    console.log('  • Gemini CLI   - https://geminicli.com');
    console.log('  • Qwen Code    - https://qwenlm.github.io/qwen-code\n');
    return;
  }

  console.log('Detected installed tools:\n');
  availableTools.forEach((t, i) => {
    console.log(`  ${i + 1}. ${t.name}`);
  });
  console.log();

  const configureToolsPrompt = await askYesNo(rl, 'Configure these tools to use memobank?', true);

  if (!configureToolsPrompt) {
    console.log('✓ Skipping tool configuration.\n');
    return;
  }

  // Let user select which tools to configure
  const selectedIndices = await askMultiSelect(
    rl,
    'Which tools to configure?',
    availableTools.map((t) => t.name)
  );

  if (selectedIndices.length === 0) {
    console.log('✓ Skipping tool configuration.\n');
    return;
  }

  // Get project path for project-scoped tools
  const cwd = process.cwd();
  const projectPath = findRepoRoot(cwd, repoRoot);
  const projectName = path.basename(projectPath);

  // Configure each selected tool with scope
  const toolConfigs: ToolConfig[] = [];

  for (const index of selectedIndices) {
    const tool = availableTools[index];
    if (!tool) continue;

    const scope = await askScope(rl, tool.name);

    toolConfigs.push({
      name: tool.name,
      scope,
      projectPath: scope === 'project' ? projectPath : undefined,
    });

    console.log(`✓ ${tool.name} will use ${scope} memory\n`);
  }

  // Apply configurations
  console.log('\n⚙️  Applying configurations...\n');
  await configureTools(toolConfigs);
  console.log();
}

/**
 * Import memories from other AI tools
 */
async function setupImport(rl: readline.Interface, repoRoot: string): Promise<void> {
  console.log('\n📥 Import Existing Memories\n');
  console.log('Memobank can import memories from other AI coding tools.\n');

  const availableTools = detectAvailableTools();

  if (availableTools.length === 0) {
    console.log('No existing AI tool memories found.\n');
    console.log('Supported tools:');
    console.log('  • Claude Code  - ~/.claude/projects/<project>/memory/');
    console.log('  • Gemini CLI   - ~/.gemini/GEMINI.md, ./GEMINI.md');
    console.log('  • Qwen Code    - ~/.qwen/QWEN.md\n');
    return;
  }

  console.log('Found memories from:\n');
  availableTools.forEach((t, i) => {
    console.log(`  ${i + 1}. ${t.name}`);
  });
  console.log();

  const doImport = await askYesNo(rl, 'Import these memories to memobank?', true);

  if (!doImport) {
    console.log('✓ Skipping import.\n');
    return;
  }

  // Select which tools to import
  const selection = await askSelect(rl, 'Which memories to import?', [
    ...availableTools.map((t) => t.name),
    'All of the above',
  ]);

  if (selection === -1 || selection === availableTools.length) {
    // Import all
    await importMemories({ repo: repoRoot, dryRun: false });
  } else {
    const tool = availableTools[selection];
    if (!tool) return;

    if (tool.name.toLowerCase().includes('claude')) {
      await importMemories({ repo: repoRoot, claude: true, dryRun: false });
    } else if (tool.name.toLowerCase().includes('gemini')) {
      await importMemories({ repo: repoRoot, gemini: true, dryRun: false });
    } else if (tool.name.toLowerCase().includes('qwen')) {
      await importMemories({ repo: repoRoot, qwen: true, dryRun: false });
    }
  }

  console.log();
}

/**
 * Main setup wizard
 */
export async function setupWizard(repoRoot?: string): Promise<void> {
  const rl = createReadline();
  const cwd = process.cwd();
  const root = findRepoRoot(cwd, repoRoot);

  console.log('\n🧠 Memobank Setup Wizard\n');
  console.log('This wizard will help you configure memobank.\n');
  console.log(`Repository: ${root}\n`);

  // Load existing config
  let config = loadConfig(root);

  // Step 1: Embedding setup
  config = await setupEmbedding(rl, config);

  // Step 2: Tool configuration
  await setupToolConfiguration(rl, root);

  // Step 3: Import existing memories
  await setupImport(rl, root);

  // Save config
  console.log('💾 Saving configuration...\n');
  writeConfig(root, config);

  // Summary
  console.log('✅ Setup Complete!\n');
  console.log('Configuration summary:');
  console.log(`  • Search engine: ${config.embedding.engine}`);
  if (config.embedding.engine === 'lancedb') {
    console.log(`  • Provider: ${config.embedding.provider}`);
    console.log(`  • Model: ${config.embedding.model}`);
  }
  console.log(`  • Top K results: ${config.memory.top_k}`);
  console.log(`  • Token budget: ${config.memory.token_budget}`);

  console.log('\nNext steps:');
  console.log('  memo map              # View memory statistics');
  console.log('  memo write lesson     # Create your first memory');
  console.log('  memo recall "query"   # Search memories');
  console.log('  memo import           # Import from other AI tools');
  console.log('  memo --help           # See all commands\n');

  rl.close();
}
