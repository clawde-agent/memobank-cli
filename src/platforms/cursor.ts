/**
 * Cursor platform install helper
 * Writes memobank.mdc to .cursor/rules/
 */

import * as fs from 'fs';
import * as path from 'path';

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
export function installCursor(cwd: string): Promise<boolean> {
  const cursorDir = path.join(cwd, '.cursor', 'rules');

  // Ensure .cursor/rules directory exists
  if (!fs.existsSync(cursorDir)) {
    try {
      fs.mkdirSync(cursorDir, { recursive: true });
    } catch (error) {
      console.error(`Could not create .cursor/rules: ${(error as Error).message}`);
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
  } catch (error) {
    console.error(`Could not write memobank.mdc: ${(error as Error).message}`);
    return Promise.resolve(false);
  }
}
