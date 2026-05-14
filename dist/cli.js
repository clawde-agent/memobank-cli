#!/usr/bin/env node
"use strict";
/**
 * memobank CLI
 * Entry point for the memo command
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
const onboarding_1 = require("./commands/onboarding");
const lifecycle_1 = require("./commands/lifecycle");
const study_1 = require("./commands/study");
const workspace_1 = require("./commands/workspace");
const init_1 = require("./commands/init");
const migrate_1 = require("./commands/migrate");
const scan_1 = require("./commands/scan");
const process_queue_1 = require("./commands/process-queue");
const code_scan_1 = require("./commands/code-scan");
const store_1 = require("./core/store");
const config_1 = require("./config");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const program = new commander_1.Command();
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
    .option('--platform <name>', 'Install adapter for specific platform: claude-code|codex|gemini|qwen|cursor|all')
    .action(async (options) => {
    try {
        await (0, install_1.installCommand)(options);
    }
    catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
});
// Init command - quick mode by default, --interactive for full TUI
program
    .command('init')
    .description('Initialize memobank for this project')
    .option('--interactive', 'Run interactive setup wizard (13-step TUI)')
    .option('--platform <platforms>', 'Comma-separated platforms to install (e.g. claude-code,cursor)')
    .action(async (options) => {
    try {
        if (options.interactive) {
            const { onboardingCommand } = await Promise.resolve().then(() => __importStar(require('./commands/onboarding')));
            await onboardingCommand();
        }
        else {
            const { quickInit } = await Promise.resolve().then(() => __importStar(require('./commands/init')));
            await quickInit({ platform: options.platform });
        }
    }
    catch (error) {
        console.error(`Error: ${error.message}`);
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
        await (0, onboarding_1.onboardingCommand)();
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
    .option('--scope <scope>', 'Limit search scope: personal|project|workspace|all (default: all)')
    .option('--explain', 'Show score breakdown for each result')
    .option('--code', 'Enable dual-track recall: search memories + code symbols', false)
    .option('--refs <symbol>', 'Show callers of a symbol from the code index')
    .option('--silent', 'Suppress stdout output')
    .action(async (query, options) => {
    try {
        await (0, recall_1.recallCommand)(query, options);
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
    .option('--silent', 'Suppress output (for hooks)')
    .action(async (options) => {
    try {
        await (0, capture_1.capture)({
            session: options.session,
            auto: options.auto,
            repo: options.repo,
            silent: options.silent,
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
    .option('--symbol <symbol>', 'Anchor this memory to a specific code symbol')
    .option('--repo <path>', 'Memobank repository path')
    .option('--silent', 'Suppress stdout output')
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
            symbol: options.symbol,
            repo: options.repo,
            silent: options.silent,
        });
    }
    catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
});
// Study command
program
    .command('study [lesson-name]')
    .description('Promote a lesson to CLAUDE.md as an <important if="..."> conditional block')
    .option('--if <condition>', 'Condition string (skips interactive prompt)')
    .option('--list', 'List available lessons to study')
    .option('--repo <path>', 'Memobank repository path')
    .action(async (lessonName, options) => {
    try {
        await (0, study_1.studyCommand)(lessonName, options);
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
    .option('--reset-epoch', 'Reset team epoch to now (use after team handoff)')
    .option('--scan', 'Run full lifecycle scan — auto-update status on all memories')
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
                report: options.report ||
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
// Tier-init command (non-interactive, for scripting)
program
    .command('tier-init')
    .description('Non-interactive tier initialization (use memo init for guided setup)')
    .option('--global', 'Initialize personal tier in ~/.memobank/<project>/')
    .option('--name <name>', 'Project name (defaults to directory name)')
    .action(async (options) => {
    try {
        await (0, init_1.initCommand)(options);
    }
    catch (error) {
        console.error(`Error: ${error.message}`);
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
        const repoRoot = (0, store_1.findRepoRoot)(process.cwd(), options.repo);
        const config = (0, config_1.loadConfig)(repoRoot);
        const home = process.env.HOME || process.env.USERPROFILE || '';
        const globalDir = options.globalDir ?? path.join(home, '.memobank', config.project.name);
        await (0, migrate_1.migrate)(repoRoot, globalDir, { dryRun: options.dryRun, rollback: options.rollback });
    }
    catch (error) {
        console.error(`Error: ${error.message}`);
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
    .action(async (remoteUrl, options) => {
    try {
        const repoRoot = (0, store_1.findRepoRoot)(process.cwd(), options.repo);
        await (0, workspace_1.workspaceInit)(remoteUrl, repoRoot);
    }
    catch (error) {
        console.error(`Error: ${error.message}`);
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
        const repoRoot = (0, store_1.findRepoRoot)(process.cwd(), options.repo);
        await (0, workspace_1.workspaceSync)(repoRoot, options.push);
    }
    catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
});
workspace
    .command('publish <file>')
    .description('Promote a project memory to workspace (runs secret scan first)')
    .option('--repo <path>', 'Memobank repository path')
    .action(async (file, options) => {
    try {
        const repoRoot = (0, store_1.findRepoRoot)(process.cwd(), options.repo);
        await (0, workspace_1.workspacePublish)(file, repoRoot);
    }
    catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
});
workspace
    .command('status')
    .description('Show git status of local workspace clone')
    .option('--repo <path>', 'Memobank repository path')
    .action(async (options) => {
    try {
        const repoRoot = (0, store_1.findRepoRoot)(process.cwd(), options.repo);
        await (0, workspace_1.workspaceStatus)(repoRoot);
    }
    catch (error) {
        console.error(`Error: ${error.message}`);
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
    .action(async (scanPath, options) => {
    try {
        await (0, scan_1.scanCommand)(scanPath, {
            staged: options.staged,
            failOnSecrets: options.failOnSecrets,
            fix: options.fix,
            repo: options.repo,
        });
    }
    catch (error) {
        console.error(`Error: ${error.message}`);
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
    .action(async (scanPath, options) => {
    try {
        await (0, code_scan_1.codeScanCommand)(scanPath, {
            summarize: options.summarize,
            force: options.force,
            langs: options.langs
                ? options.langs.split(',').map((l) => l.trim())
                : undefined,
            repo: options.repo,
        });
    }
    catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
});
// Process-queue command
program
    .command('process-queue')
    .description('Process pending memory queue (write candidates to memory files)')
    .option('--background', 'Spawn as background process and return immediately')
    .action(async (options) => {
    await (0, process_queue_1.processQueueCommand)({ background: options.background });
});
// Parse and execute
program.parse(process.argv);
//# sourceMappingURL=cli.js.map