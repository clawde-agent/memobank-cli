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
import { MemoryType, Confidence } from '../types';

const execAsync = promisify(exec);

export interface WriteOptions {
  name?: string;
  description?: string;
  tags?: string;
  content?: string;
  repo?: string;
}

/**
 * Memory template for editor
 */
function getTemplate(type: MemoryType): string {
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
function parseTemplate(content: string, type: MemoryType): any {
  const lines = content.split('\n');
  let frontmatter = '';
  let body = '';
  let inFrontmatter = false;

  for (const line of lines) {
    if (line === '---') {
      if (!inFrontmatter) {
        inFrontmatter = true;
      } else {
        inFrontmatter = false;
        continue;
      }
    } else if (inFrontmatter) {
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
    if (match) {
      const key = match[1];
      let value = match[2];

      if (key === 'tags') {
        const tagArray = value.replace(/^\[|\]$/g, '').split(',').map(t => t.trim().replace(/[\'"]/g, ''));
        data[key] = tagArray;
      } else {
        data[key] = value;
      }
    }
  }

  data.content = body.trim();

  return data;
}

export async function writeMemoryCommand(type: MemoryType, options: WriteOptions = {}): Promise<void> {
  const cwd = process.cwd();
  const repoRoot = findRepoRoot(cwd, options.repo);

  // Check if non-interactive mode
  const isNonInteractive =
    options.name &&
    options.description &&
    options.content;

  let memoryData: any;

  if (isNonInteractive) {
    // Non-interactive mode
    memoryData = {
      name: options.name,
      type,
      description: options.description,
      tags: options.tags ? options.tags.split(',').map(t => t.trim()) : [],
      confidence: 'medium' as Confidence,
      content: options.content || '',
      created: new Date().toISOString(),
    };
  } else {
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
    } catch (error) {
      console.error(`Editor error: ${(error as Error).message}`);
      fs.unlinkSync(tmpFile);
      return;
    } finally {
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
    const filePath = writeMemory(repoRoot, memoryData);
    console.log(`Created: ${filePath}`);
  } catch (error) {
    console.error(`Error writing memory: ${(error as Error).message}`);
  }
}
