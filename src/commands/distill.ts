import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import {
  findRepoRoot,
  loadAll,
  getGlobalDir,
  getWorkspaceDir,
  resolveProjectId,
} from '../core/store';
import { loadConfig } from '../config';
import { distillToWorkspace, distillToPersonal } from '../core/distiller';
import { synthesizeScenes } from '../core/scene-synthesizer';
import { readSceneIndex } from '../core/scene-index';
import { generateSceneNavigation } from '../core/scene-navigation';

export interface DistillOptions {
  to: 'workspace' | 'personal' | 'scenes';
  repo?: string;
  silent?: boolean;
}

function log(msg: string, silent?: boolean): void {
  if (!silent) process.stdout.write(msg + '\n');
}

function writeDistilledMemory(
  dir: string,
  name: string,
  frontmatter: Record<string, unknown>,
  content: string
): void {
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${name}.md`);
  const fileContent = matter.stringify(content, frontmatter);
  fs.writeFileSync(filePath, fileContent, 'utf-8');
}

export async function distillCommand(options: DistillOptions): Promise<void> {
  const repoRoot = findRepoRoot(process.cwd(), options.repo);
  const config = loadConfig(repoRoot);
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    log('No ANTHROPIC_API_KEY configured. Skipping distillation.', options.silent);
    return;
  }

  if (options.to === 'workspace') {
    const all = loadAll(repoRoot, 'project');
    const eligible = all.filter(
      (m) => m.confidence === 'high' && (m.status === 'active' || !m.status)
    );

    if (eligible.length === 0) {
      log('No high-confidence active memories to distill.', options.silent);
      return;
    }

    log(`Distilling ${eligible.length} memories to workspace tier...`, options.silent);
    const distilled = await distillToWorkspace(eligible, apiKey);

    if (distilled.length === 0) {
      log('LLM returned no distilled memories.', options.silent);
      return;
    }

    const workspaceName = config.project.name;
    const workspaceDir = getWorkspaceDir(workspaceName);

    // Load existing workspace memories for idempotency: match by distilled_from
    const existingMap = new Map<string, string>(); // source name → target filename
    if (fs.existsSync(workspaceDir)) {
      for (const f of fs.readdirSync(workspaceDir, { recursive: true }) as string[]) {
        if (!f.endsWith('.md')) continue;
        const fullPath = path.join(workspaceDir, f);
        try {
          const raw = fs.readFileSync(fullPath, 'utf-8');
          const parsed = matter(raw);
          const sources = parsed.data.distilled_from as string[] | undefined;
          if (sources) {
            for (const src of sources) existingMap.set(src, path.basename(f, '.md'));
          }
        } catch {
          /* skip unreadable files */
        }
      }
    }

    for (const d of distilled) {
      // Idempotency: reuse existing name if any source already has a workspace version
      const existingName = d.distilled_from.map((s) => existingMap.get(s)).find(Boolean);
      const targetName = existingName ?? d.name;
      const targetDir = path.join(workspaceDir, d.type);
      writeDistilledMemory(
        targetDir,
        targetName,
        {
          name: targetName,
          type: d.type,
          description: d.description,
          tags: d.tags,
          confidence: d.confidence,
          distilled_from: d.distilled_from,
          status: 'active',
          updated: new Date().toISOString().slice(0, 10),
        },
        d.content
      );
    }

    log(`Distilled ${distilled.length} memories to workspace: ${workspaceDir}`, options.silent);
  } else if (options.to === 'personal') {
    // --to personal
    const projectId = resolveProjectId(repoRoot);
    const personalDir = getGlobalDir(projectId);
    const personaPath = path.join(personalDir, 'persona.md');

    const existingPersona = fs.existsSync(personaPath)
      ? fs.readFileSync(personaPath, 'utf-8')
      : undefined;

    const all = loadAll(
      repoRoot,
      'all',
      getGlobalDir(projectId),
      config.workspace ? getWorkspaceDir(config.project.name) : undefined
    );

    if (all.length === 0) {
      log('No memories found for persona synthesis.', options.silent);
      return;
    }

    log(`Synthesizing persona from ${all.length} memories...`, options.silent);
    const persona = await distillToPersonal(all, existingPersona, apiKey);

    if (!persona) {
      log('LLM returned empty persona.', options.silent);
      return;
    }

    fs.mkdirSync(personalDir, { recursive: true });
    fs.writeFileSync(personaPath, persona, 'utf-8');
    log(`Persona written to ${personaPath}`, options.silent);
  } else if (options.to === 'scenes') {
    const all = loadAll(repoRoot, 'project');
    if (all.length === 0) {
      log('No memories found for scene synthesis.', options.silent);
      return;
    }
    log(`Synthesizing scenes from ${all.length} memories...`, options.silent);
    const results = await synthesizeScenes(all, repoRoot, apiKey);
    if (results.length === 0) {
      log('No scenes produced.', options.silent);
      return;
    }
    log(`Created/updated ${results.length} scene(s).`, options.silent);
    if (!options.silent) {
      const index = await readSceneIndex(repoRoot);
      const nav = generateSceneNavigation(repoRoot, index);
      if (nav) process.stdout.write('\n' + nav + '\n');
    }
  }
}
