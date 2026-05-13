"use strict";
/**
 * init command
 * memo init          — project tier: creates .memobank/ in current repo
 * memo init --global — personal tier: creates ~/.memobank/<project>/
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
exports.initCommand = initCommand;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const config_1 = require("../config");
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
        ensureGitignore(cwd);
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
function ensureGitignore(repoRoot) {
    const gitignorePath = path.join(repoRoot, '.gitignore');
    const entry = '.memobank/meta/access-log.json';
    if (!fs.existsSync(gitignorePath)) {
        fs.writeFileSync(gitignorePath, `${entry}\n`);
        return;
    }
    const content = fs.readFileSync(gitignorePath, 'utf-8');
    if (!content.includes(entry)) {
        fs.appendFileSync(gitignorePath, `\n# memobank — access log is local, not team state\n${entry}\n`);
    }
}
//# sourceMappingURL=init.js.map