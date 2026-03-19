#!/usr/bin/env node
"use strict";
/**
 * memobank CLI
 * Entry point for the memo command
 */
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const install_1 = require("./commands/install");
const recall_1 = require("./commands/recall");
const search_1 = require("./commands/search");
const capture_1 = require("./commands/capture");
const write_1 = require("./commands/write");
const index_1 = require("./commands/index");
const review_1 = require("./commands/review");
const map_1 = require("./commands/map");
const import_1 = require("./commands/import");
const setup_1 = require("./commands/setup");
const lifecycle_1 = require("./commands/lifecycle");
const program = new commander_1.Command();
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
        await (0, install_1.installCommand)(options);
    }
    catch (error) {
        console.error(`Error: ${error.message}`);
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
        await (0, recall_1.recall)(query, {
            top: parseInt(options.top),
            engine: options.engine,
            format: options.format,
            dryRun: options.dryRun,
            repo: options.repo,
        });
    }
    catch (error) {
        console.error(`Error: ${error.message}`);
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
        await (0, capture_1.capture)({
            session: options.session,
            auto: options.auto,
            repo: options.repo,
        });
    }
    catch (error) {
        console.error(`Error: ${error.message}`);
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
    const validTypes = ['lesson', 'decision', 'workflow', 'architecture'];
    if (!validTypes.includes(type)) {
        console.error(`Error: Invalid type "${type}". Must be one of: ${validTypes.join(', ')}`);
        process.exit(1);
    }
    try {
        await (0, write_1.writeMemoryCommand)(type, {
            name: options.name,
            description: options.description,
            tags: options.tags,
            content: options.content,
            repo: options.repo,
        });
    }
    catch (error) {
        console.error(`Error: ${error.message}`);
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
        await (0, search_1.search)(query, {
            engine: options.engine,
            tag: options.tag,
            type: options.type,
            format: options.format,
            repo: options.repo,
        });
    }
    catch (error) {
        console.error(`Error: ${error.message}`);
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
        await (0, index_1.indexCommand)({
            incremental: options.incremental,
            engine: options.engine,
            force: options.force,
            repo: options.repo,
        });
    }
    catch (error) {
        console.error(`Error: ${error.message}`);
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
        await (0, review_1.reviewCommand)({
            due: options.due,
            format: options.format,
            repo: options.repo,
        });
    }
    catch (error) {
        console.error(`Error: ${error.message}`);
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
        await (0, map_1.mapCommand)({
            type: options.type,
            repo: options.repo,
        });
    }
    catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
});
// Setup command (interactive wizard)
program
    .command('setup')
    .description('Interactive setup wizard for memobank configuration')
    .option('--repo <path>', 'Memobank repository path')
    .action(async (options) => {
    try {
        await (0, setup_1.setupWizard)(options.repo);
    }
    catch (error) {
        console.error(`Error: ${error.message}`);
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
        await (0, import_1.importMemories)({
            repo: options.repo,
            claude: options.claude,
            gemini: options.gemini,
            qwen: options.qwen,
            all: options.all || (!options.claude && !options.gemini && !options.qwen),
            dryRun: options.dryRun,
        });
    }
    catch (error) {
        console.error(`Error: ${error.message}`);
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
            await (0, lifecycle_1.correctCommand)(options.path, {
                repo: options.repo,
                reason: options.reason,
            });
        }
        else {
            await (0, lifecycle_1.lifecycleCommand)({
                repo: options.repo,
                report: options.report,
                archive: options.archive,
                delete: options.delete,
                flagged: options.flagged,
                tier: options.tier,
            });
        }
    }
    catch (error) {
        console.error(`Error: ${error.message}`);
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
        await (0, lifecycle_1.correctCommand)(memoryPath, {
            repo: options.repo,
            reason: options.reason,
        });
    }
    catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
});
// Parse and execute
program.parse(process.argv);
//# sourceMappingURL=cli.js.map