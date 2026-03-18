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
const execAsync = (0, util_1.promisify)(child_process_1.exec);
/**
 * Memory template for editor
 */
function getTemplate(type) {
    return `---
name: 
type: ${type}
description: 
tags: []
confidence: medium
created: ${new Date().toISOString()}
---

## Problem
What problem or challenge are you addressing?

## Solution
What did you learn or decide?

## Context
Any relevant background information?

## References
Links to related resources or code?
`;
}
/**
 * Parse content from edited template
 */
function parseTemplate(content, type) {
    const lines = content.split('\n');
    let frontmatter = '';
    let body = '';
    let inFrontmatter = false;
    for (const line of lines) {
        if (line === '---') {
            if (!inFrontmatter) {
                inFrontmatter = true;
            }
            else {
                inFrontmatter = false;
                continue;
            }
        }
        else if (inFrontmatter) {
            frontmatter += line + '\n';
        }
        else {
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
        if (match) {
            const key = match[1];
            let value = match[2];
            if (key === 'tags') {
                const tagArray = value.replace(/^\[|\]$/g, '').split(',').map(t => t.trim().replace(/[\'"]/g, ''));
                data[key] = tagArray;
            }
            else {
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
    const isNonInteractive = options.name &&
        options.description &&
        options.content;
    let memoryData;
    if (isNonInteractive) {
        // Non-interactive mode
        memoryData = {
            name: options.name,
            type,
            description: options.description,
            tags: options.tags ? options.tags.split(',').map(t => t.trim()) : [],
            confidence: 'medium',
            content: options.content || '',
            created: new Date().toISOString(),
        };
    }
    else {
        // Interactive mode - open editor
        const template = getTemplate(type);
        const tmpFile = path.join(os.tmpdir(), `memo-${Date.now()}.md`);
        fs.writeFileSync(tmpFile, template, 'utf-8');
        const editor = process.env.EDITOR || 'vi';
        console.log(`Opening ${editor}...`);
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
    // Validate
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
    // Write memory
    try {
        const filePath = (0, store_1.writeMemory)(repoRoot, memoryData);
        console.log(`Created: ${filePath}`);
    }
    catch (error) {
        console.error(`Error writing memory: ${error.message}`);
    }
}
//# sourceMappingURL=write.js.map