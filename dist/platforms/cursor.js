"use strict";
/**
 * Cursor platform install helper
 * Writes memobank.mdc to .cursor/rules/
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
exports.installCursor = installCursor;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const MEMOBANK_RULE = `---
description: memobank memory protocol
globs: ["**/*"]
alwaysApply: false
---

# Memory Protocol

This project uses memobank for persistent memory.

## Before Starting Work

Recall relevant project context:

\`\`\`bash
memo recall "project context"
\`\`\`

## After Finishing Work

Capture learnings and insights:

\`\`\`bash
memo capture --auto
\`\`\`

## Useful Commands

- \`memo recall <query>\` - Search and display relevant memories
- \`memo search <query>\` - Debug search without updating MEMORY.md
- \`memo write <type>\` - Manually create a new memory
- \`memo capture\` - Extract memories from session text
- \`memo map\` - Show memory summary
- \`memo review\` - List memories due for review

For more information, run: \`memo --help\`
`;
/**
 * Install memobank for Cursor
 */
function installCursor(cwd) {
    const cursorDir = path.join(cwd, '.cursor', 'rules');
    // Ensure .cursor/rules directory exists
    if (!fs.existsSync(cursorDir)) {
        try {
            fs.mkdirSync(cursorDir, { recursive: true });
        }
        catch (error) {
            console.error(`Could not create .cursor/rules: ${error.message}`);
            return Promise.resolve(false);
        }
    }
    const rulePath = path.join(cursorDir, 'memobank.mdc');
    // Check if already exists
    if (fs.existsSync(rulePath)) {
        console.log('⊘ Cursor: memobank.mdc already exists');
        return Promise.resolve(true);
    }
    // Write rule file
    try {
        fs.writeFileSync(rulePath, MEMOBANK_RULE, 'utf-8');
        console.log(`✓ Cursor: memobank.mdc created`);
        return Promise.resolve(true);
    }
    catch (error) {
        console.error(`Could not write memobank.mdc: ${error.message}`);
        return Promise.resolve(false);
    }
}
//# sourceMappingURL=cursor.js.map