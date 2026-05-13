"use strict";
/**
 * Workspace memory commands (cross-repo, optional)
 * memo workspace init <remote>  — clone/init workspace repo
 * memo workspace sync           — pull latest; optionally push
 * memo workspace publish <file> — scan secrets + copy to workspace
 * memo workspace status         — show git status of local workspace clone
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.workspaceInit = workspaceInit;
exports.workspaceSync = workspaceSync;
exports.workspacePublish = workspacePublish;
exports.workspaceStatus = workspaceStatus;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const gray_matter_1 = __importDefault(require("gray-matter"));
const config_1 = require("../config");
const store_1 = require("../core/store");
const scan_1 = require("./scan");
const MEMORY_TYPES = ['lesson', 'decision', 'workflow', 'architecture', 'meta'];
function workspaceInit(remoteUrl, repoRoot) {
    const config = (0, config_1.loadConfig)(repoRoot);
    const wsName = path.basename(remoteUrl, '.git');
    const home = process.env.HOME || process.env.USERPROFILE || '';
    const wsDir = path.join(home, '.memobank', '_workspace', wsName);
    if (fs.existsSync(wsDir)) {
        console.log(`Workspace already initialized at ${wsDir}. Run: memo workspace sync`);
        return;
    }
    let cloned = false;
    try {
        (0, child_process_1.execSync)(`git clone "${remoteUrl}" "${wsDir}"`, { stdio: 'pipe' });
        cloned = true;
        console.log('✓ Cloned workspace repository.');
    }
    catch {
        /* remote may be empty */
    }
    if (!cloned) {
        fs.mkdirSync(wsDir, { recursive: true });
        (0, child_process_1.execSync)(`git init "${wsDir}"`, { stdio: 'pipe' });
        (0, child_process_1.execSync)(`git -C "${wsDir}" remote add origin "${remoteUrl}"`, { stdio: 'pipe' });
        for (const type of MEMORY_TYPES) {
            fs.mkdirSync(path.join(wsDir, type), { recursive: true });
            fs.writeFileSync(path.join(wsDir, type, '.gitkeep'), '');
        }
        (0, child_process_1.execSync)(`git -C "${wsDir}" add -A`, { stdio: 'pipe' });
        (0, child_process_1.execSync)(`git -C "${wsDir}" commit -m "chore: initialize workspace memory repo"`, {
            stdio: 'pipe',
        });
        try {
            (0, child_process_1.execSync)(`git -C "${wsDir}" push -u origin main`, { stdio: 'pipe' });
        }
        catch {
            /* push may fail for empty remotes — ok */
        }
        console.log('✓ Initialized workspace repository.');
    }
    config.workspace = { remote: remoteUrl, auto_sync: false, branch: 'main', path: '.memobank' };
    (0, config_1.writeConfig)(repoRoot, config);
    console.log(`✓ Workspace remote configured: ${remoteUrl}`);
}
function workspaceSync(repoRoot, push = false) {
    const config = (0, config_1.loadConfig)(repoRoot);
    if (!config.workspace?.remote) {
        console.error('No workspace remote configured. Run: memo workspace init <remote-url>');
        process.exit(1);
    }
    const wsName = path.basename(config.workspace.remote, '.git');
    const home = process.env.HOME || process.env.USERPROFILE || '';
    const wsDir = path.join(home, '.memobank', '_workspace', wsName);
    const branch = config.workspace.branch ?? 'main';
    console.log('Pulling from workspace remote...');
    (0, child_process_1.execFileSync)('git', ['-C', wsDir, 'pull', 'origin', branch], { stdio: 'inherit' });
    if (push) {
        (0, child_process_1.execSync)(`git -C "${wsDir}" add -A`, { stdio: 'pipe' });
        let hasChanges = false;
        try {
            (0, child_process_1.execSync)(`git -C "${wsDir}" diff --staged --quiet`, { stdio: 'pipe' });
        }
        catch {
            hasChanges = true;
        }
        if (hasChanges) {
            (0, child_process_1.execSync)(`git -C "${wsDir}" commit -m "chore: workspace sync [memo workspace sync]"`, {
                stdio: 'inherit',
            });
            (0, child_process_1.execFileSync)('git', ['-C', wsDir, 'push', 'origin', branch], { stdio: 'inherit' });
            console.log('✓ Pushed to workspace remote.');
        }
        else {
            console.log('Nothing to push. Repository is up to date.');
        }
    }
    else {
        console.log('✓ Workspace memories synced.');
    }
}
async function workspacePublish(filePath, repoRoot, wsDirOverride) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
    }
    // Resolve to absolute paths for security checks
    const absoluteFilePath = path.resolve(filePath);
    const absoluteRepoRoot = path.resolve(repoRoot);
    // Security: Ensure filePath is within repoRoot to prevent path traversal
    const rel = path.relative(absoluteRepoRoot, absoluteFilePath);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
        throw new Error(`Security: File must be within repo root. Got: ${filePath}`);
    }
    // Secret scan
    try {
        const findings = (0, scan_1.scanFile)(filePath);
        if (findings.length > 0) {
            console.error('⚠️  Potential secrets found — aborting publish:');
            findings.forEach((f) => console.error(`  ${f}`));
            console.error('→ Fix manually or run: memo scan --fix <file>');
            process.exit(1);
        }
    }
    catch {
        /* scan module unavailable — skip */
    }
    // Project boundary check: reject memories that belong to a different project
    const fileContent = fs.readFileSync(absoluteFilePath, 'utf-8');
    const { data: frontmatter } = (0, gray_matter_1.default)(fileContent);
    if (frontmatter.project) {
        const currentProjectId = (0, store_1.resolveProjectId)(absoluteRepoRoot);
        if (frontmatter.project !== currentProjectId) {
            throw new Error(`Project boundary violation: memory belongs to "${frontmatter.project}", ` +
                `current project is "${currentProjectId}". Aborting publish.`);
        }
    }
    const config = (0, config_1.loadConfig)(repoRoot);
    const wsName = config.workspace?.remote
        ? path.basename(config.workspace.remote, '.git')
        : '_workspace';
    const home = process.env.HOME || process.env.USERPROFILE || '';
    const wsDir = wsDirOverride ?? path.join(home, '.memobank', '_workspace', wsName);
    if (!fs.existsSync(wsDir)) {
        throw new Error(`Workspace not initialized. Run: memo workspace init <remote-url>`);
    }
    const dst = path.join(wsDir, rel);
    // Security: Ensure destination is within wsDir
    const absoluteDst = path.resolve(dst);
    const absoluteWsDir = path.resolve(wsDir);
    const dstRel = path.relative(absoluteWsDir, absoluteDst);
    if (dstRel.startsWith('..') || path.isAbsolute(dstRel)) {
        throw new Error(`Security: Destination must be within workspace directory`);
    }
    if (fs.existsSync(dst)) {
        console.warn(`⚠️  File already exists in workspace: ${rel}`);
        console.warn('  Overwriting. The workspace repo PR review is the governance gate.');
    }
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(filePath, dst);
    console.log(`✓ Published: ${rel}`);
    console.log('  Run: memo workspace sync --push to share with team.');
}
function workspaceStatus(repoRoot) {
    const config = (0, config_1.loadConfig)(repoRoot);
    if (!config.workspace?.remote) {
        console.log('No workspace configured. Run: memo workspace init <remote-url>');
        return;
    }
    const wsName = path.basename(config.workspace.remote, '.git');
    const home = process.env.HOME || process.env.USERPROFILE || '';
    const wsDir = path.join(home, '.memobank', '_workspace', wsName);
    if (!fs.existsSync(path.join(wsDir, '.git'))) {
        console.log(`Workspace directory not found: ${wsDir}`);
        return;
    }
    try {
        const status = (0, child_process_1.execFileSync)('git', ['-C', wsDir, 'status', '--short'], { encoding: 'utf-8' });
        let log = '';
        try {
            log = (0, child_process_1.execFileSync)('git', ['-C', wsDir, 'log', '--oneline', '-5'], { encoding: 'utf-8' });
        }
        catch {
            log = '(no commits)';
        }
        console.log('Workspace repository status:');
        console.log(status || '  (clean)');
        console.log('\nRecent commits:');
        console.log(log);
    }
    catch (e) {
        console.error(`Could not get workspace status: ${e.message}`);
    }
}
//# sourceMappingURL=workspace.js.map