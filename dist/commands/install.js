"use strict";
/**
 * Install command
 * Sets up memobank directory structure and platform integrations
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
exports.installCommand = installCommand;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const config_1 = require("../config");
const claude_code_1 = require("../platforms/claude-code");
const codex_1 = require("../platforms/codex");
const cursor_1 = require("../platforms/cursor");
const gemini_1 = require("../platforms/gemini");
const qwen_1 = require("../platforms/qwen");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
const MEMORY_TYPES = ['lesson', 'decision', 'workflow', 'architecture'];
/**
 * Detect git repo name
 */
async function detectGitRepoName(cwd) {
    try {
        const { stdout } = await execAsync('git rev-parse --show-toplevel', { cwd });
        const gitRoot = stdout.trim();
        return path.basename(gitRoot);
    }
    catch {
        // Not a git repo, use directory name
        return path.basename(cwd);
    }
}
/**
 * Create directory structure
 */
function createDirectoryStructure(repoRoot) {
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
async function installPlatform(platform, repoRoot) {
    const { installClaudeCode: installCC } = await Promise.resolve().then(() => __importStar(require('../platforms/claude-code')));
    const { installCodex: installCx } = await Promise.resolve().then(() => __importStar(require('../platforms/codex')));
    const { installGemini: installGem, detectGemini: detectGem } = await Promise.resolve().then(() => __importStar(require('../platforms/gemini')));
    const { installQwen: installQw, detectQwen: detectQw } = await Promise.resolve().then(() => __importStar(require('../platforms/qwen')));
    const { installCursor: installCur } = await Promise.resolve().then(() => __importStar(require('../platforms/cursor')));
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
            if (detectGem()) {
                await installGem();
            }
            if (detectQw()) {
                await installQw();
            }
            await installCur(process.cwd());
            break;
        default:
            console.error(`Unknown platform: ${platform}. Valid: claude-code, codex, gemini, qwen, cursor, all`);
    }
}
/**
 * Install memobank
 */
async function installCommand(options = {}) {
    const cwd = process.cwd();
    // Determine mode and repo root
    let repoRoot;
    let projectName;
    if (options.repo) {
        // Mode A: Explicit repo path
        repoRoot = path.resolve(options.repo);
        projectName = path.basename(repoRoot);
    }
    else {
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
        (0, config_1.initConfig)(repoRoot, projectName);
        console.log(`✓ Config initialized`);
    }
    else {
        console.log(`⊘ Config already exists`);
    }
    // Platform installs
    const allPlatforms = options.all ?? (!options.claudeCode && !options.codex && !options.cursor);
    if (allPlatforms || options.claudeCode) {
        await (0, claude_code_1.installClaudeCode)(repoRoot);
    }
    if (allPlatforms || options.codex) {
        await (0, codex_1.installCodex)(cwd);
    }
    if (allPlatforms || options.cursor) {
        await (0, cursor_1.installCursor)(cwd);
    }
    if (allPlatforms) {
        if ((0, gemini_1.detectGemini)()) {
            await (0, gemini_1.installGemini)();
        }
        if ((0, qwen_1.detectQwen)()) {
            await (0, qwen_1.installQwen)();
        }
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
//# sourceMappingURL=install.js.map