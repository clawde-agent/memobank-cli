/**
 * Interactive Onboarding Command
 * Unified setup flow with interactive menu selection
 * Replaces separate install and setup commands
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as readline from 'readline';
import { exec } from 'child_process';
import { promisify } from 'util';
import { findRepoRoot, loadAll } from '../core/store';
import { loadConfig, writeConfig, initConfig } from '../config';
import { detectAvailableTools, importMemories } from './import';
import { configureTools, detectInstalledTools, ToolConfig } from '../core/tool-config';
import { installClaudeCode } from '../platforms/claude-code';
import { installCodex } from '../platforms/codex';
import { installCursor } from '../platforms/cursor';
import { MemoConfig } from '../types';

const execAsync = promisify(exec);

/**
 * Create readline interface with arrow key support
 */
function createReadline(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });
}

/**
 * Interactive menu item
 */
interface MenuItem {
  label: string;
  value: string;
  description?: string;
  disabled?: boolean;
}

/**
 * Show interactive menu with arrow key navigation
 */
function showMenu(
  rl: readline.Interface,
  title: string,
  items: MenuItem[],
  defaultIndex?: number
): Promise<number> {
  return new Promise((resolve) => {
    let selectedIndex = defaultIndex || 0;
    let isSelecting = true;

    // Hide cursor
    process.stdout.write('\x1B[?25l');

    const render = () => {
      // Clear screen from current position
      readline.clearScreenDown(process.stdout);
      rl.write('\x1B[G'); // Move to beginning of line

      console.log(`\n${title}\n`);

      items.forEach((item, index) => {
        const isSelected = index === selectedIndex;
        const icon = isSelected ? '❯' : ' ';
        const check = isSelected ? '◉' : '◯';
        const style = isSelected ? '\x1B[36m' : '\x1B[90m'; // Cyan or Gray
        const disabled = item.disabled ? '\x1B[90m' : '';

        console.log(
          `${style}${icon} ${check} ${item.label}${item.description ? ` - ${item.description}` : ''}\x1B[39m`
        );
      });

      console.log('\n\x1B[90mUse ↑↓ arrows to navigate, Enter to select\x1B[39m');
    };

    const handleKeypress = (_: unknown, key: readline.Key) => {
      if (key.name === 'up' && selectedIndex > 0) {
        selectedIndex--;
        render();
      } else if (key.name === 'down' && selectedIndex < items.length - 1) {
        selectedIndex++;
        render();
      } else if (key.name === 'return' && !items[selectedIndex].disabled) {
        cleanup();
        resolve(selectedIndex);
      } else if (key.name === 'c' && key.ctrl) {
        cleanup();
        process.exit(0);
      }
    };

    const cleanup = () => {
      // Show cursor
      process.stdout.write('\x1B[?25h');
      rl.removeListener('keypress', handleKeypress);
    };

    rl.on('keypress', handleKeypress);
    render();
  });
}

/**
 * Show checkbox selection (multiple choice)
 */
function showCheckbox(
  rl: readline.Interface,
  title: string,
  items: Array<{ label: string; value: string; selected?: boolean }>
): Promise<string[]> {
  return new Promise((resolve) => {
    let selectedIndex = 0;
    const selected = items.map((i) => i.selected || false);

    process.stdout.write('\x1B[?25l');

    const render = () => {
      readline.clearScreenDown(process.stdout);
      rl.write('\x1B[G');

      console.log(`\n${title}\n`);

      items.forEach((item, index) => {
        const isSelected = index === selectedIndex;
        const icon = isSelected ? '❯' : ' ';
        const check = selected[index] ? '◉' : '◯';
        const style = isSelected ? '\x1B[36m' : '\x1B[90m';

        console.log(`${style}${icon} [${check}] ${item.label}\x1B[39m`);
      });

      console.log('\n\x1B[90m↑↓ navigate, Space to toggle, Enter to confirm\x1B[39m');
    };

    const handleKeypress = (_: unknown, key: readline.Key) => {
      if (key.name === 'up' && selectedIndex > 0) {
        selectedIndex--;
        render();
      } else if (key.name === 'down' && selectedIndex < items.length - 1) {
        selectedIndex++;
        render();
      } else if (key.name === 'space') {
        selected[selectedIndex] = !selected[selectedIndex];
        render();
      } else if (key.name === 'return') {
        cleanup();
        resolve(items.filter((_, i) => selected[i]).map((i) => i.value));
      } else if (key.ctrl && key.name === 'c') {
        cleanup();
        process.exit(0);
      }
    };

    const cleanup = () => {
      process.stdout.write('\x1B[?25h');
      rl.removeListener('keypress', handleKeypress);
    };

    rl.on('keypress', handleKeypress);
    render();
  });
}

/**
 * Detect project name
 */
async function detectProjectName(cwd: string): Promise<string> {
  try {
    const { stdout } = await execAsync('git rev-parse --show-toplevel', { cwd });
    return path.basename(stdout.trim());
  } catch {
    return path.basename(cwd);
  }
}

/**
 * Check if Ollama is available
 */
async function checkOllama(): Promise<boolean> {
  return new Promise((resolve) => {
    exec('ollama list', (error) => {
      resolve(!error);
    });
  });
}

/**
 * Main onboarding flow
 */
export async function onboardingCommand(repoPath?: string): Promise<void> {
  const rl = createReadline();
  const cwd = process.cwd();
  const repoRoot = repoPath ? path.resolve(repoPath) : findRepoRoot(cwd);

  // Welcome screen
  console.clear();
  console.log('\n\x1B[36m');
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║                                                           ║');
  console.log('║   🧠  Welcome to Memobank CLI Setup                       ║');
  console.log('║                                                           ║');
  console.log('║   Persistent memory for AI coding sessions                ║');
  console.log('║                                                           ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log('\x1B[39m\n');

  // Detect project
  const projectName = await detectProjectName(cwd);
  console.log(`📁 Project: \x1B[36m${projectName}\x1B[39m`);
  console.log(`📂 Location: \x1B[90m${repoRoot}\x1B[39m\n`);

  // Initialize config if needed
  const configPath = path.join(repoRoot, 'meta', 'config.yaml');
  let config: MemoConfig;

  if (!fs.existsSync(configPath)) {
    initConfig(repoRoot, projectName);
    config = loadConfig(repoRoot);
    console.log('✓ Created new configuration\n');
  } else {
    config = loadConfig(repoRoot);
    console.log('✓ Found existing configuration\n');
  }

  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Main menu
  const mainMenuItems: MenuItem[] = [
    { label: 'Quick Setup', value: 'quick', description: 'Recommended for most users' },
    { label: 'Custom Setup', value: 'custom', description: 'Configure each option' },
    { label: 'Import Memories', value: 'import', description: 'From Claude Code, Gemini, etc.' },
    { label: 'Platform Setup', value: 'platforms', description: 'Configure AI tools' },
    { label: 'Embedding Setup', value: 'embedding', description: 'Vector search configuration' },
    { label: 'Exit', value: 'exit', description: 'Finish setup' },
  ];

  let exitSetup = false;

  while (!exitSetup) {
    const choice = await showMenu(rl, 'What would you like to do?', mainMenuItems);

    switch (mainMenuItems[choice].value) {
      case 'quick':
        await quickSetup(rl, repoRoot, config);
        break;
      case 'custom':
        await customSetup(rl, repoRoot, config);
        break;
      case 'import':
        await importMemories({ repo: repoRoot });
        break;
      case 'platforms':
        await platformSetup(rl, repoRoot);
        break;
      case 'embedding':
        await embeddingSetup(rl, config, repoRoot);
        break;
      case 'exit':
        exitSetup = true;
        break;
    }
  }

  // Summary
  showSummary(config);

  rl.close();
}

/**
 * Quick setup - automated recommended configuration
 */
async function quickSetup(
  rl: readline.Interface,
  repoRoot: string,
  config: MemoConfig
): Promise<void> {
  console.log('\n🚀 Quick Setup\n');

  // Check for Ollama
  const hasOllama = await checkOllama();

  if (hasOllama) {
    console.log('✓ Detected Ollama installation');
    config.embedding.engine = 'lancedb';
    config.embedding.provider = 'ollama';
    config.embedding.model = 'mxbai-embed-large';
    config.embedding.dimensions = 1024;
  } else {
    console.log('⊘ Ollama not found, using text search');
    config.embedding.engine = 'text';
  }

  writeConfig(repoRoot, config);

  // Install platforms
  console.log('\n📦 Installing platform integrations...\n');
  await installClaudeCode(repoRoot);
  await installCodex(process.cwd());
  await installCursor(process.cwd());

  console.log('\n✅ Quick Setup Complete!\n');
  await new Promise((resolve) => setTimeout(resolve, 1000));
}

/**
 * Custom setup - step by step configuration
 */
async function customSetup(
  rl: readline.Interface,
  repoRoot: string,
  config: MemoConfig
): Promise<void> {
  // Embedding choice
  const embeddingMenu: MenuItem[] = [
    { label: 'Ollama (Local, Free)', value: 'ollama', description: 'Recommended' },
    { label: 'OpenAI (Cloud)', value: 'openai' },
    { label: 'Text Only (No embeddings)', value: 'text' },
  ];

  const embeddingChoice = await showMenu(rl, 'Choose embedding provider:', embeddingMenu);

  switch (embeddingMenu[embeddingChoice].value) {
    case 'ollama':
      config.embedding.engine = 'lancedb';
      config.embedding.provider = 'ollama';
      config.embedding.model = 'mxbai-embed-large';
      config.embedding.dimensions = 1024;
      break;
    case 'openai':
      config.embedding.engine = 'lancedb';
      config.embedding.provider = 'openai';
      config.embedding.model = 'text-embedding-3-small';
      config.embedding.dimensions = 1536;
      break;
    case 'text':
      config.embedding.engine = 'text';
      break;
  }

  // Platform selection
  const platformItems = [
    { label: 'Claude Code', value: 'claude', selected: true },
    { label: 'Cursor', value: 'cursor', selected: true },
    { label: 'Codex (AGENTS.md)', value: 'codex', selected: true },
  ];

  const selectedPlatforms = await showCheckbox(rl, 'Configure AI tools:', platformItems);

  console.log('\n📦 Installing selected platforms...\n');

  if (selectedPlatforms.includes('claude')) {
    await installClaudeCode(repoRoot);
  }
  if (selectedPlatforms.includes('cursor')) {
    await installCursor(process.cwd());
  }
  if (selectedPlatforms.includes('codex')) {
    await installCodex(process.cwd());
  }

  writeConfig(repoRoot, config);
  console.log('\n✅ Custom Setup Complete!\n');
  await new Promise((resolve) => setTimeout(resolve, 1000));
}

/**
 * Platform-specific setup
 */
async function platformSetup(rl: readline.Interface, repoRoot: string): Promise<void> {
  const platformItems = [
    { label: 'Claude Code', value: 'claude', selected: false },
    { label: 'Cursor', value: 'cursor', selected: false },
    { label: 'Codex (AGENTS.md)', value: 'codex', selected: false },
  ];

  const selected = await showCheckbox(rl, 'Select platforms to configure:', platformItems);

  console.log('\n📦 Installing...\n');

  if (selected.includes('claude')) {
    await installClaudeCode(repoRoot);
  }
  if (selected.includes('cursor')) {
    await installCursor(process.cwd());
  }
  if (selected.includes('codex')) {
    await installCodex(process.cwd());
  }

  console.log('\n✅ Platform setup complete!\n');
  await new Promise((resolve) => setTimeout(resolve, 1000));
}

/**
 * Embedding setup
 */
async function embeddingSetup(
  rl: readline.Interface,
  config: MemoConfig,
  repoRoot: string
): Promise<void> {
  const embeddingMenu: MenuItem[] = [
    { label: 'Ollama (Local, Free)', value: 'ollama', description: 'Recommended' },
    { label: 'OpenAI (Cloud)', value: 'openai' },
    { label: 'Azure OpenAI', value: 'azure' },
    { label: 'Text Only', value: 'text', description: 'No embeddings' },
  ];

  const choice = await showMenu(rl, 'Choose embedding provider:', embeddingMenu);

  switch (embeddingMenu[choice].value) {
    case 'ollama':
      config.embedding.engine = 'lancedb';
      config.embedding.provider = 'ollama';
      config.embedding.model = 'mxbai-embed-large';
      config.embedding.dimensions = 1024;
      break;
    case 'openai':
      config.embedding.engine = 'lancedb';
      config.embedding.provider = 'openai';
      config.embedding.model = 'text-embedding-3-small';
      config.embedding.dimensions = 1536;
      break;
    case 'azure':
      config.embedding.engine = 'lancedb';
      config.embedding.provider = 'azure';
      config.embedding.model = 'text-embedding-ada-002';
      config.embedding.dimensions = 1536;
      break;
    case 'text':
      config.embedding.engine = 'text';
      break;
  }

  writeConfig(repoRoot, config);
  console.log('\n✅ Embedding configured!\n');
  await new Promise((resolve) => setTimeout(resolve, 1000));
}

/**
 * Show setup summary
 */
function showSummary(config: MemoConfig): void {
  console.log('\n\x1B[36m╔═══════════════════════════════════════════════════════════╗\x1B[39m');
  console.log('\x1B[36m║\x1B[39m                                                       \x1B[36m║\x1B[39m');
  console.log('\x1B[36m║\x1B[39m  \x1B[1m✅ Setup Complete!\x1B[22m                                    \x1B[36m║\x1B[39m');
  console.log('\x1B[36m║\x1B[39m                                                       \x1B[36m║\x1B[39m');
  console.log('\x1B[36m╚═══════════════════════════════════════════════════════════╝\x1B[39m\n');

  console.log('Configuration:\n');
  console.log(`  Embedding Engine: \x1B[36m${config.embedding.engine}\x1B[39m`);
  if (config.embedding.engine === 'lancedb') {
    console.log(`  Provider: \x1B[90m${config.embedding.provider}\x1B[39m`);
    console.log(`  Model: \x1B[90m${config.embedding.model}\x1B[39m`);
  }
  console.log(`  Top K Results: \x1B[90m${config.memory.top_k}\x1B[39m`);
  console.log(`  Token Budget: \x1B[90m${config.memory.token_budget}\x1B[39m\n`);

  console.log('Next steps:\n');
  console.log('  \x1B[36mmemo write lesson\x1B[39m          Create your first memory');
  console.log('  \x1B[36mmemo recall "query"\x1B[39m        Search memories');
  console.log('  \x1B[36mmemo lifecycle report\x1B[39m      View memory statistics');
  console.log('  \x1B[36mmemo --help\x1B[39m                See all commands\n');
}
