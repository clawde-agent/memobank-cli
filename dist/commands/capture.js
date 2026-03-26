"use strict";
/**
 * Capture command
 * Extracts learnings from session text and writes to memory files
 * Uses noise filtering and value scoring to determine what's worth remembering
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
exports.capture = capture;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const smart_extractor_1 = require("../core/smart-extractor");
const sanitizer_1 = require("../core/sanitizer");
const store_1 = require("../core/store");
const queue_processor_1 = require("../core/queue-processor");
const config_1 = require("../config");
const noise_filter_1 = require("../core/noise-filter");
async function capture(options = {}) {
    const cwd = process.cwd();
    const repoRoot = (0, store_1.findRepoRoot)(cwd, options.repo);
    const config = (0, config_1.loadConfig)(repoRoot);
    // Silent mode for hooks
    const isSilent = options.silent || process.env.SILENT === '1';
    const log = (...args) => {
        if (!isSilent) {
            console.log(...args);
        }
    };
    const error = (...args) => {
        if (!isSilent) {
            console.error(...args);
        }
    };
    // 1. Get session text
    let sessionText = '';
    if (options.auto) {
        // Read Claude Code auto-memory topic files from the project tier root
        // (autoMemoryDirectory = repoRoot = .memobank/).
        // Topic files are flat .md files written directly by Claude Code — exclude
        // MEMORY.md (the index) and subdirectories (lesson/, decision/, etc.).
        const autoMemoryDir = repoRoot;
        if (fs.existsSync(autoMemoryDir)) {
            const STRUCTURED_DIRS = new Set(['lesson', 'decision', 'workflow', 'architecture', 'meta']);
            const files = fs
                .readdirSync(autoMemoryDir)
                .filter((f) => {
                if (!f.endsWith('.md') || f === 'MEMORY.md') {
                    return false;
                }
                const fullPath = path.join(autoMemoryDir, f);
                // Skip subdirectories (memobank structured tiers)
                if (fs.statSync(fullPath).isDirectory()) {
                    return false;
                }
                if (STRUCTURED_DIRS.has(f.replace(/\.md$/, ''))) {
                    return false;
                }
                return true;
            })
                .map((f) => path.join(autoMemoryDir, f))
                .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
            if (files.length > 0 && files[0]) {
                sessionText = fs.readFileSync(files[0], 'utf-8');
                log(`Read from: ${files[0]}`);
            }
            else {
                log('No recent Claude Code auto-memory files found');
                return;
            }
        }
        else {
            log('Project memory directory not found');
            return;
        }
    }
    else if (options.session) {
        // Read from provided session text or file
        if (options.session === '-') {
            // Read from stdin
            try {
                sessionText = await readStdin();
            }
            catch (err) {
                error(`Failed to read from stdin: ${err.message}`);
                return;
            }
        }
        else if (fs.existsSync(options.session)) {
            sessionText = fs.readFileSync(options.session, 'utf-8');
        }
        else {
            sessionText = options.session;
        }
    }
    else {
        error('No session text provided. Use --session=<text> or --auto');
        return;
    }
    if (!sessionText.trim()) {
        console.log('Session text is empty');
        return;
    }
    // 2. Sanitize
    const sanitized = (0, sanitizer_1.sanitize)(sessionText);
    // 3. Extract memories via LLM
    const extracted = await (0, smart_extractor_1.extract)(sanitized, process.env.ANTHROPIC_API_KEY);
    if (extracted.length === 0) {
        console.log('No memories extracted from session');
        return;
    }
    console.log(`\n📊 Extracted ${extracted.length} potential memories, evaluating value...\n`);
    // 4. Evaluate and filter by value
    const memoriesWithValue = extracted.map((item) => ({
        ...item,
        valueScore: (0, noise_filter_1.calculateValueScore)(item.content),
        recommendation: (0, noise_filter_1.getCaptureRecommendation)((0, noise_filter_1.calculateValueScore)(item.content)),
    }));
    // Display evaluation
    memoriesWithValue.forEach((item, i) => {
        const { valueScore, recommendation } = item;
        const icon = valueScore >= 0.7 ? '✅' : valueScore >= 0.5 ? '⚠️' : '❌';
        console.log(`${icon} [${i + 1}] ${item.name}`);
        console.log(`   Score: ${valueScore.toFixed(2)} | ${recommendation.reason}`);
        console.log(`   Confidence: ${recommendation.confidence}\n`);
    });
    // Filter out low-value memories
    const highValueMemories = memoriesWithValue.filter((item) => item.valueScore >= 0.5 || item.recommendation.shouldCapture);
    if (highValueMemories.length === 0) {
        console.log('⊘ All memories filtered out due to low value.');
        return;
    }
    console.log(`✓ ${highValueMemories.length} memories passed value filter\n`);
    // 5. Write to pending queue, then process immediately
    // (Phase 2/3: replace processQueue call here with an async trigger)
    const entry = {
        id: `LRN-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: new Date().toISOString(),
        projectId: (0, store_1.resolveProjectId)(repoRoot),
        candidates: highValueMemories.map((item) => ({
            name: item.name,
            type: item.type,
            description: item.description,
            tags: item.tags,
            confidence: item.confidence,
            content: item.content,
        })),
    };
    (0, store_1.writePending)(repoRoot, entry);
    await (0, queue_processor_1.processQueue)(repoRoot);
    // 6. Print summary
    console.log(`\n📝 Captured up to ${highValueMemories.length} high-value memories`);
    console.log(`   (duplicates skipped silently)\n`);
    // Note: index update is no-op for text engine
    if (config.embedding.engine === 'lancedb') {
        console.log('Run: memo index --incremental to update LanceDB');
    }
}
/**
 * Read from stdin with timeout
 */
function readStdin(timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
        let data = '';
        const timeoutId = setTimeout(() => {
            reject(new Error('Stdin read timeout after 30 seconds'));
        }, timeoutMs);
        process.stdin.on('data', (chunk) => {
            data += typeof chunk === 'string' ? chunk : chunk.toString();
        });
        process.stdin.on('end', () => {
            clearTimeout(timeoutId);
            resolve(data);
        });
        process.stdin.on('error', (err) => {
            clearTimeout(timeoutId);
            reject(err);
        });
    });
}
//# sourceMappingURL=capture.js.map