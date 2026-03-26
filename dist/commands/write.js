"use strict";
/**
 * Write command
 * Interactive + non-interactive memory creation
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
exports.writeMemoryCommand = writeMemoryCommand;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const store_1 = require("../core/store");
const memory_template_1 = require("../core/memory-template");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
/**
 * Memory template for editor
 */
function getTemplate(type) {
    const baseTemplate = (0, memory_template_1.getTemplateByType)(type);
    return `---
name: ${(0, memory_template_1.generateMemorySlug)('your-memory-name')}
type: ${type}
description: One-sentence summary
tags: [topic, technology]
confidence: medium
created: ${new Date().toISOString()}
---

${baseTemplate}

---
# SECURITY CHECKLIST (remove this section before saving)
# - [ ] No API keys, passwords, or tokens
# - [ ] No IP addresses or hostnames
# - [ ] No email addresses or phone numbers
# - [ ] No database connection strings
# - [ ] No private keys or certificates
# - [ ] Content is at appropriate abstraction level (high/medium)
`;
}
/**
 * Parse content from edited template
 */
function parseTemplate(content, type) {
    // Find frontmatter boundaries
    const lines = content.split('\n');
    let frontmatter = '';
    let body = '';
    let inFrontmatter = false;
    let foundFirstDash = false;
    for (const line of lines) {
        if (line === '---') {
            if (!foundFirstDash) {
                foundFirstDash = true;
                inFrontmatter = true;
            }
            else if (inFrontmatter) {
                inFrontmatter = false;
            }
            continue;
        }
        if (inFrontmatter) {
            frontmatter += line + '\n';
        }
        else if (!line.startsWith('# SECURITY CHECKLIST')) {
            body += line + '\n';
        }
    }
    // Parse YAML frontmatter
    const data = {
        name: '',
        type,
        description: '',
        tags: [],
        confidence: 'medium',
        created: new Date().toISOString(),
    };
    for (const line of frontmatter.split('\n')) {
        const match = line.match(/^(\w+):\s*(.*)$/);
        if (match?.[1]) {
            const key = match[1];
            const value = match[2]?.trim() ?? '';
            if (key === 'tags') {
                // Parse array format: [tag1, tag2]
                const tagArray = value
                    .replace(/^\[|\]$/g, '')
                    .split(',')
                    .map((t) => t.trim().replace(/['"]/g, ''))
                    .filter((t) => t.length > 0);
                data[key] = tagArray;
            }
            else if (value) {
                data[key] = value;
            }
        }
    }
    data.content = body.trim();
    return data;
}
async function writeMemoryCommand(type, options = {}) {
    const cwd = process.cwd();
    const repoRoot = (0, store_1.findRepoRoot)(cwd, options.repo);
    // Check if non-interactive mode
    const isNonInteractive = options.name && options.description && options.content;
    let memoryData;
    if (isNonInteractive) {
        // Non-interactive mode
        memoryData = {
            name: options.name,
            type,
            description: options.description,
            tags: options.tags ? options.tags.split(',').map((t) => t.trim()) : [],
            confidence: 'medium',
            content: options.content || '',
            created: new Date().toISOString(),
            status: 'experimental',
        };
    }
    else {
        // Interactive mode - open editor
        const template = getTemplate(type);
        const tmpFile = path.join(os.tmpdir(), `memo-${Date.now()}.md`);
        fs.writeFileSync(tmpFile, template, 'utf-8');
        const editor = process.env.EDITOR || 'vi';
        console.log(`Opening ${editor}...`);
        console.log('\n📝 Security Guidelines:');
        console.log('   • Do NOT include API keys, passwords, or tokens');
        console.log('   • Do NOT include IP addresses or hostnames');
        console.log('   • Do NOT include email addresses or phone numbers');
        console.log('   • Keep content at high/medium abstraction level\n');
        try {
            await execAsync(`${editor} "${tmpFile}"`);
            const editedContent = fs.readFileSync(tmpFile, 'utf-8');
            memoryData = parseTemplate(editedContent, type);
        }
        catch (error) {
            console.error(`Editor error: ${error.message}`);
            fs.unlinkSync(tmpFile);
            return;
        }
        finally {
            fs.unlinkSync(tmpFile);
        }
    }
    // Validate required fields
    if (!memoryData.name) {
        console.error('Error: name is required');
        return;
    }
    if (!memoryData.description) {
        console.error('Error: description is required');
        return;
    }
    if (!memoryData.content) {
        console.error('Error: content is required');
        return;
    }
    // Security validation
    console.log('\n🔒 Security check...');
    const { sanitized, redacted } = (0, memory_template_1.sanitizeContent)(memoryData.content);
    if (redacted.length > 0) {
        console.log('⚠️  Found sensitive information that will be redacted:');
        redacted.forEach((item) => console.log(`   • ${item}`));
        console.log('');
        // Auto-sanitize
        memoryData.content = sanitized;
        console.log('✓ Content has been automatically sanitized\n');
    }
    // Validate content
    const validation = (0, memory_template_1.validateMemoryContent)(memoryData.content);
    if (validation.errors.length > 0) {
        console.error('❌ Validation errors:');
        validation.errors.forEach((err) => console.error(`   • ${err}`));
        console.error('\nPlease remove sensitive information and try again.');
        return;
    }
    if (validation.warnings.length > 0) {
        console.log('⚠️  Warnings:');
        validation.warnings.forEach((warn) => console.log(`   • ${warn}`));
        console.log('');
    }
    // Check abstraction level
    const abstractionLevel = (0, memory_template_1.checkAbstractionLevel)(memoryData.content);
    if (abstractionLevel === 'too-specific') {
        console.error('⚠️  Content appears too specific.');
        console.error('   Please document at a higher abstraction level.');
        console.error('   Focus on patterns, principles, and decisions rather than:');
        console.error('   • Specific IP addresses or hostnames');
        console.error('   • User-specific file paths');
        console.error('   • Hard-coded values that may change\n');
        return;
    }
    console.log(`✓ Abstraction level: ${abstractionLevel}\n`);
    // Write memory
    try {
        const { fileName } = (0, memory_template_1.generateMemoryFile)({
            name: memoryData.name,
            type: memoryData.type,
            description: memoryData.description,
            tags: memoryData.tags,
            created: memoryData.created,
            content: memoryData.content,
            confidence: memoryData.confidence,
        });
        // Update memoryData with generated file name
        memoryData.name = fileName.replace('.md', '').replace(/^\d{4}-\d{2}-\d{2}-/, '');
        if (!memoryData.status) {
            memoryData.status = 'experimental';
        }
        const filePath = (0, store_1.writeMemory)(repoRoot, memoryData);
        console.log(`✅ Created: ${filePath}`);
    }
    catch (error) {
        console.error(`Error writing memory: ${error.message}`);
    }
}
//# sourceMappingURL=write.js.map