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
exports.installPostCommitHook = installPostCommitHook;
exports.uninstallPostCommitHook = uninstallPostCommitHook;
exports.isHookInstalled = isHookInstalled;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const MEMOBANK_BLOCK_START = '# memobank:post-commit:start';
const MEMOBANK_BLOCK_END = '# memobank:end';
const HOOK_BLOCK = `${MEMOBANK_BLOCK_START}
# Auto-installed by memobank. Remove this block or run: memo hooks uninstall
changed=$(git diff-tree --no-commit-id -r --name-only HEAD 2>/dev/null | grep -E '\\.(ts|tsx|js|jsx|py|go|rs|java|c|cpp|cs|rb|swift|kt)$' || true)
if [ -n "$changed" ]; then
  echo "$changed" | while IFS= read -r f; do
    memo index-code --incremental "$f" >/dev/null 2>&1
  done &
fi
${MEMOBANK_BLOCK_END}`;
function getHookPath(gitRoot) {
    // Detect husky
    const huskyDir = path.join(gitRoot, '.husky');
    if (fs.existsSync(huskyDir)) {
        return path.join(huskyDir, 'post-commit');
    }
    return path.join(gitRoot, '.git', 'hooks', 'post-commit');
}
function installPostCommitHook(gitRoot) {
    const hookPath = getHookPath(gitRoot);
    if (isHookInstalled(gitRoot)) {
        return; // idempotent
    }
    const shebang = '#!/bin/sh\n';
    let existing = '';
    if (fs.existsSync(hookPath)) {
        existing = fs.readFileSync(hookPath, 'utf-8');
    }
    const content = existing
        ? existing.trimEnd() + '\n\n' + HOOK_BLOCK + '\n'
        : shebang + HOOK_BLOCK + '\n';
    fs.writeFileSync(hookPath, content, { mode: 0o755 });
}
function uninstallPostCommitHook(gitRoot) {
    const hookPath = getHookPath(gitRoot);
    if (!fs.existsSync(hookPath))
        return;
    const content = fs.readFileSync(hookPath, 'utf-8');
    const startIdx = content.indexOf(MEMOBANK_BLOCK_START);
    const endIdx = content.indexOf(MEMOBANK_BLOCK_END);
    if (startIdx === -1 || endIdx === -1)
        return;
    const before = content.slice(0, startIdx).trimEnd();
    const after = content.slice(endIdx + MEMOBANK_BLOCK_END.length).trimStart();
    const newContent = [before, after].filter(Boolean).join('\n') + '\n';
    if (newContent.trim() === '' || newContent.trim() === '#!/bin/sh') {
        fs.unlinkSync(hookPath);
    }
    else {
        fs.writeFileSync(hookPath, newContent);
    }
}
function isHookInstalled(gitRoot) {
    const hookPath = getHookPath(gitRoot);
    if (!fs.existsSync(hookPath))
        return false;
    const content = fs.readFileSync(hookPath, 'utf-8');
    return content.includes(MEMOBANK_BLOCK_START);
}
//# sourceMappingURL=hook-installer.js.map