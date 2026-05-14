#!/usr/bin/env node

/**
 * memobank CLI
 * Entry point for the memo command
 */

import { Command } from 'commander';
import { installCommand } from './commands/install';
import type { RecallOptions } from './commands/recall';
import { recallCommand } from './commands/recall';
import { search } from './commands/search';
import { capture } from './commands/capture';
import { writeMemoryCommand } from './commands/write';
import { indexCommand } from './commands/index';
import { reviewCommand } from './commands/review';
import { mapCommand } from './commands/map';
import { importMemories } from './commands/import';
import { onboardingCommand } from './commands/onboarding';
import { lifecycleCommand, correctCommand } from './commands/lifecycle';
import {
  workspaceInit,
  workspaceSync,
  workspacePublish,
  workspaceStatus,
} from './commands/workspace';
import { initCommand } from './commands/init';
import { migrate } from './commands/migrate';
import { scanCommand } from './commands/scan';
import { processQueueCommand } from './commands/process-queue';
import { codeScanCommand } from './commands/code-scan';
import { findRepoRoot } from './core/store';
import { loadConfig } from './config';
import type { MemoryType, IndexedLanguage } from './types';
import * as fs from 'fs';
import * as path from 'path';

const program = new Command();

// Get version from package.json
const packageJsonPath = path.join(__dirname, '..', 'package.json');
const version = fs.existsSync(packageJsonPath)
  ? JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')).version
  : '0.4.0';

program
  .name('memo')
  .description('memobank CLI - persistent memory for AI coding sessions')
  .version(version);

// Install command - simplified, just creates directory structure
program
  .command('install')
  .description('Set up memobank directory structure (use "memo onboarding" for interactive setup)')
  .option('--repo <path>', 'Point to an existing memobank repo')
  .option(
    '--platform <name>',
    'Install adapter for specific platform: claude-code|codex|gemini|qwen|cursor|all'
  )
  .action(async (options) => {
    try {
      await installCommand(options);
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

// Init command - quick mode by default, --interactive for full TUI
program
  .command('init')
  .description('Initialize memobank for this project')
  .option('--interactive', 'Run interactive setup wizard (13-step TUI)')
  .option(
    '--platform <platforms>',
    'Comma-separated platforms to install (e.g. claude-code,cursor)'
  )
  .action(async (options) => {
    try {
      if (options.interactive) {
        const { onboardingCommand } = await import('./commands/onboarding');
        await onboardingCommand();
      } else {
        const { quickInit } = await import('./commands/init');
        await quickInit({ platform: options.platform });
      }
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

// Onboarding command - interactive setup wizard
program
  .command('onboarding')
  .alias('setup')
  .description('Interactive setup wizard (recommended for first-time setup)')
  .action(async () => {
    try {
      await onboardingCommand();
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

// Recall command
program
  .command('recall <query>')
  .description('Search and display relevant memories (writes to MEMORY.md)')
  .option('--top <number>', 'Number of results to return', '5')
  .option('--engine <engine>', 'Search engine (text|lancedb)', 'text')
  .option('--format <format>', 'Output format (text|json)', 'text')
  .option('--dry-run', 'Print without writing MEMORY.md', false)
  .option('--repo <path>', 'Memobank repository path')
  .option('--scope <scope>', 'Limit search scope: personal|project|workspace|all (default: all)')
  .option('--explain', 'Show score breakdown for each result')
  .option('--code', 'Enable dual-track recall: search memories + code symbols', false)
  .option('--refs <symbol>', 'Show callers of a symbol from the code index')
  .option('--silent', 'Suppress stdout output')
  .action(async (query: string, options: RecallOptions) => {
    try {
      await recallCommand(query, options);
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

// Capture command
program
  .command('capture')
  .description('Extract learnings from session text')
  .option('--session <text>', 'Session text to extract from (use - for stdin)')
  .option('--auto', 'Read from Claude auto-memory directory')
  .option('--repo <path>', 'Memobank repository path')
  .option('--silent', 'Suppress output (for hooks)')
  .action(async (options) => {
    try {
      await capture({
        session: options.session,
        auto: options.auto,
        repo: options.repo,
        silent: options.silent,
      });
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

// Write command
program
  .command('write <type>')
  .description('Create a new memory (interactive or non-interactive)')
  .option('--name <name>', 'Memory name (slug format)')
  .option('--description <description>', 'One-sentence summary')
  .option('--tags <tags>', 'Comma-separated tags')
  .option('--content <content>', 'Markdown content')
  .option('--symbol <symbol>', 'Anchor this memory to a specific code symbol')
  .option('--repo <path>', 'Memobank repository path')
  .option('--silent', 'Suppress stdout output')
  .action(async (type, options) => {
    // Validate type
    const validTypes: MemoryType[] = ['lesson', 'decision', 'workflow', 'architecture'];
    if (!validTypes.includes(type as MemoryType)) {
      console.error(`Error: Invalid type "${type}". Must be one of: ${validTypes.join(', ')}`);
      process.exit(1);
    }

    try {
      await writeMemoryCommand(type as MemoryType, {
        name: options.name,
        description: options.description,
        tags: options.tags,
        content: options.content,
        symbol: options.symbol,
        repo: options.repo,
        silent: options.silent,
      });
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

// Search command
program
  .command('search <query>')
  .description('Search memories (debug mode, does not write MEMORY.md)')
  .option('--engine <engine>', 'Search engine (text|lancedb)', 'text')
  .option('--tag <tag>', 'Filter by tag')
  .option('--type <type>', 'Filter by type')
  .option('--format <format>', 'Output format (text|json)', 'text')
  .option('--repo <path>', 'Memobank repository path')
  .action(async (query, options) => {
    try {
      await search(query, {
        engine: options.engine,
        tag: options.tag,
        type: options.type,
        format: options.format,
        repo: options.repo,
      });
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

// Index command
program
  .command('index')
  .description('Build or update search index')
  .option('--incremental', 'Only index changed files')
  .option('--engine <engine>', 'Search engine (text|lancedb)', 'text')
  .option('--force', 'Force full rebuild')
  .option('--repo <path>', 'Memobank repository path')
  .action(async (options) => {
    try {
      await indexCommand({
        incremental: options.incremental,
        engine: options.engine,
        force: options.force,
        repo: options.repo,
      });
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

// Review command
program
  .command('review')
  .description('List memories due for review')
  .option('--due', 'Only show overdue items')
  .option('--format <format>', 'Output format (text|json)', 'text')
  .option('--repo <path>', 'Memobank repository path')
  .action(async (options) => {
    try {
      await reviewCommand({
        due: options.due,
        format: options.format,
        repo: options.repo,
      });
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

// Map command
program
  .command('map')
  .description('Show memory summary and statistics')
  .option('--type <type>', 'Filter by type')
  .option('--repo <path>', 'Memobank repository path')
  .action(async (options) => {
    try {
      await mapCommand({
        type: options.type,
        repo: options.repo,
      });
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

// Import command
program
  .command('import')
  .description('Import memories from other AI tools (Claude Code, Gemini CLI, Qwen Code)')
  .option('--claude', 'Import from Claude Code only')
  .option('--gemini', 'Import from Gemini CLI only')
  .option('--qwen', 'Import from Qwen Code only')
  .option('--all', 'Import from all available tools (default)')
  .option('--repo <path>', 'Memobank repository path')
  .option('--dry-run', 'Show what would be imported without writing')
  .action(async (options) => {
    try {
      await importMemories({
        repo: options.repo,
        claude: options.claude,
        gemini: options.gemini,
        qwen: options.qwen,
        all: options.all || (!options.claude && !options.gemini && !options.qwen),
        dryRun: options.dryRun,
      });
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

// Lifecycle command
program
  .command('lifecycle [action]')
  .description('Manage memory lifecycle (tiers, archival, corrections)')
  .option('--report', 'Generate lifecycle report')
  .option('--tier <tier>', 'Filter by tier (core|working|peripheral)')
  .option('--archive', 'Show archival candidates')
  .option('--delete', 'Delete memory (requires --path)')
  .option('--flagged', 'Show memories flagged for review')
  .option('--path <path>', 'Memory file path')
  .option('--reset-epoch', 'Reset team epoch to now (use after team handoff)')
  .option('--scan', 'Run full lifecycle scan — auto-update status on all memories')
  .option('--repo <path>', 'Memobank repository path')
  .action(async (action, options) => {
    try {
      if (action === 'correct' && options.path) {
        await correctCommand(options.path, {
          repo: options.repo,
          reason: options.reason,
        });
      } else {
        await lifecycleCommand({
          repo: options.repo,
          report:
            options.report ||
            (!options.tier &&
              !options.archive &&
              !options.delete &&
              !options.flagged &&
              !options.resetEpoch &&
              !options.scan),
          archive: options.archive,
          delete: options.delete,
          flagged: options.flagged,
          tier: options.tier,
          resetEpoch: options.resetEpoch,
          scan: options.scan,
        });
      }
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

// Correct command (alias)
program
  .command('correct <memory-path>')
  .description('Record a correction for a memory')
  .option('--reason <text>', 'Reason for correction')
  .option('--repo <path>', 'Memobank repository path')
  .action(async (memoryPath, options) => {
    try {
      await correctCommand(memoryPath, {
        repo: options.repo,
        reason: options.reason,
      });
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

// Tier-init command (non-interactive, for scripting)
program
  .command('tier-init')
  .description('Non-interactive tier initialization (use memo init for guided setup)')
  .option('--global', 'Initialize personal tier in ~/.memobank/<project>/')
  .option('--name <name>', 'Project name (defaults to directory name)')
  .action(async (options) => {
    try {
      await initCommand(options);
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

// Migrate command
program
  .command('migrate')
  .description('Migrate from legacy personal/+team/ layout to three-tier model')
  .option('--dry-run', 'Preview changes without executing')
  .option('--rollback', 'Restore from personal.bak/ and team.bak/')
  .option('--global-dir <path>', 'Target path for personal tier (default: ~/.memobank/<project>)')
  .option('--repo <path>', 'Memobank repository path')
  .action(async (options) => {
    try {
      const repoRoot = findRepoRoot(process.cwd(), options.repo);
      const config = loadConfig(repoRoot);
      const home = process.env.HOME || process.env.USERPROFILE || '';
      const globalDir = options.globalDir ?? path.join(home, '.memobank', config.project.name);
      await migrate(repoRoot, globalDir, { dryRun: options.dryRun, rollback: options.rollback });
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

// Workspace commands
const workspace = program
  .command('workspace')
  .description('Cross-repo workspace memory sharing commands (optional)');

workspace
  .command('init <remote-url>')
  .description('Connect to a shared workspace memory repository')
  .option('--repo <path>', 'Memobank repository path')
  .action(async (remoteUrl: string, options) => {
    try {
      const repoRoot = findRepoRoot(process.cwd(), options.repo);
      await workspaceInit(remoteUrl, repoRoot);
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

workspace
  .command('sync')
  .description('Pull latest workspace memories (--push to also push)')
  .option('--push', 'Push local changes to remote after pulling')
  .option('--repo <path>', 'Memobank repository path')
  .action(async (options) => {
    try {
      const repoRoot = findRepoRoot(process.cwd(), options.repo);
      await workspaceSync(repoRoot, options.push);
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

workspace
  .command('publish <file>')
  .description('Promote a project memory to workspace (runs secret scan first)')
  .option('--repo <path>', 'Memobank repository path')
  .action(async (file: string, options) => {
    try {
      const repoRoot = findRepoRoot(process.cwd(), options.repo);
      await workspacePublish(file, repoRoot);
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

workspace
  .command('status')
  .description('Show git status of local workspace clone')
  .option('--repo <path>', 'Memobank repository path')
  .action(async (options) => {
    try {
      const repoRoot = findRepoRoot(process.cwd(), options.repo);
      await workspaceStatus(repoRoot);
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

// Scan command
program
  .command('scan [path]')
  .description('Scan memory files for secrets')
  .option('--staged', 'Scan git-staged files only (used by pre-commit hook)')
  .option('--fail-on-secrets', 'Exit with code 1 if secrets found')
  .option('--fix', 'Auto-redact secrets in-place and re-stage')
  .option('--repo <path>', 'Memobank repository path')
  .action(async (scanPath: string | undefined, options) => {
    try {
      await scanCommand(scanPath, {
        staged: options.staged,
        failOnSecrets: options.failOnSecrets,
        fix: options.fix,
        repo: options.repo,
      });
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

// Code index command
program
  .command('index-code [path]')
  .description('Index codebase symbols for use with memo recall --code')
  .option('--summarize', 'Write project-architecture-snapshot memory after indexing')
  .option('--force', 'Re-index all files (ignore hash cache)')
  .option('--langs <list>', 'Comma-separated language filter, e.g. typescript,python')
  .option('--repo <path>', 'Memobank repository path')
  .action(async (scanPath: string | undefined, options) => {
    try {
      await codeScanCommand(scanPath, {
        summarize: options.summarize,
        force: options.force,
        langs: options.langs
          ? (options.langs.split(',').map((l: string) => l.trim()) as IndexedLanguage[])
          : undefined,
        repo: options.repo,
      });
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

// Process-queue command
program
  .command('process-queue')
  .description('Process pending memory queue (write candidates to memory files)')
  .option('--background', 'Spawn as background process and return immediately')
  .action(async (options) => {
    await processQueueCommand({ background: options.background as boolean | undefined });
  });

// Parse and execute
program.parse(process.argv);
