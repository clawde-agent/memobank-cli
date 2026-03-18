#!/usr/bin/env node

/**
 * memobank CLI
 * Entry point for the memo command
 */

import { Command } from 'commander';
import { installCommand } from './commands/install';
import { recall } from './commands/recall';
import { search } from './commands/search';
import { capture } from './commands/capture';
import { writeMemoryCommand } from './commands/write';
import { indexCommand } from './commands/index';
import { reviewCommand } from './commands/review';
import { mapCommand } from './commands/map';
import { MemoryType } from './types';

const program = new Command();

program
  .name('memo')
  .description('memobank CLI - persistent memory for AI coding sessions')
  .version('0.1.0');

// Install command
program
  .command('install')
  .description('Set up memobank directory structure and platform integrations')
  .option('--repo <path>', 'Point to an existing memobank repo')
  .option('--claude-code', 'Configure Claude Code')
  .option('--codex', 'Configure Codex')
  .option('--cursor', 'Configure Cursor')
  .option('--all', 'Configure all platforms (default)')
  .action(async (options) => {
    try {
      await installCommand(options);
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
  .action(async (query, options) => {
    try {
      await recall(query, {
        top: parseInt(options.top),
        engine: options.engine,
        format: options.format,
        dryRun: options.dryRun,
        repo: options.repo,
      });
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

// Parse and execute
program.parse(process.argv);