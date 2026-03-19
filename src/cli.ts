#!/usr/bin/env node

/**
 * memobank CLI
 * Entry point for the memo command
 */

import { Command } from 'commander';
import { installCommand } from './commands/install';
import { recallCommand, RecallOptions } from './commands/recall';
import { search } from './commands/search';
import { capture } from './commands/capture';
import { writeMemoryCommand } from './commands/write';
import { indexCommand } from './commands/index';
import { reviewCommand } from './commands/review';
import { mapCommand } from './commands/map';
import { importMemories } from './commands/import';
import { onboardingCommand } from './commands/onboarding';
import { lifecycleCommand, correctCommand } from './commands/lifecycle';
import { teamInit, teamSync, teamPublish, teamStatus } from './commands/team';
import { scanCommand } from './commands/scan';
import { findRepoRoot } from './core/store';
import { MemoryType } from './types';

const program = new Command();

program
  .name('memo')
  .description('memobank CLI - persistent memory for AI coding sessions')
  .version('0.1.0');

// Install command - simplified, just creates directory structure
program
  .command('install')
  .description('Set up memobank directory structure (use "memo onboarding" for interactive setup)')
  .option('--repo <path>', 'Point to an existing memobank repo')
  .option('--platform <name>', 'Install adapter for specific platform: claude-code|codex|gemini|qwen|cursor|all')
  .action(async (options) => {
    try {
      await installCommand(options);
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

// Onboarding command - new interactive setup
program
  .command('onboarding')
  .alias('init')
  .alias('setup')
  .description('Interactive setup wizard with menu navigation (recommended)')
  .option('--repo <path>', 'Memobank repository path')
  .action(async (options) => {
    try {
      await onboardingCommand(options.repo);
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
  .option('--scope <scope>', 'Limit search scope: personal|team|all (default: all)')
  .option('--explain', 'Show score breakdown for each result')
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
  .action(async (options) => {
    try {
      await capture({
        session: options.session,
        auto: options.auto,
        repo: options.repo,
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
  .option('--repo <path>', 'Memobank repository path')
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
        repo: options.repo,
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
          report: options.report || (!options.tier && !options.archive && !options.delete && !options.flagged),
          archive: options.archive,
          delete: options.delete,
          flagged: options.flagged,
          tier: options.tier,
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

// Team commands
const team = program
  .command('team')
  .description('Team memory sharing commands');

team
  .command('init <remote-url>')
  .description('Set up shared team memory repository')
  .option('--repo <path>', 'Memobank repository path')
  .action(async (remoteUrl: string, options) => {
    try {
      const repoRoot = findRepoRoot(process.cwd(), options.repo);
      await teamInit(remoteUrl, repoRoot);
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

team
  .command('sync')
  .description('Pull and push team memories')
  .option('--repo <path>', 'Memobank repository path')
  .action(async (options) => {
    try {
      const repoRoot = findRepoRoot(process.cwd(), options.repo);
      await teamSync(repoRoot);
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

team
  .command('publish <file>')
  .description('Promote a personal memory to team')
  .option('--repo <path>', 'Memobank repository path')
  .action(async (file: string, options) => {
    try {
      const repoRoot = findRepoRoot(process.cwd(), options.repo);
      await teamPublish(file, repoRoot);
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

team
  .command('status')
  .description('Show team repository status')
  .option('--repo <path>', 'Memobank repository path')
  .action(async (options) => {
    try {
      const repoRoot = findRepoRoot(process.cwd(), options.repo);
      await teamStatus(repoRoot);
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

// Parse and execute
program.parse(process.argv);
