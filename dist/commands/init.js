"use strict";
/**
 * init command
 * memo init          — project tier: creates .memobank/ in current repo
 * memo init --global — personal tier: creates ~/.memobank/<project>/
 * memo init --interactive — full onboarding TUI
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
exports.ensureGitignoreFull = ensureGitignoreFull;
exports.quickInit = quickInit;
exports.initCommand = initCommand;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const config_1 = require("../config");
const store_1 = require("../core/store");
const platform_detector_1 = require("../core/platform-detector");
const claude_code_1 = require("../platforms/claude-code");
const cursor_1 = require("../platforms/cursor");
const codex_1 = require("../platforms/codex");
const gemini_1 = require("../platforms/gemini");
const qwen_1 = require("../platforms/qwen");
const GITIGNORE_ENTRIES = [
    '.memobank/meta/access-log.json',
    '.memobank/meta/code-index.db',
    '.memobank/.lancedb/',
    '.memobank/pending/',
];
function ensureGitignoreFull(gitRoot) {
    const gitignorePath = path.join(gitRoot, '.gitignore');
    const content = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf-8') : '';
    const toAdd = GITIGNORE_ENTRIES.filter((entry) => !content.includes(entry));
    if (!toAdd.length)
        return;
    const block = '\n# memobank\n' + toAdd.join('\n') + '\n';
    if (!content) {
        fs.writeFileSync(gitignorePath, block.trimStart());
    }
    else {
        fs.appendFileSync(gitignorePath, block);
    }
}
async function quickInit(options) {
    const cwd = process.cwd();
    const gitRoot = options.repoRoot ?? (0, store_1.findRepoRoot)(cwd);
    const memobankRoot = path.join(gitRoot, '.memobank');
    const projectName = (0, platform_detector_1.detectProjectName)();
    createTierDirs(memobankRoot);
    (0, config_1.initConfig)(memobankRoot, projectName);
    ensureGitignoreFull(gitRoot);
    const allPlatforms = (0, platform_detector_1.detectPlatforms)();
    const targets = options.platform
        ? options.platform.split(',').map((s) => s.trim())
        : allPlatforms.filter((p) => p.hint?.includes('✓')).map((p) => p.value);
    const installed = [];
    for (const p of targets) {
        if (p === 'claude-code') {
            await (0, claude_code_1.installClaudeCode)(memobankRoot);
            installed.push(p);
        }
        else if (p === 'cursor') {
            await (0, cursor_1.installCursor)(cwd);
            installed.push(p);
        }
        else if (p === 'codex') {
            await (0, codex_1.installCodex)(cwd);
            installed.push(p);
        }
        else if (p === 'gemini') {
            await (0, gemini_1.installGemini)();
            installed.push(p);
        }
        else if (p === 'qwen') {
            await (0, qwen_1.installQwen)();
            installed.push(p);
        }
    }
    const platformList = installed.length ? installed.join(', ') : 'none';
    console.log(`✓ memobank initialized (project: ${projectName}, platforms: ${platformList})`);
    if (!installed.length) {
        console.log('  Tip: run memo init --interactive to configure platforms manually.');
    }
}
const MEMORY_TYPES = ['lesson', 'decision', 'workflow', 'architecture'];
function initCommand(options) {
    const cwd = process.cwd();
    const projectName = options.name ?? path.basename(cwd);
    if (options.global) {
        const home = process.env.HOME || process.env.USERPROFILE || '';
        const globalDir = path.join(home, '.memobank', projectName);
        if (fs.existsSync(path.join(globalDir, 'meta', 'config.yaml'))) {
            console.log(`Personal memory already initialized at ${globalDir}`);
            console.log('Run: memo recall <query> to search memories.');
            return;
        }
        createTierDirs(globalDir);
        (0, config_1.initConfig)(globalDir, projectName);
        console.log(`✓ Personal memory initialized at: ${globalDir}`);
        console.log('  Memories here are private to your machine and never committed.');
    }
    else {
        const projectDir = path.join(cwd, '.memobank');
        if (fs.existsSync(path.join(projectDir, 'meta', 'config.yaml'))) {
            console.log(`.memobank/ already initialized in ${cwd}`);
            console.log('Run: memo recall <query> to search memories.');
            return;
        }
        createTierDirs(projectDir);
        (0, config_1.initConfig)(projectDir, projectName);
        ensureGitignoreFull((0, store_1.findGitRoot)(cwd));
        console.log(`✓ Project memory initialized at: ${projectDir}`);
        console.log('  Commit .memobank/ with your code — it IS the team memory.');
    }
}
function createTierDirs(root) {
    fs.mkdirSync(path.join(root, 'meta'), { recursive: true });
    for (const type of MEMORY_TYPES) {
        fs.mkdirSync(path.join(root, type), { recursive: true });
    }
}
//# sourceMappingURL=init.js.map