"use strict";
/**
 * Scan command
 * memo scan [path]           — scan memory files for secrets
 * memo scan --staged         — scan git-staged .md files (used by pre-commit hook)
 * memo scan --fail-on-secrets — exit 1 if secrets found
 * memo scan --fix            — redact secrets in-place and re-stage
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
exports.scanFile = scanFile;
exports.scanDirectory = scanDirectory;
exports.scanCommand = scanCommand;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const glob_1 = require("glob");
const sanitizer_1 = require("../core/sanitizer");
const store_1 = require("../core/store");
/**
 * Scan a single file for secrets
 */
function scanFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    return (0, sanitizer_1.scanForSecrets)(content);
}
/**
 * Scan all .md files in a directory recursively
 */
function scanDirectory(dir) {
    const results = [];
    const files = glob_1.glob.sync(path.join(dir, '**', '*.md').split(path.sep).join('/'));
    for (const file of files) {
        const findings = scanFile(file);
        if (findings.length > 0) {
            results.push({ file, findings });
        }
    }
    return results;
}
/**
 * Get git-staged .md files in the repository at cwd
 */
function getStagedMdFiles(cwd) {
    try {
        const output = (0, child_process_1.execSync)('git diff --staged --name-only --diff-filter=ACM', {
            cwd,
            encoding: 'utf-8',
            stdio: 'pipe',
        });
        return output
            .trim()
            .split('\n')
            .filter(Boolean)
            .filter((f) => f.endsWith('.md'))
            .map((f) => path.join(cwd, f));
    }
    catch {
        return [];
    }
}
function scanCommand(scanPath, options) {
    let results = [];
    if (options.staged) {
        // Staged mode: scan staged files in cwd (used by pre-commit hook)
        const cwd = process.cwd();
        const stagedFiles = getStagedMdFiles(cwd);
        for (const file of stagedFiles) {
            const findings = scanFile(file);
            if (findings.length > 0) {
                results.push({ file, findings });
            }
        }
    }
    else {
        // Directory scan
        const repoRoot = (0, store_1.findRepoRoot)(process.cwd(), options.repo);
        const targetDir = scanPath ? path.resolve(scanPath) : repoRoot;
        if (!fs.existsSync(targetDir)) {
            console.log(`No directory to scan: ${targetDir}`);
            return;
        }
        results = scanDirectory(targetDir);
    }
    if (results.length === 0) {
        console.log('✓ No secrets found.');
        return;
    }
    console.error('⚠️  Potential secrets found:');
    for (const { file, findings } of results) {
        console.error(`  ${file}`);
        for (const f of findings) {
            console.error(`    > ${f}`);
        }
    }
    if (options.fix) {
        console.log('\nApplying auto-redaction...');
        for (const { file } of results) {
            const original = fs.readFileSync(file, 'utf-8');
            const cleaned = (0, sanitizer_1.sanitize)(original);
            fs.writeFileSync(file, cleaned, 'utf-8');
            // Re-stage the file if in a git repo
            try {
                const dir = path.dirname(file);
                (0, child_process_1.execFileSync)('git', ['add', file], { cwd: dir, stdio: 'pipe' });
            }
            catch {
                /* not in a git repo, skip */
            }
            console.log(`  ✓ Redacted and re-staged: ${file}`);
        }
        return;
    }
    console.error('\n→ Run: memo scan --fix to auto-redact and re-stage');
    if (options.failOnSecrets) {
        process.exit(1);
    }
}
//# sourceMappingURL=scan.js.map