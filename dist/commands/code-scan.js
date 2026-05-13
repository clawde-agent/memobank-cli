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
Object.defineProperty(exports, "__esModule", { value: true });
exports.codeScanCommand = codeScanCommand;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const store_1 = require("../core/store");
const code_scanner_1 = require("../core/code-scanner");
const code_index_1 = require("../engines/code-index");
const SKIP_DIRS = [
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
];
function collectFiles(scanRoot, langs) {
    const allowedExts = langs
        ? new Set([...code_scanner_1.SUPPORTED_EXTENSIONS.entries()]
            .filter(([, lang]) => langs.has(lang))
            .map(([ext]) => ext))
        : null;
    const results = [];
    function walk(dir) {
        const base = path.basename(dir);
        if (SKIP_DIRS.includes(base)) {
            return;
        }
        let entries;
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        }
        catch {
            return;
        }
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(fullPath);
            }
            else if (entry.isFile()) {
                const ext = path.extname(entry.name).toLowerCase();
                if (allowedExts ? allowedExts.has(ext) : code_scanner_1.SUPPORTED_EXTENSIONS.has(ext)) {
                    results.push(fullPath);
                }
            }
        }
    }
    walk(scanRoot);
    return results;
}
async function codeScanCommand(scanPath, options) {
    if (!code_index_1.CodeIndex.isAvailable()) {
        console.error('⚠  memo index requires optional dependencies. Run:\n  npm install memobank-cli --include=optional');
        process.exit(1);
    }
    const cwd = process.cwd();
    const repoRoot = (0, store_1.findRepoRoot)(cwd, options.repo);
    const scanRoot = scanPath ? path.resolve(scanPath) : cwd;
    if (!fs.existsSync(scanRoot)) {
        console.error(`Error: scan path does not exist: ${scanRoot}`);
        process.exit(1);
    }
    const langs = options.langs && options.langs.length > 0 ? new Set(options.langs) : null;
    const files = collectFiles(scanRoot, langs);
    console.log(`Scanning ${files.length} files in ${scanRoot}`);
    const dbPath = code_index_1.CodeIndex.getDbPath(repoRoot);
    const metaDir = path.dirname(dbPath);
    if (!fs.existsSync(metaDir)) {
        fs.mkdirSync(metaDir, { recursive: true });
    }
    const idx = new code_index_1.CodeIndex(dbPath);
    const langCounts = new Map();
    let indexed = 0;
    let skipped = 0;
    for (const filePath of files) {
        const lang = (0, code_scanner_1.detectLanguage)(filePath);
        if (!lang) {
            continue;
        }
        const { hash, symbols, edges } = (0, code_scanner_1.scanFile)(filePath, scanRoot);
        const relPath = path.relative(scanRoot, filePath);
        if (!options.force && !idx.needsReindex(relPath, hash)) {
            skipped++;
            continue;
        }
        idx.upsertFile(relPath, lang, hash, fs.statSync(filePath).mtimeMs);
        idx.upsertSymbols(relPath, symbols, edges);
        langCounts.set(lang, (langCounts.get(lang) ?? 0) + 1);
        indexed++;
    }
    const stats = idx.getStats();
    idx.close();
    console.log(`Indexed: ${indexed} files  Skipped (unchanged): ${skipped}`);
    console.log(`Symbols: ${stats.symbols}  Edges: ${stats.edges}`);
    if (options.summarize) {
        const langSummary = [...langCounts.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([lang, count]) => `- ${lang}: ${count} files`)
            .join('\n');
        const content = `## Code Structure Snapshot

### Languages Indexed
${langSummary || '(none)'}

### Statistics
- Total files: ${stats.files}
- Total symbols: ${stats.symbols}
- Total edges (call/import graph): ${stats.edges}

Generated by \`memo index\` on ${new Date().toISOString().split('T')[0]}.
`;
        const filePath = (0, store_1.writeMemory)(repoRoot, {
            name: 'project-architecture-snapshot',
            type: 'architecture',
            description: 'Auto-generated code structure snapshot from memo index',
            tags: ['architecture', 'codebase', 'auto-generated'],
            confidence: 'high',
            status: 'active',
            created: new Date().toISOString().split('T')[0],
            content,
        });
        console.log(`Architecture memory written: ${filePath}`);
    }
}
//# sourceMappingURL=code-scan.js.map