"use strict";
/**
 * Codex platform install helper
 * Injects memory protocol into AGENTS.md
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
exports.installCodex = installCodex;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const MEMORY_PROTOCOL_SECTION = `
## Memory Protocol

This project uses memobank for persistent memory. Before starting work, recall relevant context:

\`\`\`bash
memo recall "project context"
\`\`\`

After finishing significant work, capture learnings:

\`\`\`bash
memo capture --auto
\`\`\`

For more information, run: \`memo --help\`
`;
/**
 * Find AGENTS.md in current directory or parents
 */
function findAgentsMd(startDir) {
    let current = startDir;
    while (current !== path.dirname(current)) {
        const agentsPath = path.join(current, 'AGENTS.md');
        if (fs.existsSync(agentsPath)) {
            return agentsPath;
        }
        current = path.dirname(current);
    }
    return null;
}
/**
 * Install memobank for Codex
 */
function installCodex(cwd) {
    const agentsPath = findAgentsMd(cwd);
    if (!agentsPath) {
        console.log('⊘ Codex: AGENTS.md not found (skipping)');
        return Promise.resolve(false);
    }
    // Read AGENTS.md
    const content = fs.readFileSync(agentsPath, 'utf-8');
    // Check if memobank is already present
    if (content.includes('## Memory Protocol') && content.includes('memo recall')) {
        console.log('⊘ Codex: Memory protocol already exists in AGENTS.md');
        return Promise.resolve(true);
    }
    // Append memory protocol
    const updated = content + MEMORY_PROTOCOL_SECTION;
    try {
        fs.writeFileSync(agentsPath, updated, 'utf-8');
        console.log(`✓ Codex: Memory protocol added to AGENTS.md`);
        return Promise.resolve(true);
    }
    catch (error) {
        console.error(`Could not write AGENTS.md: ${error.message}`);
        return Promise.resolve(false);
    }
}
//# sourceMappingURL=codex.js.map