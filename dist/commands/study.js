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
exports.studyCommand = studyCommand;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const readline = __importStar(require("readline"));
const gray_matter_1 = __importDefault(require("gray-matter"));
const store_1 = require("../core/store");
function findLessons(repoRoot) {
    const dirs = ['lesson', 'decision', 'workflow', 'architecture'];
    const results = [];
    for (const dir of dirs) {
        const dirPath = path.join(repoRoot, dir);
        if (!fs.existsSync(dirPath))
            continue;
        for (const file of fs.readdirSync(dirPath)) {
            if (file.endsWith('.md'))
                results.push(path.join(dirPath, file));
        }
    }
    return results;
}
function findLesson(repoRoot, name) {
    const files = findLessons(repoRoot);
    const exact = files.find((f) => path.basename(f, '.md') === name);
    if (exact)
        return exact;
    return files.find((f) => path.basename(f, '.md').includes(name)) ?? null;
}
function findClaudeMd(repoRoot) {
    // repoRoot is the .memobank/ dir — CLAUDE.md lives in the git root (one level up)
    const gitRoot = path.dirname(repoRoot);
    return path.join(gitRoot, 'CLAUDE.md');
}
function extractSummary(content) {
    const lines = content.split('\n').filter((l) => l.trim() !== '');
    return lines.slice(0, 4).join('\n');
}
function buildBlock(condition, lessonPath, repoRoot, summary) {
    const relPath = path.relative(path.dirname(repoRoot), lessonPath);
    return `\n<important if="${condition}">\n<!-- source: ${relPath} -->\n${summary.trim()}\n</important>\n`;
}
async function promptCondition(lessonName) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => {
        rl.question(`Condition for "${lessonName}" (e.g. "you are installing dependencies"): `, (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
}
async function studyCommand(lessonName, options) {
    const repoRoot = (0, store_1.findRepoRoot)(process.cwd(), options.repo);
    if (options.list || !lessonName) {
        const files = findLessons(repoRoot);
        if (files.length === 0) {
            console.log('No lessons found in .memobank/');
            return;
        }
        console.log('Available lessons:');
        for (const f of files) {
            const rel = path.relative(repoRoot, f);
            const parsed = (0, gray_matter_1.default)(fs.readFileSync(f, 'utf-8'));
            console.log(`  ${path.basename(f, '.md')}  —  ${parsed.data.description ?? rel}`);
        }
        return;
    }
    const lessonPath = findLesson(repoRoot, lessonName);
    if (!lessonPath) {
        throw new Error(`Lesson not found: "${lessonName}". Run memo study --list to see available lessons.`);
    }
    const parsed = (0, gray_matter_1.default)(fs.readFileSync(lessonPath, 'utf-8'));
    const summary = extractSummary(parsed.content);
    const claudeMdPath = findClaudeMd(repoRoot);
    const existing = fs.existsSync(claudeMdPath) ? fs.readFileSync(claudeMdPath, 'utf-8') : '';
    const relPath = path.relative(path.dirname(repoRoot), lessonPath);
    if (existing.includes(`<!-- source: ${relPath} -->`)) {
        console.warn(`⚠  Already studied: "${lessonName}" is already in CLAUDE.md`);
        return;
    }
    const condition = options.if ?? (await promptCondition(lessonName));
    if (!condition) {
        throw new Error('Condition is required. Use --if="..." or enter it interactively.');
    }
    const block = buildBlock(condition, lessonPath, repoRoot, summary);
    fs.appendFileSync(claudeMdPath, block, 'utf-8');
    console.log(`✓ Lesson "${lessonName}" studied → CLAUDE.md updated`);
}
//# sourceMappingURL=study.js.map