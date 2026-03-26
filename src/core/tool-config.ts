/**
 * Tool Configuration Module
 * Configures AI coding tools to use memobank for memory
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface ToolConfig {
  name: string;
  scope: 'global' | 'project';
  projectPath?: string;
}

/**
 * Get Claude Code settings path
 */
function getClaudeSettingsPath(scope: 'global' | 'project', projectPath?: string): string {
  if (scope === 'global') {
    return path.join(os.homedir(), '.claude', 'settings.local.json');
  } else {
    return path.join(projectPath || process.cwd(), '.claude', 'settings.local.json');
  }
}

/**
 * Configure Claude Code to use memobank
 */
export function configureClaudeCode(config: ToolConfig): void {
  const settingsPath = getClaudeSettingsPath(config.scope, config.projectPath);
  const settingsDir = path.dirname(settingsPath);

  // Ensure directory exists
  if (!fs.existsSync(settingsDir)) {
    fs.mkdirSync(settingsDir, { recursive: true });
  }

  // Load existing settings or create new
  let settings: Record<string, unknown> = {};
  if (fs.existsSync(settingsPath)) {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
  }

  // Get memobank path
  const projectName = config.projectPath ? path.basename(config.projectPath) : 'default';
  const memobankPath = path.join(os.homedir(), '.memobank', projectName);

  // Configure autoMemoryDirectory
  settings.autoMemoryDirectory = memobankPath;

  // Write settings
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');

  console.log(`✓ Claude Code configured (${config.scope})`);
  console.log(`  Settings: ${settingsPath}`);
  console.log(`  Memory: ${memobankPath}`);
}

/**
 * Get Gemini CLI config path
 */
function getGeminiConfigPath(scope: 'global' | 'project', projectPath?: string): string {
  if (scope === 'global') {
    return path.join(os.homedir(), '.gemini', 'settings.json');
  } else {
    return path.join(projectPath || process.cwd(), '.gemini', 'settings.json');
  }
}

/**
 * Configure Gemini CLI to use memobank
 */
export function configureGeminiCli(config: ToolConfig): void {
  const configPath = getGeminiConfigPath(config.scope, config.projectPath);
  const configDir = path.dirname(configPath);

  // Ensure directory exists
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  // Load existing config or create new
  let geminiConfig: Record<string, unknown> = {};
  if (fs.existsSync(configPath)) {
    geminiConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  }

  // Get memobank path
  const projectName = config.projectPath ? path.basename(config.projectPath) : 'default';
  const memobankPath = path.join(os.homedir(), '.memobank', projectName);

  // Configure memory path
  geminiConfig.memoryPath = memobankPath;
  geminiConfig.useMemobank = true;

  // Write config
  fs.writeFileSync(configPath, JSON.stringify(geminiConfig, null, 2), 'utf-8');

  // Create GEMINI.md that references memobank
  const geminiMdPath =
    config.scope === 'global'
      ? path.join(os.homedir(), '.gemini', 'GEMINI.md')
      : path.join(config.projectPath || process.cwd(), 'GEMINI.md');

  const memobankRef = `# Gemini CLI Memory via Memobank

This project uses memobank for persistent memory.

## Memory Location

\`${memobankPath}\`

## Commands

- Run \`memo recall "query"\` to search memories
- Run \`memo write lesson\` to create new memories
- Run \`memo import\` to import from other AI tools

## Auto-Memory

Memories are automatically recalled at session start and captured at session end.
`;

  if (!fs.existsSync(geminiMdPath)) {
    fs.writeFileSync(geminiMdPath, memobankRef, 'utf-8');
    console.log(`✓ Created ${geminiMdPath}`);
  }

  console.log(`✓ Gemini CLI configured (${config.scope})`);
  console.log(`  Config: ${configPath}`);
  console.log(`  Memory: ${memobankPath}`);
}

/**
 * Get Qwen Code config path
 */
function getQwenConfigPath(scope: 'global' | 'project', projectPath?: string): string {
  if (scope === 'global') {
    return path.join(os.homedir(), '.qwen', 'settings.json');
  } else {
    return path.join(projectPath || process.cwd(), '.qwen', 'settings.json');
  }
}

/**
 * Configure Qwen Code to use memobank
 */
export function configureQwenCode(config: ToolConfig): void {
  const configPath = getQwenConfigPath(config.scope, config.projectPath);
  const configDir = path.dirname(configPath);

  // Ensure directory exists
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  // Load existing config or create new
  let qwenConfig: Record<string, unknown> = {};
  if (fs.existsSync(configPath)) {
    qwenConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  }

  // Get memobank path
  const projectName = config.projectPath ? path.basename(config.projectPath) : 'default';
  const memobankPath = path.join(os.homedir(), '.memobank', projectName);

  // Configure context file to use memobank
  qwenConfig.contextFileName = path.join(memobankPath, 'memory', 'MEMORY.md');
  qwenConfig.useMemobank = true;
  qwenConfig.memobankPath = memobankPath;

  // Write config
  fs.writeFileSync(configPath, JSON.stringify(qwenConfig, null, 2), 'utf-8');

  // Create QWEN.md that references memobank
  const qwenMdPath =
    config.scope === 'global'
      ? path.join(os.homedir(), '.qwen', 'QWEN.md')
      : path.join(config.projectPath || process.cwd(), 'QWEN.md');

  const memobankRef = `# Qwen Code Memory via Memobank

This project uses memobank for persistent memory.

## Memory Location

\`${memobankPath}\`

## Commands

- Run \`memo recall "query"\` to search memories
- Run \`memo write lesson\` to create new memories
- Run \`memo import\` to import from other AI tools

## Auto-Memory

Memories are automatically recalled at session start and captured at session end.
`;

  if (!fs.existsSync(qwenMdPath)) {
    fs.writeFileSync(qwenMdPath, memobankRef, 'utf-8');
    console.log(`✓ Created ${qwenMdPath}`);
  }

  console.log(`✓ Qwen Code configured (${config.scope})`);
  console.log(`  Config: ${configPath}`);
  console.log(`  Memory: ${memobankPath}`);
}

/**
 * Configure all selected tools
 */
export function configureTools(tools: ToolConfig[]): void {
  for (const tool of tools) {
    try {
      switch (tool.name) {
        case 'Claude Code':
          configureClaudeCode(tool);
          break;
        case 'Gemini CLI':
          configureGeminiCli(tool);
          break;
        case 'Qwen Code':
          configureQwenCode(tool);
          break;
        default:
          console.log(`⚠ Unknown tool: ${tool.name}`);
      }
    } catch (error) {
      console.log(`✗ Failed to configure ${tool.name}: ${(error as Error).message}`);
    }
  }
}

/**
 * Check which tools are installed
 */
export function detectInstalledTools(): { name: string; installed: boolean }[] {
  const tools = [
    { name: 'Claude Code', checkPath: path.join(os.homedir(), '.claude') },
    { name: 'Gemini CLI', checkPath: path.join(os.homedir(), '.gemini') },
    { name: 'Qwen Code', checkPath: path.join(os.homedir(), '.qwen') },
  ];

  return tools.map((tool) => ({
    name: tool.name,
    installed: fs.existsSync(tool.checkPath),
  }));
}
