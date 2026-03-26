/**
 * Codex platform install helper
 * Injects memory protocol into AGENTS.md
 */

import * as fs from 'fs';
import * as path from 'path';

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
function findAgentsMd(startDir: string): string | null {
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
export function installCodex(cwd: string): Promise<boolean> {
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
  } catch (error) {
    console.error(`Could not write AGENTS.md: ${(error as Error).message}`);
    return Promise.resolve(false);
  }
}
