"use strict";
/**
 * Import Command
 * Import memories from other AI tools (Claude Code, Gemini CLI, Qwen Code)
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
exports.detectAvailableTools = detectAvailableTools;
exports.importMemories = importMemories;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const store_1 = require("../core/store");
const store_2 = require("../core/store");
const memory_template_1 = require("../core/memory-template");
/**
 * Get Claude Code memory directory
 */
function getClaudeMemoryDir() {
    return path.join(os.homedir(), '.claude', 'projects');
}
/**
 * Get Gemini CLI memory file
 */
function getGeminiMemoryFiles() {
    const home = os.homedir();
    return {
        global: path.join(home, '.gemini', 'GEMINI.md'),
        project: path.join(process.cwd(), 'GEMINI.md'),
    };
}
/**
 * Get Qwen Code memory file
 */
function getQwenMemoryFile() {
    return path.join(os.homedir(), '.qwen', 'QWEN.md');
}
/**
 * Detect available tools with memories
 */
function detectAvailableTools() {
    const tools = [];
    // Claude Code - check projects directory
    const claudeDir = getClaudeMemoryDir();
    if (fs.existsSync(claudeDir)) {
        const projects = fs
            .readdirSync(claudeDir, { withFileTypes: true })
            .filter((d) => d.isDirectory())
            .map((d) => ({
            name: d.name,
            path: path.join(claudeDir, d.name, 'memory', 'MEMORY.md'),
        }));
        for (const project of projects) {
            if (fs.existsSync(project.path)) {
                const content = fs.readFileSync(project.path, 'utf-8');
                tools.push({
                    name: `Claude Code: ${project.name}`,
                    path: project.path,
                    content,
                    exists: true,
                });
            }
        }
    }
    // Gemini CLI - global memory
    const geminiFiles = getGeminiMemoryFiles();
    if (fs.existsSync(geminiFiles.global)) {
        const content = fs.readFileSync(geminiFiles.global, 'utf-8');
        tools.push({
            name: 'Gemini CLI: Global',
            path: geminiFiles.global,
            content,
            exists: true,
        });
    }
    // Gemini CLI - project memory
    if (geminiFiles.project && fs.existsSync(geminiFiles.project)) {
        const content = fs.readFileSync(geminiFiles.project, 'utf-8');
        tools.push({
            name: 'Gemini CLI: Project',
            path: geminiFiles.project,
            content,
            exists: true,
        });
    }
    // Qwen Code
    const qwenFile = getQwenMemoryFile();
    if (fs.existsSync(qwenFile)) {
        const content = fs.readFileSync(qwenFile, 'utf-8');
        tools.push({
            name: 'Qwen Code: Global',
            path: qwenFile,
            content,
            exists: true,
        });
    }
    return tools;
}
/**
 * Parse Claude Code MEMORY.md content
 */
function parseClaudeMemory(content, projectName) {
    const memories = [];
    // Split by markdown headers
    const sections = content.split(/^##+\s+/m).filter((s) => s.trim());
    for (const section of sections) {
        const lines = section.split('\n').filter((l) => l.trim());
        if (lines.length === 0) {
            continue;
        }
        const title = lines[0]?.trim() ?? '';
        const body = lines.slice(1).join('\n').trim();
        if (!title || body.length < 20) {
            continue;
        } // Skip very short sections
        // Infer type from section title
        let type = 'lesson';
        if (title.toLowerCase().includes('decision') || title.toLowerCase().includes('choice')) {
            type = 'decision';
        }
        else if (title.toLowerCase().includes('workflow') ||
            title.toLowerCase().includes('process')) {
            type = 'workflow';
        }
        else if (title.toLowerCase().includes('architecture') ||
            title.toLowerCase().includes('structure')) {
            type = 'architecture';
        }
        // Extract tags from content
        const tags = [];
        const tagMatch = body.match(/tags?:\s*([^\n]+)/i);
        if (tagMatch?.[1]) {
            tags.push(...tagMatch[1]
                .split(',')
                .map((t) => t.trim())
                .filter((t) => t));
        }
        memories.push({
            type,
            description: title,
            content: `## ${title}\n\n${body}`,
            tags: [...tags, 'claude-imported', projectName],
        });
    }
    return memories;
}
/**
 * Parse Gemini/Qwen memory content
 */
function parseGenericMemory(content, source) {
    const memories = [];
    // Split by markdown headers
    const sections = content.split(/^##+\s+/m).filter((s) => s.trim());
    for (const section of sections) {
        const lines = section.split('\n').filter((l) => l.trim());
        if (lines.length === 0) {
            continue;
        }
        const title = lines[0]?.trim() ?? '';
        const body = lines.slice(1).join('\n').trim();
        // Skip Qwen Added Memories header
        if (title.includes('Qwen Added Memories')) {
            continue;
        }
        if (!title || body.length < 10) {
            continue;
        }
        // Infer type
        let type = 'lesson';
        const lowerTitle = title.toLowerCase();
        const lowerBody = body.toLowerCase();
        if (lowerTitle.includes('decision') ||
            lowerBody.includes('we decided') ||
            lowerBody.includes('chose to')) {
            type = 'decision';
        }
        else if (lowerTitle.includes('workflow') ||
            lowerTitle.includes('process') ||
            lowerBody.includes('steps to')) {
            type = 'workflow';
        }
        else if (lowerTitle.includes('architecture') || lowerTitle.includes('structure')) {
            type = 'architecture';
        }
        memories.push({
            type,
            description: title,
            content: `## ${title}\n\n${body}`,
            tags: [source.toLowerCase().replace(' ', '-'), 'imported'],
        });
    }
    // If no sections found, treat entire content as one memory
    if (memories.length === 0 && content.trim().length > 50) {
        memories.push({
            type: 'lesson',
            description: 'Imported preferences and instructions',
            content: content.trim(),
            tags: [source.toLowerCase().replace(' ', '-'), 'imported'],
        });
    }
    return memories;
}
/**
 * Import memories from specified tools
 */
function importMemories(options = {}) {
    const cwd = process.cwd();
    const repoRoot = (0, store_1.findRepoRoot)(cwd, options.repo);
    // Detect available tools
    const availableTools = detectAvailableTools();
    if (availableTools.length === 0) {
        console.log('No existing AI tool memories found to import.');
        console.log('\nSupported tools:');
        console.log('  - Claude Code (~/.claude/projects/<project>/memory/)');
        console.log('  - Gemini CLI (~/.gemini/GEMINI.md, ./GEMINI.md)');
        console.log('  - Qwen Code (~/.qwen/QWEN.md)');
        return;
    }
    // Determine which tools to import
    let toolsToImport = availableTools;
    if (options.claude) {
        toolsToImport = availableTools.filter((t) => t.name.toLowerCase().includes('claude'));
    }
    else if (options.gemini) {
        toolsToImport = availableTools.filter((t) => t.name.toLowerCase().includes('gemini'));
    }
    else if (options.qwen) {
        toolsToImport = availableTools.filter((t) => t.name.toLowerCase().includes('qwen'));
    }
    if (toolsToImport.length === 0) {
        console.log('No memories found for the specified tool(s).');
        return;
    }
    console.log(`Found ${toolsToImport.length} memory source(s):\n`);
    toolsToImport.forEach((t, i) => {
        console.log(`  ${i + 1}. ${t.name}`);
        console.log(`     ${t.path}`);
    });
    console.log();
    let totalImported = 0;
    for (const tool of toolsToImport) {
        console.log(`\n📥 Importing from ${tool.name}...`);
        // Parse memories based on source
        let parsedMemories;
        if (tool.name.toLowerCase().includes('claude')) {
            // Extract project name from path
            const projectMatch = tool.path.match(/\/projects\/([^/]+)\/memory/);
            const projectName = projectMatch?.[1] ?? 'unknown';
            parsedMemories = parseClaudeMemory(tool.content ?? '', projectName);
        }
        else {
            const sourceName = tool.name.split(':')[0] ?? 'unknown';
            parsedMemories = parseGenericMemory(tool.content ?? '', sourceName);
        }
        if (parsedMemories.length === 0) {
            console.log('  No parseable memories found.');
            continue;
        }
        console.log(`  Found ${parsedMemories.length} memories to import.`);
        // Write memories
        for (const memory of parsedMemories) {
            // Sanitize content
            const { sanitized, redacted } = (0, memory_template_1.sanitizeContent)(memory.content);
            if (redacted.length > 0 && !options.dryRun) {
                console.log(`  ⚠️  Redacting ${redacted.length} sensitive item(s) from: ${memory.description}`);
                memory.content = sanitized;
            }
            // Validate
            const validation = (0, memory_template_1.validateMemoryContent)(memory.content);
            if (validation.errors.length > 0) {
                if (!options.dryRun) {
                    console.log(`  ✗ Skipping (validation failed): ${memory.description}`);
                }
                continue;
            }
            // Check abstraction level
            const abstractionLevel = (0, memory_template_1.checkAbstractionLevel)(memory.content);
            if (abstractionLevel === 'too-specific') {
                if (!options.dryRun) {
                    console.log(`  ✗ Skipping (too specific): ${memory.description}`);
                }
                continue;
            }
            if (options.dryRun) {
                console.log(`  [DRY RUN] Would create: [${memory.type}] ${memory.description}`);
                continue;
            }
            try {
                const slug = memory.description
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/^-+|-+$/g, '')
                    .slice(0, 50);
                const { fileName } = (0, memory_template_1.generateMemoryFile)({
                    name: slug,
                    type: memory.type,
                    description: memory.description,
                    tags: memory.tags,
                    created: new Date().toISOString(),
                    content: memory.content,
                    confidence: 'medium',
                });
                (0, store_2.writeMemory)(repoRoot, {
                    type: memory.type,
                    name: fileName.replace('.md', '').replace(/^\d{4}-\d{2}-\d{2}-/, ''),
                    description: memory.description,
                    tags: memory.tags,
                    content: memory.content,
                    confidence: 'medium',
                    created: new Date().toISOString(),
                });
                totalImported++;
                console.log(`  ✓ [${memory.type}] ${memory.description} (${abstractionLevel}-level)`);
            }
            catch (error) {
                console.log(`  ✗ Failed to import: ${memory.description}`);
                console.log(`    Error: ${error.message}`);
            }
        }
    }
    console.log(`\n${options.dryRun ? '[DRY RUN] ' : ''}Import complete!`);
    console.log(`Total memories imported: ${totalImported}`);
    if (!options.dryRun) {
        console.log('\nNext steps:');
        console.log('  memo map        # View memory statistics');
        console.log('  memo recall "query"  # Search imported memories');
    }
}
//# sourceMappingURL=import.js.map