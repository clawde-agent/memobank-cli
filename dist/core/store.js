"use strict";
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
exports.getGlobalDir = getGlobalDir;
exports.getProjectDir = getProjectDir;
exports.getWorkspaceDir = getWorkspaceDir;
exports.findRepoRoot = findRepoRoot;
exports.findGitRoot = findGitRoot;
exports.resolveProjectId = resolveProjectId;
exports.writePending = writePending;
exports.loadAll = loadAll;
exports.loadFile = loadFile;
exports.writeMemory = writeMemory;
exports.updateMemoryStatus = updateMemoryStatus;
exports.writeMemoryMd = writeMemoryMd;
exports.readMemoryMd = readMemoryMd;
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const gray_matter_1 = __importDefault(require("gray-matter"));
const glob_1 = require("glob");
const yaml = __importStar(require("js-yaml"));
const MEMORY_TYPES = ['lesson', 'decision', 'workflow', 'architecture'];
function osHomeDir() {
    return process.env.HOME || process.env.USERPROFILE || '';
}
/** Personal tier: ~/.memobank/<project-name>/ */
function getGlobalDir(projectName) {
    return path.join(osHomeDir(), '.memobank', projectName);
}
/** Project/team tier: the repo root itself (.memobank/ in repo) */
function getProjectDir(repoRoot) {
    return repoRoot;
}
/** Workspace tier (cross-repo): ~/.memobank/_workspace/<name>/ */
function getWorkspaceDir(workspaceName) {
    return path.join(osHomeDir(), '.memobank', '_workspace', workspaceName);
}
/** Directories that are never a memobank project dir */
const SKIP_DIRS = new Set([
    'node_modules',
    '.git',
    'dist',
    'build',
    'coverage',
    '.next',
    '.nuxt',
    '.turbo',
    'out',
    'tmp',
    '.cache',
]);
function findRepoRoot(cwd, repoFlag) {
    if (repoFlag) {
        return path.resolve(repoFlag);
    }
    const envRepo = process.env.MEMOBANK_REPO;
    if (envRepo) {
        return path.resolve(envRepo);
    }
    let current = cwd;
    while (current !== path.dirname(current)) {
        // Fast path: check default .memobank dir first
        const defaultConfigPath = path.join(current, '.memobank', 'meta', 'config.yaml');
        if (fs.existsSync(defaultConfigPath)) {
            return path.join(current, '.memobank');
        }
        // Scan immediate subdirs for a custom-named memobank dir
        try {
            const entries = fs.readdirSync(current, { withFileTypes: true });
            for (const entry of entries) {
                if (!entry.isDirectory() || SKIP_DIRS.has(entry.name) || entry.name === '.memobank') {
                    continue;
                }
                const customConfigPath = path.join(current, entry.name, 'meta', 'config.yaml');
                if (fs.existsSync(customConfigPath)) {
                    return path.join(current, entry.name);
                }
            }
        }
        catch {
            /* ignore permission errors */
        }
        // Legacy: meta/config.yaml at root
        if (fs.existsSync(path.join(current, 'meta', 'config.yaml'))) {
            return current;
        }
        current = path.dirname(current);
    }
    try {
        const gitRoot = path.join(cwd, '.git');
        if (fs.existsSync(gitRoot)) {
            const repoName = path.basename(cwd);
            return path.join(osHomeDir(), '.memobank', repoName);
        }
    }
    catch {
        /* ignore */
    }
    return path.join(osHomeDir(), '.memobank', 'default');
}
/** Find the git repo root (the dir containing .git), or return cwd. */
function findGitRoot(cwd) {
    let current = cwd;
    while (current !== path.dirname(current)) {
        if (fs.existsSync(path.join(current, '.git'))) {
            return current;
        }
        current = path.dirname(current);
    }
    return cwd;
}
/**
 * Resolve a stable project identifier for the current repo.
 * Priority: git remote origin → config.project.name → parent directory name.
 * memoBankDir is the .memobank/ directory (e.g. /repo/.memobank).
 */
function resolveProjectId(memoBankDir) {
    const gitCwd = path.dirname(memoBankDir);
    // 1. git remote origin
    try {
        const remote = (0, child_process_1.execSync)('git remote get-url origin', {
            cwd: gitCwd,
            stdio: 'pipe',
            encoding: 'utf-8',
        }).trim();
        const match = remote.match(/[:/]([^/:]+\/[^/.]+?)(?:\.git)?$/);
        if (match?.[1]) {
            return match[1];
        }
    }
    catch {
        /* no remote or not a git repo — fall through */
    }
    // 2. explicit project.name in config YAML (parsed directly — no defaults applied)
    try {
        const configPath = path.join(memoBankDir, 'meta', 'config.yaml');
        if (fs.existsSync(configPath)) {
            const raw = yaml.load(fs.readFileSync(configPath, 'utf-8'));
            const name = raw?.project?.name;
            if (name) {
                return name;
            }
        }
    }
    catch {
        /* config unreadable — fall through */
    }
    // 3. parent directory name
    return path.basename(gitCwd);
}
function writePending(memoBankDir, entry) {
    const pendingDir = path.join(memoBankDir, '.pending');
    if (!fs.existsSync(pendingDir)) {
        fs.mkdirSync(pendingDir, { recursive: true });
    }
    fs.writeFileSync(path.join(pendingDir, `${entry.id}.json`), JSON.stringify(entry, null, 2), 'utf-8');
}
function loadFromDir(baseDir, scope) {
    const memories = [];
    for (const type of MEMORY_TYPES) {
        const pattern = path.join(baseDir, type, '**', '*.md').split(path.sep).join('/');
        const files = glob_1.glob.sync(pattern);
        for (const filePath of files) {
            try {
                const memory = loadFile(filePath);
                memory.scope = scope;
                memories.push(memory);
            }
            catch (e) {
                console.warn(`Warning: Could not load ${filePath}: ${e.message}`);
            }
        }
    }
    return memories;
}
/**
 * Load memories from all configured tiers.
 * Priority: project > personal > workspace (for deduplication by filename).
 * globalDir and workspaceDir are optional; if absent, those tiers are skipped silently.
 */
function loadAll(repoRoot, scope = 'all', globalDir, workspaceDir) {
    const seenFilenames = new Set();
    const memories = [];
    const addFromDir = (dir, tierScope) => {
        if (!fs.existsSync(dir)) {
            return;
        }
        const tierMemories = loadFromDir(dir, tierScope);
        for (const m of tierMemories) {
            const filename = path.basename(m.path);
            if (!seenFilenames.has(filename)) {
                seenFilenames.add(filename);
                memories.push(m);
            }
        }
    };
    if (scope === 'all' || scope === 'project') {
        addFromDir(repoRoot, 'project');
    }
    if (scope === 'all' || scope === 'personal') {
        if (globalDir) {
            addFromDir(globalDir, 'personal');
        }
    }
    if (scope === 'all' || scope === 'workspace') {
        if (workspaceDir) {
            addFromDir(workspaceDir, 'workspace');
        }
    }
    // Legacy fallback: no tier dirs exist, load from root
    if (memories.length === 0 && scope === 'all') {
        return loadFromDir(repoRoot, 'project');
    }
    return memories;
}
function loadFile(filePath) {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const parsed = (0, gray_matter_1.default)(fileContent);
    const data = parsed.data;
    if (!data.name || !data.type || !data.description || !data.created) {
        throw new Error(`Missing required frontmatter fields in ${filePath}`);
    }
    const dataType = data.type;
    if (!MEMORY_TYPES.includes(data.type)) {
        throw new Error(`Invalid memory type "${dataType}" in ${filePath}`);
    }
    return {
        path: filePath,
        name: data.name,
        type: data.type,
        description: data.description,
        tags: Array.isArray(data.tags) ? data.tags : [],
        created: data.created,
        updated: data.updated,
        review_after: data.review_after,
        confidence: data.confidence || 'medium',
        status: data.status || 'experimental',
        content: parsed.content,
        project: data.project,
        codeRefs: Array.isArray(data.codeRefs) ? data.codeRefs : undefined,
    };
}
function writeMemory(repoRoot, memory) {
    const typeDir = path.join(repoRoot, memory.type);
    if (!fs.existsSync(typeDir)) {
        fs.mkdirSync(typeDir, { recursive: true });
    }
    const date = new Date(memory.created);
    const dateStr = date.toISOString().split('T')[0];
    const slug = memory.name
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');
    const filename = `${dateStr}-${slug}.md`;
    const filePath = path.join(typeDir, filename);
    const frontmatter = {
        name: memory.name,
        type: memory.type,
        description: memory.description,
        tags: memory.tags,
        created: memory.created,
        status: memory.status ?? 'experimental',
    };
    if (memory.updated) {
        frontmatter.updated = memory.updated;
    }
    if (memory.review_after) {
        frontmatter.review_after = memory.review_after;
    }
    if (memory.confidence) {
        frontmatter.confidence = memory.confidence;
    }
    if (memory.project) {
        frontmatter.project = memory.project;
    }
    if (memory.codeRefs) {
        frontmatter.codeRefs = memory.codeRefs;
    }
    const fileContent = gray_matter_1.default.stringify(memory.content, frontmatter);
    fs.writeFileSync(filePath, fileContent, 'utf-8');
    return filePath;
}
/** Patch status in a memory file's frontmatter in-place */
function updateMemoryStatus(filePath, status) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = (0, gray_matter_1.default)(content);
    parsed.data.status = status;
    fs.writeFileSync(filePath, gray_matter_1.default.stringify(parsed.content, parsed.data), 'utf-8');
}
function writeMemoryMd(repoRoot, results, query, engine) {
    if (!fs.existsSync(repoRoot)) {
        fs.mkdirSync(repoRoot, { recursive: true });
    }
    const filePath = path.join(repoRoot, 'MEMORY.md');
    let markdown = `<!-- Last updated: ${new Date().toISOString()} | query: "${query}" | engine: ${engine} | top ${results.length} -->\n\n`;
    markdown += `## Recalled Memory\n\n`;
    if (results.length === 0) {
        markdown += `*No memories found for "${query}"*\n`;
    }
    else {
        for (const result of results) {
            const { memory } = result;
            const relativePath = path.relative(repoRoot, memory.path);
            const confidenceStr = memory.confidence ? ` · ${memory.confidence} confidence` : '';
            const tagStr = memory.tags.length > 0 ? ` · tags: ${memory.tags.join(', ')}` : '';
            markdown += `### [${memory.type}] ${memory.name}${confidenceStr}\n`;
            markdown += `> ${memory.description}\n`;
            markdown += `> \`${relativePath}\`${tagStr}\n\n`;
        }
    }
    markdown += `---\n`;
    markdown += `*${results.length} memories · engine: ${engine}*`;
    fs.writeFileSync(filePath, markdown, 'utf-8');
}
function readMemoryMd(repoRoot) {
    const filePath = path.join(repoRoot, 'MEMORY.md');
    if (!fs.existsSync(filePath)) {
        return null;
    }
    return fs.readFileSync(filePath, 'utf-8');
}
//# sourceMappingURL=store.js.map