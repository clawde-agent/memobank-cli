"use strict";
/**
 * File I/O layer for memobank
 * Reads and writes .md files with YAML frontmatter
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
exports.findRepoRoot = findRepoRoot;
exports.loadAll = loadAll;
exports.loadFile = loadFile;
exports.writeMemory = writeMemory;
exports.writeMemoryMd = writeMemoryMd;
exports.readMemoryMd = readMemoryMd;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const gray_matter_1 = __importDefault(require("gray-matter"));
const glob_1 = require("glob");
const MEMORY_TYPES = ['lesson', 'decision', 'workflow', 'architecture'];
/**
 * Find memobank root directory
 * Resolution order:
 * 1. --repo CLI flag (passed as parameter)
 * 2. MEMOBANK_REPO env var
 * 3. meta/config.yaml in cwd or parent dirs (walk up)
 * 4. ~/.memobank/<git-repo-name>/
 * 5. ~/.memobank/default/
 */
function findRepoRoot(cwd, repoFlag) {
    // 1. CLI flag
    if (repoFlag) {
        return path.resolve(repoFlag);
    }
    // 2. Environment variable
    const envRepo = process.env.MEMOBANK_REPO;
    if (envRepo) {
        return path.resolve(envRepo);
    }
    // 3. Walk up looking for meta/config.yaml
    let current = cwd;
    while (current !== path.dirname(current)) {
        const configPath = path.join(current, 'meta', 'config.yaml');
        if (fs.existsSync(configPath)) {
            return current;
        }
        current = path.dirname(current);
    }
    // 4. Try to detect git repo name for ~/.memobank/<project>/
    try {
        // Check if we're in a git repo
        const gitRoot = path.join(cwd, '.git');
        if (fs.existsSync(gitRoot)) {
            // Try to get repo name from remote or use directory name
            const repoName = path.basename(cwd);
            const memobankPath = path.join(osHomeDir(), '.memobank', repoName);
            if (fs.existsSync(memobankPath)) {
                return memobankPath;
            }
        }
    }
    catch (e) {
        // Ignore git detection errors
    }
    // 5. Default: ~/.memobank/default/
    return path.join(osHomeDir(), '.memobank', 'default');
}
/**
 * Get home directory across platforms
 */
function osHomeDir() {
    return process.env.HOME || process.env.USERPROFILE || '';
}
/**
 * Load all memory files from a repo
 */
function loadAll(repoRoot) {
    const memories = [];
    for (const type of MEMORY_TYPES) {
        const pattern = path.join(repoRoot, type, '**', '*.md');
        const files = glob_1.glob.sync(pattern);
        for (const filePath of files) {
            try {
                const memory = loadFile(filePath);
                memories.push(memory);
            }
            catch (e) {
                // Skip files that can't be parsed
                console.warn(`Warning: Could not load ${filePath}: ${e.message}`);
            }
        }
    }
    return memories;
}
/**
 * Load a single memory file
 */
function loadFile(filePath) {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const parsed = (0, gray_matter_1.default)(fileContent);
    const data = parsed.data;
    // Validate required fields
    if (!data.name || !data.type || !data.description || !data.created) {
        throw new Error(`Missing required frontmatter fields in ${filePath}`);
    }
    if (!MEMORY_TYPES.includes(data.type)) {
        throw new Error(`Invalid memory type "${data.type}" in ${filePath}`);
    }
    const memory = {
        path: filePath,
        name: data.name,
        type: data.type,
        description: data.description,
        tags: Array.isArray(data.tags) ? data.tags : [],
        created: data.created,
        updated: data.updated,
        review_after: data.review_after,
        confidence: data.confidence,
        content: parsed.content,
    };
    return memory;
}
/**
 * Write a new memory file
 * Creates filename from name + created date
 */
function writeMemory(repoRoot, memory) {
    const typeDir = path.join(repoRoot, memory.type);
    // Ensure directory exists
    if (!fs.existsSync(typeDir)) {
        fs.mkdirSync(typeDir, { recursive: true });
    }
    // Generate filename: YYYY-MM-DD-name.md
    const date = new Date(memory.created);
    const dateStr = date.toISOString().split('T')[0];
    const slug = memory.name
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');
    const filename = `${dateStr}-${slug}.md`;
    const filePath = path.join(typeDir, filename);
    // Build frontmatter
    const frontmatter = {
        name: memory.name,
        type: memory.type,
        description: memory.description,
        tags: memory.tags,
        created: memory.created,
    };
    if (memory.updated)
        frontmatter.updated = memory.updated;
    if (memory.review_after)
        frontmatter.review_after = memory.review_after;
    if (memory.confidence)
        frontmatter.confidence = memory.confidence;
    // Write file
    const fileContent = gray_matter_1.default.stringify(memory.content, frontmatter);
    fs.writeFileSync(filePath, fileContent, 'utf-8');
    return filePath;
}
/**
 * Update MEMORY.md with recall results
 */
function writeMemoryMd(repoRoot, results, query, engine) {
    const memoryDir = path.join(repoRoot, 'memory');
    if (!fs.existsSync(memoryDir)) {
        fs.mkdirSync(memoryDir, { recursive: true });
    }
    const filePath = path.join(memoryDir, 'MEMORY.md');
    let markdown = `<!-- Last updated: ${new Date().toISOString()} | query: "${query}" | engine: ${engine} | top ${results.length} -->\n\n`;
    markdown += `## Recalled Memory\n\n`;
    if (results.length === 0) {
        markdown += `*No memories found for "${query}"*\n`;
    }
    else {
        for (const result of results) {
            const { memory, score } = result;
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
/**
 * Read MEMORY.md content
 */
function readMemoryMd(repoRoot) {
    const filePath = path.join(repoRoot, 'memory', 'MEMORY.md');
    if (!fs.existsSync(filePath)) {
        return null;
    }
    return fs.readFileSync(filePath, 'utf-8');
}
//# sourceMappingURL=store.js.map