import * as path from 'path';
import type { SceneEntry } from './scene-index';

const NAV_START = '<!-- scene-navigation-start -->';
const NAV_END = '<!-- scene-navigation-end -->';

export function generateSceneNavigation(memoDir: string, entries: SceneEntry[]): string {
  if (entries.length === 0) return '';

  const sorted = [...entries].sort((a, b) => b.heat - a.heat);
  const scenesDir = path.join(memoDir, 'scenes');

  const lines: string[] = [NAV_START, '', '## Scene Navigation', ''];
  for (const e of sorted) {
    const fullPath = path.join(scenesDir, e.filename).split(path.sep).join('/');
    lines.push(`### Path: ${fullPath}`);
    lines.push(`**Heat**: ${e.heat} 🔥 | **Updated**: ${e.updated}`);
    lines.push(`Summary: ${e.summary}`);
    lines.push('');
  }
  lines.push(NAV_END);
  return lines.join('\n');
}

export function stripSceneNavigation(content: string): string {
  const startIdx = content.indexOf(NAV_START);
  const endIdx = content.indexOf(NAV_END);
  if (startIdx === -1 || endIdx === -1) return content;
  return (content.slice(0, startIdx) + content.slice(endIdx + NAV_END.length)).trimEnd();
}
