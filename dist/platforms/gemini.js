"use strict";
/**
 * Gemini CLI platform adapter
 * Injects auto-capture instruction into ~/.gemini/GEMINI.md
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
exports.detectGemini = detectGemini;
exports.installGemini = installGemini;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const GEMINI_PROTOCOL = `
## Memobank Memory Protocol

This project uses memobank for persistent memory.

### Before Starting Work

Recall relevant project context:

\`\`\`bash
memo recall "project context"
\`\`\`

### After Finishing Work

Capture learnings and insights:

\`\`\`bash
memo capture --auto --silent
\`\`\`

### Useful Commands

- \`memo recall <query>\` - Search and display relevant memories
- \`memo search <query>\` - Debug search without updating MEMORY.md
- \`memo write <type>\` - Manually create a new memory
- \`memo map\` - Show memory summary
`;
function getGeminiMdPath() {
    const home = process.env.HOME || process.env.USERPROFILE || '';
    return path.join(home, '.gemini', 'GEMINI.md');
}
function detectGemini() {
    const home = process.env.HOME || process.env.USERPROFILE || '';
    return fs.existsSync(path.join(home, '.gemini')) || isInPath('gemini');
}
function isInPath(cmd) {
    try {
        (0, child_process_1.execSync)(`which ${cmd}`, { stdio: 'pipe' });
        return true;
    }
    catch {
        return false;
    }
}
function installGemini() {
    const mdPath = getGeminiMdPath();
    const dir = path.dirname(mdPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    let content = '';
    if (fs.existsSync(mdPath)) {
        content = fs.readFileSync(mdPath, 'utf-8');
        if (content.includes('memo recall "project context"')) {
            console.log('✓ Gemini: memobank protocol already installed');
            return Promise.resolve(true);
        }
    }
    fs.writeFileSync(mdPath, content + GEMINI_PROTOCOL, 'utf-8');
    console.log(`✓ Gemini: memobank protocol added to ${mdPath}`);
    return Promise.resolve(true);
}
//# sourceMappingURL=gemini.js.map