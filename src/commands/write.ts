/**
 * Write command
 * Interactive + non-interactive memory creation
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeMemory, findRepoRoot } from '../core/store';
import type { MemoryType, Confidence } from '../types';
import {
  generateMemoryFile,
  getTemplateByType,
  sanitizeContent,
  validateMemoryContent,
  checkAbstractionLevel,
  generateMemorySlug,
} from '../core/memory-template';

const execAsync = promisify(exec);

export interface WriteOptions {
  name?: string;
  description?: string;
  tags?: string;
  content?: string;
  repo?: string;
  symbol?: string;
  silent?: boolean;
}

/**
 * Memory template for editor
 */
function getTemplate(type: MemoryType): string {
  const baseTemplate = getTemplateByType(type);

  return `---
name: ${generateMemorySlug('your-memory-name')}
type: ${type}
description: One-sentence summary
tags: [topic, technology]
confidence: medium
created: ${new Date().toISOString()}
---

${baseTemplate}
`;
}

/**
 * Parse content from edited template
 */
function parseTemplate(content: string, type: MemoryType): any {
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
      } else if (inFrontmatter) {
        inFrontmatter = false;
      }
      continue;
    }

    if (inFrontmatter) {
      frontmatter += line + '\n';
    } else {
      body += line + '\n';
    }
  }

  // Parse YAML frontmatter
  const data: any = {
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
      } else if (value) {
        data[key] = value;
      }
    }
  }

  data.content = body.trim();

  return data;
}

export async function writeMemoryCommand(
  type: MemoryType,
  options: WriteOptions = {}
): Promise<void> {
  const cwd = process.cwd();
  const repoRoot = findRepoRoot(cwd, options.repo);

  // Check if non-interactive mode
  const isNonInteractive = options.name && options.description && options.content;

  let memoryData: any;

  if (isNonInteractive) {
    // Non-interactive mode
    memoryData = {
      name: options.name,
      type,
      description: options.description,
      tags: options.tags ? options.tags.split(',').map((t) => t.trim()) : [],
      confidence: 'medium' as Confidence,
      content: options.content || '',
      created: new Date().toISOString(),
      status: 'experimental',
    };
  } else {
    // Interactive mode - open editor
    const template = getTemplate(type);
    const tmpFile = path.join(os.tmpdir(), `memo-${Date.now()}.md`);
    fs.writeFileSync(tmpFile, template, 'utf-8');

    const editor = process.env.EDITOR || 'vi';
    if (!options.silent) {
      console.log(`Opening ${editor}...`);
    }

    try {
      await execAsync(`${editor} "${tmpFile}"`);
      const editedContent = fs.readFileSync(tmpFile, 'utf-8');
      memoryData = parseTemplate(editedContent, type);
    } catch (error) {
      console.error(`Editor error: ${(error as Error).message}`);
      fs.unlinkSync(tmpFile);
      return;
    } finally {
      fs.unlinkSync(tmpFile);
    }
  }

  // Symbol anchoring (v0.8.1+)
  if (options.symbol) {
    try {
      const { CodeIndex } = await import('../engines/code-index');
      const dbPath = CodeIndex.getDbPath(repoRoot);
      if (fs.existsSync(dbPath)) {
        const idx = new CodeIndex(dbPath);
        const syms = idx.search(options.symbol, 1);
        idx.close();
        if (syms.length > 0 && syms[0].symbol.hash) {
          memoryData.codeRefs = [syms[0].symbol.hash];
          if (!options.silent) {
            console.log(
              `✓ Anchored to symbol: ${syms[0].symbol.qualifiedName} (${syms[0].symbol.hash.slice(0, 8)})`
            );
          }
        } else {
          if (!options.silent) {
            console.warn(`⚠️  Symbol "${options.symbol}" not found in index. Link skipped.`);
          }
        }
      }
    } catch {
      // ignore
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
  if (!options.silent) {
    console.log('\n🔒 Security check...');
  }
  const { sanitized, redacted } = sanitizeContent(memoryData.content);

  if (redacted.length > 0) {
    if (!options.silent) {
      console.log('⚠️  Found sensitive information that will be redacted:');
      redacted.forEach((item) => console.log(`   • ${item}`));
      console.log('');
    }

    // Auto-sanitize
    memoryData.content = sanitized;
    if (!options.silent) {
      console.log('✓ Content has been automatically sanitized\n');
    }
  }

  // Validate content
  const validation = validateMemoryContent(memoryData.content);

  if (validation.errors.length > 0) {
    console.error('❌ Validation errors:');
    validation.errors.forEach((err) => console.error(`   • ${err}`));
    console.error('\nPlease remove sensitive information and try again.');
    return;
  }

  if (validation.warnings.length > 0) {
    if (!options.silent) {
      console.log('⚠️  Warnings:');
      validation.warnings.forEach((warn) => console.log(`   • ${warn}`));
      console.log('');
    }
  }

  // Check abstraction level
  const abstractionLevel = checkAbstractionLevel(memoryData.content);
  if (abstractionLevel === 'too-specific') {
    console.error('⚠️  Content appears too specific.');
    console.error('   Please document at a higher abstraction level.');
    console.error('   Focus on patterns, principles, and decisions rather than:');
    console.error('   • Specific IP addresses or hostnames');
    console.error('   • User-specific file paths');
    console.error('   • Hard-coded values that may change\n');
    return;
  }

  if (!options.silent) {
    console.log(`✓ Abstraction level: ${abstractionLevel}\n`);
  }

  // Write memory
  try {
    const { fileName } = generateMemoryFile({
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
    const filePath = writeMemory(repoRoot, memoryData);
    if (!options.silent) {
      console.log(`✅ Created: ${filePath}`);
    }
  } catch (error) {
    console.error(`Error writing memory: ${(error as Error).message}`);
  }
}
