// Custom promptfoo provider for pi CLI (local model runner)
// Usage: set provider id to "file://provider-pi.js" in promptfooconfig.yaml

import { execSync } from 'child_process';

export const id = 'pi-local';

/**
 * @param {string} prompt - JSON string of chat messages from promptfoo
 * @param {object} context - promptfoo context (vars, options, etc.)
 * @returns {{ output: string }}
 */
export async function callApi(prompt, context) {
  const messages = JSON.parse(prompt);
  const systemMsg = messages.find((m) => m.role === 'system')?.content ?? '';
  const userMsg = messages.find((m) => m.role === 'user')?.content ?? '';

  // pi reads system prompt via --system-prompt flag; user message is positional arg
  // Adjust flags to match your pi version (pi --help)
  const escaped = (s) => s.replace(/'/g, "'\\''");

  const cmd = [
    'pi',
    '--system-prompt', `'${escaped(systemMsg)}'`,
    '--no-interactive',
    `'${escaped(userMsg)}'`,
  ].join(' ');

  try {
    const output = execSync(cmd, { encoding: 'utf8', timeout: 120_000 });
    return { output: output.trim() };
  } catch (err) {
    return { error: err.message ?? String(err) };
  }
}
